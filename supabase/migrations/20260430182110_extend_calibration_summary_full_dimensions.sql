/*
  # Extend calibration_summary for full 13-dimension calibration depth

  ## Changes
  - Add missing metric columns to calibration_summary:
    - high_confidence_wrong_rate: fraction of high-confidence predictions that were wrong
    - predicted_h_count, predicted_d_count, predicted_a_count: prediction distribution
    - actual_h_count, actual_d_count, actual_a_count: actual result distribution
    - h_correct, d_correct, a_correct: per-outcome correct counts
    - over_1_5_accuracy, over_3_5_accuracy: additional market accuracy
    - avg_confidence_score: mean confidence score for this group
    - calibration_error: mean |p_predicted - actual_rate| (simplified ECE)
    - error_category_json: full error category breakdown as jsonb
    - predicted_vs_actual_json: 3x3 confusion matrix as jsonb
  - Add status column to calibration_adjustments:
    - status text default 'candidate'
    - evidence_metric numeric: the measured bias/error value
    - before_metric numeric: baseline metric before correction
    - proposed_correction numeric: computed correction value
  - Add unique constraint on calibration_summary (backtest_run_id, group_type, group_key)
    to support upsert

  ## Notes
  - All columns added with IF NOT EXISTS pattern via DO block
  - No existing data modified
*/

DO $$
BEGIN
  -- calibration_summary extra metric columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='high_confidence_wrong_rate') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN high_confidence_wrong_rate numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='predicted_h_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN predicted_h_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='predicted_d_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN predicted_d_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='predicted_a_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN predicted_a_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='actual_h_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN actual_h_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='actual_d_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN actual_d_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='actual_a_count') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN actual_a_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='h_correct') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN h_correct integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='d_correct') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN d_correct integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='a_correct') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN a_correct integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='over_1_5_accuracy') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN over_1_5_accuracy numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='over_3_5_accuracy') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN over_3_5_accuracy numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='avg_confidence_score') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN avg_confidence_score numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='calibration_error') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN calibration_error numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='error_category_json') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN error_category_json jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_summary' AND column_name='predicted_vs_actual_json') THEN
    ALTER TABLE model_lab.calibration_summary ADD COLUMN predicted_vs_actual_json jsonb;
  END IF;

  -- calibration_adjustments: add status + evidence columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_adjustments' AND column_name='status') THEN
    ALTER TABLE model_lab.calibration_adjustments ADD COLUMN status text NOT NULL DEFAULT 'candidate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_adjustments' AND column_name='evidence_metric') THEN
    ALTER TABLE model_lab.calibration_adjustments ADD COLUMN evidence_metric numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_adjustments' AND column_name='before_metric') THEN
    ALTER TABLE model_lab.calibration_adjustments ADD COLUMN before_metric numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='model_lab' AND table_name='calibration_adjustments' AND column_name='proposed_correction') THEN
    ALTER TABLE model_lab.calibration_adjustments ADD COLUMN proposed_correction numeric;
  END IF;
END $$;

-- Unique constraint to support upsert on calibration_summary
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'model_lab.calibration_summary'::regclass
    AND conname = 'calibration_summary_run_group_key'
  ) THEN
    ALTER TABLE model_lab.calibration_summary
      ADD CONSTRAINT calibration_summary_run_group_key
      UNIQUE (backtest_run_id, group_type, group_key);
  END IF;
END $$;

-- Grant new columns to service_role / authenticated (inherits from table-level grants already set)
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON model_lab.calibration_summary TO service_role;
