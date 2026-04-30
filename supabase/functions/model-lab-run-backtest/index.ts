import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Era bucket ────────────────────────────────────────────────────────────────
function getEraBucket(seasonYear: number, seasonLabel: string): string {
  if (seasonLabel === "2018-2019") return "bridge_2018_2019";
  if (seasonLabel === "2019-2020") return "covid_disrupted";
  if (seasonLabel === "2020-2021") return "covid_limited_crowd";
  if (seasonYear <= 2017) return "historical_basic";
  if (seasonYear >= 2021) return "modern_basic";
  return "modern_basic";
}

// ── Poisson PMF ───────────────────────────────────────────────────────────────
function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function buildMatrix(lH: number, lA: number, max = 6): number[][] {
  const m: number[][] = [];
  for (let h = 0; h <= max; h++) {
    m[h] = [];
    for (let a = 0; a <= max; a++) m[h][a] = poissonPmf(lH, h) * poissonPmf(lA, a);
  }
  return m;
}

function outcomes(m: number[][]): { pH: number; pD: number; pA: number; over15: number; over25: number; over35: number; btts: number } {
  let pH = 0, pD = 0, pA = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0;
  const max = m.length - 1;
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = m[h][a];
      if (h > a) pH += p; else if (h === a) pD += p; else pA += p;
      const tot = h + a;
      if (tot > 1.5) o15 += p;
      if (tot > 2.5) o25 += p;
      if (tot > 3.5) o35 += p;
      if (h >= 1 && a >= 1) btts += p;
    }
  }
  const tot = pH + pD + pA;
  return { pH: pH / tot, pD: pD / tot, pA: pA / tot, over15: o15, over25: o25, over35: o35, btts };
}

// ── League averages ───────────────────────────────────────────────────────────
function leagueAvg(prior: Record<string, unknown>[], compId?: string) {
  const scored = prior.filter((m) =>
    m.home_score_ft != null && m.away_score_ft != null &&
    (!compId || m.competition_id === compId)
  );
  if (scored.length === 0) {
    return { hg: 1.5, ag: 1.15, hwr: 0.45, dr: 0.26, awr: 0.29, hshot: null as number | null, ashot: null as number | null, n: 0 };
  }
  const hg = scored.reduce((s, m) => s + (m.home_score_ft as number), 0) / scored.length;
  const ag = scored.reduce((s, m) => s + (m.away_score_ft as number), 0) / scored.length;
  const hwr = scored.filter((m) => m.result === "H").length / scored.length;
  const dr = scored.filter((m) => m.result === "D").length / scored.length;
  const awr = scored.filter((m) => m.result === "A").length / scored.length;
  const sm = scored.filter((m) => m.home_total_shots != null && m.away_total_shots != null);
  const hshot = sm.length > 0 ? sm.reduce((s, m) => s + (m.home_total_shots as number), 0) / sm.length : null;
  const ashot = sm.length > 0 ? sm.reduce((s, m) => s + (m.away_total_shots as number), 0) / sm.length : null;
  return { hg, ag, hwr, dr, awr, hshot, ashot, n: scored.length };
}

// ── Team strength (Bayesian shrinkage) ────────────────────────────────────────
function teamStrength(teamId: string, prior: Record<string, unknown>[], la: ReturnType<typeof leagueAvg>) {
  const homeMat = prior.filter((m) => m.home_team_id === teamId && m.home_score_ft != null && m.away_score_ft != null);
  const awayMat = prior.filter((m) => m.away_team_id === teamId && m.home_score_ft != null && m.away_score_ft != null);
  const MIN = 10;
  const shrink = (obs: number, pr: number, n: number) => {
    const w = Math.max(0, Math.min(1, n / (n + MIN * 3)));
    return w * obs + (1 - w) * pr;
  };
  const rawHA = homeMat.length > 0 ? homeMat.reduce((s, m) => s + (m.home_score_ft as number), 0) / homeMat.length : la.hg;
  const rawHD = homeMat.length > 0 ? homeMat.reduce((s, m) => s + (m.away_score_ft as number), 0) / homeMat.length : la.ag;
  const rawAA = awayMat.length > 0 ? awayMat.reduce((s, m) => s + (m.away_score_ft as number), 0) / awayMat.length : la.ag;
  const rawAD = awayMat.length > 0 ? awayMat.reduce((s, m) => s + (m.home_score_ft as number), 0) / awayMat.length : la.hg;
  return {
    ha: shrink(rawHA, la.hg, homeMat.length),
    hd: shrink(rawHD, la.ag, homeMat.length),
    aa: shrink(rawAA, la.ag, awayMat.length),
    ad: shrink(rawAD, la.hg, awayMat.length),
    hgr: rawHA,
    agr: rawAA,
    n: homeMat.length + awayMat.length,
  };
}

// ── Expected goals ────────────────────────────────────────────────────────────
function xg(attack: number, defense: number, lgAvg: number, ha = 1.15) {
  if (lgAvg <= 0) return 1.3;
  return (attack / lgAvg) * (defense / lgAvg) * lgAvg * ha;
}

// ── Confidence ────────────────────────────────────────────────────────────────
function confidence(pH: number, pD: number, pA: number) {
  const sorted = [pH, pD, pA].sort((a, b) => b - a);
  const score = sorted[0] - sorted[1];
  const grade = score >= 0.25 ? "A" : score >= 0.18 ? "B+" : score >= 0.12 ? "B" : score >= 0.07 ? "C" : score >= 0.03 ? "D" : "F";
  return { score, grade };
}

// ── Brier + log loss ──────────────────────────────────────────────────────────
function brier1x2(pH: number, pD: number, pA: number, actual: string) {
  const oH = actual === "H" ? 1 : 0, oD = actual === "D" ? 1 : 0, oA = actual === "A" ? 1 : 0;
  return ((pH - oH) ** 2 + (pD - oD) ** 2 + (pA - oA) ** 2) / 3;
}

function logLoss1x2(pH: number, pD: number, pA: number, actual: string) {
  const e = 1e-7;
  const cH = Math.max(e, Math.min(1 - e, pH));
  const cD = Math.max(e, Math.min(1 - e, pD));
  const cA = Math.max(e, Math.min(1 - e, pA));
  if (actual === "H") return -Math.log(cH);
  if (actual === "D") return -Math.log(cD);
  return -Math.log(cA);
}

// ── Error category ────────────────────────────────────────────────────────────
function errorCat(pred: string, actual: string, grade: string) {
  if (pred === actual) return { cat: "correct", notes: "" };
  let cat = "wrong";
  let notes = `Predicted ${pred}, actual ${actual}`;
  if (pred === "H" && actual === "A") cat = "home_overestimate";
  else if (pred === "A" && actual === "H") cat = "away_overestimate";
  else if (pred === "H" && actual === "D") cat = "draw_missed_home_bias";
  else if (pred === "A" && actual === "D") cat = "draw_missed_away_bias";
  else if (pred === "D" && actual !== "D") cat = "draw_overestimate";
  if ((grade === "A" || grade === "B+") && pred !== actual) {
    cat = "high_confidence_wrong";
    notes += " (high confidence error)";
  }
  return { cat, notes };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const modelKey = url.searchParams.get("model_key") ?? "b3_historical_backbone_v0_1";
    const COMPETITIONS = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Eredivisie", "Sueper Lig"];
    const VALIDATION_SEASON = "2018-2019";
    const TRAINED_UNTIL = "2018-06-30";
    const TRAINING_SEASON_YEAR = 2017;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Fetch model version via RPC bridge (model_lab not exposed to PostgREST) ──
    const { data: mvRaw, error: mvErr } = await sb.rpc("ml_get_model_version", { p_version_key: modelKey });
    if (mvErr || !mvRaw) {
      return Response.json({ error: `Model version not found: ${modelKey}. mvErr: ${mvErr?.message}` }, { headers: corsHeaders, status: 400 });
    }
    const mv = mvRaw as { id: string; version_key: string };
    const modelVersionId: string = mv.id;

    const runKey = `${modelKey}_test_${limit}_${Date.now()}`;
    const runScope = `test_${limit}`;

    // ── Create backtest run via RPC bridge ────────────────────────────────────
    const { data: runRaw, error: runErr } = await sb.rpc("ml_insert_backtest_run", {
      p_model_version_id: modelVersionId,
      p_run_key: runKey,
      p_run_scope: runScope,
      p_competition_scope: COMPETITIONS,
      p_era_scope: ["bridge_2018_2019"],
    });
    if (runErr || !runRaw) {
      return Response.json({ error: `Failed to create run: ${runErr?.message}` }, { headers: corsHeaders, status: 500 });
    }
    const runId: string = (runRaw as { id: string }).id;

    // ── Load validation matches (public schema — no issue) ────────────────────
    const { data: valData, error: valErr } = await sb
      .from("v_historical_match_archive")
      .select("*")
      .eq("season_label", VALIDATION_SEASON)
      .in("competition_name", COMPETITIONS)
      .not("result", "is", null)
      .eq("has_ft_score", true)
      .order("match_date", { ascending: true })
      .limit(limit);

    if (valErr) {
      await sb.rpc("ml_update_backtest_run", { p_run_id: runId, p_status: "failed", p_error_message: valErr.message });
      return Response.json({ error: valErr.message }, { headers: corsHeaders, status: 500 });
    }

    const valMatches = (valData ?? []) as Record<string, unknown>[];
    const total = valMatches.length;

    await sb.rpc("ml_update_backtest_run", { p_run_id: runId, p_total_matches: total });

    let processed = 0, failed = 0, totalBrier = 0, totalLL = 0, scoredCount = 0;

    for (const target of valMatches) {
      try {
        const targetDate = target.match_date as string;

        // Prior matches: strictly before target date, only training era
        const { data: priorData } = await sb
          .from("v_historical_match_archive")
          .select("*")
          .in("competition_name", COMPETITIONS)
          .lt("match_date", targetDate)
          .lte("season_year", TRAINING_SEASON_YEAR)
          .not("result", "is", null)
          .order("match_date", { ascending: false })
          .limit(2000);

        const prior = (priorData ?? []) as Record<string, unknown>[];

        // Build features using only prior data
        const la = leagueAvg(prior, target.competition_id as string);
        const ht = teamStrength(target.home_team_id as string, prior, la);
        const at = teamStrength(target.away_team_id as string, prior, la);
        const era = getEraBucket(target.season_year as number, target.season_label as string);

        const eHG = Math.max(0.1, xg(ht.ha, at.ad, la.hg, 1.15));
        const eAG = Math.max(0.1, xg(at.aa, ht.hd, la.ag, 1.0));

        const mat = buildMatrix(eHG, eAG);
        const { pH, pD, pA, over15, over25, over35, btts } = outcomes(mat);
        const { score: confScore, grade: confGrade } = confidence(pH, pD, pA);
        const predictedResult = pH >= pD && pH >= pA ? "H" : pD >= pA ? "D" : "A";

        const decisionSummary = `${target.home_team_name} - ${target.away_team_name} | ${predictedResult} (${(Math.max(pH, pD, pA) * 100).toFixed(1)}%) | Grade: ${confGrade} | xG: ${eHG.toFixed(2)}-${eAG.toFixed(2)}`;

        const featureSnapshot = {
          cutoffDate: targetDate,
          eraBucket: era,
          leagueAverages: { sampleSize: la.n, homeGoalAvg: la.hg, awayGoalAvg: la.ag, homeWinRate: la.hwr, drawRate: la.dr, awayWinRate: la.awr },
          homeTeam: { teamId: target.home_team_id, sampleSize: ht.n, homeAttack: ht.ha, homeDefense: ht.hd, awayAttack: ht.aa, awayDefense: ht.ad, homeGoalRate: ht.hgr, awayGoalRate: ht.agr },
          awayTeam: { teamId: target.away_team_id, sampleSize: at.n, homeAttack: at.ha, homeDefense: at.hd, awayAttack: at.aa, awayDefense: at.ad, homeGoalRate: at.hgr, awayGoalRate: at.agr },
          dataAvailability: { has_ft_score: true, has_result: true, priorSampleSize: prior.length },
          expectedHomeGoals: eHG,
          expectedAwayGoals: eAG,
        };

        // Store feature snapshot via RPC
        await sb.rpc("ml_upsert_feature_snapshot", {
          p_match_id: target.match_id,
          p_model_version_id: modelVersionId,
          p_feature_cutoff_date: targetDate,
          p_era_bucket: era,
          p_competition_id: target.competition_id,
          p_season_id: target.season_id,
          p_home_team_id: target.home_team_id,
          p_away_team_id: target.away_team_id,
          p_feature_json: featureSnapshot,
          p_data_availability_json: featureSnapshot.dataAvailability,
        });

        // Store prediction via RPC
        const predPayload = {
          backtest_run_id: runId,
          model_version_id: modelVersionId,
          match_id: target.match_id,
          match_date: targetDate,
          feature_cutoff_date: targetDate,
          trained_until_date: TRAINED_UNTIL,
          era_bucket: era,
          competition_id: target.competition_id,
          competition_name: target.competition_name,
          season_id: target.season_id,
          season_label: target.season_label,
          home_team_id: target.home_team_id,
          home_team_name: target.home_team_name,
          away_team_id: target.away_team_id,
          away_team_name: target.away_team_name,
          p_home: pH,
          p_draw: pD,
          p_away: pA,
          expected_home_goals: eHG,
          expected_away_goals: eAG,
          p_over_1_5: over15,
          p_over_2_5: over25,
          p_over_3_5: over35,
          p_btts: btts,
          attack_index_home: la.hg > 0 ? ht.ha / la.hg : 1.0,
          attack_index_away: la.ag > 0 ? at.aa / la.ag : 1.0,
          xg_lite_internal_home: eHG,
          xg_lite_internal_away: eAG,
          predicted_result: predictedResult,
          confidence_score: confScore,
          confidence_grade: confGrade,
          decision_summary: decisionSummary,
          feature_snapshot: featureSnapshot,
          model_debug: { leagueSampleSize: la.n, homeTeamSampleSize: ht.n, awayTeamSampleSize: at.n, priorMatchesUsed: prior.length },
          is_public_visible: false,
        };

        const { data: predRaw, error: predErr } = await sb.rpc("ml_insert_prediction", { p_payload: predPayload });
        if (predErr || !predRaw) { failed++; continue; }

        const predId: string = (predRaw as { id: string }).id;

        // Store evaluation — actual result used only for scoring, never as training input
        const actualResult = target.result as string;
        const actualTotalGoals = (target.home_score_ft as number) + (target.away_score_ft as number);
        const actualBtts = (target.home_score_ft as number) > 0 && (target.away_score_ft as number) > 0;
        const b = brier1x2(pH, pD, pA, actualResult);
        const ll = logLoss1x2(pH, pD, pA, actualResult);
        const { cat, notes } = errorCat(predictedResult, actualResult, confGrade);

        await sb.rpc("ml_insert_evaluation", {
          p_payload: {
            prediction_id: predId,
            match_id: target.match_id,
            actual_result: actualResult,
            actual_home_score: target.home_score_ft,
            actual_away_score: target.away_score_ft,
            actual_total_goals: actualTotalGoals,
            actual_btts: actualBtts,
            actual_over_1_5: actualTotalGoals > 1.5,
            actual_over_2_5: actualTotalGoals > 2.5,
            actual_over_3_5: actualTotalGoals > 3.5,
            predicted_result: predictedResult,
            is_result_correct: predictedResult === actualResult,
            brier_1x2: b,
            log_loss_1x2: ll,
            over_1_5_correct: (over15 > 0.5) === (actualTotalGoals > 1.5),
            over_2_5_correct: (over25 > 0.5) === (actualTotalGoals > 2.5),
            over_3_5_correct: (over35 > 0.5) === (actualTotalGoals > 3.5),
            btts_correct: (btts > 0.5) === actualBtts,
            error_category: cat,
            error_notes: notes,
            calibration_bucket: confGrade,
          },
        });

        totalBrier += b;
        totalLL += ll;
        scoredCount++;
        processed++;

        if (processed % 10 === 0) {
          await sb.rpc("ml_update_backtest_run", { p_run_id: runId, p_processed_matches: processed, p_failed_matches: failed });
        }
      } catch (e) {
        failed++;
        console.error("Match processing error:", e);
      }
    }

    const avgBrier = scoredCount > 0 ? totalBrier / scoredCount : null;
    const avgLL = scoredCount > 0 ? totalLL / scoredCount : null;

    await sb.rpc("ml_update_backtest_run", {
      p_run_id: runId,
      p_status: "completed",
      p_processed_matches: processed,
      p_failed_matches: failed,
      p_avg_brier: avgBrier,
      p_avg_log_loss: avgLL,
    });

    return Response.json({
      success: true,
      run_id: runId,
      total_matches: total,
      processed_matches: processed,
      failed_matches: failed,
      scored_count: scoredCount,
      average_brier_1x2: avgBrier,
      average_log_loss_1x2: avgLL,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { headers: corsHeaders, status: 500 });
  }
});
