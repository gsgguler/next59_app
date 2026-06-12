import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Internal-Secret",
};

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("ADMIN_JOB_SECRET") ?? Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  if (!secret) return false;
  const header = req.headers.get("X-Internal-Secret") ?? "";
  return header.length > 0 && header === secret;
}

// ── API-Football helpers ───────────────────────────────────────────────────────

const AF_BASE = "https://v3.football.api-sports.io";

async function afGet(
  apiKey: string,
  path: string,
): Promise<{ response: unknown[]; errors: unknown }> {
  const resp = await fetch(`${AF_BASE}${path}`, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });
  if (!resp.ok) {
    throw new Error(`AF API ${resp.status} for ${path}`);
  }
  return resp.json();
}

// ── Live scenario generator ────────────────────────────────────────────────────

function generateLiveScenarios(
  fixtureId: string,
  fixtureKey: string,
  afFixtureId: number,
  elapsed: number,
  homeScore: number,
  awayScore: number,
  statsRows: StatRow[],
): LiveScenarioRow[] {
  const homeStats = statsRows.find(s => s.is_home) ?? null;
  const awayStats = statsRows.find(s => !s.is_home) ?? null;

  const homePoss = homeStats?.ball_possession ?? 50;
  const awayPoss = 100 - homePoss;
  const homeShotsOnTarget = homeStats?.shots_on_goal ?? 0;
  const awayShotsOnTarget = awayStats?.shots_on_goal ?? 0;
  const homeCorners = homeStats?.corner_kicks ?? 0;
  const awayCorners = awayStats?.corner_kicks ?? 0;
  const homeFouls = homeStats?.fouls ?? 0;
  const awayFouls = awayStats?.fouls ?? 0;
  const homeYellows = homeStats?.yellow_cards ?? 0;
  const awayYellows = awayStats?.yellow_cards ?? 0;

  const scoreDiff = homeScore - awayScore;
  const totalShots = homeShotsOnTarget + awayShotsOnTarget;

  const goalRiskHome = Math.min(0.35, (homeShotsOnTarget / Math.max(1, totalShots)) * 0.30 + (homePoss / 100) * 0.10);
  const goalRiskAway = Math.min(0.35, (awayShotsOnTarget / Math.max(1, totalShots)) * 0.30 + (awayPoss / 100) * 0.10);
  const cardRisk = Math.min(0.40, ((homeYellows + awayYellows) / 90) * elapsed * 0.08 + (homeFouls + awayFouls > 20 ? 0.10 : 0.04));
  const cornerRisk = Math.min(0.35, ((homeCorners + awayCorners) / Math.max(1, elapsed)) * 5 * 0.08);
  const foulIntensity = Math.min(0.40, (homeFouls + awayFouls) / Math.max(1, elapsed) * 10 * 0.06);

  const momentumSide = homePoss > 55
    ? "home"
    : homePoss < 45
    ? "away"
    : scoreDiff > 0
    ? "home"
    : scoreDiff < 0
    ? "away"
    : "balanced";

  const currentPeriodStart = Math.floor(elapsed / 5) * 5;
  const periodStart = Math.min(currentPeriodStart, 85);

  return [{
    fixture_id: fixtureId,
    fixture_key: fixtureKey,
    api_football_fixture_id: afFixtureId,
    live_minute: elapsed,
    period_start: periodStart,
    period_end: Math.min(periodStart + 5, 90),
    home_score: homeScore,
    away_score: awayScore,
    momentum_side: momentumSide,
    goal_risk_home: parseFloat(goalRiskHome.toFixed(4)),
    goal_risk_away: parseFloat(goalRiskAway.toFixed(4)),
    card_risk: parseFloat(cardRisk.toFixed(4)),
    corner_risk: parseFloat(cornerRisk.toFixed(4)),
    foul_intensity: parseFloat(foulIntensity.toFixed(4)),
    narrative_text: null,
    is_current: true,
    is_public: true,
    generated_at: new Date().toISOString(),
  }];
}

interface StatRow {
  is_home: boolean;
  ball_possession: number;
  shots_on_goal: number;
  corner_kicks: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
}

interface LiveScenarioRow {
  fixture_id: string;
  fixture_key: string;
  api_football_fixture_id: number;
  live_minute: number;
  period_start: number;
  period_end: number;
  home_score: number;
  away_score: number;
  momentum_side: string;
  goal_risk_home: number;
  goal_risk_away: number;
  card_risk: number;
  corner_risk: number;
  foul_intensity: number;
  narrative_text: null;
  is_current: boolean;
  is_public: boolean;
  generated_at: string;
}

// ── Process a single fixture ───────────────────────────────────────────────────

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

async function processFixture(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  afFixtureId: number,
  fixtureUuid: string,
  fixtureKey: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {
    af_fixture_id: afFixtureId,
    fixture_uuid: fixtureUuid,
  };

  // ── 1. Fetch fixture state ────────────────────────────────────────────────
  let fixtureData: Record<string, unknown> | null = null;
  try {
    const { response } = await afGet(apiKey, `/fixtures?id=${afFixtureId}`);
    fixtureData = (response?.[0] as Record<string, unknown>) ?? null;
    result.fixtures_fetched = response?.length ?? 0;
  } catch (err) {
    result.fixtures_error = String(err);
    return { ...result, status: "error" };
  }

  if (!fixtureData) return { ...result, status: "no_fixture_data" };

  const fix = fixtureData as {
    fixture: { status: { short: string; long: string; elapsed: number | null }; periods: Record<string, unknown> };
    goals: { home: number | null; away: number | null };
    score: { halftime: { home: number | null; away: number | null }; extratime: { home: number | null; away: number | null }; penalty: { home: number | null; away: number | null } };
  };

  const statusShort = fix.fixture.status.short;
  const statusLong = fix.fixture.status.long;
  const elapsed = fix.fixture.status.elapsed ?? 0;
  const homeScore = fix.goals.home ?? 0;
  const awayScore = fix.goals.away ?? 0;

  // Upsert live match state
  await supabase
    .from("wc2026_live_match_state")
    .upsert({
      fixture_id: fixtureUuid,
      fixture_key: fixtureKey,
      api_football_fixture_id: afFixtureId,
      status_short: statusShort,
      status_long: statusLong,
      elapsed_minute: elapsed,
      home_score: homeScore,
      away_score: awayScore,
      home_score_ht: fix.score.halftime.home,
      away_score_ht: fix.score.halftime.away,
      home_score_et: fix.score.extratime?.home ?? null,
      away_score_et: fix.score.extratime?.away ?? null,
      home_score_pen: fix.score.penalty?.home ?? null,
      away_score_pen: fix.score.penalty?.away ?? null,
      raw_fixture_json: fixtureData,
      synced_at: new Date().toISOString(),
    }, { onConflict: "fixture_id" });

  result.status_short = statusShort;
  result.home_score = homeScore;
  result.away_score = awayScore;
  result.match_state_stored = true;

  // ── 2. Fetch events ───────────────────────────────────────────────────────
  let eventsResponse: unknown[] = [];
  try {
    const { response } = await afGet(apiKey, `/fixtures/events?fixture=${afFixtureId}`);
    eventsResponse = response ?? [];
    result.events_fetched = eventsResponse.length;
  } catch (err) {
    result.events_error = String(err);
  }

  if (eventsResponse.length > 0) {
    await supabase
      .from("wc2026_live_events")
      .delete()
      .eq("fixture_id", fixtureUuid);

    const eventRows = eventsResponse.map((ev: unknown) => {
      const e = ev as {
        time: { elapsed: number; extra: number | null };
        team: { id: number; name: string };
        player: { id: number | null; name: string | null };
        assist: { id: number | null; name: string | null };
        type: string;
        detail: string;
        comments: string | null;
      };
      return {
        fixture_id: fixtureUuid,
        api_football_fixture_id: afFixtureId,
        event_time_elapsed: e.time.elapsed,
        event_time_extra: e.time.extra,
        team_name: e.team.name,
        team_api_id: e.team.id,
        player_name: e.player.name,
        player_api_id: e.player.id,
        assist_name: e.assist.name,
        assist_api_id: e.assist.id,
        event_type: e.type,
        event_detail: e.detail,
        event_comments: e.comments,
        raw_event_json: ev,
        synced_at: new Date().toISOString(),
      };
    });

    await supabase.from("wc2026_live_events").insert(eventRows);
    result.events_stored = eventRows.length;
  }

  // ── 3. Fetch statistics ───────────────────────────────────────────────────
  let statsResponse: unknown[] = [];
  let parsedStats: StatRow[] = [];
  try {
    const { response } = await afGet(apiKey, `/fixtures/statistics?fixture=${afFixtureId}`);
    statsResponse = response ?? [];
    result.statistics_fetched = statsResponse.length;
  } catch (err) {
    result.statistics_error = String(err);
  }

  if (statsResponse.length > 0) {
    await supabase
      .from("wc2026_live_statistics")
      .delete()
      .eq("fixture_id", fixtureUuid);

    const statRows = statsResponse.map((teamStat: unknown) => {
      const ts = teamStat as {
        team: { id: number; name: string };
        statistics: { type: string; value: string | number | null }[];
      };
      const getStat = (type: string): number => {
        const found = ts.statistics.find(s => s.type === type);
        if (!found || found.value == null) return 0;
        const v = String(found.value).replace("%", "");
        return parseFloat(v) || 0;
      };
      const row = {
        fixture_id: fixtureUuid,
        api_football_fixture_id: afFixtureId,
        team_name: ts.team.name,
        team_api_id: ts.team.id,
        shots_on_goal: getStat("Shots on Goal"),
        shots_off_goal: getStat("Shots off Goal"),
        total_shots: getStat("Total Shots"),
        blocked_shots: getStat("Blocked Shots"),
        shots_inside_box: getStat("Shots insidebox"),
        shots_outside_box: getStat("Shots outsidebox"),
        fouls: getStat("Fouls"),
        corner_kicks: getStat("Corner Kicks"),
        offsides: getStat("Offsides"),
        ball_possession: getStat("Ball Possession"),
        yellow_cards: getStat("Yellow Cards"),
        red_cards: getStat("Red Cards"),
        goalkeeper_saves: getStat("Goalkeeper Saves"),
        total_passes: getStat("Total passes"),
        passes_accurate: getStat("Passes accurate"),
        passes_pct: getStat("Passes %"),
        expected_goals: getStat("expected_goals"),
        raw_statistics_json: teamStat,
        synced_at: new Date().toISOString(),
      };
      return row;
    });

    await supabase.from("wc2026_live_statistics").insert(statRows);
    result.statistics_stored = statRows.length;

    // Build StatRow for scenario generation (index 0 = home by AF convention)
    parsedStats = statsResponse.map((ts: unknown, idx: number) => {
      const t = ts as { statistics: { type: string; value: string | number | null }[] };
      const getStat = (type: string): number => {
        const found = t.statistics.find(s => s.type === type);
        if (!found || found.value == null) return 0;
        return parseFloat(String(found.value).replace("%", "")) || 0;
      };
      return {
        is_home: idx === 0,
        ball_possession: getStat("Ball Possession"),
        shots_on_goal: getStat("Shots on Goal"),
        corner_kicks: getStat("Corner Kicks"),
        fouls: getStat("Fouls"),
        yellow_cards: getStat("Yellow Cards"),
        red_cards: getStat("Red Cards"),
      };
    });
  }

  // ── 4. Fetch lineups ──────────────────────────────────────────────────────
  try {
    const { response } = await afGet(apiKey, `/fixtures/lineups?fixture=${afFixtureId}`);
    result.lineups_fetched = response?.length ?? 0;
  } catch (err) {
    result.lineups_error = String(err);
  }

  // ── 5. Generate live 5-min scenarios if match is in play ──────────────────
  if (LIVE_STATUSES.has(statusShort) && elapsed > 0) {
    const scenarios = generateLiveScenarios(
      fixtureUuid, fixtureKey, afFixtureId,
      elapsed, homeScore, awayScore, parsedStats,
    );

    await supabase
      .from("wc2026_live_5min_scenarios")
      .update({ is_current: false })
      .eq("fixture_id", fixtureUuid)
      .eq("is_current", true);

    await supabase.from("wc2026_live_5min_scenarios").insert(scenarios);
    result.live_scenarios_generated = scenarios.length;
  } else if (FINISHED_STATUSES.has(statusShort)) {
    result.live_scenarios_generated = 0;
    result.note = "Match finished — no new live scenarios generated";
  } else {
    result.live_scenarios_generated = 0;
    result.note = `Status ${statusShort} — not in-play`;
  }

  return { ...result, status: "ok" };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = Deno.env.get("API_FOOTBALL_KEY") ?? "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetAfId: number | null = body.af_fixture_id ?? null;
    const batchLimit: number = Math.max(1, Math.min(body.batch_limit ?? 4, 10));

    let fixtures: { id: string; fixture_key: string; api_football_fixture_id: number }[] = [];

    if (targetAfId) {
      const { data } = await supabase
        .from("wc2026_fixtures")
        .select("id, fixture_key, api_football_fixture_id")
        .eq("api_football_fixture_id", targetAfId)
        .limit(1);
      fixtures = data ?? [];
    } else {
      const now = new Date().toISOString();
      const windowStart = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("wc2026_fixtures")
        .select("id, fixture_key, api_football_fixture_id")
        .not("api_football_fixture_id", "is", null)
        .gte("kickoff_utc", windowStart)
        .lte("kickoff_utc", windowEnd)
        .order("kickoff_utc")
        .limit(batchLimit);

      fixtures = data ?? [];
    }

    if (!fixtures.length) {
      return new Response(JSON.stringify({ message: "No active fixtures to sync", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(
      fixtures.map(f =>
        processFixture(supabase, apiKey, f.api_football_fixture_id, f.id, f.fixture_key).catch(err => ({
          fixture_id: f.id,
          af_fixture_id: f.api_football_fixture_id,
          status: "error",
          error: String(err),
        }))
      )
    );

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("handler error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
