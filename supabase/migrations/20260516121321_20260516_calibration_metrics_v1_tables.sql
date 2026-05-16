
/*
  # Calibration Metrics V1 — Storage Tables

  ## Summary
  Creates three tables in model_lab to store calibration metric runs and results
  for the ELO V1 baseline model, supporting Phase 4 of the Calibration Backbone.

  ## New Tables

  ### model_lab.calibration_metric_runs
  One row per metric computation run. Tracks which model/feature/elo versions
  were evaluated, how many matches were included, and free-text notes.

  ### model_lab.calibration_metric_results
  One row per metric × competition × season × quality-tier slice.
  Stores named scalar metrics (brier, log_loss, hit_rate, calibration_gap, etc.)
  with their sample sizes. Supports both overall and stratified evaluation.

  ### model_lab.calibration_probability_buckets
  One row per probability bucket × competition × quality-tier slice.
  Decile buckets (0.0–0.1 … 0.9–1.0) comparing avg predicted probability vs
  actual outcome rate — the core calibration reliability diagram data.

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can SELECT
  - Writes go through SECURITY DEFINER function only

  ## Notes
  1. All writes are idempotent — ON CONFLICT DO NOTHING or DO UPDATE
  2. run_key is a unique natural key on calibration_metric_runs
  3. metric_results unique on (run_id, competition_name, season_label, feature_quality_tier, metric_name)
  4. bucket table unique on (run_id, competition_name, feature_quality_tier, probability_bucket)
*/

-- ============================================================
-- TABLE 1: calibration_metric_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.calibration_metric_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key           text        NOT NULL,
  model_version     text        NOT NULL DEFAULT 'elo_v1',
  feature_version   text        NOT NULL,
  elo_version       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  match_count       integer,
  notes             text,
  CONSTRAINT calibration_metric_runs_run_key_uq UNIQUE (run_key)
);

ALTER TABLE model_lab.calibration_metric_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration metric runs"
  ON model_lab.calibration_metric_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- TABLE 2: calibration_metric_results
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.calibration_metric_results (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid        NOT NULL REFERENCES model_lab.calibration_metric_runs(id) ON DELETE CASCADE,
  competition_name     text        NOT NULL DEFAULT '__overall__',
  season_label         text,
  feature_quality_tier text        NOT NULL DEFAULT '__all__',
  metric_name          text        NOT NULL,
  metric_value         numeric(18,8),
  sample_size          integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_metric_results_uq
    UNIQUE (run_id, competition_name, season_label, feature_quality_tier, metric_name)
);

ALTER TABLE model_lab.calibration_metric_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration metric results"
  ON model_lab.calibration_metric_results
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_cal_results_run_id
  ON model_lab.calibration_metric_results(run_id);

CREATE INDEX IF NOT EXISTS idx_cal_results_competition
  ON model_lab.calibration_metric_results(competition_name);

CREATE INDEX IF NOT EXISTS idx_cal_results_tier
  ON model_lab.calibration_metric_results(feature_quality_tier);

-- ============================================================
-- TABLE 3: calibration_probability_buckets
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.calibration_probability_buckets (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                    uuid        NOT NULL REFERENCES model_lab.calibration_metric_runs(id) ON DELETE CASCADE,
  competition_name          text        NOT NULL DEFAULT '__overall__',
  feature_quality_tier      text        NOT NULL DEFAULT '__all__',
  probability_bucket        text        NOT NULL,
  bucket_min                numeric(6,4) NOT NULL,
  bucket_max                numeric(6,4) NOT NULL,
  sample_size               integer,
  avg_predicted_probability numeric(10,6),
  actual_home_rate          numeric(10,6),
  calibration_gap           numeric(10,6),
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_prob_buckets_uq
    UNIQUE (run_id, competition_name, feature_quality_tier, probability_bucket)
);

ALTER TABLE model_lab.calibration_probability_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration probability buckets"
  ON model_lab.calibration_probability_buckets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_cal_buckets_run_id
  ON model_lab.calibration_probability_buckets(run_id);
