import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineupRow {
  team_id:    number;
  start_xi:   Array<{ player: { id: number | null; name: string; pos: string | null } }> | null;
  substitutes: Array<{ player: { id: number | null; name: string; pos: string | null } }> | null;
  formation:  string | null;
  coach:      { name: string | null } | null;
}

interface PerfScore {
  player_id:               number | null;
  player_name:             string;
  final_performance_score: number | null;
  confidence:              number | null;
  lookup_status:           string;
}

interface RefereeProfile {
  referee_card_score: number | null;
  confidence:         number | null;
}

interface FixtureRow {
  id:                      string;
  api_football_fixture_id: number;
  home_api_team_id:        number | null;
  away_api_team_id:        number | null;
  home_team_name:          string | null;
  away_team_name:          string | null;
  fixture_status:          string;
  lineups_available:       boolean | null;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function weightedXiScore(
  xiPlayers: Array<{ player: { id: number | null; name: string; pos: string | null } }>,
  scores: Map<string, PerfScore>,
  missingFields: string[],
): { score: number | null; confidence: number } {
  if (xiPlayers.length === 0) return { score: null, confidence: 0 };

  let totalScore   = 0;
  let totalWeight  = 0;
  let totalConf    = 0;
  let missingCount = 0;

  for (const entry of xiPlayers) {
    const p     = entry.player;
    const key   = p.id ? `id:${p.id}` : `name:${p.name}`;
    const perf  = scores.get(key);

    if (!perf || perf.final_performance_score == null || perf.lookup_status === "missing" || perf.lookup_status === "player_not_found") {
      missingCount++;
      missingFields.push(`player_score_missing:${p.name}`);
      continue;
    }

    if ((perf.confidence ?? 0) < 0.82) {
      missingFields.push(`player_low_confidence:${p.name}`);
    }

    const weight = perf.confidence ?? 0.5;
    totalScore   += perf.final_performance_score * weight;
    totalWeight  += weight;
    totalConf    += perf.confidence ?? 0;
  }

  if (totalWeight === 0) return { score: null, confidence: 0 };

  return {
    score:      Math.round(totalScore / totalWeight),
    confidence: totalConf / xiPlayers.length,
  };
}

function computeDataQualityScore(opts: {
  lineupAnnounced: boolean;
  homeXiCount:     number;
  awayXiCount:     number;
  xiPlayerIdRatio: number;
  ratingAvailRatio: number;
  refereeScore:    boolean;
  ambiguousCount:  number;
}): number {
  let score = 0;
  if (opts.lineupAnnounced) score += 30;
  if (opts.homeXiCount === 11) score += 10;
  if (opts.awayXiCount === 11) score += 10;
  score += Math.round(opts.xiPlayerIdRatio * 20);
  score += Math.round(opts.ratingAvailRatio * 15);
  if (opts.refereeScore) score += 10;
  if (opts.ambiguousCount === 0) score += 5;
  return Math.min(100, score);
}

// ─── Main builder ─────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function buildPredictionInput(
  supabase: ReturnType<typeof getSupabase>,
  fixture: FixtureRow,
  dryRun: boolean,
): Promise<{ built: boolean; reason?: string }> {
  const afId = fixture.api_football_fixture_id;

  const scopeCheck = await assertWc2026FixtureScope(afId);
  if (!scopeCheck.isWc2026) return { built: false, reason: "not_wc2026" };

  const homeTeamId = fixture.home_api_team_id;
  const awayTeamId = fixture.away_api_team_id;
  const now        = new Date().toISOString();

  // Fetch lineups
  const { data: lineupRows } = await supabase
    .from("wc_fixture_lineups")
    .select("team_id, start_xi, substitutes, formation, coach")
    .eq("api_football_fixture_id", afId) as { data: LineupRow[] | null };

  const homeLineup = lineupRows?.find(l => l.team_id === homeTeamId) ?? null;
  const awayLineup = lineupRows?.find(l => l.team_id === awayTeamId) ?? null;

  const lineupAnnounced = !!(homeLineup && awayLineup);
  const homeXi          = homeLineup?.start_xi ?? [];
  const awayXi          = awayLineup?.start_xi ?? [];
  const homeSubs        = homeLineup?.substitutes ?? [];
  const awaySubs        = awayLineup?.substitutes ?? [];

  // Collect all player ids + names for score lookup
  const allPlayers = [...homeXi, ...awayXi, ...homeSubs, ...awaySubs];
  const playerIds  = allPlayers.map(p => p.player.id).filter(Boolean) as number[];
  const playerNames = allPlayers.map(p => p.player.name);

  // Fetch performance scores
  const scoreMap = new Map<string, PerfScore>();
  if (playerIds.length > 0) {
    const { data: byId } = await supabase
      .from("wc_player_performance_scores")
      .select("player_id, player_name, final_performance_score, confidence")
      .in("player_id", playerIds) as { data: PerfScore[] | null };
    for (const s of byId ?? []) {
      if (s.player_id) scoreMap.set(`id:${s.player_id}`, { ...s, lookup_status: "found" });
    }
  }

  // Fill gaps from enrichment profiles (for players without id)
  const { data: enrichProfiles } = await supabase
    .from("wc_player_enrichment_profiles")
    .select("player_id, player_name, lookup_status, derived_score")
    .or(`api_team_id.eq.${homeTeamId},api_team_id.eq.${awayTeamId}`)
    .in("player_name", playerNames) as {
      data: Array<{
        player_id: number | null;
        player_name: string;
        lookup_status: string;
        derived_score: { final_performance_score?: number; confidence?: number } | null;
      }> | null;
    };

  for (const ep of enrichProfiles ?? []) {
    const key = ep.player_id ? `id:${ep.player_id}` : `name:${ep.player_name}`;
    if (!scoreMap.has(key)) {
      scoreMap.set(key, {
        player_id:               ep.player_id,
        player_name:             ep.player_name,
        final_performance_score: ep.derived_score?.final_performance_score ?? null,
        confidence:              ep.derived_score?.confidence ?? null,
        lookup_status:           ep.lookup_status,
      });
    }
  }

  const missingFields: string[] = [];

  // Compute XI scores
  const { score: homeXiScore } = weightedXiScore(homeXi, scoreMap, missingFields);
  const { score: awayXiScore } = weightedXiScore(awayXi, scoreMap, missingFields);
  const { score: homeBenchScore } = weightedXiScore(homeSubs, scoreMap, missingFields);
  const { score: awayBenchScore } = weightedXiScore(awaySubs, scoreMap, missingFields);

  // Referee
  let refereeName: string | null = null;
  let refereeCardScore: number | null = null;
  let refereeProfile: RefereeProfile | null = null;

  const { data: existingInput } = await supabase
    .from("wc_match_prediction_inputs")
    .select("referee_name")
    .eq("api_football_fixture_id", afId)
    .maybeSingle();
  refereeName = existingInput?.referee_name ?? null;

  if (refereeName) {
    const { data: refRow } = await supabase
      .from("wc_referee_profiles")
      .select("referee_card_score, confidence")
      .ilike("name", refereeName)
      .maybeSingle() as { data: RefereeProfile | null };
    refereeProfile = refRow;
    refereeCardScore = refRow?.referee_card_score ?? null;
  }

  if (!refereeName) missingFields.push("referee_name");
  if (refereeCardScore == null) missingFields.push("referee_card_score");
  if (!lineupAnnounced) missingFields.push("lineup_not_announced");

  // Data quality
  const allXiPlayers = [...homeXi, ...awayXi];
  const xiWithId      = allXiPlayers.filter(p => p.player.id).length;
  const xiWithRating  = allXiPlayers.filter(p => {
    const key = p.player.id ? `id:${p.player.id}` : `name:${p.player.name}`;
    const s   = scoreMap.get(key);
    return s?.final_performance_score != null;
  }).length;
  const ambiguous     = [...scoreMap.values()].filter(s => s.lookup_status === "ambiguous").length;

  const dataQualityScore = computeDataQualityScore({
    lineupAnnounced,
    homeXiCount:      homeXi.length,
    awayXiCount:      awayXi.length,
    xiPlayerIdRatio:  allXiPlayers.length > 0 ? xiWithId / allXiPlayers.length : 0,
    ratingAvailRatio: allXiPlayers.length > 0 ? xiWithRating / allXiPlayers.length : 0,
    refereeScore:     refereeCardScore != null,
    ambiguousCount:   ambiguous,
  });

  // Full inputs JSON
  const inputs = {
    home_xi:      homeXi,
    away_xi:      awayXi,
    home_subs:    homeSubs,
    away_subs:    awaySubs,
    home_formation: homeLineup?.formation ?? null,
    away_formation: awayLineup?.formation ?? null,
    home_coach:   homeLineup?.coach?.name ?? null,
    away_coach:   awayLineup?.coach?.name ?? null,
    referee_card_score:    refereeCardScore,
    referee_confidence:    refereeProfile?.confidence ?? null,
    ambiguous_player_count: ambiguous,
    score_map_size:        scoreMap.size,
  };

  // Upsert prediction input
  if (!dryRun) {
    await supabase
      .from("wc_match_prediction_inputs")
      .upsert({
        api_football_fixture_id:  afId,
        fixture_id:               fixture.id,
        home_team_id:             homeTeamId,
        away_team_id:             awayTeamId,
        referee_name:             refereeName,
        lineup_status:            lineupAnnounced ? "announced" : "not_announced",
        home_lineup_score:        homeXiScore,
        away_lineup_score:        awayXiScore,
        home_starting_xi_score:   homeXiScore,
        away_starting_xi_score:   awayXiScore,
        home_bench_score:         homeBenchScore,
        away_bench_score:         awayBenchScore,
        referee_card_score:       refereeCardScore,
        data_quality_score:       dataQualityScore,
        missing_fields:           missingFields,
        inputs,
        generated_at:             now,
        updated_at:               now,
      }, { onConflict: "api_football_fixture_id" });
  }

  return { built: true };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-prediction-input-builder");
  let processed = 0;

  try {
    const supabase = getSupabase();

    // Process fixtures with lineups announced or those needing a refresh
    const { data: fixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, home_api_team_id, away_api_team_id, home_team_name, away_team_name, fixture_status, lineups_available")
      .not("api_football_fixture_id", "is", null)
      .not("fixture_status", "in", '("FT","AET","PEN")')
      .eq("is_closed", false)
      .order("match_date", { ascending: true })
      .limit(30) as { data: FixtureRow[] | null; error: unknown };

    if (error) throw error;
    if (!fixtures || fixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no fixtures to process" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown>[] = [];
    for (const fixture of fixtures) {
      const result = await buildPredictionInput(supabase, fixture, dryRun);
      results.push({ fixture_id: fixture.api_football_fixture_id, ...result });
      if (result.built) processed++;
    }

    await finishSyncRun(runId, "completed", { fixturesProcessed: processed, apiCalls: 0, meta: { dryRun } });
    return new Response(JSON.stringify({ ok: true, processed, results, dryRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-prediction-input-builder] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: processed });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
