/*
  # Create ml_generate_candidate_adjustments function

  ## Purpose
  After calibration_summary is computed, this function inspects the data and
  generates candidate correction rules in calibration_adjustments.

  Rules are NEVER auto-activated (is_active = false always).
  Status is 'candidate' (enough evidence) or 'manual_review' (borderline).

  ## Adjustment types generated
  1. home_bias_correction — per competition, when home_prediction_bias > threshold
  2. draw_bias_correction — per competition, when |draw_prediction_bias| > threshold
  3. away_bias_correction — per competition, when away_prediction_bias < -threshold
  4. high_confidence_deflation — overall, when high_confidence_wrong_rate is high
  5. competition_brier_penalty — competitions with avg_brier significantly above overall
  6. draw_underestimate — when model rarely predicts D but draws happen frequently

  ## Thresholds
  - MIN_SAMPLE = 30 for candidate status; 15-29 = manual_review; <15 = skipped
  - home_bias threshold: |home_prediction_bias| > 0.05
  - draw_bias threshold: |draw_prediction_bias| > 0.04
  - away_bias threshold: |away_prediction_bias| > 0.04
  - high_confidence_wrong_rate threshold: > 0.40
  - brier_penalty threshold: avg_brier > overall_brier * 1.15

  ## Notes
  - SECURITY DEFINER, callable from service_role
  - proposed_correction = -1 * bias value (sign inverted to correct direction)
  - Upserts: unique on (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type)
*/

-- Add unique constraint to calibration_adjustments for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'model_lab.calibration_adjustments'::regclass
    AND conname = 'calibration_adj_unique_key'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustments
      ADD CONSTRAINT calibration_adj_unique_key
      UNIQUE (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ml_generate_candidate_adjustments(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_model_version_id uuid;
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
  SELECT model_version_id INTO v_model_version_id
  FROM model_lab.backtest_runs WHERE id = p_run_id;

  -- Get overall baseline metrics
  SELECT avg_brier_1x2, high_confidence_wrong_rate
  INTO v_overall_brier, v_overall_hcw_rate
  FROM model_lab.calibration_summary
  WHERE backtest_run_id = p_run_id AND group_type = 'overall' AND group_key = 'all';

  IF v_overall_brier IS NULL THEN
    RETURN jsonb_build_object('error', 'No overall calibration summary found. Run ml_compute_calibration_summary first.');
  END IF;

  -- ── 1. Home bias correction per competition ──────────────────────────────
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'competition', cs.group_key,
    'home_bias_correction',
    ROUND(-cs.home_prediction_bias, 6),
    cs.sample_size,
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 0.80 ELSE 0.60 END,
    ROUND(cs.home_prediction_bias, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-cs.home_prediction_bias, 6),
    'Home prediction bias of ' || ROUND(cs.home_prediction_bias * 100, 1) || '% detected in ' || cs.group_key || '. Model over-predicts home wins. Proposed correction deflates p_home by this amount.',
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END,
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'competition'
    AND cs.home_prediction_bias IS NOT NULL
    AND ABS(cs.home_prediction_bias) > HOME_BIAS_THRESHOLD
    AND cs.sample_size >= MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value,
    sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence,
    evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction,
    reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  -- ── 2. Draw bias correction per competition ───────────────────────────────
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'competition', cs.group_key,
    'draw_bias_correction',
    ROUND(-cs.draw_prediction_bias, 6),
    cs.sample_size,
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 0.75 ELSE 0.55 END,
    ROUND(cs.draw_prediction_bias, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-cs.draw_prediction_bias, 6),
    'Draw prediction bias of ' || ROUND(cs.draw_prediction_bias * 100, 1) || '% in ' || cs.group_key || '. Correction adjusts p_draw estimate.',
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END,
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'competition'
    AND cs.draw_prediction_bias IS NOT NULL
    AND ABS(cs.draw_prediction_bias) > DRAW_BIAS_THRESHOLD
    AND cs.sample_size >= MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value, sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence, evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction, reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  -- ── 3. Away bias correction per competition ───────────────────────────────
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'competition', cs.group_key,
    'away_bias_correction',
    ROUND(-cs.away_prediction_bias, 6),
    cs.sample_size,
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 0.75 ELSE 0.55 END,
    ROUND(cs.away_prediction_bias, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-cs.away_prediction_bias, 6),
    'Away prediction bias of ' || ROUND(cs.away_prediction_bias * 100, 1) || '% in ' || cs.group_key || '. Model under/over-predicts away wins.',
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END,
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'competition'
    AND cs.away_prediction_bias IS NOT NULL
    AND ABS(cs.away_prediction_bias) > AWAY_BIAS_THRESHOLD
    AND cs.sample_size >= MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value, sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence, evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction, reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  -- ── 4. High confidence deflation (overall) ────────────────────────────────
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'overall', 'all',
    'high_confidence_deflation',
    ROUND(-(v_overall_hcw_rate - HCW_THRESHOLD), 6),
    cs.sample_size,
    0.85,
    ROUND(v_overall_hcw_rate, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-(v_overall_hcw_rate - HCW_THRESHOLD), 6),
    'High-confidence wrong rate of ' || ROUND(v_overall_hcw_rate * 100, 1) || '% exceeds threshold of ' || ROUND(HCW_THRESHOLD * 100, 0) || '%. Model is overconfident. Proposed correction deflates max probability by excess amount.',
    'candidate',
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'overall'
    AND v_overall_hcw_rate > HCW_THRESHOLD
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value, sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence, evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction, reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  -- ── 5. Competition Brier penalty (competitions performing worse than baseline) ──
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'competition', cs.group_key,
    'brier_penalty_flag',
    ROUND(cs.avg_brier_1x2 - v_overall_brier, 6),
    cs.sample_size,
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 0.70 ELSE 0.50 END,
    ROUND(cs.avg_brier_1x2, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-(cs.avg_brier_1x2 - v_overall_brier), 6),
    cs.group_key || ' Brier of ' || ROUND(cs.avg_brier_1x2, 4) || ' is ' || ROUND((cs.avg_brier_1x2 / v_overall_brier - 1) * 100, 1) || '% above overall. Flagged for additional feature investigation.',
    CASE WHEN cs.sample_size >= MIN_SAMPLE_CANDIDATE THEN 'candidate' ELSE 'manual_review' END,
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'competition'
    AND cs.avg_brier_1x2 IS NOT NULL
    AND cs.avg_brier_1x2 > v_overall_brier * BRIER_PENALTY_RATIO
    AND cs.sample_size >= MIN_SAMPLE_REVIEW
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value, sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence, evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction, reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  -- ── 6. Draw underestimate (overall draw bias negative = model under-predicts draws) ──
  INSERT INTO model_lab.calibration_adjustments (
    model_version_id, source_backtest_run_id, group_type, group_key,
    adjustment_type, adjustment_value, sample_size, confidence,
    evidence_metric, before_metric, proposed_correction,
    reason, status, is_active
  )
  SELECT
    v_model_version_id, p_run_id,
    'overall', 'all',
    'draw_underestimate',
    ROUND(-cs.draw_prediction_bias, 6),
    cs.sample_size,
    0.80,
    ROUND(cs.draw_prediction_bias, 6),
    ROUND(v_overall_brier, 6),
    ROUND(-cs.draw_prediction_bias, 6),
    'Overall draw bias of ' || ROUND(cs.draw_prediction_bias * 100, 2) || '%. ' ||
    CASE WHEN cs.draw_prediction_bias < -DRAW_BIAS_THRESHOLD
      THEN 'Model systematically under-predicts draws. p_draw should be inflated.'
      ELSE 'Model over-predicts draws. p_draw should be deflated.'
    END,
    'candidate',
    false
  FROM model_lab.calibration_summary cs
  WHERE cs.backtest_run_id = p_run_id
    AND cs.group_type = 'overall'
    AND cs.draw_prediction_bias IS NOT NULL
    AND ABS(cs.draw_prediction_bias) > DRAW_BIAS_THRESHOLD
  ON CONFLICT (model_version_id, source_backtest_run_id, group_type, group_key, adjustment_type) DO UPDATE SET
    adjustment_value = EXCLUDED.adjustment_value, sample_size = EXCLUDED.sample_size,
    confidence = EXCLUDED.confidence, evidence_metric = EXCLUDED.evidence_metric,
    proposed_correction = EXCLUDED.proposed_correction, reason = EXCLUDED.reason,
    status = EXCLUDED.status;

  SELECT COUNT(*) INTO v_inserted
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_run_id;

  RETURN jsonb_build_object('adjustments_generated', v_inserted, 'run_id', p_run_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_generate_candidate_adjustments(uuid) TO service_role, authenticated;
