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

interface LiveFixtureResponse {
  fixture: {
    id:     number;
    status: { short: string; elapsed: number | null };
    date:   string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-live-discovery");
  let discovered = 0, apiCalls = 0;

  try {
    const supabase = getSupabase();

    // Load WC2026 fixture IDs for scope filtering
    const wc2026Ids = await loadWc2026FixtureIds();

    // Fetch all currently live fixtures from API-Football
    const result = await apiFootballGet<LiveFixtureResponse>(
      "fixtures",
      { live: "all" },
      { jobName: "wc2026-live-discovery", isWc2026Scope: false },
    );
    apiCalls++;

    const now = new Date().toISOString();
    const liveWcFixtures: number[] = [];

    for (const item of result.data) {
      const afId = item.fixture.id;

      // Only process WC2026 fixtures
      if (!wc2026Ids.has(afId)) continue;

      const scopeCheck = await assertWc2026FixtureScope(afId);
      if (!scopeCheck.isWc2026) continue;

      const statusShort = item.fixture.status.short;
      if (!LIVE_STATUSES.has(statusShort)) continue;

      liveWcFixtures.push(afId);

      if (!dryRun) {
        // Mark fixture as live in DB
        await supabase
          .from("wc2026_fixtures")
          .update({
            is_live:        true,
            fixture_status: statusShort,
            elapsed:        item.fixture.status.elapsed ?? null,
            home_score:     item.goals.home,
            away_score:     item.goals.away,
            updated_at:     now,
          })
          .eq("api_football_fixture_id", afId);
      }

      discovered++;
      console.log(`[live-discovery] WC2026 live fixture detected: ${afId} (${item.teams.home.name} vs ${item.teams.away.name}) ${statusShort}${dryRun ? " [dryRun]" : ""}`);
    }

    // Clear is_live flag for WC2026 fixtures NOT in the live response
    if (!dryRun && liveWcFixtures.length >= 0) {
      // Get currently marked-as-live fixtures in DB
      const { data: dbLiveFixtures } = await supabase
        .from("wc2026_fixtures")
        .select("api_football_fixture_id")
        .eq("is_live", true)
        .not("api_football_fixture_id", "is", null);

      for (const dbRow of dbLiveFixtures ?? []) {
        const afId = Number(dbRow.api_football_fixture_id);
        if (!liveWcFixtures.includes(afId)) {
          // No longer live — check if it finished
          await supabase
            .from("wc2026_fixtures")
            .update({ is_live: false, updated_at: now })
            .eq("api_football_fixture_id", afId)
            .not("fixture_status", "in", '("FT","AET","PEN","AWD","WO")');
        }
      }
    }

    await finishSyncRun(runId, "completed", {
      fixturesProcessed: discovered,
      apiCalls,
      meta: { live_wc_fixtures: liveWcFixtures, dryRun },
    });

    return new Response(JSON.stringify({ ok: true, discovered, liveFixtures: liveWcFixtures, apiCalls, dryRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-live-discovery] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: discovered, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
