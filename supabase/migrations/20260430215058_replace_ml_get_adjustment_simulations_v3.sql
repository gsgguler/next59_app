/*
  # Replace ml_get_adjustment_simulations — expose draw floor / temp simulation columns

  Drops the existing function and recreates with all new columns included:
  draw_precision, draw_recall, draw_f1, away_precision, away_recall, away_f1,
  expected_calibration_error_draw, reliability_bins_draw,
  probability_transform_config, rejection_flags, simulation_verdict.
*/

DROP FUNCTION IF EXISTS public.ml_get_adjustment_simulations(uuid);

CREATE FUNCTION public.ml_get_adjustment_simulations(
  p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                                  uuid,
  source_backtest_run_id              uuid,
  simulation_key                      text,
  simulation_status                   text,
  simulation_verdict                  text,
  applied_adjustments                 jsonb,
  sample_size                         integer,
  raw_avg_brier_1x2                   numeric,
  adjusted_avg_brier_1x2              numeric,
  raw_avg_log_loss_1x2                numeric,
  adjusted_avg_log_loss_1x2           numeric,
  raw_result_accuracy                 numeric,
  adjusted_result_accuracy            numeric,
  raw_pred_home_rate                  numeric,
  raw_pred_draw_rate                  numeric,
  raw_pred_away_rate                  numeric,
  adjusted_pred_home_rate             numeric,
  adjusted_pred_draw_rate             numeric,
  adjusted_pred_away_rate             numeric,
  actual_home_rate                    numeric,
  actual_draw_rate                    numeric,
  actual_away_rate                    numeric,
  per_competition_metrics             jsonb,
  per_confidence_metrics              jsonb,
  raw_decision_distribution_json      jsonb,
  adjusted_decision_distribution_json jsonb,
  decision_rule_config                jsonb,
  scenario_class_distribution_json    jsonb,
  probability_unchanged               boolean,
  draw_capture_rate                   numeric,
  home_overcall_reduction             numeric,
  confusion_matrix_json               jsonb,
  draw_precision                      numeric,
  draw_recall                         numeric,
  draw_f1                             numeric,
  away_precision                      numeric,
  away_recall                         numeric,
  away_f1                             numeric,
  expected_calibration_error_draw     numeric,
  reliability_bins_draw               jsonb,
  probability_transform_config        jsonb,
  rejection_flags                     jsonb,
  notes                               text,
  created_at                          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  PERFORM public._ml_assert_admin();
  RETURN QUERY
  SELECT
    s.id, s.source_backtest_run_id, s.simulation_key, s.simulation_status,
    s.simulation_verdict,
    s.applied_adjustments, s.sample_size,
    s.raw_avg_brier_1x2, s.adjusted_avg_brier_1x2,
    s.raw_avg_log_loss_1x2, s.adjusted_avg_log_loss_1x2,
    s.raw_result_accuracy, s.adjusted_result_accuracy,
    s.raw_pred_home_rate, s.raw_pred_draw_rate, s.raw_pred_away_rate,
    s.adjusted_pred_home_rate, s.adjusted_pred_draw_rate, s.adjusted_pred_away_rate,
    s.actual_home_rate, s.actual_draw_rate, s.actual_away_rate,
    s.per_competition_metrics, s.per_confidence_metrics,
    s.raw_decision_distribution_json, s.adjusted_decision_distribution_json,
    s.decision_rule_config, s.scenario_class_distribution_json,
    s.probability_unchanged, s.draw_capture_rate, s.home_overcall_reduction,
    s.confusion_matrix_json,
    s.draw_precision, s.draw_recall, s.draw_f1,
    s.away_precision, s.away_recall, s.away_f1,
    s.expected_calibration_error_draw, s.reliability_bins_draw,
    s.probability_transform_config, s.rejection_flags,
    s.notes, s.created_at
  FROM model_lab.calibration_adjustment_simulations s
  WHERE (p_run_id IS NULL OR s.source_backtest_run_id = p_run_id)
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_adjustment_simulations(uuid) TO authenticated;
