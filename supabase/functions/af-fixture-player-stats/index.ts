import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fetches /fixtures/players for DOMESTIC league matches only.
// UEFA /fixtures/players returns empty — use af-player-season-stats for UEFA instead.
// Raw-first: stores in af_fixture_player_stats_raw.
// Normalize via: SELECT af_normalize_fixture_player_stats(league_id, season)
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
    const leagueId: number = body.league_id;
    const seasonYear: number = body.season ?? 2024;
    const chunkOffset: number = body.chunk_offset ?? 0;
    const chunkSize: number = body.chunk_size ?? 50;

    if (!leagueId) throw new Error("league_id required");

    const { data: fixtures, error: fErr } = await supabase.rpc("get_domestic_fixture_ids", {
      p_af_league_id: leagueId,
      p_season_year: seasonYear,
      p_offset: chunkOffset,
      p_limit: chunkSize,
    });
    if (fErr) throw fErr;
    const batch: Array<{ match_id: string; api_football_fixture_id: number }> = fixtures ?? [];

    let fetched = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const f of batch) {
      const fixtureId = f.api_football_fixture_id;
      const hash = `fixture-players-${fixtureId}`;

      const { data: existing } = await supabase
        .from("af_fixture_player_stats_raw")
        .select("id").eq("response_hash", hash).maybeSingle();
      if (existing) { skipped++; continue; }

      const endpoint = `https://v3.football.api-sports.io/fixtures/players?fixture=${fixtureId}`;
      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const teamsArr: any[] = json?.response ?? [];
        const playerCount = teamsArr.reduce((s: number, t: any) => s + (t.players?.length ?? 0), 0);

        const { error: insErr } = await supabase.from("af_fixture_player_stats_raw").insert({
          competition_type: "domestic_league",
          match_id: f.match_id,
          af_uefa_fixture_id: null,
          api_football_fixture_id: fixtureId,
          endpoint,
          request_params: { fixture: fixtureId },
          response_hash: hash,
          response_json: { fixture_id: fixtureId, teams: teamsArr },
          http_status: httpStatus,
          players_count: playerCount,
          transform_status: "raw",
        });
        if (insErr && insErr.code !== "23505") throw insErr;
        fetched++;
      } catch (e: any) {
        failed++;
        errors.push(`fixture ${fixtureId}: ${e.message}`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const hasMore = batch.length === chunkSize;
    return new Response(JSON.stringify({
      league_id: leagueId, season: seasonYear,
      chunk_offset: chunkOffset, batch_count: batch.length,
      fetched, skipped_cached: skipped, failed, has_more: hasMore,
      next_chunk_offset: hasMore ? chunkOffset + chunkSize : null,
      errors: errors.slice(0, 10),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
