import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Terminal statuses — match is fully over
const TERMINAL_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"];
// In-progress statuses
const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];

// AF league ID → competition_season_id (current 2025-2026)
const LEAGUE_SEASONS: Record<number, { cs_id: string; af_season: number }> = {
  39:  { cs_id: "f0f5f43c-55c4-44a1-9ca6-dbed10460097", af_season: 2025 }, // Premier League
  61:  { cs_id: "96b68baf-5368-43ed-93d4-05720a45a843", af_season: 2025 }, // Ligue 1
  78:  { cs_id: "dff96a19-a77a-42ae-bf04-bae1098e8411", af_season: 2025 }, // Bundesliga
  88:  { cs_id: "09af551c-9bae-48ed-aa01-28a328f0d5cb", af_season: 2025 }, // Eredivisie
  135: { cs_id: "160eb576-5b10-4803-be2c-e92eeb4afd82", af_season: 2025 }, // Serie A
  140: { cs_id: "60b9c7ec-ae43-4986-98e8-77ac6de3c3f2", af_season: 2025 }, // La Liga
  203: { cs_id: "fb898419-630e-439c-a709-003b9ac3bb34", af_season: 2025 }, // Süper Lig
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // mode: "live" fetches currently in-progress matches; "recent" fetches matches finished in last N hours
    const mode: "live" | "recent" = body.mode ?? "recent";
    // recent_hours: how many hours back to look for finished matches (default 3)
    const recentHours: number = Math.min(body.recent_hours ?? 3, 12);
    // league_id: restrict to one league
    const leagueFilter: number | null = body.league_id ?? null;

    const leagueIds = leagueFilter ? [leagueFilter] : Object.keys(LEAGUE_SEASONS).map(Number);

    // Find matches in our DB that need result updates
    // These are matches with status_short IN ('NS','1H','HT','2H','ET','BT','P','SUSP','INT','LIVE')
    // and api_football_fixture_id IS NOT NULL
    // and kickoff (timestamp) in the relevant window
    const nowTs = Math.floor(Date.now() / 1000);
    const windowStart = mode === "live"
      ? nowTs - 6 * 3600   // started up to 6h ago
      : nowTs - recentHours * 3600;
    const windowEnd = mode === "live" ? nowTs + 300 : nowTs;

    const statusFilter = mode === "live"
      ? [...LIVE_STATUSES, "NS"]
      : [...TERMINAL_STATUSES, ...LIVE_STATUSES, "NS"];

    let query = supabase
      .from("matches")
      .select("id, api_football_fixture_id, status_short, competition_season_id, timestamp")
      .not("api_football_fixture_id", "is", null)
      .in("status_short", statusFilter)
      .gte("timestamp", windowStart)
      .lte("timestamp", mode === "live" ? nowTs + 300 : nowTs + 300);

    if (leagueFilter) {
      const csId = LEAGUE_SEASONS[leagueFilter]?.cs_id;
      if (csId) query = query.eq("competition_season_id", csId);
    }

    const { data: matchesToSync, error: queryErr } = await query.limit(100);
    if (queryErr) throw queryErr;

    if (!matchesToSync || matchesToSync.length === 0) {
      return new Response(JSON.stringify({
        mode,
        matches_found: 0,
        updated: 0,
        message: "No matches in sync window",
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group fixture IDs for batch AF API call
    const fixtureIds = matchesToSync.map((m: any) => m.api_football_fixture_id);
    // AF API supports up to 20 fixture IDs in one call via ids param
    const chunks: number[][] = [];
    for (let i = 0; i < fixtureIds.length; i += 20) {
      chunks.push(fixtureIds.slice(i, i + 20));
    }

    let totalUpdated = 0;
    const updateLog: Array<{ fixture_id: number; status: string; result?: string }> = [];
    const errors: string[] = [];

    for (const chunk of chunks) {
      const idsParam = chunk.join("-");
      const endpoint = `https://v3.football.api-sports.io/fixtures?ids=${idsParam}`;

      try {
        const resp = await fetch(endpoint, {
          headers: { "x-apisports-key": AF_KEY },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const fixtures: any[] = json?.response ?? [];

        for (const fix of fixtures) {
          const fixtureId: number = fix.fixture.id;
          const statusShort: string = fix.fixture.status.short;
          const elapsed: number | null = fix.fixture.status.elapsed ?? null;

          const dbMatch = matchesToSync.find((m: any) => m.api_football_fixture_id === fixtureId);
          if (!dbMatch) continue;

          // Skip if status hasn't changed and it's not a terminal status
          if (dbMatch.status_short === statusShort && !TERMINAL_STATUSES.includes(statusShort)) continue;

          const ftHome: number | null = fix.score?.fulltime?.home ?? null;
          const ftAway: number | null = fix.score?.fulltime?.away ?? null;
          const htHome: number | null = fix.score?.halftime?.home ?? null;
          const htAway: number | null = fix.score?.halftime?.away ?? null;
          const etHome: number | null = fix.score?.extratime?.home ?? null;
          const etAway: number | null = fix.score?.extratime?.away ?? null;
          const penHome: number | null = fix.score?.penalty?.home ?? null;
          const penAway: number | null = fix.score?.penalty?.away ?? null;

          // Determine result for terminal matches
          let result: string | null = null;
          if (TERMINAL_STATUSES.includes(statusShort) && ftHome !== null && ftAway !== null) {
            if (ftHome > ftAway) result = "H";
            else if (ftAway > ftHome) result = "A";
            else result = "D";
          }

          const updatePayload: Record<string, any> = {
            status_short: statusShort,
            status_long: fix.fixture.status.long,
            status_elapsed: elapsed,
            updated_at: new Date().toISOString(),
          };

          if (htHome !== null) { updatePayload.home_score_ht = htHome; updatePayload.away_score_ht = htAway; }
          if (ftHome !== null) { updatePayload.home_score_ft = ftHome; updatePayload.away_score_ft = ftAway; }
          if (etHome !== null) { updatePayload.home_score_et = etHome; updatePayload.away_score_et = etAway; }
          if (penHome !== null) { updatePayload.home_score_pen = penHome; updatePayload.away_score_pen = penAway; }
          if (result) updatePayload.result = result;

          const { error: updateErr } = await supabase
            .from("matches")
            .update(updatePayload)
            .eq("id", dbMatch.id);

          if (updateErr) {
            errors.push(`fixture ${fixtureId}: ${updateErr.message}`);
          } else {
            totalUpdated++;
            updateLog.push({ fixture_id: fixtureId, status: statusShort, result: result ?? undefined });
          }
        }
      } catch (e: any) {
        errors.push(`chunk ${chunk[0]}-${chunk[chunk.length - 1]}: ${e.message}`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({
      mode,
      window_start: new Date(windowStart * 1000).toISOString(),
      matches_found: matchesToSync.length,
      chunks_fetched: chunks.length,
      updated: totalUpdated,
      updates: updateLog,
      errors: errors.slice(0, 10),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
