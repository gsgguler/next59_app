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

interface FixturePlayerStatResponse {
  team: { id: number; name: string };
  players: Array<{
    player:     { id: number | null; name: string; photo: string | null };
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
  bookmakers: Array<{ id: number; name: string; bets: Array<unknown> }>;
}

interface QueueItem {
  id:                      string;
  api_football_fixture_id: number;
  status:                  string;
  attempts:                number;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const MAX_ATTEMPTS = 3;

interface FinalizeCounts {
  apiCalls: number;
  finalEventsUpserted: number;
  finalStatisticsUpserted: number;
  finalLineupsUpserted: number;
  finalPlayersUpserted: number;
  finalScoreWritten: boolean;
}

async function finalizeFixture(
  supabase: ReturnType<typeof getSupabase>,
  queueItem: QueueItem,
  dryRun: boolean,
): Promise<{ ok: boolean; counts: FinalizeCounts; reason?: string }> {
  const afId = queueItem.api_football_fixture_id;
  const counts: FinalizeCounts = {
    apiCalls: 0, finalEventsUpserted: 0, finalStatisticsUpserted: 0,
    finalLineupsUpserted: 0, finalPlayersUpserted: 0, finalScoreWritten: false,
  };
  const now = new Date().toISOString();

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) {
    return { ok: false, counts, reason: "not_wc2026" };
  }

  // 1. Full fixture re-fetch to confirm terminal status
  const fixtureResult = await apiFootballGet<FixtureApiResponse>(
    "fixtures",
    { id: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  const fixtureData = fixtureResult.data[0];
  if (!fixtureData) return { ok: false, counts, reason: "fixture_not_found" };

  const statusShort = fixtureData.fixture.status.short;
  if (!TERMINAL_STATUSES.has(statusShort)) {
    if (!dryRun) {
      await supabase
        .from("wc_fixture_finalization_queue")
        .update({ status: "pending", last_error: `not_terminal:${statusShort}`, updated_at: now })
        .eq("id", queueItem.id);
    }
    return { ok: false, counts, reason: `not_terminal:${statusShort}` };
  }

  const refereeRaw = fixtureData.fixture.referee;
  const refereeName = refereeRaw
    ? refereeRaw.replace(/\s*\([^)]+\)\s*$/, "").trim() || null
    : null;

  let winner: string | null = null;
  if (fixtureData.teams.home.winner === true) winner = "home";
  else if (fixtureData.teams.away.winner === true) winner = "away";
  else if (fixtureData.goals.home === fixtureData.goals.away) winner = "draw";

  // 2. Events (final snapshot)
  await sleep(300);
  const eventsResult = await apiFootballGet<FixtureEventResponse>(
    "fixtures/events",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
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
        }, { onConflict: "api_football_fixture_id,elapsed,type,detail,player_id" });
      counts.finalEventsUpserted++;
    }
  } else {
    counts.finalEventsUpserted = eventsResult.data.length;
  }

  // 3. Statistics (final)
  await sleep(300);
  const statsResult = await apiFootballGet<FixtureStatResponse>(
    "fixtures/statistics",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
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
        counts.finalStatisticsUpserted++;
      }
    }
  } else {
    counts.finalStatisticsUpserted = statsResult.data.reduce((s, t) => s + t.statistics.length, 0);
  }

  // 4. Lineups (final snapshot)
  await sleep(300);
  const lineupResult = await apiFootballGet<LineupTeamResponse>(
    "fixtures/lineups",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
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
      counts.finalLineupsUpserted++;
    }
  } else {
    counts.finalLineupsUpserted = lineupResult.data.length;
  }

  // 5. Player stats (final)
  await sleep(300);
  const playerStatsResult = await apiFootballGet<FixturePlayerStatResponse>(
    "fixtures/players",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  counts.apiCalls++;

  if (!dryRun) {
    for (const teamEntry of playerStatsResult.data) {
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
        counts.finalPlayersUpserted++;
      }
    }
  } else {
    counts.finalPlayersUpserted = playerStatsResult.data.reduce((s, t) => s + t.players.length, 0);
  }

  // 6. Optional final odds snapshot
  if (isLiveOddsSyncEnabled()) {
    await sleep(200);
    const oddsResult = await apiFootballGet<OddsResponse>(
      "odds/live",
      { fixture: afId },
      { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
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
    }
  }

  if (!dryRun) {
    // 7. Mark fixture closed
    await supabase
      .from("wc2026_fixtures")
      .update({
        is_closed:           true,
        is_live:             false,
        fixture_status:      statusShort,
        home_score:          fixtureData.goals.home,
        away_score:          fixtureData.goals.away,
        home_score_ht:       fixtureData.score.halftime.home,
        away_score_ht:       fixtureData.score.halftime.away,
        final_home_score:    fixtureData.score.fulltime.home ?? fixtureData.goals.home,
        final_away_score:    fixtureData.score.fulltime.away ?? fixtureData.goals.away,
        winner,
        referee_name:        refereeName,
        finished_at:         now,
        closed_at:           now,
        data_finalized_at:   now,
        closure_status:      "closed",
        finalization_status: "completed",
        updated_at:          now,
      })
      .eq("api_football_fixture_id", afId);

    // 8. Update wc_live_match_state
    await supabase
      .from("wc_live_match_state")
      .update({
        status_short:      statusShort,
        status_long:       fixtureData.fixture.status.long ?? null,
        home_goals:        fixtureData.goals.home ?? 0,
        away_goals:        fixtureData.goals.away ?? 0,
        is_live:           false,
        is_finished:       true,
        last_api_update_at: now,
        updated_at:        now,
      })
      .eq("api_football_fixture_id", afId);

    // 9. Mark finalization queue completed
    await supabase
      .from("wc_fixture_finalization_queue")
      .update({ status: "completed", updated_at: now })
      .eq("id", queueItem.id);
  }

  counts.finalScoreWritten = true;

  console.log(`[match-finalizer] fixture ${afId} finalized: ${statusShort}, score ${fixtureData.goals.home}-${fixtureData.goals.away}, dryRun=${dryRun}`);
  return { ok: true, counts };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-match-finalizer");
  let finalized = 0;
  const totalCounts: FinalizeCounts = {
    apiCalls: 0, finalEventsUpserted: 0, finalStatisticsUpserted: 0,
    finalLineupsUpserted: 0, finalPlayersUpserted: 0, finalScoreWritten: false,
  };

  try {
    const supabase = getSupabase();

    const { data: queueItems, error } = await supabase
      .from("wc_fixture_finalization_queue")
      .select("id, api_football_fixture_id, status, attempts")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(10) as { data: QueueItem[] | null; error: unknown };

    if (error) throw error;
    if (!queueItems || queueItems.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "empty queue", dryRun } });
      return new Response(JSON.stringify({ ok: true, skipped: true, dryRun }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const item of queueItems) {
      if (!dryRun) {
        await supabase
          .from("wc_fixture_finalization_queue")
          .update({ attempts: item.attempts + 1, status: "processing", updated_at: new Date().toISOString() })
          .eq("id", item.id);
      }

      await sleep(500);
      const { ok, counts, reason } = await finalizeFixture(supabase, item, dryRun);

      totalCounts.apiCalls              += counts.apiCalls;
      totalCounts.finalEventsUpserted   += counts.finalEventsUpserted;
      totalCounts.finalStatisticsUpserted += counts.finalStatisticsUpserted;
      totalCounts.finalLineupsUpserted  += counts.finalLineupsUpserted;
      totalCounts.finalPlayersUpserted  += counts.finalPlayersUpserted;
      if (counts.finalScoreWritten) totalCounts.finalScoreWritten = true;

      results.push({ fixture_id: item.api_football_fixture_id, ok, reason, ...counts });

      if (ok) {
        finalized++;
      } else if (!dryRun) {
        if (item.attempts + 1 >= MAX_ATTEMPTS) {
          await supabase
            .from("wc_fixture_finalization_queue")
            .update({ status: "failed", last_error: reason ?? "unknown", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          await supabase
            .from("wc2026_fixtures")
            .update({ admin_review_required: true, updated_at: new Date().toISOString() })
            .eq("api_football_fixture_id", item.api_football_fixture_id);
        } else {
          await supabase
            .from("wc_fixture_finalization_queue")
            .update({ status: "pending", last_error: reason ?? "unknown", updated_at: new Date().toISOString() })
            .eq("id", item.id);
        }
        console.warn(`[match-finalizer] fixture ${item.api_football_fixture_id} failed: ${reason}`);
      }
    }

    const meta = { ...totalCounts, dryRun };
    await finishSyncRun(runId, "completed", {
      fixturesProcessed: finalized,
      apiCalls: totalCounts.apiCalls,
      meta,
    });

    return new Response(JSON.stringify({ ok: true, finalized, dryRun, results, ...totalCounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-match-finalizer] fatal:", msg);
    await finishSyncRun(runId, "error", {
      error: msg,
      fixturesProcessed: finalized,
      apiCalls: totalCounts.apiCalls,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
