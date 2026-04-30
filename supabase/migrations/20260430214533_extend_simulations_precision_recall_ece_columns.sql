/*
  # Extend calibration_adjustment_simulations with precision/recall/F1/ECE columns

  ## Changes
  Adds columns for draw/away class metrics, reliability bins, and transform config.
  All new columns are nullable or have defaults — no existing rows are affected.

  ## New Columns
  - draw_precision / draw_recall / draw_f1: per-class draw metrics
  - away_precision / away_recall / away_f1: per-class away metrics
  - expected_calibration_error_draw: ECE computed on draw probability bins
  - reliability_bins_draw: jsonb array of bin objects (p range, avg pred, actual rate, gap)
  - probability_transform_config: jsonb storing temp scaling / draw floor params used
  - rejection_flags: jsonb array of strings explaining REJECTED/RISKY status
  - simulation_verdict: text — 'promising', 'risky', 'rejected', 'neutral'

  Note: home_overcall_reduction and draw_capture_rate already exist from prior migration.
  confusion_matrix_json and decision_rule_config also already exist.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='model_lab' AND table_name='calibration_adjustment_simulations'
      AND column_name='draw_precision'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN draw_precision                  numeric(8,6),
      ADD COLUMN draw_recall                     numeric(8,6),
      ADD COLUMN draw_f1                         numeric(8,6),
      ADD COLUMN away_precision                  numeric(8,6),
      ADD COLUMN away_recall                     numeric(8,6),
      ADD COLUMN away_f1                         numeric(8,6),
      ADD COLUMN expected_calibration_error_draw numeric(8,6),
      ADD COLUMN reliability_bins_draw           jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN probability_transform_config    jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN rejection_flags                 jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN simulation_verdict              text  NOT NULL DEFAULT 'neutral';
  END IF;
END $$;
