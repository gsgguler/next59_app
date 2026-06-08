import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";
const DELAY_MS = 1800;
// FIFA World Cup 2026 league ID on API-Football
const WC2026_LEAGUE_ID = 1;
const WC2026_SEASON = 2026;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TeamPoolRow {
  api_football_team_id: number;
  team_name: string;
}

interface ApiInjuryPlayer {
  player: {
    id: number;
    name: string;
    photo: string;
    age: number;
    position: string;
    reason: string;
    type: string; // "Injury" | "Suspension"
  };
  team: { id: number; name: string };
  fixture: { id: number | null };
}

interface ApiInjuryResponse {
  response: ApiInjuryPlayer[];
  errors: Record<string, string> | string[];
  results: number;
  paging?: { current: number; total: number };
}

async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("API_FOOTBALL_KEY")!;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "48", 10);

  const { data: teams, error: teamsErr } = await supabase
    .from("wc2026_team_pool")
    .select("api_football_team_id, team_name")
    .order("confederation", { ascending: true })
    .order("team_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (teamsErr || !teams) {
    return new Response(
      JSON.stringify({ error: "Failed to load wc2026_team_pool", detail: teamsErr }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const runId = crypto.randomUUID();
  const runStarted = new Date().toISOString();

  let apiCallsUsed = 0;
  let teamsSucceeded = 0;
  let teamsFailed = 0;
  let emptyResponses = 0;
  let totalInjuriesFound = 0;
  let totalNormalizedRows = 0;
  let rateLimitHit = false;

  const teamResults: Array<{
    team: string;
    api_football_team_id: number;
    status: "success" | "empty" | "error";
    injuries_found: number;
    error?: string;
  }> = [];

  const allInjuredPlayers: Array<{
    team: string;
    player: string;
    type: string;
    reason: string;
    fixture_id: number | null;
  }> = [];

  for (const team of teams as TeamPoolRow[]) {
    if (rateLimitHit) break;
    if (apiCallsUsed > 0) await delay(DELAY_MS);

    try {
      const res = await fetch(
        `${API_BASE}/injuries?team=${team.api_football_team_id}&season=${WC2026_SEASON}`,
        { headers: { "x-apisports-key": apiKey, "Accept": "application/json" } }
      );
      apiCallsUsed++;

      const raw = await res.json() as ApiInjuryResponse;

      // Async audit log — fire-and-forget
      sha256hex(JSON.stringify(raw)).then((hash) =>
        supabase.from("af_injuries_raw").insert({
          af_league_id: WC2026_LEAGUE_ID,
          af_season: WC2026_SEASON,
          af_fixture_id: null,
          endpoint: `/injuries`,
          request_params: { team: team.api_football_team_id, season: WC2026_SEASON },
          response_hash: hash,
          response_json: raw,
          http_status: res.status,
          players_count: raw.response?.length ?? 0,
          transform_status: "wc2026_injury_sync",
        })
      );

      // Check for API-level errors
      const errors = raw.errors;
      const hasErrors = Array.isArray(errors)
        ? errors.length > 0
        : Object.keys(errors ?? {}).length > 0;

      if (hasErrors) {
        const errStr = JSON.stringify(errors);
        rateLimitHit = errStr.toLowerCase().includes("ratelimit") || errStr.toLowerCase().includes("too many");
        throw new Error(errStr);
      }

      if (!raw.response || raw.response.length === 0) {
        emptyResponses++;
        teamsSucceeded++;
        teamResults.push({
          team: team.team_name,
          api_football_team_id: team.api_football_team_id,
          status: "empty",
          injuries_found: 0,
        });
        continue;
      }

      // Normalize injury rows
      const now = new Date().toISOString();
      const players = raw.response;
      const normalizedRows = players.map((entry) => ({
        af_league_id: WC2026_LEAGUE_ID,
        af_season: WC2026_SEASON,
        af_fixture_id: entry.fixture?.id ?? null,
        af_team_id: team.api_football_team_id,
        team_name: team.team_name,
        af_player_id: entry.player?.id ?? null,
        player_name: entry.player?.name ?? null,
        player_photo: entry.player?.photo ?? null,
        player_type: entry.player?.type ?? null,
        player_reason: entry.player?.reason ?? null,
        player_age: entry.player?.age ?? null,
        player_position: entry.player?.position ?? null,
        match_id: null,
        source_provider: "wc2026_injury_sync",
        raw_payload: entry,
        fetched_at: now,
      }));

      // Insert normalized rows — use ignoreDuplicates:true (ON CONFLICT DO NOTHING)
      // so the partial unique index on (af_team_id, af_player_id) guards re-runs
      const insertPromises = [
        supabase.from("af_injuries_normalized").upsert(
          normalizedRows,
          { ignoreDuplicates: true }
        ),
      ];

      // Also update wc2026_player_pool availability for matched players in parallel
      const poolUpdates = players
        .filter((e) => e.player?.id != null)
        .map((e) => {
          const isInjured = (e.player.type ?? "").toLowerCase() !== "suspension";
          return supabase
            .from("wc2026_player_pool")
            .update({
              availability_status: isInjured ? "injured" : "suspended",
              injury_detail: isInjured ? (e.player.reason ?? null) : null,
              suspension_detail: !isInjured ? (e.player.reason ?? null) : null,
              updated_at: now,
            })
            .eq("api_football_team_id", team.api_football_team_id)
            .eq("api_football_player_id", e.player.id);
        });

      await Promise.all([...insertPromises, ...poolUpdates]);

      totalInjuriesFound += players.length;
      totalNormalizedRows += normalizedRows.length;
      teamsSucceeded++;

      teamResults.push({
        team: team.team_name,
        api_football_team_id: team.api_football_team_id,
        status: "success",
        injuries_found: players.length,
      });

      for (const e of players) {
        allInjuredPlayers.push({
          team: team.team_name,
          player: e.player?.name ?? "Unknown",
          type: e.player?.type ?? "Unknown",
          reason: e.player?.reason ?? "",
          fixture_id: e.fixture?.id ?? null,
        });
      }
    } catch (err) {
      teamsFailed++;
      teamResults.push({
        team: team.team_name,
        api_football_team_id: team.api_football_team_id,
        status: "error",
        injuries_found: 0,
        error: String(err),
      });
    }
  }

  const teamsWithInjuries = teamResults.filter((r) => r.injuries_found > 0).length;

  return new Response(
    JSON.stringify({
      run_id: runId,
      run_started: runStarted,
      run_completed: new Date().toISOString(),
      offset,
      rate_limit_hit: rateLimitHit,
      api_calls_used: apiCallsUsed,
      teams_attempted: teams.length,
      teams_succeeded: teamsSucceeded,
      teams_failed: teamsFailed,
      empty_responses: emptyResponses,
      teams_with_injuries: teamsWithInjuries,
      total_injuries_found: totalInjuriesFound,
      total_normalized_rows: totalNormalizedRows,
      injured_players: allInjuredPlayers.slice(0, 50),
      team_results: teamResults,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
