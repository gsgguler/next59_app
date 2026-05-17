/*
  # Replay Memory Hygiene — Validity and Production Candidate Flags

  ## Purpose
  Adds production-grade validity tracking to replay_prediction_runs.
  Historical runs are never deleted or overwritten. Production systems
  must only consume runs where is_valid = true AND is_production_candidate = true.

  ## New Columns
  - `is_valid` (boolean, default true): false = run invalidated (bad data, formula bug, etc.)
  - `is_production_candidate` (boolean, default false): true = approved for production use
  - `invalidated_at` (timestamptz): when the run was invalidated
  - `invalidation_reason` (text): human-readable reason for invalidation

  ## Backfill Rules
  - All existing V1 runs: is_valid = true, is_production_candidate = false
    (historical baseline, not yet approved for production)
  - All existing draw_v2 runs: is_valid = true, is_production_candidate = false
    (candidate, pending explicit promotion after validation gates)

  ## Important Notes
  1. No existing rows are deleted.
  2. No existing predictions are overwritten.
  3. Promotion to is_production_candidate = true requires explicit admin action.
  4. V1 runs remain queryable as historical baselines forever.
*/

-- Add validity and promotion tracking columns
ALTER TABLE model_lab.replay_prediction_runs
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_production_candidate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidation_reason text;

-- Index for fast production candidate lookups
CREATE INDEX IF NOT EXISTS idx_replay_runs_production_candidates
  ON model_lab.replay_prediction_runs (scope_competition, is_valid, is_production_candidate)
  WHERE is_valid = true AND is_production_candidate = true;

-- Index for formula-based filtering
CREATE INDEX IF NOT EXISTS idx_replay_runs_formula
  ON model_lab.replay_prediction_runs (prediction_formula, scope_competition);

-- Ensure all existing rows have correct defaults
-- V1 runs: valid historical baseline, not production candidates
UPDATE model_lab.replay_prediction_runs
SET
  is_valid = true,
  is_production_candidate = false
WHERE prediction_formula = 'formula_v1_binary_plus_draw_heuristic';

-- V2 runs: valid candidates, pending explicit promotion after validation gates
UPDATE model_lab.replay_prediction_runs
SET
  is_valid = true,
  is_production_candidate = false
WHERE prediction_formula ~ 'formula_v[2-9]';
