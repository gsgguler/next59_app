/*
  # Extend calibration_adjustment_simulations for Bias Refinement Simulations

  ## Summary
  Adds 6 new columns to support the sigmoid/dynamic bias refinement simulation family (17-mode suite).

  ## New Columns
  - `sigmoid_k` (numeric 8,4): The sigmoid slope parameter k used in cap*tanh(delta/cap). Controls how aggressively the sigmoid compresses large biases.
  - `relative_cap_pct` (numeric 8,4): Dynamic relative clipping ceiling expressed as fraction of class probability. E.g. 0.20 means cap delta at ±20% of p_class.
  - `pipeline_order` (text): Describes the order of operations — e.g. 'T→CB', 'CB→T' (whether temp scaling or competition bias is applied first).
  - `simulation_family` (text): High-level family label — 'sigmoid_tuning', 'dynamic_relative', 'hybrid', 'cb_then_t', 'league_ablation'.
  - `family_objective` (text): Short human-readable description of what the family is testing.
  - `per_competition_health_json` (jsonb): Per-competition health summary — pred_draw_rate, accuracy_delta_vs_raw, argmax_helped, argmax_harmed for each competition.

  ## Notes
  - All columns are nullable — existing rows are unaffected
  - `rejection_flags` column already exists from prior migration
  - Uses IF NOT EXISTS guard for idempotency
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'sigmoid_k'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN sigmoid_k numeric(8,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'relative_cap_pct'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN relative_cap_pct numeric(8,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'pipeline_order'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN pipeline_order text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'simulation_family'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN simulation_family text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'family_objective'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN family_objective text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'per_competition_health_json'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN per_competition_health_json jsonb;
  END IF;
END $$;
