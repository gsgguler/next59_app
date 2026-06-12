import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
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

async function finalizeFixture(
  supabase: ReturnType<typeof getSupabase>,
  queueItem: QueueItem,
): Promise<{ ok: boolean; apiCalls: number; reason?: string }> {
  const afId = queueItem.api_football_fixture_id;
  let apiCalls = 0;
  const now = new Date().toISOString();

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) {
    return { ok: false, apiCalls, reason: "not_wc2026" };
  }

  // 1. Full fixture re-fetch to confirm terminal status
  const fixtureResult = await apiFootballGet<FixtureApiResponse>(
    "fixtures",
    { id: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  apiCalls++;

  const fixtureData = fixtureResult.data[0];
  if (!fixtureData) return { ok: false, apiCalls, reason: "fixture_not_found" };

  const statusShort = fixtureData.fixture.status.short;
  if (!TERMINAL_STATUSES.has(statusShort)) {
    // Not yet terminal — re-queue with delay
    await supabase
      .from("wc_fixture_finalization_queue")
      .update({ status: "pending", last_error: `not_terminal:${statusShort}`, updated_at: now })
      .eq("id", queueItem.id);
    return { ok: false, apiCalls, reason: `not_terminal:${statusShort}` };
  }

  const refereeRaw = fixtureData.fixture.referee;
  const refereeName = refereeRaw
    ? refereeRaw.replace(/\s*\([^)]+\)\s*$/, "").trim() || null
    : null;

  let winner: string | null = null;
  if (fixtureData.teams.home.winner === true) winner = "home";
  else if (fixtureData.teams.away.winner === true) winner = "away";
  else if (fixtureData.goals.home === fixtureData.goals.away) winner = "draw";

  // 2. Statistics
  await sleep(300);
  const statsResult = await apiFootballGet<FixtureStatResponse>(
    "fixtures/statistics",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
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
        }, { onConflict: "api_football_fixture_id,team_id,type" });
    }
  }

  // 3. Player stats
  await sleep(300);
  const playerStatsResult = await apiFootballGet<FixturePlayerStatResponse>(
    "fixtures/players",
    { fixture: afId },
    { jobName: "wc2026-match-finalizer", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  apiCalls++;

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
    }
  }

  // 4. Mark fixture closed
  await supabase
    .from("wc2026_fixtures")
    .update({
      is_closed:           true,
      is_live:             false,
      fixture_status:      statusShort,
      final_home_score:    fixtureData.score.fulltime.home ?? fixtureData.goals.home,
      final_away_score:    fixtureData.score.fulltime.away ?? fixtureData.goals.away,
      winner,
      referee_name:        refereeName,
      finished_at:         now,
      closed_at:           now,
      data_finalized_at:   now,
      closure_status:      "closed",
      finalization_status: "finalized",
      updated_at:          now,
    })
    .eq("api_football_fixture_id", afId);

  // 5. Remove from queue
  await supabase
    .from("wc_fixture_finalization_queue")
    .update({ status: "done", updated_at: now })
    .eq("id", queueItem.id);

  console.log(`[match-finalizer] fixture ${afId} finalized: ${statusShort}, score ${fixtureData.goals.home}-${fixtureData.goals.away}`);
  return { ok: true, apiCalls };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-match-finalizer");
  let finalized = 0, totalApiCalls = 0;

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
      await finishSyncRun(runId, "skipped", { meta: { reason: "empty queue" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const item of queueItems) {
      // Increment attempt counter before processing
      await supabase
        .from("wc_fixture_finalization_queue")
        .update({ attempts: item.attempts + 1, status: "processing", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      await sleep(500);
      const { ok, apiCalls, reason } = await finalizeFixture(supabase, item);
      totalApiCalls += apiCalls;

      if (ok) {
        finalized++;
      } else {
        // Mark failed if max attempts reached
        if (item.attempts + 1 >= MAX_ATTEMPTS) {
          await supabase
            .from("wc_fixture_finalization_queue")
            .update({ status: "failed", last_error: reason ?? "unknown", updated_at: new Date().toISOString() })
            .eq("id", item.id);

          // Flag fixture for admin review
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

    await finishSyncRun(runId, "completed", { fixturesProcessed: finalized, apiCalls: totalApiCalls });
    return new Response(JSON.stringify({ ok: true, finalized, apiCalls: totalApiCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-match-finalizer] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: finalized, apiCalls: totalApiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
