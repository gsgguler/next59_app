
/*
  # ELO Optimization Lab — Tables

  ## Summary
  Creates storage for the ELO V2 parameter grid search.
  All V1 data is immutable and untouched.
  V2 runs use separate version keys and separate snapshot rows (UNIQUE on match_id + elo_version).

  ## New Tables

  ### model_lab.elo_optimization_runs
  Registry of every ELO parameter configuration tested.
  Stores home_advantage, k_factor, decay_mode, era_mode, and result summary.

  ### model_lab.elo_optimization_results
  Per-run scalar metrics (overall and per-competition slices).

  ## Notes
  1. version_key mirrors elo_version used in team_elo_snapshots — no duplication
  2. Idempotent: version_key UNIQUE prevents duplicate registrations
  3. RLS: authenticated SELECT only; writes via SECURITY DEFINER functions
*/

CREATE TABLE IF NOT EXISTS model_lab.elo_optimization_runs (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key      text         NOT NULL,
  home_advantage   numeric(6,1) NOT NULL,
  k_factor         numeric(6,1) NOT NULL,
  decay_mode       text         NOT NULL DEFAULT 'none',
  era_mode         text         NOT NULL DEFAULT 'global',
  covid_ha_override numeric(6,1),
  match_count      integer,
  notes            text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT elo_opt_runs_version_key_uq UNIQUE (version_key)
);

ALTER TABLE model_lab.elo_optimization_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read elo optimization runs"
  ON model_lab.elo_optimization_runs
  FOR SELECT TO authenticated USING (true);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_lab.elo_optimization_results (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid         NOT NULL REFERENCES model_lab.elo_optimization_runs(id) ON DELETE CASCADE,
  competition_name text         NOT NULL DEFAULT '__overall__',
  metric_name      text         NOT NULL,
  metric_value     numeric(18,8),
  sample_size      integer,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT elo_opt_results_uq UNIQUE (run_id, competition_name, metric_name)
);

ALTER TABLE model_lab.elo_optimization_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read elo optimization results"
  ON model_lab.elo_optimization_results
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_elo_opt_results_run
  ON model_lab.elo_optimization_results(run_id);
CREATE INDEX IF NOT EXISTS idx_elo_opt_results_comp
  ON model_lab.elo_optimization_results(competition_name);
