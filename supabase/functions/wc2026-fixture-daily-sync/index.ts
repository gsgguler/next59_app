import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
  loadWc2026FixtureIds,
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
    date:     string;
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

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);

function deriveWinner(
  homeWinner: boolean | null,
  awayWinner: boolean | null,
  homeGoals: number | null,
  awayGoals: number | null,
): string | null {
  if (homeWinner === true) return "home";
  if (awayWinner === true) return "away";
  if (homeGoals != null && awayGoals != null && homeGoals === awayGoals) return "draw";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-fixture-daily-sync");
  let processed = 0, apiCalls = 0;
  const updatedFixtures: number[] = [];

  try {
    const supabase = getSupabase();

    // Get all non-closed WC2026 fixtures with API IDs (excludes 32 knockout placeholders)
    const { data: fixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, fixture_status, is_closed")
      .not("api_football_fixture_id", "is", null)
      .eq("is_closed", false)
      .order("match_date", { ascending: true })
      .limit(60);

    if (error) throw error;
    if (!fixtures || fixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no open fixtures", dryRun } });
      return new Response(JSON.stringify({ ok: true, skipped: true, dryRun }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load WC2026 ID set for scope guard
    await loadWc2026FixtureIds();

    // Batch by 20 IDs per request to stay within API limits
    const BATCH_SIZE = 20;
    for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
      const batch = fixtures.slice(i, i + BATCH_SIZE);
      const ids = batch.map(f => f.api_football_fixture_id).join("-");

      const result = await apiFootballGet<FixtureApiResponse>(
        "fixtures",
        { ids },
        { jobName: "wc2026-fixture-daily-sync", isWc2026Scope: true },
      );
      apiCalls++;

      const now = new Date().toISOString();
      for (const item of result.data) {
        const afId = item.fixture.id;

        const scopeCheck = await assertWc2026FixtureScope(afId);
        if (!scopeCheck.isWc2026) continue;

        const statusShort = item.fixture.status.short;
        const isTerminal  = TERMINAL_STATUSES.has(statusShort);
        const isLive      = LIVE_STATUSES.has(statusShort);

        const winner = deriveWinner(
          item.teams.home.winner,
          item.teams.away.winner,
          item.goals.home,
          item.goals.away,
        );

        // Strip referee country code
        const refereeRaw = item.fixture.referee;
        const refereeName = refereeRaw
          ? refereeRaw.replace(/\s*\([^)]+\)\s*$/, "").trim() || null
          : null;

        updatedFixtures.push(afId);

        if (!dryRun) {
          const updatePayload: Record<string, unknown> = {
            fixture_status:      statusShort,
            is_live:             isLive,
            elapsed:             item.fixture.status.elapsed ?? null,
            home_score:          item.goals.home,
            away_score:          item.goals.away,
            home_score_ht:       item.score.halftime.home,
            away_score_ht:       item.score.halftime.away,
            last_daily_sync_at:  now,
            updated_at:          now,
          };

          if (refereeName) updatePayload.referee_name = refereeName;

          if (isTerminal) {
            updatePayload.final_home_score    = item.score.fulltime.home ?? item.goals.home;
            updatePayload.final_away_score    = item.score.fulltime.away ?? item.goals.away;
            updatePayload.winner              = winner;
            updatePayload.finished_at         = updatePayload.finished_at ?? now;
            updatePayload.finalization_status = "awaiting_finalization";
          }

          await supabase
            .from("wc2026_fixtures")
            .update(updatePayload)
            .eq("api_football_fixture_id", afId);

          // Queue terminal fixtures for finalization
          if (isTerminal) {
            await supabase
              .from("wc_fixture_finalization_queue")
              .upsert(
                { api_football_fixture_id: afId, status: "pending", updated_at: now },
                { onConflict: "api_football_fixture_id", ignoreDuplicates: true },
              );
          }
        }

        processed++;
        console.log(`[daily-sync] fixture ${afId}: ${statusShort}, score ${item.goals.home}-${item.goals.away}${dryRun ? " [dryRun]" : ""}`);
      }
    }

    await finishSyncRun(runId, "completed", {
      fixturesProcessed: processed,
      apiCalls,
      meta: { dryRun, updated_fixtures: updatedFixtures },
    });
    return new Response(JSON.stringify({ ok: true, processed, apiCalls, dryRun, updatedFixtures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-fixture-daily-sync] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: processed, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
