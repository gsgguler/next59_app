import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
  isLiveOddsSyncEnabled,
  sleep,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixtureApiResponse {
  fixture: {
    id:       number;
    referee:  string | null;
    status:   { short: string; long: string; elapsed: number | null };
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime:  { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
}

interface FixtureEventResponse {
  time:    { elapsed: number; extra: number | null };
  team:    { id: number; name: string };
  player:  { id: number | null; name: string | null };
  assist:  { id: number | null; name: string | null };
  type:    string;
  detail:  string;
  comments: string | null;
}

interface FixtureStatResponse {
  team:       { id: number; name: string };
  statistics: Array<{ type: string; value: string | number | null }>;
}

interface OddsResponse {
  fixture:   { id: number };
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

// ─── Process one live fixture ─────────────────────────────────────────────────

async function pollFixture(
  supabase: ReturnType<typeof getSupabase>,
  afId: number,
): Promise<{ apiCalls: number }> {
  let apiCalls = 0;
  const now = new Date().toISOString();

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) {
    console.warn(`[live-poller] ${afId} failed scope guard`);
    return { apiCalls };
  }

  // 1. Fixture status + score
  const fixtureResult = await apiFootballGet<FixtureApiResponse>(
    "fixtures",
    { id: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  apiCalls++;

  const fixtureData = fixtureResult.data[0];
  if (!fixtureData) return { apiCalls };

  const statusShort = fixtureData.fixture.status.short;
  const isTerminal  = TERMINAL_STATUSES.has(statusShort);
  const refereeRaw  = fixtureData.fixture.referee;
  const refereeName = refereeRaw
    ? refereeRaw.replace(/\s*\([^)]+\)\s*$/, "").trim() || null
    : null;

  // Update main fixture row
  const fixtureUpdate: Record<string, unknown> = {
    fixture_status:     statusShort,
    is_live:            !isTerminal,
    elapsed:            fixtureData.fixture.status.elapsed ?? null,
    home_score:         fixtureData.goals.home,
    away_score:         fixtureData.goals.away,
    home_score_ht:      fixtureData.score.halftime.home,
    away_score_ht:      fixtureData.score.halftime.away,
    last_live_poll_at:  now,
    updated_at:         now,
  };
  if (refereeName) fixtureUpdate.referee_name = refereeName;
  if (isTerminal) {
    fixtureUpdate.final_home_score    = fixtureData.score.fulltime.home ?? fixtureData.goals.home;
    fixtureUpdate.final_away_score    = fixtureData.score.fulltime.away ?? fixtureData.goals.away;
    fixtureUpdate.finished_at         = now;
    fixtureUpdate.finalization_status = "awaiting_finalization";
  }

  await supabase
    .from("wc2026_fixtures")
    .update(fixtureUpdate)
    .eq("api_football_fixture_id", afId);

  // 2. Events
  await sleep(200);
  const eventsResult = await apiFootballGet<FixtureEventResponse>(
    "fixtures/events",
    { fixture: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  apiCalls++;

  for (const evt of eventsResult.data) {
    await supabase
      .from("wc_fixture_events")
      .upsert({
        api_football_fixture_id: afId,
        elapsed:     evt.time.elapsed,
        elapsed_extra: evt.time.extra ?? null,
        team_id:     evt.team.id,
        team_name:   evt.team.name,
        player_id:   evt.player.id ?? null,
        player_name: evt.player.name ?? null,
        assist_id:   evt.assist.id ?? null,
        assist_name: evt.assist.name ?? null,
        type:        evt.type,
        detail:      evt.detail,
        comments:    evt.comments ?? null,
        raw:         evt,
        updated_at:  now,
      }, {
        onConflict: "api_football_fixture_id,elapsed,type,detail,player_id",
        ignoreDuplicates: false,
      });
  }

  // 3. Statistics
  await sleep(200);
  const statsResult = await apiFootballGet<FixtureStatResponse>(
    "fixtures/statistics",
    { fixture: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  apiCalls++;

  for (const teamStat of statsResult.data) {
    for (const stat of teamStat.statistics) {
      await supabase
        .from("wc_fixture_statistics")
        .upsert({
          api_football_fixture_id: afId,
          team_id:   teamStat.team.id,
          team_name: teamStat.team.name,
          type:      stat.type,
          value:     stat.value != null ? String(stat.value) : null,
          updated_at: now,
        }, {
          onConflict: "api_football_fixture_id,team_id,type",
          ignoreDuplicates: false,
        });
    }
  }

  // 4. Optional live odds
  if (isLiveOddsSyncEnabled()) {
    await sleep(200);
    const oddsResult = await apiFootballGet<OddsResponse>(
      "odds/live",
      { fixture: afId },
      { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
    );
    apiCalls++;

    const oddsData = oddsResult.data[0];
    if (oddsData) {
      await supabase
        .from("wc_live_odds_snapshots")
        .insert({
          api_football_fixture_id: afId,
          snapshot_at: now,
          raw: oddsData,
        });
    }
  }

  // 5. Queue for finalization if terminal
  if (isTerminal) {
    await supabase
      .from("wc_fixture_finalization_queue")
      .upsert(
        { api_football_fixture_id: afId, status: "pending", updated_at: now },
        { onConflict: "api_football_fixture_id", ignoreDuplicates: true },
      );
    console.log(`[live-poller] ${afId} terminal (${statusShort}) — queued for finalization`);
  }

  // Increment poll count
  await supabase.rpc("wc2026_increment_live_poll_count", { p_fixture_id: afId }).maybeSingle();

  return { apiCalls };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-live-poller");
  let polled = 0, totalApiCalls = 0;

  try {
    const supabase = getSupabase();

    // Fetch currently live WC2026 fixtures
    const { data: liveFixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("api_football_fixture_id")
      .eq("is_live", true)
      .eq("is_closed", false)
      .not("api_football_fixture_id", "is", null);

    if (error) throw error;
    if (!liveFixtures || liveFixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no live fixtures" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const fixture of liveFixtures) {
      const afId = Number(fixture.api_football_fixture_id);
      await sleep(300);
      const { apiCalls } = await pollFixture(supabase, afId);
      totalApiCalls += apiCalls;
      polled++;
    }

    await finishSyncRun(runId, "completed", { fixturesProcessed: polled, apiCalls: totalApiCalls });
    return new Response(JSON.stringify({ ok: true, polled, apiCalls: totalApiCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-live-poller] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: polled, apiCalls: totalApiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
