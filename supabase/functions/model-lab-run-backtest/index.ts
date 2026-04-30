import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type M = Record<string, unknown>;

// ─── Constants ────────────────────────────────────────────────────────────────
const COMPETITIONS = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Eredivisie", "Sueper Lig"];
const VALIDATION_SEASON = "2018-2019";
const TRAINED_UNTIL = "2018-06-30";
const TRAINING_SEASON_YEAR = 2017;
const PRIOR_LIMIT = 5000;
const DEFAULT_CHUNK_SIZE = 500;
const MODEL_KEY_DEFAULT = "b3_historical_backbone_v0_1";

// ─── Era bucket ───────────────────────────────────────────────────────────────
function getEraBucket(seasonYear: number, seasonLabel: string): string {
  if (seasonLabel === "2018-2019") return "bridge_2018_2019";
  if (seasonLabel === "2019-2020") return "covid_disrupted";
  if (seasonLabel === "2020-2021") return "covid_limited_crowd";
  if (seasonYear <= 2017) return "historical_basic";
  return "modern_basic";
}

// ─── Poisson PMF ──────────────────────────────────────────────────────────────
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

// ─── League averages ──────────────────────────────────────────────────────────
function leagueAvg(prior: M[], compId?: string) {
  const scored = prior.filter((m) =>
    m.home_score_ft != null && m.away_score_ft != null &&
    (!compId || m.competition_id === compId)
  );
  if (scored.length === 0) return { hg: 1.5, ag: 1.15, hwr: 0.45, dr: 0.26, awr: 0.29, n: 0 };
  const hg = scored.reduce((s, m) => s + (m.home_score_ft as number), 0) / scored.length;
  const ag = scored.reduce((s, m) => s + (m.away_score_ft as number), 0) / scored.length;
  const hwr = scored.filter((m) => m.result === "H").length / scored.length;
  const dr  = scored.filter((m) => m.result === "D").length / scored.length;
  const awr = scored.filter((m) => m.result === "A").length / scored.length;
  return { hg, ag, hwr, dr, awr, n: scored.length };
}

// ─── Team strength (Bayesian shrinkage) ───────────────────────────────────────
function teamStrength(teamId: string, prior: M[], la: ReturnType<typeof leagueAvg>) {
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
    ha: shrink(rawHA, la.hg, homeMat.length), hd: shrink(rawHD, la.ag, homeMat.length),
    aa: shrink(rawAA, la.ag, awayMat.length), ad: shrink(rawAD, la.hg, awayMat.length),
    hgr: rawHA, agr: rawAA, n: homeMat.length + awayMat.length,
  };
}

// ─── xG ───────────────────────────────────────────────────────────────────────
function xg(attack: number, defense: number, lgAvg: number, ha = 1.15) {
  if (lgAvg <= 0) return 1.3;
  return (attack / lgAvg) * (defense / lgAvg) * lgAvg * ha;
}

// ─── Confidence ───────────────────────────────────────────────────────────────
function confidence(pH: number, pD: number, pA: number) {
  const sorted = [pH, pD, pA].sort((a, b) => b - a);
  const score = sorted[0] - sorted[1];
  const grade = score >= 0.25 ? "A" : score >= 0.18 ? "B+" : score >= 0.12 ? "B" : score >= 0.07 ? "C" : score >= 0.03 ? "D" : "F";
  return { score, grade };
}

// ─── Brier + log loss ─────────────────────────────────────────────────────────
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

// ─── Error category ───────────────────────────────────────────────────────────
function errorCat(pred: string, actual: string, grade: string) {
  if (pred === actual) return { cat: "correct", notes: "" };
  let cat = "wrong";
  const notes = `Predicted ${pred}, actual ${actual}${(grade === "A" || grade === "B+") ? " (high confidence error)" : ""}`;
  if (pred === "H" && actual === "A") cat = "home_overestimate";
  else if (pred === "A" && actual === "H") cat = "away_overestimate";
  else if (pred === "H" && actual === "D") cat = "draw_missed_home_bias";
  else if (pred === "A" && actual === "D") cat = "draw_missed_away_bias";
  else if (pred === "D" && actual !== "D") cat = "draw_overestimate";
  if ((grade === "A" || grade === "B+") && pred !== actual) cat = "high_confidence_wrong";
  return { cat, notes };
}

// ─── Process a slice of matches (shared by all modes) ─────────────────────────
async function processMatches(
  sb: ReturnType<typeof createClient>,
  matches: M[],
  allPrior: M[],
  runId: string,
  modelVersionId: string,
): Promise<{ processed: number; failed: number; totalBrier: number; totalLL: number; scoredCount: number }> {
  let processed = 0, failed = 0, totalBrier = 0, totalLL = 0, scoredCount = 0;
  const predPayloads: M[] = [];
  const snapshotPayloads: M[] = [];

  for (const target of matches) {
    try {
      const targetDate = target.match_date as string;

      // Frozen validation mode: feature_cutoff_date = trained_until_date, NEVER match_date
      const featureCutoffDate = TRAINED_UNTIL;

      // Defensive leakage guard — fail fast, never silently insert invalid audit record
      if (featureCutoffDate >= targetDate) {
        failed++;
        console.error(`LEAKAGE_GUARD: match ${target.match_id} date=${targetDate} cutoff=${featureCutoffDate} — skipped`);
        continue;
      }

      // Prior = all training rows strictly before target date
      const prior = allPrior.filter((m) => (m.match_date as string) < targetDate);

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
        cutoffDate: featureCutoffDate, // frozen: trained_until_date, never match_date
        eraBucket: era,
        leagueAverages: { sampleSize: la.n, homeGoalAvg: la.hg, awayGoalAvg: la.ag, homeWinRate: la.hwr, drawRate: la.dr, awayWinRate: la.awr },
        homeTeam: { teamId: target.home_team_id, sampleSize: ht.n, homeAttack: ht.ha, homeDefense: ht.hd, awayAttack: ht.aa, awayDefense: ht.ad, homeGoalRate: ht.hgr, awayGoalRate: ht.agr },
        awayTeam: { teamId: target.away_team_id, sampleSize: at.n, homeAttack: at.ha, homeDefense: at.hd, awayAttack: at.aa, awayDefense: at.ad, homeGoalRate: at.hgr, awayGoalRate: at.agr },
        dataAvailability: { has_ft_score: true, has_result: true, priorSampleSize: prior.length },
        expectedHomeGoals: eHG, expectedAwayGoals: eAG,
      };

      const actualResult   = target.result as string;
      const actualTotalGoals = (target.home_score_ft as number) + (target.away_score_ft as number);
      const actualBtts     = (target.home_score_ft as number) > 0 && (target.away_score_ft as number) > 0;
      const b  = brier1x2(pH, pD, pA, actualResult);
      const ll = logLoss1x2(pH, pD, pA, actualResult);
      const { cat, notes } = errorCat(predictedResult, actualResult, confGrade);

      totalBrier += b; totalLL += ll; scoredCount++; processed++;

      snapshotPayloads.push({
        match_id: target.match_id, model_version_id: modelVersionId,
        feature_cutoff_date: featureCutoffDate, era_bucket: era,
        competition_id: target.competition_id, season_id: target.season_id,
        home_team_id: target.home_team_id, away_team_id: target.away_team_id,
        feature_json: featureSnapshot, data_availability_json: featureSnapshot.dataAvailability,
      });

      predPayloads.push({
        backtest_run_id: runId, model_version_id: modelVersionId,
        match_id: target.match_id, match_date: targetDate,
        feature_cutoff_date: featureCutoffDate, // frozen: trained_until_date
        trained_until_date: TRAINED_UNTIL,
        era_bucket: era, competition_id: target.competition_id, competition_name: target.competition_name,
        season_id: target.season_id, season_label: target.season_label,
        home_team_id: target.home_team_id, home_team_name: target.home_team_name,
        away_team_id: target.away_team_id, away_team_name: target.away_team_name,
        p_home: pH, p_draw: pD, p_away: pA, expected_home_goals: eHG, expected_away_goals: eAG,
        p_over_1_5: over15, p_over_2_5: over25, p_over_3_5: over35, p_btts: btts,
        attack_index_home: la.hg > 0 ? ht.ha / la.hg : 1.0,
        attack_index_away: la.ag > 0 ? at.aa / la.ag : 1.0,
        xg_lite_internal_home: eHG, xg_lite_internal_away: eAG,
        predicted_result: predictedResult, confidence_score: confScore, confidence_grade: confGrade,
        decision_summary: decisionSummary, feature_snapshot: featureSnapshot,
        model_debug: { leagueSampleSize: la.n, homeTeamSampleSize: ht.n, awayTeamSampleSize: at.n, priorSampleSize: prior.length },
        is_public_visible: false,
        _actual_result: actualResult, _actual_home_score: target.home_score_ft,
        _actual_away_score: target.away_score_ft, _actual_total_goals: actualTotalGoals,
        _actual_btts: actualBtts, _brier: b, _ll: ll,
        _over15: over15, _over25: over25, _over35: over35, _btts: btts,
        _cat: cat, _notes: notes, _confGrade: confGrade, _predictedResult: predictedResult,
      });
    } catch (e) {
      failed++;
      console.error("Match processing error:", e);
    }
  }

  // ── Persist: feature snapshots ────────────────────────────────────────────
  const SNAP_BATCH = 50;
  for (let i = 0; i < snapshotPayloads.length; i += SNAP_BATCH) {
    const batch = snapshotPayloads.slice(i, i + SNAP_BATCH) as M[];
    await Promise.all(batch.map((s) => sb.rpc("ml_upsert_feature_snapshot", {
      p_match_id: s.match_id, p_model_version_id: s.model_version_id,
      p_feature_cutoff_date: s.feature_cutoff_date, p_era_bucket: s.era_bucket,
      p_competition_id: s.competition_id, p_season_id: s.season_id,
      p_home_team_id: s.home_team_id, p_away_team_id: s.away_team_id,
      p_feature_json: s.feature_json, p_data_availability_json: s.data_availability_json,
    })));
  }

  // ── Persist: predictions ──────────────────────────────────────────────────
  const PRED_BATCH = 25;
  const insertedPreds: { id: string; match_id: string }[] = [];
  for (let i = 0; i < predPayloads.length; i += PRED_BATCH) {
    const batch = predPayloads.slice(i, i + PRED_BATCH) as M[];
    const results = await Promise.all(batch.map((p) => {
      const payload: M = { ...p };
      for (const k of Object.keys(payload)) { if (k.startsWith("_")) delete payload[k]; }
      return sb.rpc("ml_insert_prediction", { p_payload: payload });
    }));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.data) {
        insertedPreds.push({ id: (r.data as { id: string }).id, match_id: batch[j].match_id as string });
      } else {
        failed++;
        processed--;
      }
    }
  }

  // ── Persist: evaluations ──────────────────────────────────────────────────
  const predIdMap = new Map(insertedPreds.map((p) => [p.match_id, p.id]));
  const EVAL_BATCH = 25;
  for (let i = 0; i < predPayloads.length; i += EVAL_BATCH) {
    const batch = predPayloads.slice(i, i + EVAL_BATCH) as M[];
    await Promise.all(batch.map((p) => {
      const predId = predIdMap.get(p.match_id as string);
      if (!predId) return Promise.resolve();
      return sb.rpc("ml_insert_evaluation", {
        p_payload: {
          prediction_id: predId, match_id: p.match_id,
          actual_result: p._actual_result, actual_home_score: p._actual_home_score,
          actual_away_score: p._actual_away_score, actual_total_goals: p._actual_total_goals,
          actual_btts: p._actual_btts,
          actual_over_1_5: (p._actual_total_goals as number) > 1.5,
          actual_over_2_5: (p._actual_total_goals as number) > 2.5,
          actual_over_3_5: (p._actual_total_goals as number) > 3.5,
          predicted_result: p._predictedResult,
          is_result_correct: p._predictedResult === p._actual_result,
          brier_1x2: p._brier, log_loss_1x2: p._ll,
          over_1_5_correct: ((p._over15 as number) > 0.5) === ((p._actual_total_goals as number) > 1.5),
          over_2_5_correct: ((p._over25 as number) > 0.5) === ((p._actual_total_goals as number) > 2.5),
          over_3_5_correct: ((p._over35 as number) > 0.5) === ((p._actual_total_goals as number) > 3.5),
          btts_correct: ((p._btts as number) > 0.5) === (p._actual_btts as boolean),
          error_category: p._cat, error_notes: p._notes, calibration_bucket: p._confGrade,
        },
      });
    }));
  }

  return { processed, failed, totalBrier, totalLL, scoredCount };
}

// ─── MODE: create_run ─────────────────────────────────────────────────────────
async function modeCreateRun(
  sb: ReturnType<typeof createClient>,
  modelKey: string,
  chunkSize: number,
  totalLimit: number,
): Promise<Response> {
  const { data: mvRaw, error: mvErr } = await sb.rpc("ml_get_model_version", { p_version_key: modelKey });
  if (mvErr || !mvRaw) return Response.json({ error: `Model version not found: ${modelKey}` }, { headers: corsHeaders, status: 400 });
  const modelVersionId = (mvRaw as { id: string }).id;

  // Count eligible matches
  let countQuery = sb.from("v_historical_match_archive")
    .select("match_id", { count: "exact", head: true })
    .eq("season_label", VALIDATION_SEASON)
    .in("competition_name", COMPETITIONS)
    .not("result", "is", null)
    .eq("has_ft_score", true);
  if (totalLimit > 0) countQuery = countQuery.limit(totalLimit);
  const { count: totalCount, error: cntErr } = await countQuery;
  if (cntErr) return Response.json({ error: cntErr.message }, { headers: corsHeaders, status: 500 });

  const total = Math.min(totalCount ?? 0, totalLimit > 0 ? totalLimit : (totalCount ?? 0));

  const runKey = `${modelKey}_chunked_${chunkSize}_${Date.now()}`;
  const { data: runRaw, error: runErr } = await sb.rpc("ml_insert_backtest_run", {
    p_model_version_id: modelVersionId,
    p_run_key: runKey,
    p_run_scope: `chunked_${chunkSize}`,
    p_competition_scope: COMPETITIONS,
    p_era_scope: ["bridge_2018_2019"],
  });
  if (runErr || !runRaw) return Response.json({ error: `Failed to create run: ${runErr?.message}` }, { headers: corsHeaders, status: 500 });
  const runId = (runRaw as { id: string }).id;

  await sb.rpc("ml_update_backtest_run", { p_run_id: runId, p_total_matches: total });

  // Create chunk rows
  const chunks: M[] = [];
  let chunkIndex = 0;
  for (let offset = 0; offset < total; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, total);
    chunks.push({
      backtest_run_id: runId,
      chunk_index: chunkIndex++,
      offset_start: offset,
      offset_end: end,
      limit_size: end - offset,
      status: "pending",
    });
  }

  const chunkPayloads = chunks.map((c) => ({
    chunk_index: c.chunk_index,
    offset_start: c.offset_start,
    offset_end: c.offset_end,
    limit_size: c.limit_size,
  }));
  const { error: insertErr } = await sb.rpc("ml_insert_backtest_run_chunks", {
    p_run_id: runId,
    p_chunks: chunkPayloads,
  });
  if (insertErr) return Response.json({ error: `Failed to create chunks: ${insertErr.message}` }, { headers: corsHeaders, status: 500 });

  return Response.json({
    success: true, mode: "create_run",
    run_id: runId, total_matches: total,
    chunk_size: chunkSize, chunk_count: chunks.length,
  }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── MODE: run_chunk ──────────────────────────────────────────────────────────
async function modeRunChunk(
  sb: ReturnType<typeof createClient>,
  runId: string,
  chunkIndex: number,
): Promise<Response> {
  // Fetch all chunks for run, find target chunk
  const { data: chunksRaw } = await sb.rpc("ml_get_backtest_run_chunks", { p_run_id: runId });
  const allChunkRows = (chunksRaw ?? []) as M[];
  const chunk = allChunkRows.find((c) => (c.chunk_index as number) === chunkIndex);

  if (!chunk) {
    return Response.json({ error: `Chunk ${chunkIndex} not found for run ${runId}` }, { headers: corsHeaders, status: 404 });
  }

  if (chunk.status === "completed") {
    return Response.json({ success: true, mode: "run_chunk", skipped: true, reason: "already_completed", chunk_index: chunkIndex }, { headers: corsHeaders });
  }

  // Get model version from parent run via RPC
  const { data: runInfoRaw } = await sb.rpc("ml_get_backtest_run", { p_run_id: runId });
  const modelVersionId = (runInfoRaw as M)?.model_version_id as string;

  // Mark chunk running
  await sb.rpc("ml_update_backtest_run_chunk", {
    p_run_id: runId, p_chunk_index: chunkIndex,
    p_status: "running", p_started_at: new Date().toISOString(),
  });

  try {
    // Load this chunk's validation matches using range (offset via ordering)
    const { data: allValRaw, error: valErr } = await sb
      .from("v_historical_match_archive")
      .select("*")
      .eq("season_label", VALIDATION_SEASON)
      .in("competition_name", COMPETITIONS)
      .not("result", "is", null)
      .eq("has_ft_score", true)
      .order("match_date", { ascending: true })
      .order("match_id", { ascending: true })
      .range(chunk.offset_start as number, (chunk.offset_end as number) - 1);

    if (valErr) throw new Error(`Failed to load validation matches: ${valErr.message}`);
    const chunkMatches = (allValRaw ?? []) as M[];

    // Load prior training matches (single bulk fetch, filter in-memory)
    const { data: priorRaw } = await sb
      .from("v_historical_match_archive")
      .select("*")
      .in("competition_name", COMPETITIONS)
      .lte("season_year", TRAINING_SEASON_YEAR)
      .not("result", "is", null)
      .order("match_date", { ascending: false })
      .limit(PRIOR_LIMIT);
    const allPrior = (priorRaw ?? []) as M[];

    const { processed, failed, totalBrier, totalLL, scoredCount } = await processMatches(
      sb, chunkMatches, allPrior, runId, modelVersionId,
    );

    const avgBrier = scoredCount > 0 ? totalBrier / scoredCount : null;
    const avgLL    = scoredCount > 0 ? totalLL / scoredCount : null;

    // Mark chunk completed
    await sb.rpc("ml_update_backtest_run_chunk", {
      p_run_id: runId, p_chunk_index: chunkIndex,
      p_status: "completed",
      p_processed_matches: processed, p_failed_matches: failed,
      p_average_brier_1x2: avgBrier, p_average_log_loss_1x2: avgLL,
      p_completed_at: new Date().toISOString(),
    });

    // Update parent run progress totals
    const { data: agg } = await sb.rpc("ml_get_backtest_run_chunks", { p_run_id: runId });
    const aggRows = (agg ?? []) as M[];
    const totalProcessed = aggRows.reduce((s, r) => s + ((r.processed_matches as number) ?? 0), 0);
    const totalFailed    = aggRows.reduce((s, r) => s + ((r.failed_matches as number) ?? 0), 0);
    await sb.rpc("ml_update_backtest_run", {
      p_run_id: runId, p_status: "running",
      p_processed_matches: totalProcessed, p_failed_matches: totalFailed,
    });

    return Response.json({
      success: true, mode: "run_chunk",
      run_id: runId, chunk_index: chunkIndex,
      processed_matches: processed, failed_matches: failed,
      average_brier_1x2: avgBrier, average_log_loss_1x2: avgLL,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.rpc("ml_update_backtest_run_chunk", {
      p_run_id: runId, p_chunk_index: chunkIndex,
      p_status: "failed", p_error_message: msg,
      p_completed_at: new Date().toISOString(),
    });
    return Response.json({ error: msg, mode: "run_chunk", chunk_index: chunkIndex }, { headers: corsHeaders, status: 500 });
  }
}

// ─── MODE: retry_failed_chunks ────────────────────────────────────────────────
async function modeRetryFailed(
  sb: ReturnType<typeof createClient>,
  runId: string,
): Promise<Response> {
  const { data: allChunksRaw } = await sb.rpc("ml_get_backtest_run_chunks", { p_run_id: runId });
  const failedChunks = ((allChunksRaw ?? []) as M[]).filter((c) => c.status === "failed");

  if (failedChunks.length === 0) {
    return Response.json({ success: true, mode: "retry_failed_chunks", retried: 0, message: "No failed chunks found" }, { headers: corsHeaders });
  }

  const { data: resetResult } = await sb.rpc("ml_reset_failed_chunks", { p_run_id: runId });
  const resetCount = (resetResult as { reset_count?: number })?.reset_count ?? failedChunks.length;

  return Response.json({
    success: true, mode: "retry_failed_chunks",
    run_id: runId,
    retried: resetCount,
    chunk_indices: failedChunks.map((c) => c.chunk_index),
  }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── MODE: finalize_run ───────────────────────────────────────────────────────
async function modeFinalizeRun(
  sb: ReturnType<typeof createClient>,
  runId: string,
): Promise<Response> {
  // Verify all chunks completed — refuse to finalize otherwise
  const { data: chunkSummary } = await sb.rpc("ml_get_backtest_run_chunks", { p_run_id: runId });

  const allChunks = (chunkSummary ?? []) as M[];
  const pending   = allChunks.filter((c) => c.status === "pending").length;
  const running   = allChunks.filter((c) => c.status === "running").length;
  const failed    = allChunks.filter((c) => c.status === "failed").length;
  const completed = allChunks.filter((c) => c.status === "completed").length;

  if (pending > 0 || running > 0 || failed > 0) {
    return Response.json({
      error: "Cannot finalize: not all chunks completed",
      mode: "finalize_run", pending, running, failed, completed,
    }, { headers: corsHeaders, status: 400 });
  }

  // Compute aggregate metrics across all chunks
  let totalProcessed = 0, totalFailed = 0, weightedBrier = 0, weightedLL = 0, scoredCount = 0;
  for (const c of allChunks) {
    const n = (c.processed_matches as number) ?? 0;
    totalProcessed += n;
    totalFailed += (c.failed_matches as number) ?? 0;
    if (c.average_brier_1x2 != null) { weightedBrier += (c.average_brier_1x2 as number) * n; scoredCount += n; }
    if (c.average_log_loss_1x2 != null) weightedLL += (c.average_log_loss_1x2 as number) * n;
  }
  const avgBrier = scoredCount > 0 ? weightedBrier / scoredCount : null;
  const avgLL    = scoredCount > 0 ? weightedLL / scoredCount : null;

  // Mark parent run completed
  await sb.rpc("ml_update_backtest_run", {
    p_run_id: runId, p_status: "completed",
    p_processed_matches: totalProcessed, p_failed_matches: totalFailed,
    p_avg_brier: avgBrier, p_avg_log_loss: avgLL,
  });

  // Compute calibration summary (all 13 group dimensions, completed-run guard inside)
  const { data: calResult, error: calErr } = await sb.rpc("ml_compute_calibration_summary", { p_run_id: runId });
  const calibrationRows = calErr ? 0 : ((calResult as { rows_inserted?: number })?.rows_inserted ?? 0);

  // Generate candidate adjustments (never auto-activated, is_active=false)
  const { data: adjResult, error: adjErr } = await sb.rpc("ml_generate_candidate_adjustments", { p_run_id: runId });
  const adjustmentsGenerated = adjErr ? 0 : ((adjResult as { adjustments_generated?: number })?.adjustments_generated ?? 0);

  return Response.json({
    success: true, mode: "finalize_run",
    run_id: runId, total_chunks: allChunks.length, completed_chunks: completed,
    processed_matches: totalProcessed, failed_matches: totalFailed,
    average_brier_1x2: avgBrier, average_log_loss_1x2: avgLL,
    calibration_summary_rows: calibrationRows,
    candidate_adjustments: adjustmentsGenerated,
  }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url       = new URL(req.url);
    const mode      = url.searchParams.get("mode") ?? "legacy";
    const modelKey  = url.searchParams.get("model_key") ?? MODEL_KEY_DEFAULT;
    const chunkSize = parseInt(url.searchParams.get("chunk_size") ?? String(DEFAULT_CHUNK_SIZE), 10);
    const totalLimit = parseInt(url.searchParams.get("limit") ?? "0", 10); // 0 = no limit
    const runId     = url.searchParams.get("run_id") ?? "";
    const chunkIndex = parseInt(url.searchParams.get("chunk_index") ?? "0", 10);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Chunked modes ─────────────────────────────────────────────────────────
    if (mode === "create_run") return await modeCreateRun(sb, modelKey, chunkSize, totalLimit);
    if (mode === "run_chunk") {
      if (!runId) return Response.json({ error: "run_id required" }, { headers: corsHeaders, status: 400 });
      return await modeRunChunk(sb, runId, chunkIndex);
    }
    if (mode === "retry_failed_chunks") {
      if (!runId) return Response.json({ error: "run_id required" }, { headers: corsHeaders, status: 400 });
      return await modeRetryFailed(sb, runId);
    }
    if (mode === "finalize_run") {
      if (!runId) return Response.json({ error: "run_id required" }, { headers: corsHeaders, status: 400 });
      return await modeFinalizeRun(sb, runId);
    }

    // ── Legacy mode (existing behaviour, limit param) ─────────────────────────
    const limit = totalLimit > 0 ? totalLimit : 50;
    const { data: mvRaw, error: mvErr } = await sb.rpc("ml_get_model_version", { p_version_key: modelKey });
    if (mvErr || !mvRaw) return Response.json({ error: `Model version not found: ${modelKey}` }, { headers: corsHeaders, status: 400 });
    const modelVersionId = (mvRaw as { id: string }).id;

    const runKey   = `${modelKey}_pilot_${limit}_${Date.now()}`;
    const runScope = limit <= 50 ? `test_${limit}` : `pilot_${limit}`;

    const { data: runRaw, error: runErr } = await sb.rpc("ml_insert_backtest_run", {
      p_model_version_id: modelVersionId, p_run_key: runKey, p_run_scope: runScope,
      p_competition_scope: COMPETITIONS, p_era_scope: ["bridge_2018_2019"],
    });
    if (runErr || !runRaw) return Response.json({ error: `Failed to create run: ${runErr?.message}` }, { headers: corsHeaders, status: 500 });
    const legacyRunId = (runRaw as { id: string }).id;

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
      await sb.rpc("ml_update_backtest_run", { p_run_id: legacyRunId, p_status: "failed", p_error_message: valErr.message });
      return Response.json({ error: valErr.message }, { headers: corsHeaders, status: 500 });
    }

    const valMatches = (valData ?? []) as M[];
    await sb.rpc("ml_update_backtest_run", { p_run_id: legacyRunId, p_total_matches: valMatches.length });

    const { data: priorRaw } = await sb
      .from("v_historical_match_archive").select("*")
      .in("competition_name", COMPETITIONS).lte("season_year", TRAINING_SEASON_YEAR)
      .not("result", "is", null).order("match_date", { ascending: false }).limit(PRIOR_LIMIT);
    const allPrior = (priorRaw ?? []) as M[];

    const { processed, failed, totalBrier, totalLL, scoredCount } = await processMatches(
      sb, valMatches, allPrior, legacyRunId, modelVersionId,
    );

    const avgBrier = scoredCount > 0 ? totalBrier / scoredCount : null;
    const avgLL    = scoredCount > 0 ? totalLL / scoredCount : null;

    await sb.rpc("ml_update_backtest_run", {
      p_run_id: legacyRunId, p_status: "completed",
      p_processed_matches: processed, p_failed_matches: failed,
      p_avg_brier: avgBrier, p_avg_log_loss: avgLL,
    });

    const { data: calResult, error: calErr } = await sb.rpc("ml_compute_calibration_summary", { p_run_id: legacyRunId });
    const calibrationRows = calErr ? 0 : ((calResult as { rows_inserted?: number })?.rows_inserted ?? 0);

    const { data: adjResult, error: adjErr } = await sb.rpc("ml_generate_candidate_adjustments", { p_run_id: legacyRunId });
    const adjustmentsGenerated = adjErr ? 0 : ((adjResult as { adjustments_generated?: number })?.adjustments_generated ?? 0);

    return Response.json({
      success: true, run_id: legacyRunId,
      total_matches: valMatches.length, processed_matches: processed, failed_matches: failed,
      scored_count: scoredCount, average_brier_1x2: avgBrier, average_log_loss_1x2: avgLL,
      calibration_summary_rows: calibrationRows, candidate_adjustments: adjustmentsGenerated,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { headers: corsHeaders, status: 500 });
  }
});
