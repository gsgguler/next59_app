/*
  # Extend calibration_adjustment_simulations with pathology diagnosis columns

  ## Summary
  Adds 9 new columns to model_lab.calibration_adjustment_simulations to support
  the competition pathology diagnosis and robust bias simulation workflow.

  ## New Columns
  - `pathology_focus` (text): Free-text label for which pathology this simulation targets
    (e.g., 'ligue1_draw_overcall', 'bundesliga_accuracy_drop')
  - `bias_transform_config` (jsonb): Full config describing bias transform applied
    (type, cap, scale_factor, sigmoid_k, etc.)
  - `per_competition_ece` (jsonb): Per-competition ECE draw values as
    {competition_name: ece_draw_value}
  - `brier_decomposition` (jsonb): Global Brier decomposition
    {reliability, resolution, uncertainty, skill_score}
  - `per_competition_brier_decomposition` (jsonb): Per-competition Brier decomposition
  - `pathology_notes` (jsonb): Structured notes about detected pathologies
    {ligue1_pred_draw_pct, bundesliga_acc_delta, flags: [...]}
  - `argmax_stability_json` (jsonb): Global + per-competition argmax stability metrics
    {global: {changed_rate, changed_to_draw_rate, helped, harmed}, competitions: {...}}
  - `entropy_bucket_metrics` (jsonb): Distribution bucketed by prediction entropy
    {low_entropy: {...}, mid_entropy: {...}, high_entropy: {...}}
  - `margin_bucket_metrics` (jsonb): Distribution bucketed by top-second margin
    {decisive: {...}, contested: {...}, close: {...}}

  ## Notes
  - All new columns are nullable (existing rows will have NULL for new columns)
  - No existing columns removed or renamed
  - No data migration required
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'calibration_adjustment_simulations'
      AND column_name = 'pathology_focus'
  ) THEN
    ALTER TABLE model_lab.calibration_adjustment_simulations
      ADD COLUMN pathology_focus text,
      ADD COLUMN bias_transform_config jsonb,
      ADD COLUMN per_competition_ece jsonb,
      ADD COLUMN brier_decomposition jsonb,
      ADD COLUMN per_competition_brier_decomposition jsonb,
      ADD COLUMN pathology_notes jsonb,
      ADD COLUMN argmax_stability_json jsonb,
      ADD COLUMN entropy_bucket_metrics jsonb,
      ADD COLUMN margin_bucket_metrics jsonb;
  END IF;
END $$;
