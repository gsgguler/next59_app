/*
  # Extend model_lab.calibration_adjustment_simulations with decision-layer columns

  ## Changes
  Adds four new jsonb columns to store decision-calibration simulation data:
  - raw_decision_distribution_json: predicted H/D/A counts before decision rule
  - adjusted_decision_distribution_json: predicted H/D/A counts after decision rule
  - decision_rule_config: stores the rule parameters (type, threshold, etc.)
  - scenario_class_distribution_json: count per scenario class for scenario_class_v1 mode

  Also adds:
  - probability_unchanged boolean: true when only the decision rule changed (probs same)
  - draw_capture_rate numeric: actual draws predicted as D / total actual draws
  - home_overcall_reduction numeric: raw pred_H_rate - adjusted pred_H_rate
  - confusion_matrix_json jsonb: raw 3x3 confusion matrix keyed by predicted→actual

  All existing rows are unaffected (nullable / default).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name   = 'calibration_adjustment_simulations'
      AND column_name  = 'raw_decision_distribution_json'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN raw_decision_distribution_json  jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN adjusted_decision_distribution_json jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN decision_rule_config            jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN scenario_class_distribution_json jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN probability_unchanged           boolean NOT NULL DEFAULT false,
      ADD COLUMN draw_capture_rate               numeric(8,6),
      ADD COLUMN home_overcall_reduction         numeric(8,6),
      ADD COLUMN confusion_matrix_json           jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;
