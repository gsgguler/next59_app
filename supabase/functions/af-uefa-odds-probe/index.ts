import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Historical odds availability probe for UEFA fixtures.
// Internal-only: odds are analytical context, never exposed publicly.
// Allowed endpoints: /odds/bookmakers, /odds/bets, /odds?fixture={id}
// Forbidden: /odds/live, /predictions, player bulk, injuries
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // mode: "metadata" | "probe"
    const mode: string = body.mode ?? "probe";

    const BASE = "https://v3.football.api-sports.io";

    // ── Metadata mode: fetch bookmakers + bet types ───────────────────────────
    if (mode === "metadata") {
      const [bmResp, betsResp] = await Promise.all([
        fetch(`${BASE}/odds/bookmakers`, { headers: { "x-apisports-key": AF_KEY } }),
        fetch(`${BASE}/odds/bets`, { headers: { "x-apisports-key": AF_KEY } }),
      ]);

      const bmJson = bmResp.ok ? await bmResp.json() : null;
      const betsJson = betsResp.ok ? await betsResp.json() : null;

      const bookmakers: any[] = bmJson?.response ?? [];
      const bets: any[] = betsJson?.response ?? [];

      // Upsert bookmakers
      if (bookmakers.length > 0) {
        const bmRows = bookmakers.map((b: any) => ({
          provider: "api_football",
          provider_bookmaker_id: b.id,
          name: b.name,
        }));
        await supabase.from("af_odds_bookmakers")
          .upsert(bmRows, { onConflict: "provider,provider_bookmaker_id", ignoreDuplicates: false });
      }

      // Upsert bet types
      if (bets.length > 0) {
        const betRows = bets.map((b: any) => ({
          provider: "api_football",
          provider_bet_id: b.id,
          name: b.name,
        }));
        await supabase.from("af_odds_bets")
          .upsert(betRows, { onConflict: "provider,provider_bet_id", ignoreDuplicates: false });
      }

      return new Response(JSON.stringify({
        mode: "metadata",
        bookmakers_fetched: bookmakers.length,
        bet_types_fetched: bets.length,
        note: "Admin-only internal metadata. Not exposed publicly.",
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Probe mode: check odds availability for specific fixture IDs ──────────
    // fixture_ids: array of { api_football_fixture_id, league_id, season, competition_level }
    const probeFixtures: Array<{
      api_football_fixture_id: number;
      league_id: number;
      season: number;
      competition_level: string;
    }> = body.fixture_ids ?? [];

    if (probeFixtures.length === 0) {
      return new Response(JSON.stringify({ error: "fixture_ids array required for probe mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      fixture_id: number;
      odds_available: boolean;
      bookmakers_count: number;
      markets_count: number;
      http_status: number;
    }> = [];

    for (const f of probeFixtures) {
      const fixtureId = f.api_football_fixture_id;
      const hash = `uefa-odds-probe-${fixtureId}`;
      const endpoint = `${BASE}/odds?fixture=${fixtureId}`;

      // Skip if already probed
      const { data: existing } = await supabase
        .from("af_uefa_fixture_odds_raw")
        .select("id, odds_available, bookmakers_count, markets_count, http_status")
        .eq("response_hash", hash)
        .maybeSingle();

      if (existing) {
        results.push({
          fixture_id: fixtureId,
          odds_available: existing.odds_available,
          bookmakers_count: existing.bookmakers_count ?? 0,
          markets_count: existing.markets_count ?? 0,
          http_status: existing.http_status ?? 0,
        });
        continue;
      }

      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const oddsArray: any[] = json?.response ?? [];

        const bookmakerCount = oddsArray.length;
        const marketCount = oddsArray.reduce(
          (sum: number, bm: any) => sum + (bm?.bets?.length ?? 0), 0
        );
        const oddsAvailable = bookmakerCount > 0;

        await supabase.from("af_uefa_fixture_odds_raw").insert({
          provider: "api_football",
          competition_level: f.competition_level,
          league_id: f.league_id,
          season: f.season,
          api_football_fixture_id: fixtureId,
          endpoint,
          request_params: { fixture: fixtureId },
          response_hash: hash,
          response_json: { fixture_id: fixtureId, odds: oddsArray },
          http_status: httpStatus,
          odds_available: oddsAvailable,
          bookmakers_count: bookmakerCount,
          markets_count: marketCount,
          transform_status: "raw",
        });

        results.push({ fixture_id: fixtureId, odds_available: oddsAvailable, bookmakers_count: bookmakerCount, markets_count: marketCount, http_status: httpStatus });
      } catch (e: any) {
        await supabase.from("af_uefa_fixture_odds_raw").insert({
          provider: "api_football",
          competition_level: f.competition_level,
          league_id: f.league_id,
          season: f.season,
          api_football_fixture_id: fixtureId,
          endpoint,
          request_params: { fixture: fixtureId },
          response_hash: null,
          response_json: null,
          http_status: httpStatus,
          odds_available: false,
          bookmakers_count: 0,
          markets_count: 0,
          transform_status: "error",
        }).catch(() => {});
        results.push({ fixture_id: fixtureId, odds_available: false, bookmakers_count: 0, markets_count: 0, http_status: httpStatus });
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    const available = results.filter(r => r.odds_available);
    return new Response(JSON.stringify({
      mode: "probe",
      fixtures_checked: results.length,
      odds_available_count: available.length,
      odds_unavailable_count: results.length - available.length,
      results,
      note: "Internal analytics only. Not exposed publicly. No betting advice.",
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
