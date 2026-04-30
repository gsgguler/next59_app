/*
  # Create ml_compute_calibration_summary function

  ## Purpose
  Computes calibration summary for a completed backtest run across all 13 group dimensions:
    1. overall
    2. competition
    3. season (season_label)
    4. era_bucket
    5. confidence_grade
    6. error_category
    7. predicted_result
    8. actual_result
    9. predicted_vs_actual (pred+actual combined key)
   10. high_confidence_wrong (boolean group)
   11. home_prediction_bias group (matches where H was predicted)
   12. draw_prediction_bias group (matches where D was predicted)
   13. away_prediction_bias group (matches where A was predicted)

  ## Metrics per group
  - sample_size
  - avg_brier_1x2, avg_log_loss_1x2
  - result_accuracy
  - over_1_5_accuracy, over_2_5_accuracy, over_3_5_accuracy
  - btts_accuracy
  - home_prediction_bias: avg(p_home) - actual_home_rate
  - draw_prediction_bias: avg(p_draw) - actual_draw_rate
  - away_prediction_bias: avg(p_away) - actual_away_rate
  - high_confidence_wrong_rate
  - predicted_h/d/a_count, actual_h/d/a_count
  - h_correct, d_correct, a_correct
  - avg_confidence_score
  - calibration_error: mean |max(p_home,p_draw,p_away) - is_result_correct|
  - error_category_json: {category: count}
  - predicted_vs_actual_json: {HH: n, HD: n, HA: n, DH: n, ...}

  ## Notes
  - SECURITY DEFINER — callable from service_role edge function
  - Upserts rows (backtest_run_id + group_type + group_key unique)
  - MIN_SAMPLE = 10 enforced for bias groups
*/

CREATE OR REPLACE FUNCTION public.ml_compute_calibration_summary(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_model_version_id uuid;
  v_inserted integer := 0;
BEGIN
  -- Get model_version_id for this run
  SELECT model_version_id INTO v_model_version_id
  FROM model_lab.backtest_runs WHERE id = p_run_id;

  -- ── Shared base CTE used by all group computations ────────────────────────
  -- We build each group dimension as a separate INSERT ... SELECT

  -- Helper: upsert one group's summary row
  -- We loop over group dimensions using a single large query per group type

  -- ── 1. overall ─────────────────────────────────────────────────────────────
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
    error_category_json, predicted_vs_actual_json, notes
  )
  SELECT
    p_run_id, v_model_version_id, 'overall', 'all',
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
    AVG(ABS(GREATEST(p.p_home, p.p_draw, p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END)),
    jsonb_object_agg(ec.error_category, ec.cnt),
    jsonb_object_agg(pva.combo, pva.cnt),
    NULL
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  CROSS JOIN LATERAL (
    SELECT e2.error_category, COUNT(*)::integer AS cnt
    FROM model_lab.match_model_evaluations e2
    JOIN model_lab.match_model_predictions p2 ON p2.id = e2.prediction_id
    WHERE p2.backtest_run_id = p_run_id
    GROUP BY e2.error_category
  ) ec
  CROSS JOIN LATERAL (
    SELECT (p3.predicted_result || '_' || e3.actual_result) AS combo, COUNT(*)::integer AS cnt
    FROM model_lab.match_model_predictions p3
    JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id = p3.id
    WHERE p3.backtest_run_id = p_run_id
    GROUP BY p3.predicted_result, e3.actual_result
  ) pva
  WHERE p.backtest_run_id = p_run_id
  GROUP BY ec.error_category, ec.cnt, pva.combo, pva.cnt
  -- The above cross join would explode rows; use subquery approach instead
  LIMIT 0; -- placeholder — replaced by proper approach below

  -- Use correct approach: compute aggregates then build JSON separately
  WITH base AS (
    SELECT
      p.id AS pred_id,
      p.p_home, p.p_draw, p.p_away,
      p.predicted_result, p.confidence_score, p.confidence_grade,
      e.actual_result, e.brier_1x2, e.log_loss_1x2,
      e.is_result_correct, e.over_1_5_correct, e.over_2_5_correct,
      e.over_3_5_correct, e.btts_correct, e.error_category
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_run_id
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
      AVG(brier_1x2) AS avg_brier,
      AVG(log_loss_1x2) AS avg_ll,
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
    sample_size = EXCLUDED.sample_size,
    avg_brier_1x2 = EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2 = EXCLUDED.avg_log_loss_1x2,
    result_accuracy = EXCLUDED.result_accuracy,
    over_1_5_accuracy = EXCLUDED.over_1_5_accuracy,
    over_2_5_accuracy = EXCLUDED.over_2_5_accuracy,
    over_3_5_accuracy = EXCLUDED.over_3_5_accuracy,
    btts_accuracy = EXCLUDED.btts_accuracy,
    home_prediction_bias = EXCLUDED.home_prediction_bias,
    draw_prediction_bias = EXCLUDED.draw_prediction_bias,
    away_prediction_bias = EXCLUDED.away_prediction_bias,
    high_confidence_wrong_rate = EXCLUDED.high_confidence_wrong_rate,
    predicted_h_count = EXCLUDED.predicted_h_count,
    predicted_d_count = EXCLUDED.predicted_d_count,
    predicted_a_count = EXCLUDED.predicted_a_count,
    actual_h_count = EXCLUDED.actual_h_count,
    actual_d_count = EXCLUDED.actual_d_count,
    actual_a_count = EXCLUDED.actual_a_count,
    h_correct = EXCLUDED.h_correct,
    d_correct = EXCLUDED.d_correct,
    a_correct = EXCLUDED.a_correct,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    calibration_error = EXCLUDED.calibration_error,
    error_category_json = EXCLUDED.error_category_json,
    predicted_vs_actual_json = EXCLUDED.predicted_vs_actual_json;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ── 2–13. Dimension groups via a single parameterised block ─────────────────
  -- We use a macro-style DO to insert for each group_type using dynamic SQL

  -- competition
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
    (SELECT jsonb_object_agg(ec, cnt) FROM (SELECT e2.error_category AS ec, COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id WHERE p2.backtest_run_id=p_run_id AND p2.competition_name=p.competition_name GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo, cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo, COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id WHERE p3.backtest_run_id=p_run_id AND p3.competition_name=p.competition_name GROUP BY p3.predicted_result, e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
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

  -- season
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
    (SELECT jsonb_object_agg(ec, cnt) FROM (SELECT e2.error_category AS ec, COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id WHERE p2.backtest_run_id=p_run_id AND p2.season_label=p.season_label GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo, cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo, COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id WHERE p3.backtest_run_id=p_run_id AND p3.season_label=p.season_label GROUP BY p3.predicted_result, e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
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

  -- era_bucket
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
    (SELECT jsonb_object_agg(ec, cnt) FROM (SELECT e2.error_category AS ec, COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id WHERE p2.backtest_run_id=p_run_id AND p2.era_bucket=p.era_bucket GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo, cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo, COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id WHERE p3.backtest_run_id=p_run_id AND p3.era_bucket=p.era_bucket GROUP BY p3.predicted_result, e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
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

  -- confidence_grade
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
    (SELECT jsonb_object_agg(ec, cnt) FROM (SELECT e2.error_category AS ec, COUNT(*)::integer AS cnt FROM model_lab.match_model_evaluations e2 JOIN model_lab.match_model_predictions p2 ON p2.id=e2.prediction_id WHERE p2.backtest_run_id=p_run_id AND p2.confidence_grade=p.confidence_grade GROUP BY e2.error_category) x),
    (SELECT jsonb_object_agg(combo, cnt) FROM (SELECT (p3.predicted_result||'_'||e3.actual_result) AS combo, COUNT(*)::integer AS cnt FROM model_lab.match_model_predictions p3 JOIN model_lab.match_model_evaluations e3 ON e3.prediction_id=p3.id WHERE p3.backtest_run_id=p_run_id AND p3.confidence_grade=p.confidence_grade GROUP BY p3.predicted_result, e3.actual_result) x)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
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

  -- error_category
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
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
  GROUP BY e.error_category
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, avg_confidence_score=EXCLUDED.avg_confidence_score,
    calibration_error=EXCLUDED.calibration_error;

  -- predicted_result
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
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
  GROUP BY p.predicted_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- actual_result
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
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
  GROUP BY e.actual_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- predicted_vs_actual (9 combinations: HH, HD, HA, DH, DD, DA, AH, AD, AA)
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy, avg_confidence_score
  )
  SELECT p_run_id, v_model_version_id, 'predicted_vs_actual',
    (p.predicted_result || '_' || e.actual_result),
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score)
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
  GROUP BY p.predicted_result, e.actual_result
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    avg_confidence_score=EXCLUDED.avg_confidence_score;

  -- high_confidence_wrong (single row: only wrong high-conf predictions)
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'high_confidence_wrong', 'high_confidence_wrong',
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    0.0, -- by definition all wrong
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id
    AND e.error_category = 'high_confidence_wrong'
  HAVING COUNT(*) > 0
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, avg_confidence_score=EXCLUDED.avg_confidence_score,
    calibration_error=EXCLUDED.calibration_error;

  -- home_prediction_bias (all H-predicted matches)
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'home_prediction_bias', 'predicted_H',
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id AND p.predicted_result = 'H'
  HAVING COUNT(*) >= 10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- draw_prediction_bias
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'draw_prediction_bias', 'predicted_D',
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id AND p.predicted_result = 'D'
  HAVING COUNT(*) >= 10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  -- away_prediction_bias
  INSERT INTO model_lab.calibration_summary (
    backtest_run_id, model_version_id, group_type, group_key, sample_size,
    avg_brier_1x2, avg_log_loss_1x2, result_accuracy,
    home_prediction_bias, draw_prediction_bias, away_prediction_bias,
    high_confidence_wrong_rate, avg_confidence_score, calibration_error
  )
  SELECT p_run_id, v_model_version_id, 'away_prediction_bias', 'predicted_A',
    COUNT(*)::integer,
    AVG(e.brier_1x2), AVG(e.log_loss_1x2),
    AVG(CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END),
    AVG(p.p_home) - AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_draw) - AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END),
    AVG(p.p_away) - AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN e.error_category='high_confidence_wrong' THEN 1.0 ELSE 0.0 END),
    AVG(p.confidence_score),
    AVG(ABS(GREATEST(p.p_home,p.p_draw,p.p_away) - CASE WHEN e.is_result_correct THEN 1.0 ELSE 0.0 END))
  FROM model_lab.match_model_predictions p
  JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
  WHERE p.backtest_run_id = p_run_id AND p.predicted_result = 'A'
  HAVING COUNT(*) >= 10
  ON CONFLICT (backtest_run_id, group_type, group_key) DO UPDATE SET
    sample_size=EXCLUDED.sample_size, avg_brier_1x2=EXCLUDED.avg_brier_1x2,
    avg_log_loss_1x2=EXCLUDED.avg_log_loss_1x2, result_accuracy=EXCLUDED.result_accuracy,
    home_prediction_bias=EXCLUDED.home_prediction_bias, draw_prediction_bias=EXCLUDED.draw_prediction_bias,
    away_prediction_bias=EXCLUDED.away_prediction_bias, high_confidence_wrong_rate=EXCLUDED.high_confidence_wrong_rate,
    avg_confidence_score=EXCLUDED.avg_confidence_score, calibration_error=EXCLUDED.calibration_error;

  SELECT COUNT(*) INTO v_inserted
  FROM model_lab.calibration_summary
  WHERE backtest_run_id = p_run_id;

  RETURN jsonb_build_object('rows_inserted', v_inserted, 'run_id', p_run_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_compute_calibration_summary(uuid) TO service_role, authenticated;
