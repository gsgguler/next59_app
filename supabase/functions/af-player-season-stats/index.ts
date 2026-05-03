import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fetches /players?league={league_id}&season={season} with pagination.
// Works for both domestic leagues AND UEFA (league_id 2, 3, 531).
// Raw-first: stores pages in af_player_season_stats_raw.
// Normalize via: SELECT af_normalize_player_season_stats(league_id, season)
// competition_type: domestic_league | uefa_club
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
    const startPage: number = body.page ?? body.start_page ?? 1;
    const maxPages: number = body.max_pages ?? 1; // how many pages to fetch in this call
    const competitionType: string = body.competition_type ?? "domestic_league";

    if (!leagueId) throw new Error("league_id required");

    let fetched = 0, skipped = 0, failed = 0;
    let totalPages = startPage;
    const errors: string[] = [];

    for (let page = startPage; page < startPage + maxPages; page++) {
      const hash = `player-season-${leagueId}-${seasonYear}-p${page}`;
      const endpoint = `https://v3.football.api-sports.io/players?league=${leagueId}&season=${seasonYear}&page=${page}`;

      const { data: existing } = await supabase
        .from("af_player_season_stats_raw")
        .select("id")
        .eq("response_hash", hash)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${httpStatus}`);
        const json = await resp.json();
        const players: any[] = json?.response ?? [];
        const paging: { current: number; total: number } = json?.paging ?? { current: page, total: page };
        totalPages = paging.total;

        const { error: insErr } = await supabase.from("af_player_season_stats_raw").insert({
          provider: "api_football",
          competition_type: competitionType,
          league_id: leagueId,
          season: seasonYear,
          page_number: page,
          api_football_player_id: null,
          endpoint,
          request_params: { league: leagueId, season: seasonYear, page },
          response_hash: hash,
          response_json: { players },
          http_status: httpStatus,
          players_in_page: players.length,
          transform_status: "raw",
        });
        if (insErr && insErr.code !== "23505") throw insErr;
        fetched++;

        // Stop early if we've reached the last page
        if (page >= paging.total) break;
      } catch (e: any) {
        failed++;
        errors.push(`page ${page}: ${e.message}`);
        if (failed > 3) break; // abort on repeated failures
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    const nextStart = startPage + maxPages;
    const hasMore = nextStart <= totalPages;

    return new Response(JSON.stringify({
      league_id: leagueId, season: seasonYear,
      competition_type: competitionType,
      start_page: startPage, max_pages: maxPages,
      total_pages: totalPages,
      fetched, skipped_cached: skipped, failed,
      has_more: hasMore,
      next_start_page: hasMore ? nextStart : null,
      errors: errors.slice(0, 5),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
