/*
  # Model Lab Schema

  Creates the model_lab schema with all ML/calibration support tables.

  1. Schema
    - `model_lab` schema exposed to PostgREST
  
  2. New Tables (all in model_lab schema)
    - `model_versions` - registered ML model versions
    - `backtest_runs` - individual backtest execution records
    - `backtest_run_chunks` - chunked backtest execution for long runs
    - `feature_snapshots` - feature matrix snapshots per match
    - `calibration_adjustments` - temperature/bias adjustment configs
    - `calibration_simulations` - simulation results for calibration experiments
    - `result_sync_runs` - live result sync execution log
    - `prediction_outcomes` - per-prediction outcome evaluations
    - `live_pattern_memory` - learned patterns from live match outcomes
    - `live_micro_simulations` - micro-simulation run results
    - `live_outcome_evaluations` - post-match outcome evaluations
    - `meta_learner_configs` - meta-learner ensemble configuration
    - `brain_configs` - brain orchestration configuration
    - `brain_run_log` - brain orchestration run history

  3. Security
    - All tables have RLS enabled
    - Admin-only write access
    - Authenticated read for relevant tables
*/

-- ─── Create schema ────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS model_lab;

-- Grant schema usage
GRANT USAGE ON SCHEMA model_lab TO anon, authenticated, service_role;

-- ─── model_versions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.model_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key     text UNIQUE NOT NULL,
  label           text NOT NULL,
  description     text,
  formula         text NOT NULL DEFAULT 'baseline',
  is_active       boolean NOT NULL DEFAULT false,
  brier_score     numeric(6,4),
  accuracy        numeric(6,4),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_versions authenticated read"
  ON model_lab.model_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "model_versions admin write"
  ON model_lab.model_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "model_versions admin update"
  ON model_lab.model_versions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Seed active model
INSERT INTO model_lab.model_versions (version_key, label, formula, is_active)
VALUES ('b3_temp160', 'B3 Temp=1.60', 'elo_draw_recal', true)
ON CONFLICT (version_key) DO NOTHING;

-- ─── backtest_runs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.backtest_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id      uuid REFERENCES model_lab.model_versions(id),
  competition_scope     text,
  season_label          text,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  started_at            timestamptz,
  completed_at          timestamptz,
  matches_evaluated     int NOT NULL DEFAULT 0,
  brier_score           numeric(6,4),
  accuracy              numeric(6,4),
  log_loss              numeric(8,6),
  error_message         text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backtest_runs authenticated read"
  ON model_lab.backtest_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "backtest_runs service write"
  ON model_lab.backtest_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "backtest_runs service update"
  ON model_lab.backtest_runs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── backtest_run_chunks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.backtest_run_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES model_lab.backtest_runs(id) ON DELETE CASCADE,
  chunk_index     int NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  matches_in_chunk int NOT NULL DEFAULT 0,
  processed_at    timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, chunk_index)
);

ALTER TABLE model_lab.backtest_run_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backtest_run_chunks authenticated read"
  ON model_lab.backtest_run_chunks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "backtest_run_chunks service write"
  ON model_lab.backtest_run_chunks FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "backtest_run_chunks service update"
  ON model_lab.backtest_run_chunks FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── feature_snapshots ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.feature_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  snapshot_type   text NOT NULL DEFAULT 'prematch' CHECK (snapshot_type IN ('prematch','live','upcoming')),
  elo_home        numeric(8,2),
  elo_away        numeric(8,2),
  form_home       numeric(6,4),
  form_away       numeric(6,4),
  h2h_home_wins   int,
  h2h_draws       int,
  h2h_away_wins   int,
  features_json   jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, snapshot_type)
);

ALTER TABLE model_lab.feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_snapshots authenticated read"
  ON model_lab.feature_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "feature_snapshots service write"
  ON model_lab.feature_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── calibration_adjustments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.calibration_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id    uuid REFERENCES model_lab.model_versions(id),
  adjustment_type     text NOT NULL,
  parameter_key       text NOT NULL,
  parameter_value     numeric(10,6) NOT NULL,
  scope               text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_version_id, adjustment_type, parameter_key, scope)
);

ALTER TABLE model_lab.calibration_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_adjustments authenticated read"
  ON model_lab.calibration_adjustments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "calibration_adjustments service write"
  ON model_lab.calibration_adjustments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "calibration_adjustments service update"
  ON model_lab.calibration_adjustments FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── calibration_simulations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.calibration_simulations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid REFERENCES model_lab.backtest_runs(id) ON DELETE CASCADE,
  simulation_type     text NOT NULL,
  parameters          jsonb NOT NULL DEFAULT '{}',
  brier_score         numeric(6,4),
  accuracy            numeric(6,4),
  log_loss            numeric(8,6),
  ece                 numeric(6,4),
  precision_score     numeric(6,4),
  recall_score        numeric(6,4),
  skill_score         numeric(6,4),
  slope               numeric(8,6),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.calibration_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_simulations authenticated read"
  ON model_lab.calibration_simulations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "calibration_simulations service write"
  ON model_lab.calibration_simulations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── result_sync_runs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.result_sync_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                text NOT NULL DEFAULT 'recent',
  started_at          timestamptz NOT NULL,
  completed_at        timestamptz,
  triggered_at        timestamptz,
  status              text NOT NULL DEFAULT 'running',
  matches_seen        int NOT NULL DEFAULT 0,
  matches_found       int NOT NULL DEFAULT 0,
  matches_updated     int NOT NULL DEFAULT 0,
  updated             int NOT NULL DEFAULT 0,
  events_processed    int NOT NULL DEFAULT 0,
  stats_processed     int NOT NULL DEFAULT 0,
  lineups_processed   int NOT NULL DEFAULT 0,
  errors_json         jsonb NOT NULL DEFAULT '[]',
  duration_ms         int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.result_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "result_sync_runs authenticated read"
  ON model_lab.result_sync_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "result_sync_runs service write"
  ON model_lab.result_sync_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── prediction_outcomes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.prediction_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  prediction_id       uuid REFERENCES predictions(id),
  predicted_result    text NOT NULL,
  actual_result       text,
  was_correct         boolean,
  confidence          numeric(5,4),
  brier_contribution  numeric(8,6),
  model_version_key   text,
  evaluated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, model_version_key)
);

ALTER TABLE model_lab.prediction_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prediction_outcomes authenticated read"
  ON model_lab.prediction_outcomes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "prediction_outcomes service write"
  ON model_lab.prediction_outcomes FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "prediction_outcomes service update"
  ON model_lab.prediction_outcomes FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── live_pattern_memory ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_pattern_memory (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key           text UNIQUE NOT NULL,
  pattern_type          text NOT NULL,
  occurrences           int NOT NULL DEFAULT 0,
  correct_predictions   int NOT NULL DEFAULT 0,
  accuracy              numeric(5,4),
  last_seen_at          timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.live_pattern_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_pattern_memory authenticated read"
  ON model_lab.live_pattern_memory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "live_pattern_memory service write"
  ON model_lab.live_pattern_memory FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "live_pattern_memory service update"
  ON model_lab.live_pattern_memory FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── live_micro_simulations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_micro_simulations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  simulation_minute   int,
  current_score_home  int,
  current_score_away  int,
  win_prob_home       numeric(5,4),
  draw_prob           numeric(5,4),
  win_prob_away       numeric(5,4),
  confidence_delta    numeric(6,4),
  model_version_key   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.live_micro_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_micro_simulations authenticated read"
  ON model_lab.live_micro_simulations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "live_micro_simulations service write"
  ON model_lab.live_micro_simulations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── live_outcome_evaluations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_outcome_evaluations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  evaluated_at        timestamptz NOT NULL DEFAULT now(),
  prematch_prediction text,
  live_prediction     text,
  actual_result       text,
  prematch_correct    boolean,
  live_correct        boolean,
  prematch_confidence numeric(5,4),
  live_confidence     numeric(5,4),
  model_version_key   text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

ALTER TABLE model_lab.live_outcome_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_outcome_evaluations authenticated read"
  ON model_lab.live_outcome_evaluations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "live_outcome_evaluations service write"
  ON model_lab.live_outcome_evaluations FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "live_outcome_evaluations service update"
  ON model_lab.live_outcome_evaluations FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── meta_learner_configs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.meta_learner_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key          text UNIQUE NOT NULL,
  label               text NOT NULL,
  base_models         jsonb NOT NULL DEFAULT '[]',
  ensemble_weights    jsonb NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT false,
  brier_score         numeric(6,4),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.meta_learner_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_learner_configs authenticated read"
  ON model_lab.meta_learner_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "meta_learner_configs service write"
  ON model_lab.meta_learner_configs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "meta_learner_configs service update"
  ON model_lab.meta_learner_configs FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- Seed default meta learner
INSERT INTO model_lab.meta_learner_configs (config_key, label, base_models, ensemble_weights, is_active)
VALUES (
  'default_v1',
  'Default Ensemble v1',
  '["b3_temp160", "elo_baseline"]',
  '{"b3_temp160": 0.7, "elo_baseline": 0.3}',
  true
) ON CONFLICT (config_key) DO NOTHING;

-- ─── brain_configs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.brain_configs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key          text UNIQUE NOT NULL,
  label               text NOT NULL,
  model_version_key   text NOT NULL,
  calibration_temp    numeric(5,3) NOT NULL DEFAULT 1.0,
  draw_floor          numeric(5,4) NOT NULL DEFAULT 0.22,
  home_advantage      numeric(5,4) NOT NULL DEFAULT 0.05,
  is_active           boolean NOT NULL DEFAULT false,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.brain_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_configs authenticated read"
  ON model_lab.brain_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "brain_configs service write"
  ON model_lab.brain_configs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "brain_configs service update"
  ON model_lab.brain_configs FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- Seed active brain config
INSERT INTO model_lab.brain_configs (config_key, label, model_version_key, calibration_temp, is_active)
VALUES ('b3_temp160_default', 'B3 Temp=1.60 Default', 'b3_temp160', 1.60, true)
ON CONFLICT (config_key) DO NOTHING;

-- ─── brain_run_log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.brain_run_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid REFERENCES matches(id) ON DELETE SET NULL,
  run_type            text NOT NULL DEFAULT 'prematch',
  triggered_by        text,
  status              text NOT NULL DEFAULT 'running',
  brain_config_key    text,
  model_version_key   text,
  duration_ms         int,
  error_message       text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

ALTER TABLE model_lab.brain_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_run_log authenticated read"
  ON model_lab.brain_run_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "brain_run_log service write"
  ON model_lab.brain_run_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "brain_run_log service update"
  ON model_lab.brain_run_log FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── Grant table access ───────────────────────────────────────────────────────

GRANT SELECT ON ALL TABLES IN SCHEMA model_lab TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA model_lab TO service_role;
