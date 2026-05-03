import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fetch /fixtures/statistics for UEFA club competition fixtures.
// Source: af_uefa_fixtures (not matches table).
// Stores raw only — normalization runs via af_normalize_uefa_fixture_statistics() SQL fn.
// Supports: league_id filter, season filter, stage_type filter, chunk_offset/chunk_size.
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
    // Default: CL 2023 pilot
    const leagueAfId: number = body.league_id ?? 2;
    const seasonYear: number = body.season ?? 2023;
    const stageFilter: string | null = body.stage_type ?? null;
    const chunkOffset: number = body.chunk_offset ?? 0;
    const chunkSize: number = body.chunk_size ?? 50;
    // Only fetch FT finished fixtures
    const finishedOnly: boolean = body.finished_only !== false;

    let query = supabase
      .from("af_uefa_fixtures")
      .select("id, api_football_fixture_id, af_league_id, af_season, stage_type")
      .eq("af_league_id", leagueAfId)
      .eq("af_season", seasonYear)
      .not("api_football_fixture_id", "is", null);

    if (finishedOnly) query = query.eq("fixture_status", "FT");
    if (stageFilter) query = query.eq("stage_type", stageFilter);

    const { data: fixtures, error: fixErr } = await query
      .range(chunkOffset, chunkOffset + chunkSize - 1);

    if (fixErr) throw fixErr;
    const batch = fixtures ?? [];

    let fetched = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const f of batch) {
      const fixtureId: number = f.api_football_fixture_id;
      const hash = `uefa-stats-${fixtureId}`;

      const { data: existing } = await supabase
        .from("af_uefa_fixture_statistics_raw")
        .select("id")
        .eq("response_hash", hash)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const endpoint = `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`;
      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const statsArray = json?.response ?? [];

        const { error: insertErr } = await supabase
          .from("af_uefa_fixture_statistics_raw")
          .insert({
            af_uefa_fixture_id: f.id,
            api_football_fixture_id: fixtureId,
            af_league_id: f.af_league_id,
            af_season: f.af_season,
            endpoint,
            response_hash: hash,
            response_json: { fixture_id: fixtureId, stats: statsArray },
            http_status: httpStatus,
            transform_status: "raw",
          });

        if (insertErr && insertErr.code !== "23505") throw insertErr;
        fetched++;
      } catch (e: any) {
        failed++;
        errors.push(`fixture ${fixtureId}: ${e.message}`);
        await supabase.from("af_uefa_fixture_statistics_raw").insert({
          af_uefa_fixture_id: f.id,
          api_football_fixture_id: fixtureId,
          af_league_id: f.af_league_id,
          af_season: f.af_season,
          endpoint,
          response_hash: null,
          response_json: null,
          http_status: httpStatus,
          transform_status: "error",
          transform_error: (e as Error).message,
        }).catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const hasMore = batch.length === chunkSize;

    return new Response(JSON.stringify({
      league_id: leagueAfId,
      season: seasonYear,
      stage_filter: stageFilter,
      chunk_offset: chunkOffset,
      chunk_size: chunkSize,
      batch_count: batch.length,
      fetched,
      skipped_cached: skipped,
      failed,
      has_more: hasMore,
      next_chunk_offset: hasMore ? chunkOffset + chunkSize : null,
      errors: errors.slice(0, 10),
      next: fetched + skipped === batch.length && !hasMore
        ? "Chunk complete. Run SELECT af_normalize_uefa_fixture_statistics() to normalize."
        : hasMore
          ? `More fixtures available. Send chunk_offset: ${chunkOffset + chunkSize}`
          : `${failed} failures — review errors before normalizing.`,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
