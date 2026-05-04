import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_IDS = [203, 39, 140, 135, 78, 61, 88];
const SEASONS    = [2020, 2021, 2022, 2023, 2024];

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
    const leagueId: number | null = body.league_id ?? null;
    const season:   number | null = body.season    ?? null;
    const chunkOffset: number = body.chunk_offset ?? 0;
    const chunkSize:   number = Math.min(body.chunk_size ?? 50, 100);

    const pairs: { league: number; season: number }[] = [];
    const leagues = leagueId ? [leagueId] : LEAGUE_IDS;
    const years   = season   ? [season]   : SEASONS;
    for (const l of leagues) for (const y of years) pairs.push({ league: l, season: y });

    let batch: { match_id: string; api_football_fixture_id: number }[] = [];
    let activePair = { league: leagues[0], season: years[0] };

    if (pairs.length === 1) {
      activePair = pairs[0];
      const { data, error } = await supabase.rpc("get_unfetched_events_fixtures", {
        p_af_league_id: activePair.league,
        p_season_year:  activePair.season,
        p_offset:       chunkOffset,
        p_limit:        chunkSize,
      });
      if (error) throw error;
      batch = data ?? [];
    } else {
      for (const pair of pairs) {
        if (batch.length >= chunkSize) break;
        const { data, error } = await supabase.rpc("get_unfetched_events_fixtures", {
          p_af_league_id: pair.league,
          p_season_year:  pair.season,
          p_offset:       0,
          p_limit:        chunkSize - batch.length,
        });
        if (error) throw error;
        if (data && data.length > 0) { batch.push(...data); activePair = pair; }
      }
    }

    let fetched = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const m of batch) {
      const fixtureId = m.api_football_fixture_id;
      const endpoint  = `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`;
      const hash      = `events-${fixtureId}`;

      const { data: existing } = await supabase
        .from("api_football_fixture_events_raw")
        .select("id").eq("response_hash", hash).maybeSingle();
      if (existing) { skipped++; continue; }

      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const eventsArray = json?.response ?? [];

        const { error: insertErr } = await supabase
          .from("api_football_fixture_events_raw")
          .insert({
            match_id:                m.match_id,
            api_football_fixture_id: fixtureId,
            endpoint,
            response_hash:           hash,
            response_json:           { fixture_id: fixtureId, events: eventsArray },
            http_status:             httpStatus,
            transform_status:        "raw",
          });
        if (insertErr && insertErr.code !== "23505") throw insertErr;
        fetched++;
      } catch (e: any) {
        failed++;
        errors.push(`fixture ${fixtureId}: ${e.message}`);
        await supabase.from("api_football_fixture_events_raw").insert({
          match_id: m.match_id, api_football_fixture_id: fixtureId,
          endpoint, response_hash: null, response_json: null,
          http_status: httpStatus, transform_status: "error",
        }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const { data: checkMore } = await supabase.rpc("get_unfetched_events_fixtures", {
      p_af_league_id: activePair.league, p_season_year: activePair.season,
      p_offset: 0, p_limit: 1,
    });
    const hasMore = pairs.length === 1 ? batch.length === chunkSize : !!(checkMore?.length);

    return new Response(JSON.stringify({
      league_id: activePair.league, season: activePair.season,
      chunk_offset: chunkOffset, chunk_size: chunkSize,
      batch_count: batch.length, fetched, skipped_cached: skipped, failed,
      has_more: hasMore,
      next_chunk_offset: hasMore && pairs.length === 1 ? chunkOffset + chunkSize : null,
      errors: errors.slice(0, 10),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
