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
    const pageNumber: number = body.page ?? 1;
    const competitionType: string = body.competition_type ?? "domestic_league";

    if (!leagueId) throw new Error("league_id required");

    const hash = `player-season-${leagueId}-${seasonYear}-p${pageNumber}`;
    const endpoint = `https://v3.football.api-sports.io/players?league=${leagueId}&season=${seasonYear}&page=${pageNumber}`;

    // Idempotency check
    const { data: existing } = await supabase
      .from("af_player_season_stats_raw")
      .select("id, players_in_page")
      .eq("response_hash", hash)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        league_id: leagueId, season: seasonYear, page: pageNumber,
        skipped_cached: true, players_in_page: existing.players_in_page,
        has_more: false,
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let httpStatus = 0;
    const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
    httpStatus = resp.status;
    if (!resp.ok) throw new Error(`HTTP ${httpStatus}`);

    const json = await resp.json();
    const players: any[] = json?.response ?? [];
    const paging: { current: number; total: number } = json?.paging ?? { current: pageNumber, total: 1 };

    const { error: insErr } = await supabase.from("af_player_season_stats_raw").insert({
      provider: "api_football",
      competition_type: competitionType,
      league_id: leagueId,
      season: seasonYear,
      page_number: pageNumber,
      api_football_player_id: null,
      endpoint,
      request_params: { league: leagueId, season: seasonYear, page: pageNumber },
      response_hash: hash,
      response_json: { players },
      http_status: httpStatus,
      players_in_page: players.length,
      transform_status: "raw",
    });
    if (insErr && insErr.code !== "23505") throw insErr;

    const hasMore = paging.current < paging.total;

    return new Response(JSON.stringify({
      league_id: leagueId, season: seasonYear,
      competition_type: competitionType,
      page: pageNumber, total_pages: paging.total,
      players_in_page: players.length,
      fetched: 1, skipped_cached: false,
      has_more: hasMore,
      next_page: hasMore ? pageNumber + 1 : null,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
