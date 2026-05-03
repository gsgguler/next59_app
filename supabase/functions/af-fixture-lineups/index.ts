import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fetch /fixtures/lineups for a given league+season in chunks.
// Stores raw responses only — normalization runs via af_normalize_fixture_lineups() SQL fn.
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
    const leagueAfId: number = body.league_id ?? 39;
    const seasonYear: number = body.season ?? 2023;
    const chunkOffset: number = body.chunk_offset ?? 0;
    const chunkSize: number = body.chunk_size ?? 50;

    const { data: matches, error: matchErr } = await supabase
      .from("matches")
      .select(`
        id,
        api_football_fixture_id,
        competition_seasons!inner(
          competitions!inner(api_football_id),
          seasons!inner(year)
        )
      `)
      .not("api_football_fixture_id", "is", null)
      .eq("competition_seasons.competitions.api_football_id", leagueAfId)
      .eq("competition_seasons.seasons.year", seasonYear)
      .range(chunkOffset, chunkOffset + chunkSize - 1);

    if (matchErr) throw matchErr;
    const batch = matches ?? [];

    let fetched = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const m of batch) {
      const fixtureId: number = m.api_football_fixture_id;
      const endpoint = `https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`;
      const hash = `lineups-${fixtureId}`;

      const { data: existing } = await supabase
        .from("api_football_fixture_lineups_raw")
        .select("id")
        .eq("response_hash", hash)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const lineupsArray = json?.response ?? [];

        const { error: insertErr } = await supabase
          .from("api_football_fixture_lineups_raw")
          .insert({
            match_id: m.id,
            api_football_fixture_id: fixtureId,
            endpoint,
            response_hash: hash,
            response_json: { fixture_id: fixtureId, lineups: lineupsArray },
            http_status: httpStatus,
            transform_status: "raw",
          });

        if (insertErr && insertErr.code !== "23505") throw insertErr;
        fetched++;
      } catch (e: any) {
        failed++;
        errors.push(`fixture ${fixtureId}: ${e.message}`);
        await supabase.from("api_football_fixture_lineups_raw").insert({
          match_id: m.id,
          api_football_fixture_id: fixtureId,
          endpoint,
          response_hash: null,
          response_json: null,
          http_status: httpStatus,
          transform_status: "error",
        }).catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const hasMore = batch.length === chunkSize;

    return new Response(JSON.stringify({
      league_id: leagueAfId,
      season: seasonYear,
      chunk_offset: chunkOffset,
      chunk_size: chunkSize,
      batch_count: batch.length,
      fetched,
      skipped_cached: skipped,
      failed,
      has_more: hasMore,
      next_chunk_offset: hasMore ? chunkOffset + chunkSize : null,
      errors: errors.slice(0, 10),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
