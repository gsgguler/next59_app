import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_SEASONS: Record<number, { af_season: number }> = {
  39:  { af_season: 2025 },
  61:  { af_season: 2025 },
  78:  { af_season: 2025 },
  88:  { af_season: 2025 },
  135: { af_season: 2025 },
  140: { af_season: 2025 },
  203: { af_season: 2025 },
};

// WC2026 venues — altitude in meters (approximate) for known high-altitude cities
// Mexico City (Estadio Azteca): ~2240m
// Denver (Mile High): ~1609m
// Kansas City: ~265m — not significant
// Other WC2026 venues are sea-level or low altitude
const WC2026_VENUE_ALTITUDES: Record<string, number> = {
  "Mexico City": 2240,
  "Ciudad de Mexico": 2240,
  "Denver": 1609,
  "Guadalajara": 1566,
  "Monterrey": 538,
};

const WC2026_CITIES = new Set([
  "Mexico City", "Ciudad de Mexico", "Guadalajara", "Monterrey",
  "Denver", "Kansas City", "Dallas", "Houston", "Los Angeles",
  "San Francisco", "Seattle", "New York", "Boston", "Miami",
  "Atlanta", "Philadelphia", "Vancouver", "Toronto",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // Can pass explicit venue_ids OR league_id to derive venue ids from fixtures
    const explicitVenueIds: number[] = body.venue_ids ?? [];
    const leagueFilter: number | null = body.league_id ?? null;
    const maxVenues: number = Math.min(body.max_venues ?? 50, 100);

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({ sync_type: "venues", status: "running" })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    // Collect venue IDs to fetch
    let venueIds: Set<number> = new Set(explicitVenueIds);

    if (venueIds.size === 0) {
      // Derive from af_fixtures_raw venue field — look at stored fixture JSON
      const leaguesToQuery = leagueFilter
        ? [leagueFilter]
        : Object.keys(LEAGUE_SEASONS).map(Number);

      for (const lid of leaguesToQuery) {
        const { af_season } = LEAGUE_SEASONS[lid] ?? { af_season: 2025 };
        const { data: rows } = await supabase
          .schema("shared")
          .from("af_fixtures_raw")
          .select("raw_response")
          .eq("league_id", lid)
          .eq("season", af_season)
          .limit(50);

        if (rows) {
          for (const row of rows) {
            const venueId = row.raw_response?.fixture?.venue?.id;
            if (venueId && typeof venueId === "number") {
              venueIds.add(venueId);
            }
          }
        }
      }
    }

    // Skip already-fetched venues unless forced
    const force: boolean = body.force ?? false;
    if (!force && venueIds.size > 0) {
      const { data: existing } = await supabase
        .from("af_venues_normalized")
        .select("af_venue_id")
        .in("af_venue_id", [...venueIds]);
      if (existing) {
        const existingSet = new Set(existing.map((r: any) => r.af_venue_id));
        venueIds = new Set([...venueIds].filter((id) => !existingSet.has(id)));
      }
    }

    const venueList = [...venueIds].slice(0, maxVenues);

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];

    for (const venueId of venueList) {
      try {
        const url = `https://v3.football.api-sports.io/venues?id=${venueId}`;
        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status}`);
        const json = await resp.json();
        const venue = json?.response?.[0] ?? null;

        if (!venue) {
          errors.push(`venue ${venueId}: no response data`);
          continue;
        }

        // Store raw
        const { error: rawErr } = await supabase
          .from("af_venues_raw")
          .upsert({
            af_venue_id: venueId,
            request_params: { id: venueId },
            response_hash: `venue_${venueId}`,
            response_json: json,
            http_status: resp.status,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "af_venue_id" });

        if (rawErr) {
          errors.push(`venues_raw ${venueId}: ${rawErr.message}`);
          continue;
        }

        const cityName: string = venue.city ?? "";
        const isWC2026 = WC2026_CITIES.has(cityName);
        const altitude = WC2026_VENUE_ALTITUDES[cityName] ?? null;

        let venueContextWarning: string | null = null;
        if (altitude !== null && altitude > 500) {
          if (altitude > 2000) {
            venueContextWarning = `High altitude (${altitude}m) — significant home advantage adjustment recommended`;
          } else if (altitude > 1000) {
            venueContextWarning = `Moderate altitude (${altitude}m) — consider home advantage effect`;
          } else {
            venueContextWarning = `Mild altitude (${altitude}m)`;
          }
        }

        const normalizedPayload = {
          af_venue_id: venueId,
          name: venue.name ?? null,
          address: venue.address ?? null,
          city: cityName || null,
          country: venue.country ?? null,
          capacity: venue.capacity ?? null,
          surface: venue.surface ?? null,
          altitude_meters: altitude,
          is_wc2026_venue: isWC2026,
          venue_context_warning: venueContextWarning,
          image_url: venue.image ?? null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: ex } = await supabase
          .from("af_venues_normalized")
          .select("id")
          .eq("af_venue_id", venueId)
          .maybeSingle();

        if (ex) {
          await supabase.from("af_venues_normalized").update(normalizedPayload)
            .eq("af_venue_id", venueId);
          rowsUpdated++;
        } else {
          await supabase.from("af_venues_normalized").insert(normalizedPayload);
          rowsInserted++;
        }

        await supabase
          .from("af_venues_raw")
          .update({ transform_status: "transformed" })
          .eq("af_venue_id", venueId);

      } catch (venueErr: unknown) {
        const msg = venueErr instanceof Error ? venueErr.message : String(venueErr);
        errors.push(`venue ${venueId}: ${msg}`);
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    if (logId) {
      await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .update({
          completed_at: completedAt.toISOString(),
          status: errors.length > 0 && rowsInserted === 0 && rowsUpdated === 0 ? "failed" : "completed",
          leagues_seen: venueList.length,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "venues",
      venues_processed: venueList.length,
      venues_skipped_already_fetched: (venueIds.size - venueList.length),
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      errors: errors.slice(0, 5),
      duration_ms: durationMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
