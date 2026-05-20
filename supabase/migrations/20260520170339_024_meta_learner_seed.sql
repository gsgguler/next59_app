/*
  # Meta-Learner Bootstrap Seed

  ## Summary
  Ensures a default active meta-learner model (meta_v1) always exists.
  Fixes the "Model bulunamadı" (Model not found) error on the Brain
  Orchestration control panel and Model Comparison page.

  ## Changes

  ### meta_learner_models
  - Inserts bootstrap `meta_v1` row using correct column names:
    model_version, model_type, training_sample_count, validation_brier,
    learned_weights, is_active, notes
  - Uses ON CONFLICT (model_version) DO UPDATE to safely re-apply
    without duplicating the row
  - Sets is_active = true; the enforce_single_active_meta_learner trigger
    will deactivate any other active models automatically

  ## Notes
  - learned_weights uses the default spec from the brain_configs table
  - validation_brier = 0.250 (initial bootstrap placeholder)
  - training_sample_count = 0 (no real training data yet)
*/

INSERT INTO public.meta_learner_models (
  model_version,
  model_type,
  training_sample_count,
  validation_brier,
  learned_weights,
  is_active,
  notes,
  created_at
) VALUES (
  'meta_v1',
  'weighted_average',
  0,
  0.250,
  '{"tactical": 0.20, "statistical": 0.25, "psychological": 0.15, "live": 0.10, "conditions": 0.10, "news": 0.05}',
  true,
  'Bootstrap model — default spec weights, no training data yet',
  now()
)
ON CONFLICT (model_version) DO UPDATE
  SET
    is_active            = true,
    notes                = EXCLUDED.notes,
    learned_weights      = EXCLUDED.learned_weights,
    validation_brier     = EXCLUDED.validation_brier;
