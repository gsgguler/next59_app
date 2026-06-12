import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
  normalizeName,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineupPlayer {
  player: { id: number | null; name: string; number: number | null; pos: string | null; grid: string | null };
}

interface LineupTeam {
  team:       { id: number; name: string };
  formation:  string | null;
  startXI:    LineupPlayer[];
  substitutes: LineupPlayer[];
  coach:       { id: number | null; name: string | null; photo: string | null };
}

interface UpcomingFixture {
  id:                       string;
  api_football_fixture_id:  number;
  home_api_team_id:         number | null;
  away_api_team_id:         number | null;
  home_team_name:           string | null;
  away_team_name:           string | null;
  lineups_available:        boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function lineupQualityScore(home: LineupTeam, away: LineupTeam): number {
  let score = 0;
  score += 30; // announced
  score += home.startXI.length === 11 ? 10 : 0;
  score += away.startXI.length === 11 ? 10 : 0;
  score += home.formation ? 5 : 0;
  score += away.formation ? 5 : 0;
  score += home.coach?.name ? 5 : 0;
  score += away.coach?.name ? 5 : 0;
  const totalPlayers = home.startXI.length + away.startXI.length;
  const withId = [...home.startXI, ...away.startXI].filter(p => p.player.id).length;
  score += totalPlayers > 0 ? Math.round((withId / totalPlayers) * 30) : 0;
  return Math.min(100, score);
}

// ─── Core processing ──────────────────────────────────────────────────────────

async function processFixtureLineup(
  supabase: ReturnType<typeof getSupabase>,
  fixture: UpcomingFixture,
): Promise<{ status: string; playersQueued: number }> {
  const afId = fixture.api_football_fixture_id;

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) {
    console.warn(`[prelineup] ${afId} failed scope guard: ${scopeCheck.reason}`);
    return { status: "skipped_scope", playersQueued: 0 };
  }

  const result = await apiFootballGet<LineupTeam>("fixtures/lineups", { fixture: afId }, {
    jobName: "wc2026-prelineup-sync",
    apiFootballFixtureId: afId,
    isWc2026Scope: true,
    maxRetries: 1,
  });

  const now = new Date().toISOString();

  if (result.data.length === 0) {
    await supabase
      .from("wc2026_fixtures")
      .update({
        lineups_available: false,
        lineup_status: "not_available_yet",
        last_lineup_check_at: now,
      })
      .eq("api_football_fixture_id", afId);
    return { status: "not_available", playersQueued: 0 };
  }

  const home = result.data.find(t => t.team.id === fixture.home_api_team_id) ?? result.data[0];
  const away = result.data.find(t => t.team.id === fixture.away_api_team_id) ?? result.data[1];

  if (!home || !away) {
    return { status: "partial_data", playersQueued: 0 };
  }

  const qualityScore = lineupQualityScore(home, away);

  // Upsert wc_fixture_lineups for home team
  for (const team of [home, away]) {
    await supabase
      .from("wc_fixture_lineups")
      .upsert({
        api_football_fixture_id: afId,
        team_id:          team.team.id,
        team_name:        team.team.name,
        formation:        team.formation ?? null,
        coach:            team.coach ?? null,
        start_xi:         team.startXI,
        substitutes:      team.substitutes,
        raw:              team,
        lineup_announced_at: now,
        updated_at:       now,
      }, { onConflict: "api_football_fixture_id,team_id" });
  }

  // Update wc2026_fixtures
  const { data: existing } = await supabase
    .from("wc2026_fixtures")
    .select("lineup_announced_at")
    .eq("api_football_fixture_id", afId)
    .single();

  await supabase
    .from("wc2026_fixtures")
    .update({
      lineups_available:         true,
      lineup_status:             "announced",
      lineup_announced_at:       existing?.lineup_announced_at ?? now,
      last_lineup_check_at:      now,
      home_start_xi_count:       home.startXI.length,
      away_start_xi_count:       away.startXI.length,
      home_sub_count:            home.substitutes.length,
      away_sub_count:            away.substitutes.length,
      home_formation:            home.formation ?? null,
      away_formation:            away.formation ?? null,
      coach_home:                home.coach?.name ?? null,
      coach_away:                away.coach?.name ?? null,
      lineup_data_quality_score: qualityScore,
    })
    .eq("api_football_fixture_id", afId);

  // Queue enrichment profiles for all players
  const allPlayers = [
    ...home.startXI.map(p => ({ ...p.player, team_id: home.team.id })),
    ...home.substitutes.map(p => ({ ...p.player, team_id: home.team.id })),
    ...away.startXI.map(p => ({ ...p.player, team_id: away.team.id })),
    ...away.substitutes.map(p => ({ ...p.player, team_id: away.team.id })),
  ];

  let queued = 0;
  for (const p of allPlayers) {
    if (!p.name) continue;
    const { error } = await supabase
      .from("wc_player_enrichment_profiles")
      .upsert({
        player_id:      p.id ?? null,
        player_name:    p.name,
        normalized_name: normalizeName(p.name),
        api_team_id:    p.team_id,
        lookup_status:  "pending",
        profile:        {},
        statistics:     {},
        derived_score:  {},
        updated_at:     now,
      }, {
        onConflict: "player_name,api_team_id",
        ignoreDuplicates: false,
      });
    if (!error) queued++;
  }

  return { status: "announced", playersQueued: queued };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-prelineup-sync");
  let fixturesProcessed = 0;
  let apiCalls = 0;
  let totalQueued = 0;

  try {
    const supabase = getSupabase();

    // Fetch upcoming fixtures that need lineup check
    const now = new Date();
    const in90min = new Date(now.getTime() + 90 * 60 * 1000).toISOString();

    const { data: fixtures, error: fetchErr } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, home_api_team_id, away_api_team_id, home_team_name, away_team_name, lineups_available")
      .not("api_football_fixture_id", "is", null)
      .in("fixture_status", ["NS", "not_started", "scheduled", "pending", "1H", "2H", "HT", "ET", "P", "BT", "LIVE"])
      .eq("is_closed", false)
      .lte("match_date", in90min)
      .gte("match_date", new Date(now.getTime() - 120 * 60 * 1000).toISOString()) as {
        data: UpcomingFixture[] | null;
        error: unknown;
      };

    if (fetchErr) throw fetchErr;
    if (!fixtures || fixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no upcoming fixtures in window" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const fixture of fixtures) {
      const { status, playersQueued } = await processFixtureLineup(supabase, fixture);
      fixturesProcessed++;
      apiCalls++;
      totalQueued += playersQueued;
      console.log(`[prelineup] fixture ${fixture.api_football_fixture_id}: ${status}, queued ${playersQueued}`);
    }

    await finishSyncRun(runId, "completed", {
      fixturesProcessed,
      apiCalls,
      meta: { players_queued: totalQueued },
    });

    return new Response(JSON.stringify({ ok: true, fixturesProcessed, apiCalls, playersQueued: totalQueued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-prelineup-sync] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
