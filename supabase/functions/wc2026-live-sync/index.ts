import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
  isRateLimitLow,
} from "../_shared/apiFootballClient.ts";

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

// ── Status sets ───────────────────────────────────────────────────────────────

const LIVE_STATUSES    = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

// ── Event key ─────────────────────────────────────────────────────────────────

function buildEventKey(
  afFixtureId: number,
  elapsed: number,
  extra: number | null,
  teamId: number,
  playerId: number | null,
  type: string,
  detail: string,
  comments: string | null,
): string {
  return [afFixtureId, elapsed, extra ?? "", teamId, playerId ?? "", type, detail, comments ?? ""]
    .join("|");
}

// ── Live scenario generator ───────────────────────────────────────────────────

interface StatSummary {
  is_home: boolean;
  ball_possession: number;
  shots_on_goal: number;
  corner_kicks: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
}

function generateLiveScenarios(
  fixtureUuid: string,
  fixtureKey: string,
  afFixtureId: number,
  elapsed: number,
  homeScore: number,
  awayScore: number,
  stats: StatSummary[],
): Record<string, unknown>[] {
  const home = stats.find(s => s.is_home);
  const away = stats.find(s => !s.is_home);

  const homePoss          = home?.ball_possession ?? 50;
  const homeShotsOnTarget = home?.shots_on_goal ?? 0;
  const awayShotsOnTarget = away?.shots_on_goal ?? 0;
  const homeCorners       = home?.corner_kicks ?? 0;
  const awayCorners       = away?.corner_kicks ?? 0;
  const homeFouls         = home?.fouls ?? 0;
  const awayFouls         = away?.fouls ?? 0;
  const homeYellows       = home?.yellow_cards ?? 0;
  const awayYellows       = away?.yellow_cards ?? 0;

  const totalShots  = homeShotsOnTarget + awayShotsOnTarget;
  const scoreDiff   = homeScore - awayScore;

  const goalRiskHome = Math.min(0.35, (homeShotsOnTarget / Math.max(1, totalShots)) * 0.30 + (homePoss / 100) * 0.10);
  const goalRiskAway = Math.min(0.35, (awayShotsOnTarget / Math.max(1, totalShots)) * 0.30 + ((100 - homePoss) / 100) * 0.10);
  const cardRisk     = Math.min(0.40, ((homeYellows + awayYellows) / 90) * elapsed * 0.08 + (homeFouls + awayFouls > 20 ? 0.10 : 0.04));
  const cornerRisk   = Math.min(0.35, ((homeCorners + awayCorners) / Math.max(1, elapsed)) * 5 * 0.08);
  const foulIntensity = Math.min(0.40, (homeFouls + awayFouls) / Math.max(1, elapsed) * 10 * 0.06);

  const momentumSide = homePoss > 55 ? "home" : homePoss < 45 ? "away" : scoreDiff > 0 ? "home" : scoreDiff < 0 ? "away" : "balanced";
  const periodStart  = Math.min(Math.floor(elapsed / 5) * 5, 85);

  return [{
    fixture_id:              fixtureUuid,
    fixture_key:             fixtureKey,
    api_football_fixture_id: afFixtureId,
    live_minute:             elapsed,
    period_start:            periodStart,
    period_end:              Math.min(periodStart + 5, 90),
    home_score:              homeScore,
    away_score:              awayScore,
    momentum_side:           momentumSide,
    goal_risk_home:          parseFloat(goalRiskHome.toFixed(4)),
    goal_risk_away:          parseFloat(goalRiskAway.toFixed(4)),
    card_risk:               parseFloat(cardRisk.toFixed(4)),
    corner_risk:             parseFloat(cornerRisk.toFixed(4)),
    foul_intensity:          parseFloat(foulIntensity.toFixed(4)),
    narrative_text:          null,
    is_current:              true,
    is_public:               true,
    generated_at:            new Date().toISOString(),
  }];
}

// ── Process a single WC2026 fixture ──────────────────────────────────────────

async function processFixture(
  supabase: ReturnType<typeof createClient>,
  afFixtureId: number,
  fixtureUuid: string,
  fixtureKey: string,
  jobName: string,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { af_fixture_id: afFixtureId, fixture_uuid: fixtureUuid };

  // ── WC2026 scope guard ────────────────────────────────────────────────────
  const guard = await assertWc2026FixtureScope(afFixtureId);
  if (!guard.isWc2026) {
    return { ...result, status: "skipped", reason: guard.reason };
  }

  // ── 1. Fixture state ──────────────────────────────────────────────────────
  const fixtureResult = await apiFootballGet<Record<string, unknown>>(
    `fixtures`,
    { id: afFixtureId },
    { jobName, apiFootballFixtureId: afFixtureId, isWc2026Scope: true },
  );

  if (fixtureResult.results === 0 || fixtureResult.data.length === 0) {
    result.status = "no_fixture_data";
    return result;
  }

  const fix = fixtureResult.data[0] as {
    fixture: {
      id: number;
      referee: string | null;
      status: { short: string; long: string; elapsed: number | null; extra: number | null };
      periods: { first: number | null; second: number | null };
      venue: { id: number | null };
    };
    goals:  { home: number | null; away: number | null };
    score: {
      halftime:  { home: number | null; away: number | null };
      fulltime:  { home: number | null; away: number | null };
      extratime: { home: number | null; away: number | null };
      penalty:   { home: number | null; away: number | null };
    };
  };

  const statusShort = fix.fixture.status.short;
  const statusLong  = fix.fixture.status.long;
  const elapsed     = fix.fixture.status.elapsed ?? 0;
  const extra       = fix.fixture.status.extra ?? null;
  const homeScore   = fix.goals.home ?? 0;
  const awayScore   = fix.goals.away ?? 0;
  const isLive      = LIVE_STATUSES.has(statusShort);
  const isFinished  = FINISHED_STATUSES.has(statusShort);

  // Write to old frontend table (backward compat — powers fixture cards & puan durumu)
  await supabase.from("wc2026_live_match_state").upsert({
    fixture_id:           fixtureUuid,
    fixture_key:          fixtureKey,
    api_football_fixture_id: afFixtureId,
    status_short:         statusShort,
    status_long:          statusLong,
    elapsed_minute:       elapsed,
    home_score:           homeScore,
    away_score:           awayScore,
    home_score_ht:        fix.score.halftime.home,
    away_score_ht:        fix.score.halftime.away,
    home_score_et:        fix.score.extratime?.home ?? null,
    away_score_et:        fix.score.extratime?.away ?? null,
    home_score_pen:       fix.score.penalty?.home ?? null,
    away_score_pen:       fix.score.penalty?.away ?? null,
    raw_fixture_json:     fixtureResult.data[0],
    synced_at:            new Date().toISOString(),
  }, { onConflict: "fixture_id" });

  // Write to new operational table (richer, API-aligned schema)
  await supabase.from("wc_live_match_state").upsert({
    api_football_fixture_id: afFixtureId,
    fixture_id:     fixtureUuid,
    status_short:   statusShort,
    status_long:    statusLong,
    elapsed:        elapsed,
    extra:          extra,
    home_goals:     homeScore,
    away_goals:     awayScore,
    period_first:   fix.fixture.periods?.first ?? null,
    period_second:  fix.fixture.periods?.second ?? null,
    referee:        fix.fixture.referee ?? null,
    venue_id:       fix.fixture.venue?.id ?? null,
    is_live:        isLive,
    is_finished:    isFinished,
    last_api_update_at: new Date().toISOString(),
    raw:            fixtureResult.data[0],
    updated_at:     new Date().toISOString(),
  }, { onConflict: "api_football_fixture_id" });

  result.status_short        = statusShort;
  result.home_score          = homeScore;
  result.away_score          = awayScore;
  result.match_state_stored  = true;

  // ── 2. Events ─────────────────────────────────────────────────────────────
  const eventsResult = await apiFootballGet<Record<string, unknown>>(
    `fixtures/events`,
    { fixture: afFixtureId },
    { jobName, apiFootballFixtureId: afFixtureId, isWc2026Scope: true },
  );

  if (eventsResult.results > 0 && eventsResult.data.length > 0) {
    // Legacy table: delete + insert (existing behavior)
    await supabase.from("wc2026_live_events").delete().eq("fixture_id", fixtureUuid);
    const legacyEventRows = eventsResult.data.map((ev) => {
      const e = ev as {
        time: { elapsed: number; extra: number | null };
        team: { id: number; name: string };
        player: { id: number | null; name: string | null };
        assist: { id: number | null; name: string | null };
        type: string; detail: string; comments: string | null;
      };
      return {
        fixture_id: fixtureUuid,
        api_football_fixture_id: afFixtureId,
        event_time_elapsed: e.time.elapsed,
        event_time_extra:   e.time.extra,
        team_name:          e.team.name,
        team_api_id:        e.team.id,
        player_name:        e.player.name,
        player_api_id:      e.player.id,
        assist_name:        e.assist.name,
        assist_api_id:      e.assist.id,
        event_type:         e.type,
        event_detail:       e.detail,
        event_comments:     e.comments,
        raw_event_json:     ev,
        synced_at:          new Date().toISOString(),
      };
    });
    await supabase.from("wc2026_live_events").insert(legacyEventRows);

    // New operational table: upsert via event_key (idempotent)
    const newEventRows = eventsResult.data.map((ev) => {
      const e = ev as {
        time: { elapsed: number; extra: number | null };
        team: { id: number; name: string };
        player: { id: number | null; name: string | null };
        assist: { id: number | null; name: string | null };
        type: string; detail: string; comments: string | null;
      };
      return {
        api_football_fixture_id: afFixtureId,
        event_key:    buildEventKey(afFixtureId, e.time.elapsed, e.time.extra, e.team.id, e.player.id, e.type, e.detail, e.comments),
        elapsed:      e.time.elapsed,
        extra:        e.time.extra,
        team_id:      e.team.id,
        team_name:    e.team.name,
        player_id:    e.player.id,
        player_name:  e.player.name,
        assist_id:    e.assist.id,
        assist_name:  e.assist.name,
        type:         e.type,
        detail:       e.detail,
        comments:     e.comments,
        raw:          ev,
        updated_at:   new Date().toISOString(),
      };
    });
    await supabase.from("wc_fixture_events").upsert(newEventRows, { onConflict: "event_key" });
    result.events_stored = newEventRows.length;
  } else {
    result.events_stored = 0;
  }

  // ── 3. Statistics ─────────────────────────────────────────────────────────
  const statsResult = await apiFootballGet<Record<string, unknown>>(
    `fixtures/statistics`,
    { fixture: afFixtureId },
    { jobName, apiFootballFixtureId: afFixtureId, isWc2026Scope: true },
  );

  const parsedStats: StatSummary[] = [];

  if (statsResult.results > 0 && statsResult.data.length > 0) {
    // Legacy table: delete + insert
    await supabase.from("wc2026_live_statistics").delete().eq("fixture_id", fixtureUuid);
    const legacyStatRows = statsResult.data.map((ts, idx) => {
      const t = ts as { team: { id: number; name: string }; statistics: { type: string; value: string | number | null }[] };
      const getStat = (type: string): number => {
        const f = t.statistics.find(s => s.type === type);
        if (!f || f.value == null) return 0;
        return parseFloat(String(f.value).replace("%", "")) || 0;
      };
      parsedStats.push({
        is_home:          idx === 0,
        ball_possession:  getStat("Ball Possession"),
        shots_on_goal:    getStat("Shots on Goal"),
        corner_kicks:     getStat("Corner Kicks"),
        fouls:            getStat("Fouls"),
        yellow_cards:     getStat("Yellow Cards"),
        red_cards:        getStat("Red Cards"),
      });
      return {
        fixture_id: fixtureUuid,
        api_football_fixture_id: afFixtureId,
        team_name:            t.team.name,
        team_api_id:          t.team.id,
        shots_on_goal:        getStat("Shots on Goal"),
        shots_off_goal:       getStat("Shots off Goal"),
        total_shots:          getStat("Total Shots"),
        blocked_shots:        getStat("Blocked Shots"),
        shots_inside_box:     getStat("Shots insidebox"),
        shots_outside_box:    getStat("Shots outsidebox"),
        fouls:                getStat("Fouls"),
        corner_kicks:         getStat("Corner Kicks"),
        offsides:             getStat("Offsides"),
        ball_possession:      getStat("Ball Possession"),
        yellow_cards:         getStat("Yellow Cards"),
        red_cards:            getStat("Red Cards"),
        goalkeeper_saves:     getStat("Goalkeeper Saves"),
        total_passes:         getStat("Total passes"),
        passes_accurate:      getStat("Passes accurate"),
        passes_pct:           getStat("Passes %"),
        expected_goals:       getStat("expected_goals"),
        raw_statistics_json:  ts,
        synced_at:            new Date().toISOString(),
      };
    });
    await supabase.from("wc2026_live_statistics").insert(legacyStatRows);

    // New operational table: normalized one-row-per-stat-type upsert
    const newStatRows: Record<string, unknown>[] = [];
    for (const ts of statsResult.data) {
      const t = ts as { team: { id: number; name: string }; statistics: { type: string; value: string | number | null }[] };
      for (const stat of t.statistics) {
        if (!stat.type) continue;
        newStatRows.push({
          api_football_fixture_id: afFixtureId,
          team_id:    t.team.id,
          type:       stat.type,
          value:      stat.value != null ? JSON.stringify(stat.value) : null,
          half:       null,
          raw:        ts,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (newStatRows.length > 0) {
      await supabase.from("wc_fixture_statistics").upsert(newStatRows, {
        onConflict: "api_football_fixture_id,team_id,type,half",
        ignoreDuplicates: false,
      });
    }
    result.statistics_stored = statsResult.data.length;
  } else {
    result.statistics_stored = 0;
  }

  // ── 4. Live 5-min scenarios (live matches only) ───────────────────────────
  if (isLive && elapsed > 0) {
    const scenarios = generateLiveScenarios(fixtureUuid, fixtureKey, afFixtureId, elapsed, homeScore, awayScore, parsedStats);
    await supabase.from("wc2026_live_5min_scenarios")
      .update({ is_current: false })
      .eq("fixture_id", fixtureUuid)
      .eq("is_current", true);
    await supabase.from("wc2026_live_5min_scenarios").insert(scenarios);
    result.live_scenarios_generated = scenarios.length;
  } else {
    result.live_scenarios_generated = 0;
    result.note = isFinished
      ? "Match finished — no new live scenarios generated"
      : `Status ${statusShort} — not in-play`;
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

  const startedAt = Date.now();
  const runId = await createSyncRun("wc2026-live-sync");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetAfId: number | null  = body.af_fixture_id ?? null;
    const batchLimit: number         = Math.max(1, Math.min(body.batch_limit ?? 4, 10));
    const jobName = "wc2026-live-sync";

    // ── Discover fixtures to sync ────────────────────────────────────────────
    let fixtures: { id: string; fixture_key: string; api_football_fixture_id: number }[] = [];

    if (targetAfId) {
      const { data } = await supabase
        .from("wc2026_fixtures")
        .select("id, fixture_key, api_football_fixture_id")
        .eq("api_football_fixture_id", targetAfId)
        .limit(1);
      fixtures = data ?? [];
    } else {
      const windowStart = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const windowEnd   = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
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
      await finishSyncRun(runId, "skipped", { meta: { reason: "no_active_fixtures" } });
      return new Response(JSON.stringify({ message: "No active fixtures to sync", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Process each fixture sequentially (API quota management) ────────────
    const results: Record<string, unknown>[] = [];
    let apiCalls = 0;

    for (const f of fixtures) {
      const res = await processFixture(supabase, f.api_football_fixture_id, f.id, f.fixture_key ?? "", jobName)
        .catch(err => ({ af_fixture_id: f.api_football_fixture_id, status: "error", error: String(err) }));

      results.push(res);
      // 3 API calls per fixture (fixtures + events + statistics)
      if ((res as Record<string, unknown>).status !== "skipped") apiCalls += 3;
    }

    const errorCount = results.filter(r => (r as Record<string, unknown>).status === "error").length;

    await finishSyncRun(runId, errorCount === results.length ? "error" : "completed", {
      fixturesProcessed: results.length,
      apiCalls,
      error: errorCount > 0 ? `${errorCount} fixture(s) failed` : undefined,
      meta: { duration_ms: Date.now() - startedAt },
    });

    return new Response(JSON.stringify({
      processed:   results.length,
      errors:      errorCount,
      duration_ms: Date.now() - startedAt,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, "error", { error: `fatal: ${msg}` });
    return new Response(JSON.stringify({ error: "Internal server error", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
