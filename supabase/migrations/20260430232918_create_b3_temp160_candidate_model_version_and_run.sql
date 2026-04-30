/*
  # Create candidate model version and backtest run for T=1.6 validation rerun

  ## Summary
  This migration provisions the versioned infrastructure for the T=1.6 +
  competition_bias candidate. It does NOT touch original predictions or evaluations.

  ## New Records

  ### model_versions
  - `b3_temp160_compbias_candidate_v0_1`
    Family: deterministic_stats_calibrated_candidate
    is_active: FALSE — this is a candidate version, not a production model
    Same training/validation dates as source

  ### backtest_runs
  - `b3_temp160_compbias_candidate_v0_1_validation_2018_2019`
    run_status: pending (will be set to completed by the rerun RPC)
    Links to the new candidate model_version_id
    Same scope as source run

  ## Security
  - RLS remains on both tables (admin-only via existing policies)
  - No public exposure
  - is_active=false on candidate version

  ## Safety
  - Uses INSERT ... ON CONFLICT DO NOTHING so re-running is idempotent
  - No existing data is modified
*/

-- Step 1: Candidate model version
INSERT INTO model_lab.model_versions (
  version_key,
  model_name,
  model_family,
  description,
  training_start_date,
  training_end_date,
  validation_start_date,
  validation_end_date,
  feature_config,
  algorithm_config,
  is_active
) VALUES (
  'b3_temp160_compbias_candidate_v0_1',
  'B3 Temp 1.6 + Competition Bias Candidate',
  'deterministic_stats_calibrated_candidate',
  'Validation-only calibrated candidate using B3 Historical Backbone probabilities, temperature scaling T=1.6, and competition-level bias correction. Not public visible. Not production-approved.',
  '2000-07-28',
  '2018-06-30',
  '2018-07-01',
  '2019-06-30',
  jsonb_build_object(
    'temperature', 1.6,
    'pipeline_order', 'temp_then_compbias',
    'formula', 'stable_power: p_i^(1/T) / sum(p_j^(1/T))',
    'clamp_min', 0.001,
    'clamp_max', 0.95,
    'source_version_key', 'b3_historical_backbone_v0_1'
  ),
  jsonb_build_object(
    'calibration_adjustments', 'competition_bias_only',
    'adjustments_active', false,
    'candidate_only', true
  ),
  false  -- MUST remain false; candidate version only
) ON CONFLICT (version_key) DO NOTHING;

-- Step 2: Candidate backtest run (status=pending; RPC will update to completed)
INSERT INTO model_lab.backtest_runs (
  model_version_id,
  run_key,
  run_status,
  run_scope,
  train_start_date,
  train_end_date,
  validation_start_date,
  validation_end_date,
  competition_scope,
  era_scope,
  total_matches,
  processed_matches,
  failed_matches
) VALUES (
  (SELECT id FROM model_lab.model_versions WHERE version_key = 'b3_temp160_compbias_candidate_v0_1'),
  'b3_temp160_compbias_candidate_v0_1_validation_2018_2019',
  'pending',
  'candidate_adjusted_validation_2018_2019_7_leagues',
  '2000-07-28',
  '2018-06-30',
  '2018-07-01',
  '2019-06-30',
  '["Premier League","La Liga","Serie A","Bundesliga","Ligue 1","Eredivisie","Sueper Lig"]'::jsonb,
  '[]'::jsonb,
  893,
  0,
  0
) ON CONFLICT (run_key) DO NOTHING;
