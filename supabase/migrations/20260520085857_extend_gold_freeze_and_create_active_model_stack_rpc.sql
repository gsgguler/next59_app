/*
  # Extend gold_forecast_core_freeze + create get_active_model_stack RPC

  ## Purpose
  Single source of truth for the active production model stack.
  Admin pages read from this instead of using hardcoded constants.

  ## Changes
  1. Add new columns to model_lab.gold_forecast_core_freeze:
     - scenario_version          text  (e.g. 'scenario_class_v1')
     - narrative_policy_version  text  (e.g. 'narrative_v1')
     - wc2026_calibration_version text (e.g. 'wc2026_v3')
     - calibration_version       text  (short label, e.g. 'replay_v1')

  2. Update the existing active freeze row with current known values.

  3. Create public RPC model_lab.get_active_model_stack() returning a flat
     JSON object with all version fields — replaces per-page hardcoded strings.

  ## Active stack values (from verified DB/code):
  - elo_version:               elo_v2_ha0_k20_global
  - feature_version:           features_v2_domestic_2026_05
  - prediction_formula:        formula_v2_draw_recalibrated
  - calibration_version:       replay_v1
  - scenario_version:          scenario_class_v1
  - narrative_policy_version:  NULL (not yet implemented)
  - wc2026_calibration_version: wc2026_v1 (from calibration_formula_version default)
*/

-- 1. Add columns (safe: IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'gold_forecast_core_freeze'
      AND column_name = 'scenario_version'
  ) THEN
    ALTER TABLE model_lab.gold_forecast_core_freeze ADD COLUMN scenario_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'gold_forecast_core_freeze'
      AND column_name = 'narrative_policy_version'
  ) THEN
    ALTER TABLE model_lab.gold_forecast_core_freeze ADD COLUMN narrative_policy_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'gold_forecast_core_freeze'
      AND column_name = 'wc2026_calibration_version'
  ) THEN
    ALTER TABLE model_lab.gold_forecast_core_freeze ADD COLUMN wc2026_calibration_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'gold_forecast_core_freeze'
      AND column_name = 'calibration_version'
  ) THEN
    ALTER TABLE model_lab.gold_forecast_core_freeze ADD COLUMN calibration_version text;
  END IF;
END $$;

-- 2. Seed new columns on the active freeze row
UPDATE model_lab.gold_forecast_core_freeze
SET
  scenario_version           = 'scenario_class_v1',
  wc2026_calibration_version = 'wc2026_v1',
  calibration_version        = 'replay_v1',
  narrative_policy_version   = NULL  -- not yet auto-generated
WHERE is_active = true;

-- 3. Public RPC returning flat JSON — single row, all version fields
CREATE OR REPLACE FUNCTION model_lab.get_active_model_stack()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'model_lab'
AS $$
  SELECT jsonb_build_object(
    'freeze_label',               freeze_label,
    'elo_version',                elo_version,
    'feature_version',            feature_version,
    'prediction_formula',         prediction_formula,
    'calibration_version',        calibration_version,
    'scenario_version',           scenario_version,
    'narrative_policy_version',   narrative_policy_version,
    'wc2026_calibration_version', wc2026_calibration_version,
    'frozen_at',                  frozen_at,
    'notes',                      notes
  )
  FROM model_lab.gold_forecast_core_freeze
  WHERE is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION model_lab.get_active_model_stack() TO authenticated;
