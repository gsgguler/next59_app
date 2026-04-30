/*
  # Add completed-run filter to ml_compute_calibration_summary and ml_generate_candidate_adjustments

  ## Changes
  - Both functions now JOIN backtest_runs and enforce run_status = 'completed' before
    aggregating predictions/evaluations. This ensures stale/failed/running runs never
    pollute calibration data.
  - No schema changes — function body replacements only.
*/

-- ── ml_compute_calibration_summary — add completed-run guard ─────────────────
CREATE OR REPLACE FUNCTION public.ml_compute_calibration_summary(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_model_version_id uuid;
  v_run_status text;
  v_inserted integer := 0;
BEGIN
  SELECT model_version_id, run_status INTO v_model_version_id, v_run_status
  FROM model_lab.backtest_runs WHERE id = p_run_id;

  -- Only compute calibration for completed runs
  IF v_run_status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('error', 'Run is not completed', 'run_status', v_run_status);
  END IF;

  -- ── overall ─────────────────────────────────────────────────────────────────
  WITH base AS (
    SELECT
      p.p_home, p.p_draw, p.p_away,
      p.predicted_result, p.confidence_score, p.confidence_grade,
      e.actual_result, e.brier_1x2, e.log_loss_1x2,
      e.is_result_correct, e.over_1_5_correct, e.over_2_5_correct,
      e.over_3_5_correct, e.btts_correct, e.error_category
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    JOIN model_lab.backtest_runs br ON br.id = p.backtest_run_id
    WHERE p.backtest_run_id = p_run_id AND br.run_status = 'completed'
  ),
  error_cat_agg AS (
    SELECT jsonb_object_agg(error_category, cnt) AS j
    FROM (SELECT error_category, COUNT(*)::integer AS cnt FROM base GROUP BY error_category) x
  ),
  pva_agg AS (
    SELECT jsonb_object_agg(combo, cnt) AS j
    FROM (SELECT (predicted_result || '_' || actual_result) AS combo, COUNT(*)::integer AS cnt FROM base GROUP BY predicted_result, actual_result) x
  ),
  metrics AS (
    SELECT
      COUNT(*)::integer AS n,
      AVG(brier_1x2) AS avg_brier, AVG(log_loss_1x2) AS avg_ll,
      AVG(CASE WHEN is_result_correct THEN 1.0 ELSE 0.0 END) AS acc,
      AVG(CASE WHEN over_1_5_correct THEN 1.0 ELSE 0.0 END) AS o15,
      AVG(CASE WHEN over_2_5_correct THEN 1.0 ELSE 0.0 END) AS o25,
      AVG(CASE WHEN over_3_5_correct THEN 1.0 ELSE 0.0 END) AS o35,
      AVG(CASE WHEN btts_correct THEN 1.0 ELSE 0.0 END) AS btts,
      AVG(p_home) - AVG(CASE WHEN actual_result='H' THEN 1.0 ELSE 0.0 END) AS h_bias,
      AVG(p_draw) - AVG(CASE WHEN actual_result='D' THEN 1.0 ELSE 0.0 END) AS d_bias,
      AVG(p_away) - AVG(CASE WHEN actual_result='A' THEN 1.0 ELSE 0.0 END) AS a_bias,
      AVG(CASE WHEN error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END) AS hcw_rate,
      COUNT(*) FILTER (WHERE predicted_result='H')::integer AS ph,
      COUNT(*) FILTER (WHERE predicted_result='D')::integer AS pd,
      COUNT(*) FILTER (WHERE predicted_result='A')::integer AS pa,
      COUNT(*) FILTER (WHERE actual_result='H')::integer AS ah,
      COUNT(*) FILTER (WHERE actual_result='D')::integer AS ad,
      COUNT(*) FILTER (WHERE actual_result='A')::integer AS aa,
      COUNT(*) FILTER (WHERE predicted_result='H' AND actual_result='H')::integer AS hh,
      COUNT(*) FILTER (WHERE predicted_result='D' AND actual_result='D')::integer AS dd,
      COUNT(*) FILTER (WHERE predicted_result='A' AND actual_result='A')::integer AS aac,
      AVG(confidence_score) AS avg_conf,
      AVG(ABS(GREATEST(p_home,p_draw,p_away) - CASE WHEN is_result_correct THEN 1.0 ELSE 0.0 END)) AS cal_err
    FROM base
  )
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate,
    predicted_h_count, predicted_d_count, predicted_a_count,
    actual_h_count, actual_d_count, actual_a_count,
    h_correct, d_correct, a_correct,
    avg_confidence_score, calibration_error,
    error_category_json, predicted_vs_actual_json
  )
  SELECT p_run_id, v_model_version_id, 'overall', 'all',
    m.n, m.avg_brier, m.avg_ll, m.acc,
    m.o15, m.o25, m.o35, m.btts,
    m.h_bias, m.d_bias, m.a_bias, m.hcw_rate,
    m.ph, m.pd, m.pa, m.ah, m.ad, m.aa,
    m.hh, m.dd, m.aac, m.avg_conf, m.cal_err,
    ec.j, pva.j
  FROM metrics m, error_cat_agg ec, pva_agg pva
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    over_1_5_accuracy=EXCLUDED.over_1_5_accuracy, over_2_5_accuracy=EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy=EXCLUDED.over_3_5_accuracy, btts_accuracy=EXCLUDED.btts_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count=EXCLUDED.predicted_h_count, predicted_d_count=EXCLUDED.predicted_d_count,
    predicted_a_count=EXCLUDED.predicted_a_count, actual_h_count=EXCLUDED.actual_h_count,
    actual_d_count=EXCLUDED.actual_d_count, actual_a_count=EXCLUDED.actual_a_count,
    h_correct=EXCLUDED.h_correct, d_correct=EXCLUDED.d_correct, a_correct=EXCLUDED.a_correct,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error,
    error_category_json=EXCLUDED.error_category_json, predicted_vs_actual_json=EXCLUDED.predicted_vs_actual_json;

  -- ── competition ──────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, predicted_h_count, predicted_d_count, predicted_a_count,
    actual_h_count, actual_d_count, actual_a_count, h_correct, d_correct, a_correct,
    avg_confidence_score, calibration_error, error_category_json, predicted_vs_actual_json
  )
  SELECT p_run_id, v_model_version_id, 'competition', p.competition_name,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    COUNT(*) FILTER (WHERE p.predicted_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='A')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='H' AND e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D' AND e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A' AND e.actual_result='A')::integer,
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END)),
    (SELECT jsonb_object_agg(ec,cnt) FROM (SELECT e2.error_category AS ec,COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id JOIN model_lab.backtest_runs br2 ON br2.id=p2.backtest_run_id WHERE p2.backtest_run_id=p_run_id AND br2.run_status='completed' AND p2.competition_name=p.competition_name GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo,cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo,COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id JOIN model_lab.backtest_runs br3 ON br3.id=p3.backtest_run_id WHERE p3.backtest_run_id=p_run_id AND br3.run_status='completed' AND p3.competition_name=p.competition_name GROUP BY p3.predicted_result,e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.competition_name
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    over_1_5_accuracy=EXCLUDED.over_1_5_accuracy, over_2_5_accuracy=EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy=EXCLUDED.over_3_5_accuracy, btts_accuracy=EXCLUDED.btts_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count=EXCLUDED.predicted_h_count, predicted_d_count=EXCLUDED.predicted_d_count,
    predicted_a_count=EXCLUDED.predicted_a_count, actual_h_count=EXCLUDED.actual_h_count,
    actual_d_count=EXCLUDED.actual_d_count, actual_a_count=EXCLUDED.actual_a_count,
    h_correct=EXCLUDED.h_correct, d_correct=EXCLUDED.d_correct, a_correct=EXCLUDED.a_correct,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error,
    error_category_json=EXCLUDED.error_category_json, predicted_vs_actual_json=EXCLUDED.predicted_vs_actual_json;

  -- ── season ───────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, predicted_h_count, predicted_d_count, predicted_a_count,
    actual_h_count, actual_d_count, actual_a_count, h_correct, d_correct, a_correct,
    avg_confidence_score, calibration_error, error_category_json, predicted_vs_actual_json
  )
  SELECT p_run_id, v_model_version_id, 'season', p.season_label,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    COUNT(*) FILTER (WHERE p.predicted_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='A')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='H' AND e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D' AND e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A' AND e.actual_result='A')::integer,
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END)),
    (SELECT jsonb_object_agg(ec,cnt) FROM (SELECT e2.error_category AS ec,COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id JOIN model_lab.backtest_runs br2 ON br2.id=p2.backtest_run_id WHERE p2.backtest_run_id=p_run_id AND br2.run_status='completed' AND p2.season_label=p.season_label GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo,cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo,COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id JOIN model_lab.backtest_runs br3 ON br3.id=p3.backtest_run_id WHERE p3.backtest_run_id=p_run_id AND br3.run_status='completed' AND p3.season_label=p.season_label GROUP BY p3.predicted_result,e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.season_label
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    over_1_5_accuracy=EXCLUDED.over_1_5_accuracy, over_2_5_accuracy=EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy=EXCLUDED.over_3_5_accuracy, btts_accuracy=EXCLUDED.btts_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count=EXCLUDED.predicted_h_count, predicted_d_count=EXCLUDED.predicted_d_count,
    predicted_a_count=EXCLUDED.predicted_a_count, actual_h_count=EXCLUDED.actual_h_count,
    actual_d_count=EXCLUDED.actual_d_count, actual_a_count=EXCLUDED.actual_a_count,
    h_correct=EXCLUDED.h_correct, d_correct=EXCLUDED.d_correct, a_correct=EXCLUDED.a_correct,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error,
    error_category_json=EXCLUDED.error_category_json, predicted_vs_actual_json=EXCLUDED.predicted_vs_actual_json;

  -- ── era_bucket ───────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, predicted_h_count, predicted_d_count, predicted_a_count,
    actual_h_count, actual_d_count, actual_a_count, h_correct, d_correct, a_correct,
    avg_confidence_score, calibration_error, error_category_json, predicted_vs_actual_json
  )
  SELECT p_run_id, v_model_version_id, 'era_bucket', p.era_bucket,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    COUNT(*) FILTER (WHERE p.predicted_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='A')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='H' AND e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D' AND e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A' AND e.actual_result='A')::integer,
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END)),
    (SELECT jsonb_object_agg(ec,cnt) FROM (SELECT e2.error_category AS ec,COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id JOIN model_lab.backtest_runs br2 ON br2.id=p2.backtest_run_id WHERE p2.backtest_run_id=p_run_id AND br2.run_status='completed' AND p2.era_bucket=p.era_bucket GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo,cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo,COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id JOIN model_lab.backtest_runs br3 ON br3.id=p3.backtest_run_id WHERE p3.backtest_run_id=p_run_id AND br3.run_status='completed' AND p3.era_bucket=p.era_bucket GROUP BY p3.predicted_result,e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.era_bucket
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    over_1_5_accuracy=EXCLUDED.over_1_5_accuracy, over_2_5_accuracy=EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy=EXCLUDED.over_3_5_accuracy, btts_accuracy=EXCLUDED.btts_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count=EXCLUDED.predicted_h_count, predicted_d_count=EXCLUDED.predicted_d_count,
    predicted_a_count=EXCLUDED.predicted_a_count, actual_h_count=EXCLUDED.actual_h_count,
    actual_d_count=EXCLUDED.actual_d_count, actual_a_count=EXCLUDED.actual_a_count,
    h_correct=EXCLUDED.h_correct, d_correct=EXCLUDED.d_correct, a_correct=EXCLUDED.a_correct,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error,
    error_category_json=EXCLUDED.error_category_json, predicted_vs_actual_json=EXCLUDED.predicted_vs_actual_json;

  -- ── confidence_grade ─────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, predicted_h_count, predicted_d_count, predicted_a_count,
    actual_h_count, actual_d_count, actual_a_count, h_correct, d_correct, a_correct,
    avg_confidence_score, calibration_error, error_category_json, predicted_vs_actual_json
  )
  SELECT p_run_id, v_model_version_id, 'confidence_grade', p.confidence_grade,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    COUNT(*) FILTER (WHERE p.predicted_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE e.actual_result='A')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='H' AND e.actual_result='H')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='D' AND e.actual_result='D')::integer,
    COUNT(*) FILTER (WHERE p.predicted_result='A' AND e.actual_result='A')::integer,
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END)),
    (SELECT jsonb_object_agg(ec,cnt) FROM (SELECT e2.error_category AS ec,COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id JOIN model_lab.backtest_runs br2 ON br2.id=p2.backtest_run_id WHERE p2.backtest_run_id=p_run_id AND br2.run_status='completed' AND p2.confidence_grade=p.confidence_grade GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo,cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo,COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id JOIN model_lab.backtest_runs br3 ON br3.id=p3.backtest_run_id WHERE p3.backtest_run_id=p_run_id AND br3.run_status='completed' AND p3.confidence_grade=p.confidence_grade GROUP BY p3.predicted_result,e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.confidence_grade
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    over_1_5_accuracy=EXCLUDED.over_1_5_accuracy, over_2_5_accuracy=EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy=EXCLUDED.over_3_5_accuracy, btts_accuracy=EXCLUDED.btts_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count=EXCLUDED.predicted_h_count, predicted_d_count=EXCLUDED.predicted_d_count,
    predicted_a_count=EXCLUDED.predicted_a_count, actual_h_count=EXCLUDED.actual_h_count,
    actual_d_count=EXCLUDED.actual_d_count, actual_a_count=EXCLUDED.actual_a_count,
    h_correct=EXCLUDED.h_correct, d_correct=EXCLUDED.d_correct, a_correct=EXCLUDED.a_correct,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error,
    error_category_json=EXCLUDED.error_category_json, predicted_vs_actual_json=EXCLUDED.predicted_vs_actual_json;

  -- ── error_category ───────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'error_category', e.error_category,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY e.error_category
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, avg_confidence_score=EXCLUDED.avg_confidence_score,
    calibration_error=EXCLUDED.calibration_error;

  -- ── predicted_result ─────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'predicted_result', p.predicted_result,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.predicted_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- ── actual_result ────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy, btts_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'actual_result', e.actual_result,
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_1_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_2_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.over_3_5_correct THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.btts_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY e.actual_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- ── predicted_vs_actual ──────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy, avg_confidence_score
  )
  SELECT p_run_id, v_model_version_id, 'predicted_vs_actual',
    (p.predicted_result||'_'||e.actual_result),
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
  GROUP BY p.predicted_result, e.actual_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    avg_confidence_score=EXCLUDED.avg_confidence_score;

  -- ── high_confidence_wrong ────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'high_confidence_wrong', 'high_confidence_wrong',
    COUNT(*)::integer, AVG(e.brier_1x2), AVG(e.log_loss_1x2), 0.0,
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed'
    AND e.error_category='high_confidence_wrong'
  HAVING COUNT(*)>0
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, avg_confidence_score=EXCLUDED.avg_confidence_score,
    calibration_error=EXCLUDED.calibration_error;

  -- ── home_prediction_bias ─────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'home_prediction_bias', 'predicted_H',
    COUNT(*)::integer, AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed' AND p.predicted_result='H'
  HAVING COUNT(*)>=10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- ── draw_prediction_bias ─────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'draw_prediction_bias', 'predicted_D',
    COUNT(*)::integer, AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed' AND p.predicted_result='D'
  HAVING COUNT(*)>=10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- ── away_prediction_bias ─────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'away_prediction_bias', 'predicted_A',
    COUNT(*)::integer, AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id=p.id
  JOIN model_lab.backtest_runs br ON br.id=p.backtest_run_id
  WHERE p.backtest_run_id=p_run_id AND br.run_status='completed' AND p.predicted_result='A'
  HAVING COUNT(*)>=10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  SELECT COUNT(*) INTO v_inserted FROM model_lab.calibration_summary WHERE backtest_run_id=p_run_id;
  RETURN jsonb_build_object('rows_inserted', v_inserted, 'run_id', p_run_id);
END;
$$;

-- ── ml_generate_candidate_adjustments — add completed-run guard ───────────────
CREATE OR REPLACE FUNCTION public.ml_generate_candidate_adjustments(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_model_version_id uuid;
  v_run_status text;
  v_overall_brier numeric;
  v_overall_hcw_rate numeric;
  v_inserted integer := 0;
  MIN_SAMPLE_CANDIDATE constant integer := 30;
  MIN_SAMPLE_REVIEW constant integer := 15;
  HOME_BIAS_THRESHOLD constant numeric := 0.05;
  DRAW_BIAS_THRESHOLD constant numeric := 0.04;
  AWAY_BIAS_THRESHOLD constant numeric := 0.04;
  HCW_THRESHOLD constant numeric := 0.40;
  BRIER_PENALTY_RATIO constant numeric := 1.15;
BEGIN
  SELECT model_version_id, run_status INTO v_model_version_id, v_run_status
  FROM model_lab.backtest_runs WHERE id = p_run_id;

  -- Only generate adjustments for completed runs
  IF v_run_status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('error', 'Run is not completed', 'run_status', v_run_status);
  END IF;

  SELECT avg_brier_1x2, high_confidence_wrong_rate
  INTO v_overall_brier, v_overall_hcw_rate
  FROM model_lab.calibration_summary
  WHERE backtest_run_id=p_run_id AND group_type='overall' AND group_key='all';

  IF v_overall_brier IS NULL THEN
    RETURN jsonb_build_object('error', 'No overall calibration summary. Run ml_compute_calibration_summary first.');
  END IF;

  -- home_bias_correction per competition
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'competition', cs.group_key,
    'home_bias_correction', ROUND(-cs.home_prediction_bias,6), cs.sample_size,
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 0.80 ELSE 0.60 END,
    ROUND(cs.home_prediction_bias,6), ROUND(v_overall_brier,6), ROUND(-cs.home_prediction_bias,6),
    'Home prediction bias of '||ROUND(cs.home_prediction_bias*100,1)||'% in '||cs.group_key||'. Model over-predicts home wins. Proposed correction deflates p_home.',
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END, false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='competition'
    AND cs.home_prediction_bias IS NOT NULL
    AND ABS(cs.home_prediction_bias)>HOME_BIAS_THRESHOLD AND cs.sample_size>=MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  -- draw_bias_correction per competition
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'competition', cs.group_key,
    'draw_bias_correction', ROUND(-cs.draw_prediction_bias,6), cs.sample_size,
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 0.75 ELSE 0.55 END,
    ROUND(cs.draw_prediction_bias,6), ROUND(v_overall_brier,6), ROUND(-cs.draw_prediction_bias,6),
    'Draw prediction bias of '||ROUND(cs.draw_prediction_bias*100,1)||'% in '||cs.group_key||'. Correction adjusts p_draw estimate.',
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END, false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='competition'
    AND cs.draw_prediction_bias IS NOT NULL
    AND ABS(cs.draw_prediction_bias)>DRAW_BIAS_THRESHOLD AND cs.sample_size>=MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  -- away_bias_correction per competition
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'competition', cs.group_key,
    'away_bias_correction', ROUND(-cs.away_prediction_bias,6), cs.sample_size,
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 0.75 ELSE 0.55 END,
    ROUND(cs.away_prediction_bias,6), ROUND(v_overall_brier,6), ROUND(-cs.away_prediction_bias,6),
    'Away prediction bias of '||ROUND(cs.away_prediction_bias*100,1)||'% in '||cs.group_key||'. Model under/over-predicts away wins.',
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END, false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='competition'
    AND cs.away_prediction_bias IS NOT NULL
    AND ABS(cs.away_prediction_bias)>AWAY_BIAS_THRESHOLD AND cs.sample_size>=MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  -- high_confidence_deflation (overall)
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'overall', 'all',
    'high_confidence_deflation', ROUND(-(v_overall_hcw_rate-HCW_THRESHOLD),6),
    cs.sample_size, 0.85,
    ROUND(v_overall_hcw_rate,6), ROUND(v_overall_brier,6), ROUND(-(v_overall_hcw_rate-HCW_THRESHOLD),6),
    'High-confidence wrong rate of '||ROUND(v_overall_hcw_rate*100,1)||'% exceeds threshold of '||ROUND(HCW_THRESHOLD*100,0)||'%. Model is overconfident.',
    'candidate', false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='overall' AND v_overall_hcw_rate>HCW_THRESHOLD
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  -- brier_penalty_flag per competition
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'competition', cs.group_key,
    'brier_penalty_flag', ROUND(cs.avg_brier_1x2-v_overall_brier,6), cs.sample_size,
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 0.70 ELSE 0.50 END,
    ROUND(cs.avg_brier_1x2,6), ROUND(v_overall_brier,6), ROUND(-(cs.avg_brier_1x2-v_overall_brier),6),
    cs.group_key||' Brier of '||ROUND(cs.avg_brier_1x2,4)||' is '||ROUND((cs.avg_brier_1x2/v_overall_brier-1)*100,1)||'% above overall. Flagged for investigation.',
    CASE WHEN cs.sample_size>=MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END, false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='competition'
    AND cs.avg_brier_1x2 IS NOT NULL
    AND cs.avg_brier_1x2>v_overall_brier*BRIER_PENALTY_RATIO AND cs.sample_size>=MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  -- draw_underestimate (overall)
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction, reason, status, is_active
  )
  SELECT v_model_version_id, p_run_id, 'overall', 'all',
    'draw_underestimate', ROUND(-cs.draw_prediction_bias,6), cs.sample_size, 0.80,
    ROUND(cs.draw_prediction_bias,6), ROUND(v_overall_brier,6), ROUND(-cs.draw_prediction_bias,6),
    'Overall draw bias of '||ROUND(cs.draw_prediction_bias*100,2)||'%. '||
    CASE WHEN cs.draw_prediction_bias<-DRAW_BIAS_THRESHOLD
      THEN 'Model under-predicts draws. p_draw should be inflated.'
      ELSE 'Model over-predicts draws. p_draw should be deflated.' END,
    'candidate', false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id=p_run_id AND cs.group_type='overall'
    AND cs.draw_prediction_bias IS NOT NULL AND ABS(cs.draw_prediction_bias)>DRAW_BIAS_THRESHOLD
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value=EXCLUDED.adjustment_value, sample_size=EXCLUDED.sample_size,
    confidence=EXCLUDED.confidence, evidence_metric=EXCLUDED.evidence_metric,
    proposed_correction=EXCLUDED.proposed_correction, reason=EXCLUDED.reason, status=EXCLUDED.status;

  SELECT COUNT(*) INTO v_inserted FROM model_lab.calibration_adjustments WHERE source_backtest_run_id=p_run_id;
  RETURN jsonb_build_object('adjustments_generated', v_inserted, 'run_id', p_run_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_compute_calibration_summary(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_generate_candidate_adjustments(uuid) TO service_role, authenticated;
