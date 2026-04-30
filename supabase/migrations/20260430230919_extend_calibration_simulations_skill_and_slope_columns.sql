/*
  # Extend calibration_adjustment_simulations with skill score and calibration slope columns

  1. New Columns on model_lab.calibration_adjustment_simulations
    - `brier_skill_vs_raw` numeric(10,8) — Brier skill score relative to raw baseline
    - `brier_skill_vs_compbias` numeric(10,8) — Brier skill score relative to competition_bias_only simulation
    - `calibration_slope_draw` numeric(10,6) — OLS slope of (actual_draw ~ predicted_draw) per reliability bin

  2. Notes
    - Columns are nullable; existing rows remain unaffected
    - No RLS changes required (table is already admin-only)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'brier_skill_vs_raw'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN brier_skill_vs_raw numeric(10,8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'brier_skill_vs_compbias'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN brier_skill_vs_compbias numeric(10,8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'calibration_slope_draw'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN calibration_slope_draw numeric(10,6);
  END IF;
END $$;
