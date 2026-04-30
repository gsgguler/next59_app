import { supabase } from '../supabase';
import { buildPrediction, buildEvaluation, getEraBucket } from './helpers';
import type { ArchiveMatch } from './types';

// ─── Focus competitions ───────────────────────────────────────────────────────

export const FOCUS_COMPETITIONS = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Eredivisie',
  'Sueper Lig',
];

const TRAINING_UNTIL_SEASON_YEAR = 2017; // includes up to 2017-2018
const VALIDATION_SEASON_LABEL = '2018-2019';
const TRAINED_UNTIL_DATE = '2018-06-30';

// ─── Runner options ───────────────────────────────────────────────────────────

export interface BacktestRunnerOptions {
  modelVersionKey: string;
  competitionNames?: string[];
  limit?: number;
  runScope?: string;
}

// ─── Main runner (admin-triggered only) ──────────────────────────────────────

export async function runHistoricalBackboneBacktest(
  opts: BacktestRunnerOptions,
): Promise<{ success: boolean; runId?: string; error?: string }> {
  const {
    modelVersionKey = 'b3_historical_backbone_v0_1',
    competitionNames = FOCUS_COMPETITIONS,
    limit,
    runScope = limit ? `limited_${limit}` : 'full_validation',
  } = opts;

  // ── Fetch model version ──────────────────────────────────────────────────
  const { data: modelVersion, error: mvErr } = await supabase
    .schema('model_lab' as never)
    .from('model_versions')
    .select('id')
    .eq('version_key', modelVersionKey)
    .maybeSingle();

  if (mvErr || !modelVersion) {
    return { success: false, error: `Model version not found: ${modelVersionKey}` };
  }

  const modelVersionId: string = (modelVersion as { id: string }).id;

  // ── Generate run key ─────────────────────────────────────────────────────
  const runKey = `${modelVersionKey}_${runScope}_${Date.now()}`;

  // ── Create backtest_run row ──────────────────────────────────────────────
  const { data: runRow, error: runErr } = await supabase
    .schema('model_lab' as never)
    .from('backtest_runs')
    .insert({
      model_version_id: modelVersionId,
      run_key: runKey,
      run_status: 'running',
      run_scope: runScope,
      train_start_date: '2000-07-28',
      train_end_date: TRAINED_UNTIL_DATE,
      validation_start_date: '2018-07-01',
      validation_end_date: '2019-06-30',
      competition_scope: competitionNames,
      era_scope: ['bridge_2018_2019'],
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (runErr || !runRow) {
    return { success: false, error: `Failed to create run: ${runErr?.message}` };
  }

  const runId: string = (runRow as { id: string }).id;

  try {
    // ── Load validation matches ────────────────────────────────────────────
    let valQuery = supabase
      .from('v_historical_match_archive')
      .select('*')
      .eq('season_label', VALIDATION_SEASON_LABEL)
      .in('competition_name', competitionNames)
      .not('result', 'is', null)
      .order('match_date', { ascending: true });

    if (limit) {
      valQuery = valQuery.limit(limit);
    }

    const { data: validationMatches, error: vmErr } = await valQuery;
    if (vmErr) throw new Error(`Failed to load validation matches: ${vmErr.message}`);

    const matches = (validationMatches as ArchiveMatch[]) ?? [];
    const total = matches.length;

    await supabase
      .schema('model_lab' as never)
      .from('backtest_runs')
      .update({ total_matches: total })
      .eq('id', runId);

    let processed = 0;
    let failed = 0;
    let totalBrier = 0;
    let totalLogLoss = 0;
    let scoredCount = 0;

    // ── Process each validation match ─────────────────────────────────────
    for (const targetMatch of matches) {
      try {
        // Load prior matches strictly before target date
        const { data: priorData } = await supabase
          .from('v_historical_match_archive')
          .select('*')
          .in('competition_name', competitionNames)
          .lt('match_date', targetMatch.match_date)
          .lte('season_year', TRAINING_UNTIL_SEASON_YEAR)
          .not('result', 'is', null)
          .order('match_date', { ascending: false })
          .limit(2000);

        const priorMatches = (priorData as ArchiveMatch[]) ?? [];

        // Build prediction using ONLY prior data
        const prediction = buildPrediction(targetMatch, priorMatches, TRAINED_UNTIL_DATE);

        // Store feature snapshot
        await supabase
          .schema('model_lab' as never)
          .from('match_feature_snapshots')
          .upsert(
            {
              match_id: targetMatch.match_id,
              model_version_id: modelVersionId,
              feature_cutoff_date: targetMatch.match_date,
              era_bucket: prediction.eraBucket,
              competition_id: targetMatch.competition_id,
              season_id: targetMatch.season_id,
              home_team_id: targetMatch.home_team_id,
              away_team_id: targetMatch.away_team_id,
              feature_json: prediction.featureSnapshot,
              data_availability_json: prediction.featureSnapshot.dataAvailability,
            },
            { onConflict: 'model_version_id,match_id' },
          );

        // Store prediction
        const { data: predRow, error: predErr } = await supabase
          .schema('model_lab' as never)
          .from('match_model_predictions')
          .insert({
            backtest_run_id: runId,
            model_version_id: modelVersionId,
            match_id: targetMatch.match_id,
            match_date: targetMatch.match_date,
            feature_cutoff_date: targetMatch.match_date,
            trained_until_date: TRAINED_UNTIL_DATE,
            era_bucket: prediction.eraBucket,
            competition_id: targetMatch.competition_id,
            competition_name: targetMatch.competition_name,
            season_id: targetMatch.season_id,
            season_label: targetMatch.season_label,
            home_team_id: targetMatch.home_team_id,
            home_team_name: targetMatch.home_team_name,
            away_team_id: targetMatch.away_team_id,
            away_team_name: targetMatch.away_team_name,
            p_home: prediction.pHome,
            p_draw: prediction.pDraw,
            p_away: prediction.pAway,
            expected_home_goals: prediction.expectedHomeGoals,
            expected_away_goals: prediction.expectedAwayGoals,
            p_over_1_5: prediction.pOver15,
            p_over_2_5: prediction.pOver25,
            p_over_3_5: prediction.pOver35,
            p_btts: prediction.pBtts,
            attack_index_home: prediction.attackIndexHome,
            attack_index_away: prediction.attackIndexAway,
            xg_lite_internal_home: prediction.xgLiteInternalHome,
            xg_lite_internal_away: prediction.xgLiteInternalAway,
            predicted_result: prediction.predictedResult,
            confidence_score: prediction.confidenceScore,
            confidence_grade: prediction.confidenceGrade,
            decision_summary: prediction.decisionSummary,
            feature_snapshot: prediction.featureSnapshot,
            model_debug: prediction.modelDebug,
            is_public_visible: false,
          })
          .select('id')
          .maybeSingle();

        if (predErr || !predRow) {
          failed++;
          continue;
        }

        const predictionId: string = (predRow as { id: string }).id;

        // Store evaluation
        const evaluation = buildEvaluation(predictionId, prediction, targetMatch);
        if (evaluation) {
          await supabase
            .schema('model_lab' as never)
            .from('match_model_evaluations')
            .insert({
              prediction_id: predictionId,
              match_id: targetMatch.match_id,
              actual_result: evaluation.actualResult,
              actual_home_score: evaluation.actualHomeScore,
              actual_away_score: evaluation.actualAwayScore,
              actual_total_goals: evaluation.actualTotalGoals,
              actual_btts: evaluation.actualBtts,
              actual_over_1_5: evaluation.actualOver15,
              actual_over_2_5: evaluation.actualOver25,
              actual_over_3_5: evaluation.actualOver35,
              predicted_result: evaluation.predictedResult,
              is_result_correct: evaluation.isResultCorrect,
              brier_1x2: evaluation.brier1x2,
              log_loss_1x2: evaluation.logLoss1x2,
              over_1_5_correct: evaluation.over15Correct,
              over_2_5_correct: evaluation.over25Correct,
              over_3_5_correct: evaluation.over35Correct,
              btts_correct: evaluation.bttsCorrect,
              error_category: evaluation.errorCategory,
              error_notes: evaluation.errorNotes,
              calibration_bucket: evaluation.calibrationBucket,
            });

          totalBrier += evaluation.brier1x2;
          totalLogLoss += evaluation.logLoss1x2;
          scoredCount++;
        }

        processed++;

        // Update progress every 10 matches
        if (processed % 10 === 0) {
          await supabase
            .schema('model_lab' as never)
            .from('backtest_runs')
            .update({ processed_matches: processed, failed_matches: failed })
            .eq('id', runId);
        }
      } catch (matchErr) {
        failed++;
        console.error('Match processing error:', matchErr);
      }
    }

    // ── Finalize run ───────────────────────────────────────────────────────
    const avgBrier = scoredCount > 0 ? totalBrier / scoredCount : null;
    const avgLogLoss = scoredCount > 0 ? totalLogLoss / scoredCount : null;

    await supabase
      .schema('model_lab' as never)
      .from('backtest_runs')
      .update({
        run_status: 'completed',
        processed_matches: processed,
        failed_matches: failed,
        average_brier_1x2: avgBrier,
        average_log_loss_1x2: avgLogLoss,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return { success: true, runId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .schema('model_lab' as never)
      .from('backtest_runs')
      .update({
        run_status: 'failed',
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);
    return { success: false, runId, error: msg };
  }
}
