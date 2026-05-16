
/*
  # Walk-Forward Validation V1 — Storage Tables

  ## Summary
  Creates three tables in model_lab to store walk-forward validation runs,
  fold definitions, and per-fold metrics for the ELO V1 baseline model.
  Walk-forward uses expanding training windows with annual test folds to
  measure true out-of-sample predictive quality.

  ## New Tables

  ### model_lab.walk_forward_runs
  One row per walk-forward experiment. Tracks model/feature/elo versions,
  fold strategy, and free-text notes.

  ### model_lab.walk_forward_folds
  One row per temporal fold. Each fold has a train window (start→end year)
  and a single test year. Stores match counts for train and test splits.

  ### model_lab.walk_forward_metrics
  One row per metric × competition × tier × fold. Supports overall,
  per-league, and per-quality-tier stratification within each fold.

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can SELECT
  - Writes go through SECURITY DEFINER function only

  ## Notes
  1. walk_forward_runs.run_key is a unique natural key
  2. walk_forward_folds.fold_key is unique within run (format: 'fold_YYYY')
  3. walk_forward_metrics unique on (fold_id, competition_name, feature_quality_tier, metric_name)
  4. Season start year derived from season_label as LEFT(season_label, 4)::integer
*/

-- ============================================================
-- TABLE 1: walk_forward_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.walk_forward_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key           text        NOT NULL,
  model_version     text        NOT NULL DEFAULT 'elo_v1',
  feature_version   text        NOT NULL,
  elo_version       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  notes             text,
  CONSTRAINT walk_forward_runs_run_key_uq UNIQUE (run_key)
);

ALTER TABLE model_lab.walk_forward_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read walk forward runs"
  ON model_lab.walk_forward_runs
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- TABLE 2: walk_forward_folds
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.walk_forward_folds (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid        NOT NULL REFERENCES model_lab.walk_forward_runs(id) ON DELETE CASCADE,
  fold_key            text        NOT NULL,
  train_start_year    integer     NOT NULL,
  train_end_year      integer     NOT NULL,
  test_year           integer     NOT NULL,
  train_match_count   integer,
  test_match_count    integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT walk_forward_folds_uq UNIQUE (run_id, fold_key)
);

ALTER TABLE model_lab.walk_forward_folds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read walk forward folds"
  ON model_lab.walk_forward_folds
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_wf_folds_run_id
  ON model_lab.walk_forward_folds(run_id);

-- ============================================================
-- TABLE 3: walk_forward_metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.walk_forward_metrics (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fold_id              uuid        NOT NULL REFERENCES model_lab.walk_forward_folds(id) ON DELETE CASCADE,
  competition_name     text        NOT NULL DEFAULT '__overall__',
  feature_quality_tier text        NOT NULL DEFAULT '__all__',
  metric_name          text        NOT NULL,
  metric_value         numeric(18,8),
  sample_size          integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT walk_forward_metrics_uq
    UNIQUE (fold_id, competition_name, feature_quality_tier, metric_name)
);

ALTER TABLE model_lab.walk_forward_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read walk forward metrics"
  ON model_lab.walk_forward_metrics
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_wf_metrics_fold_id
  ON model_lab.walk_forward_metrics(fold_id);

CREATE INDEX IF NOT EXISTS idx_wf_metrics_competition
  ON model_lab.walk_forward_metrics(competition_name);

-- ============================================================
-- TABLE 4: home_advantage_sensitivity
-- Lightweight simulation results for HA audit
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.home_advantage_sensitivity (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key              text        NOT NULL,
  home_advantage       numeric(6,1) NOT NULL,
  competition_name     text        NOT NULL DEFAULT '__overall__',
  sample_size          integer,
  avg_predicted_home   numeric(10,6),
  actual_home_rate     numeric(10,6),
  binary_brier_home    numeric(10,8),
  calibration_gap_home numeric(10,6),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ha_sensitivity_uq UNIQUE (run_key, home_advantage, competition_name)
);

ALTER TABLE model_lab.home_advantage_sensitivity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ha sensitivity"
  ON model_lab.home_advantage_sensitivity
  FOR SELECT TO authenticated
  USING (true);
