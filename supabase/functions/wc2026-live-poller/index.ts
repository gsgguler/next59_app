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
    status:   { short: string; long: string; elapsed: number | null; extra: number | null };
    periods:  { first: number | null; second: number | null };
    venue:    { id: number | null };
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

interface FixturePlayerStatResponse {
  team: { id: number; name: string };
  players: Array<{
    player: { id: number | null; name: string; photo: string | null };
    statistics: Array<{
      games:    { minutes: number | null; rating: string | null; position: string | null; captain: boolean | null };
      goals:    { total: number | null; assists: number | null; conceded: number | null; saves: number | null };
      cards:    { yellow: number | null; red: number | null };
      shots:    { total: number | null; on: number | null };
      passes:   { total: number | null; key: number | null; accuracy: string | null };
      tackles:  { total: number | null; blocks: number | null; interceptions: number | null };
      dribbles: { attempts: number | null; success: number | null };
    }>;
  }>;
}

interface LineupTeamResponse {
  team:        { id: number; name: string };
  formation:   string | null;
  startXI:     Array<{ player: { id: number | null; name: string; number: number | null; pos: string | null; grid: string | null } }>;
  substitutes: Array<{ player: { id: number | null; name: string; number: number | null; pos: string | null; grid: string | null } }>;
  coach:       { id: number | null; name: string | null; photo: string | null };
}

interface OddsResponse {
  fixture:    { id: number };
  bookmakers: Array<{
    id: number; name: string;
    bets: Array<{ id: number; name: string; values: Array<{ value: string; odd: string }> }>;
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

interface PollCounts {
  apiCalls: number;
  eventsUpserted: number;
  statisticsUpserted: number;
  playersUpserted: number;
  lineupsUpserted: number;
  oddsSnapshotsInserted: number;
}

async function pollFixture(
  supabase: ReturnType<typeof getSupabase>,
  afId: number,
  dryRun: boolean,
): Promise<PollCounts> {
  const counts: PollCounts = {
    apiCalls: 0, eventsUpserted: 0, statisticsUpserted: 0,
    playersUpserted: 0, lineupsUpserted: 0, oddsSnapshotsInserted: 0,
  };
  const now = new Date().toISOString();

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) {
    console.warn(`[live-poller] ${afId} failed scope guard: ${scopeCheck.reason}`);
    return counts;
  }

  // 1. Fixture status + score
  const fixtureResult = await apiFootballGet<FixtureApiResponse>(
    "fixtures",
    { id: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  const fixtureData = fixtureResult.data[0];
  if (!fixtureData) return counts;

  const statusShort = fixtureData.fixture.status.short;
  const isTerminal  = TERMINAL_STATUSES.has(statusShort);
  const isLive      = !isTerminal;
  const refereeRaw  = fixtureData.fixture.referee;
  const refereeName = refereeRaw
    ? refereeRaw.replace(/\s*\([^)]+\)\s*$/, "").trim() || null
    : null;

  if (!dryRun) {
    // Update wc2026_fixtures
    const fixtureUpdate: Record<string, unknown> = {
      fixture_status:     statusShort,
      is_live:            isLive,
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

    // Write wc_live_match_state
    await supabase
      .from("wc_live_match_state")
      .upsert({
        api_football_fixture_id: afId,
        status_short:      statusShort,
        status_long:       fixtureData.fixture.status.long ?? null,
        elapsed:           fixtureData.fixture.status.elapsed ?? null,
        extra:             fixtureData.fixture.status.extra ?? null,
        home_goals:        fixtureData.goals.home ?? 0,
        away_goals:        fixtureData.goals.away ?? 0,
        period_first:      fixtureData.fixture.periods?.first ?? null,
        period_second:     fixtureData.fixture.periods?.second ?? null,
        referee:           refereeName,
        venue_id:          fixtureData.fixture.venue?.id ?? null,
        is_live:           isLive,
        is_finished:       isTerminal,
        last_api_update_at: now,
        raw:               fixtureData,
        updated_at:        now,
      }, { onConflict: "api_football_fixture_id" });
  }

  // 2. Events
  await sleep(200);
  const eventsResult = await apiFootballGet<FixtureEventResponse>(
    "fixtures/events",
    { fixture: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  if (!dryRun) {
    for (const evt of eventsResult.data) {
      await supabase
        .from("wc_fixture_events")
        .upsert({
          api_football_fixture_id: afId,
          elapsed:       evt.time.elapsed,
          elapsed_extra: evt.time.extra ?? null,
          team_id:       evt.team.id,
          team_name:     evt.team.name,
          player_id:     evt.player.id ?? null,
          player_name:   evt.player.name ?? null,
          assist_id:     evt.assist.id ?? null,
          assist_name:   evt.assist.name ?? null,
          type:          evt.type,
          detail:        evt.detail,
          comments:      evt.comments ?? null,
          raw:           evt,
          updated_at:    now,
        }, {
          onConflict: "api_football_fixture_id,elapsed,type,detail,player_id",
          ignoreDuplicates: false,
        });
      counts.eventsUpserted++;
    }
  } else {
    counts.eventsUpserted = eventsResult.data.length;
  }

  // 3. Statistics
  await sleep(200);
  const statsResult = await apiFootballGet<FixtureStatResponse>(
    "fixtures/statistics",
    { fixture: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  if (!dryRun) {
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
          }, { onConflict: "api_football_fixture_id,team_id,type" });
        counts.statisticsUpserted++;
      }
    }
  } else {
    counts.statisticsUpserted = statsResult.data.reduce((s, t) => s + t.statistics.length, 0);
  }

  // 4. Player stats
  await sleep(200);
  const playerResult = await apiFootballGet<FixturePlayerStatResponse>(
    "fixtures/players",
    { fixture: afId },
    { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  if (!dryRun) {
    for (const teamEntry of playerResult.data) {
      for (const entry of teamEntry.players) {
        const s = entry.statistics[0];
        if (!s) continue;
        await supabase
          .from("wc_fixture_player_stats")
          .upsert({
            api_football_fixture_id: afId,
            team_id:     teamEntry.team.id,
            team_name:   teamEntry.team.name,
            player_id:   entry.player.id ?? null,
            player_name: entry.player.name,
            photo:       entry.player.photo ?? null,
            minutes:     s.games.minutes ?? null,
            rating:      s.games.rating ? parseFloat(s.games.rating) : null,
            position:    s.games.position ?? null,
            captain:     s.games.captain ?? false,
            goals:       s.goals.total ?? 0,
            assists:     s.goals.assists ?? 0,
            saves:       s.goals.saves ?? 0,
            conceded:    s.goals.conceded ?? 0,
            yellow_cards: s.cards.yellow ?? 0,
            red_cards:   s.cards.red ?? 0,
            shots:       s.shots.total ?? 0,
            shots_on:    s.shots.on ?? 0,
            passes:      s.passes.total ?? 0,
            key_passes:  s.passes.key ?? 0,
            tackles:     s.tackles.total ?? 0,
            blocks:      s.tackles.blocks ?? 0,
            interceptions: s.tackles.interceptions ?? 0,
            dribbles_attempts: s.dribbles.attempts ?? 0,
            dribbles_success:  s.dribbles.success ?? 0,
            raw:         entry,
            updated_at:  now,
          }, { onConflict: "api_football_fixture_id,player_id,team_id" });
        counts.playersUpserted++;
      }
    }
  } else {
    counts.playersUpserted = playerResult.data.reduce((s, t) => s + t.players.length, 0);
  }

  // 5. Lineups — check if we have a fresh lineup or need to fetch
  const { data: existingLineup } = await supabase
    .from("wc_fixture_lineups")
    .select("team_id, updated_at")
    .eq("api_football_fixture_id", afId)
    .limit(1)
    .maybeSingle();

  const lineupAgeMinutes = existingLineup?.updated_at
    ? (Date.now() - new Date(existingLineup.updated_at).getTime()) / 60_000
    : Infinity;

  // Fetch lineups if missing or more than 60 minutes old
  if (!existingLineup || lineupAgeMinutes > 60) {
    await sleep(200);
    const lineupResult = await apiFootballGet<LineupTeamResponse>(
      "fixtures/lineups",
      { fixture: afId },
      { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
    );
    counts.apiCalls++;

    if (!dryRun) {
      for (const team of lineupResult.data) {
        await supabase
          .from("wc_fixture_lineups")
          .upsert({
            api_football_fixture_id: afId,
            team_id:     team.team.id,
            team_name:   team.team.name,
            formation:   team.formation ?? null,
            coach:       team.coach ?? null,
            start_xi:    team.startXI,
            substitutes: team.substitutes,
            raw:         team,
            lineup_announced_at: now,
            updated_at:  now,
          }, { onConflict: "api_football_fixture_id,team_id" });
        counts.lineupsUpserted++;
      }
    } else {
      counts.lineupsUpserted = lineupResult.data.length;
    }
  }

  // 6. Optional live odds
  if (isLiveOddsSyncEnabled()) {
    await sleep(200);
    const oddsResult = await apiFootballGet<OddsResponse>(
      "odds/live",
      { fixture: afId },
      { jobName: "wc2026-live-poller", apiFootballFixtureId: afId, isWc2026Scope: true },
    );
    counts.apiCalls++;

    const oddsData = oddsResult.data[0];
    if (oddsData && !dryRun) {
      await supabase
        .from("wc_live_odds_snapshots")
        .insert({
          api_football_fixture_id: afId,
          captured_at: now,
          status:      statusShort,
          odds:        oddsData.bookmakers,
          raw:         oddsData,
        });
      counts.oddsSnapshotsInserted++;
    } else if (oddsData) {
      counts.oddsSnapshotsInserted = 1;
    }
  }

  // Queue for finalization if terminal
  if (isTerminal && !dryRun) {
    await supabase
      .from("wc_fixture_finalization_queue")
      .upsert(
        { api_football_fixture_id: afId, status: "pending", updated_at: now },
        { onConflict: "api_football_fixture_id", ignoreDuplicates: true },
      );
    console.log(`[live-poller] ${afId} terminal (${statusShort}) — queued for finalization`);
  }

  // Increment poll count
  if (!dryRun) {
    await supabase
      .from("wc2026_fixtures")
      .update({ live_poll_count: (await supabase
        .from("wc2026_fixtures")
        .select("live_poll_count")
        .eq("api_football_fixture_id", afId)
        .single()
        .then(r => (r.data?.live_poll_count ?? 0) + 1))
      })
      .eq("api_football_fixture_id", afId);
  }

  return counts;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-live-poller");
  let polled = 0;
  const totalCounts: PollCounts = {
    apiCalls: 0, eventsUpserted: 0, statisticsUpserted: 0,
    playersUpserted: 0, lineupsUpserted: 0, oddsSnapshotsInserted: 0,
  };

  try {
    const supabase = getSupabase();

    const { data: liveFixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("api_football_fixture_id")
      .eq("is_live", true)
      .eq("is_closed", false)
      .not("api_football_fixture_id", "is", null);

    if (error) throw error;
    if (!liveFixtures || liveFixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no live fixtures", dryRun } });
      return new Response(JSON.stringify({ ok: true, skipped: true, dryRun }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const fixture of liveFixtures) {
      const afId = Number(fixture.api_football_fixture_id);
      await sleep(300);
      const counts = await pollFixture(supabase, afId, dryRun);
      totalCounts.apiCalls             += counts.apiCalls;
      totalCounts.eventsUpserted       += counts.eventsUpserted;
      totalCounts.statisticsUpserted   += counts.statisticsUpserted;
      totalCounts.playersUpserted      += counts.playersUpserted;
      totalCounts.lineupsUpserted      += counts.lineupsUpserted;
      totalCounts.oddsSnapshotsInserted += counts.oddsSnapshotsInserted;
      polled++;
    }

    const meta = { ...totalCounts, dryRun };
    await finishSyncRun(runId, "completed", {
      fixturesProcessed: polled,
      apiCalls: totalCounts.apiCalls,
      meta,
    });

    return new Response(JSON.stringify({ ok: true, polled, dryRun, ...totalCounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-live-poller] fatal:", msg);
    await finishSyncRun(runId, "error", {
      error: msg,
      fixturesProcessed: polled,
      apiCalls: totalCounts.apiCalls,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
