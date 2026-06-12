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

interface FixtureApiResponse {
  fixture: {
    id:     number;
    status: { short: string; elapsed: number | null };
    date:   string;
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
  };
}

interface StaleFixture {
  id:                      string;
  api_football_fixture_id: number;
  fixture_status:          string;
  match_date:              string;
  is_closed:               boolean;
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-delayed-result-reconciler");
  let reconciled = 0, apiCalls = 0;

  try {
    const supabase = getSupabase();

    // Find fixtures that:
    // 1. Are not closed
    // 2. Match date was more than 2 hours ago
    // 3. Status is not already terminal
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: staleFixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, fixture_status, match_date, is_closed")
      .eq("is_closed", false)
      .not("api_football_fixture_id", "is", null)
      .not("fixture_status", "in", '("FT","AET","PEN","AWD","WO","placeholder")')
      .lte("match_date", twoHoursAgo)
      .order("match_date", { ascending: true })
      .limit(20) as { data: StaleFixture[] | null; error: unknown };

    if (error) throw error;
    if (!staleFixtures || staleFixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no stale fixtures" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[reconciler] Found ${staleFixtures.length} stale fixture(s) to reconcile`);

    for (const fixture of staleFixtures) {
      const afId = Number(fixture.api_football_fixture_id);
      await sleep(400);

      const scopeCheck = await assertWc2026FixtureScope(afId);
      if (!scopeCheck.isWc2026) continue;

      const result = await apiFootballGet<FixtureApiResponse>(
        "fixtures",
        { id: afId },
        { jobName: "wc2026-delayed-result-reconciler", apiFootballFixtureId: afId, isWc2026Scope: true },
      );
      apiCalls++;

      const data = result.data[0];
      if (!data) {
        console.warn(`[reconciler] No API data for fixture ${afId}`);
        continue;
      }

      const statusShort = data.fixture.status.short;
      const now = new Date().toISOString();

      let winner: string | null = null;
      if (data.teams.home.winner === true) winner = "home";
      else if (data.teams.away.winner === true) winner = "away";
      else if (data.goals.home === data.goals.away) winner = "draw";

      if (TERMINAL_STATUSES.has(statusShort)) {
        // Full closure
        await supabase
          .from("wc2026_fixtures")
          .update({
            is_closed:           true,
            is_live:             false,
            fixture_status:      statusShort,
            home_score:          data.goals.home,
            away_score:          data.goals.away,
            home_score_ht:       data.score.halftime.home,
            away_score_ht:       data.score.halftime.away,
            final_home_score:    data.score.fulltime.home ?? data.goals.home,
            final_away_score:    data.score.fulltime.away ?? data.goals.away,
            winner,
            finished_at:         now,
            closed_at:           now,
            data_finalized_at:   now,
            closure_status:      "closed",
            finalization_status: "finalized",
            updated_at:          now,
          })
          .eq("api_football_fixture_id", afId);

        // Remove from finalization queue if present
        await supabase
          .from("wc_fixture_finalization_queue")
          .update({ status: "done", updated_at: now })
          .eq("api_football_fixture_id", afId)
          .eq("status", "pending");

        reconciled++;
        console.log(`[reconciler] fixture ${afId} reconciled as closed: ${statusShort}`);
      } else {
        // Status update only — may still be live or in extra time
        await supabase
          .from("wc2026_fixtures")
          .update({
            fixture_status: statusShort,
            home_score:     data.goals.home,
            away_score:     data.goals.away,
            elapsed:        data.fixture.status.elapsed ?? null,
            updated_at:     now,
          })
          .eq("api_football_fixture_id", afId);

        console.log(`[reconciler] fixture ${afId} updated status to ${statusShort} (not terminal yet)`);
      }
    }

    await finishSyncRun(runId, "completed", { fixturesProcessed: reconciled, apiCalls });
    return new Response(JSON.stringify({ ok: true, reconciled, apiCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-delayed-result-reconciler] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: reconciled, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
