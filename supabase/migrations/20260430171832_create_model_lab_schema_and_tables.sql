/*
  # Create model_lab Schema — Historical Backbone Model Foundation

  ## Purpose
  Private admin-only schema for Next59's deterministic B3 historical football backbone model.
  No public user access. No LLM calls. No external APIs. Deterministic only.

  ## New Schema
  - model_lab (private admin schema)

  ## New Tables
  1. model_lab.model_versions — Track deterministic model versions with configs
  2. model_lab.match_feature_snapshots — Pre-match feature snapshots per model version
  3. model_lab.backtest_runs — Track each deterministic backtest run
  4. model_lab.match_model_predictions — Model outputs per match per backtest
  5. model_lab.match_model_evaluations — Comparison of prediction vs actual result
  6. model_lab.calibration_summary — Aggregated calibration metrics

  ## Security
  - RLS enabled on ALL tables
  - anon: NO ACCESS
  - authenticated normal users: NO ACCESS
  - admin only (profiles.role = 'admin' OR auth.jwt().app_metadata.role = 'admin'): full access
  - service_role: full access for backend runners

  ## Seed
  - model_version: b3_historical_backbone_v0_1
*/

-- ─── Create schema ────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS model_lab;

-- ─── 1. model_versions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.model_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key            text UNIQUE NOT NULL,
  model_name             text NOT NULL,
  model_family           text NOT NULL,
  description            text,
  training_start_date    date,
  training_end_date      date,
  validation_start_date  date,
  validation_end_date    date,
  feature_config         jsonb NOT NULL DEFAULT '{}',
  algorithm_config       jsonb NOT NULL DEFAULT '{}',
  is_active              boolean DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

ALTER TABLE model_lab.model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_model_versions"
  ON model_lab.model_versions FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_model_versions"
  ON model_lab.model_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_update_model_versions"
  ON model_lab.model_versions FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── 2. match_feature_snapshots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.match_feature_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              uuid NOT NULL,
  model_version_id      uuid REFERENCES model_lab.model_versions(id),
  feature_cutoff_date   date NOT NULL,
  era_bucket            text NOT NULL,
  competition_id        uuid,
  season_id             uuid,
  home_team_id          uuid,
  away_team_id          uuid,
  feature_json          jsonb NOT NULL DEFAULT '{}',
  data_availability_json jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz DEFAULT now(),
  UNIQUE (model_version_id, match_id)
);

ALTER TABLE model_lab.match_feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_match_feature_snapshots"
  ON model_lab.match_feature_snapshots FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_match_feature_snapshots"
  ON model_lab.match_feature_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── 3. backtest_runs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.backtest_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id     uuid REFERENCES model_lab.model_versions(id),
  run_key              text UNIQUE NOT NULL,
  run_status           text NOT NULL CHECK (run_status IN ('pending','running','completed','failed')),
  run_scope            text NOT NULL,
  train_start_date     date NOT NULL,
  train_end_date       date NOT NULL,
  validation_start_date date,
  validation_end_date  date,
  competition_scope    jsonb NOT NULL DEFAULT '[]',
  era_scope            jsonb NOT NULL DEFAULT '[]',
  total_matches        integer DEFAULT 0,
  processed_matches    integer DEFAULT 0,
  failed_matches       integer DEFAULT 0,
  average_brier_1x2    numeric(10,8),
  average_log_loss_1x2 numeric(10,8),
  started_at           timestamptz,
  completed_at         timestamptz,
  error_message        text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE model_lab.backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_backtest_runs"
  ON model_lab.backtest_runs FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_backtest_runs"
  ON model_lab.backtest_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_update_backtest_runs"
  ON model_lab.backtest_runs FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── 4. match_model_predictions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.match_model_predictions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id        uuid REFERENCES model_lab.backtest_runs(id),
  model_version_id       uuid REFERENCES model_lab.model_versions(id),
  match_id               uuid NOT NULL,
  match_date             date NOT NULL,
  feature_cutoff_date    date NOT NULL,
  trained_until_date     date NOT NULL,
  era_bucket             text NOT NULL,

  -- Match identity
  competition_id         uuid,
  competition_name       text,
  season_id              uuid,
  season_label           text,
  home_team_id           uuid,
  home_team_name         text,
  away_team_id           uuid,
  away_team_name         text,

  -- Probability outputs
  p_home                 numeric(8,6),
  p_draw                 numeric(8,6),
  p_away                 numeric(8,6),
  expected_home_goals    numeric(8,4),
  expected_away_goals    numeric(8,4),
  p_over_1_5             numeric(8,6),
  p_over_2_5             numeric(8,6),
  p_over_3_5             numeric(8,6),
  p_btts                 numeric(8,6),

  -- Internal proxy (never expose publicly)
  attack_index_home      numeric(10,6),
  attack_index_away      numeric(10,6),
  xg_lite_internal_home  numeric(10,6),
  xg_lite_internal_away  numeric(10,6),

  -- Decision
  predicted_result       text CHECK (predicted_result IN ('H','D','A')),
  confidence_score       numeric(8,6),
  confidence_grade       text CHECK (confidence_grade IN ('A','B+','B','C','D','F')),
  decision_summary       text,

  -- Debug (internal only)
  feature_snapshot       jsonb NOT NULL DEFAULT '{}',
  model_debug            jsonb NOT NULL DEFAULT '{}',

  -- Visibility gate: default false, never expose to public
  is_public_visible      boolean DEFAULT false,

  created_at             timestamptz DEFAULT now(),
  UNIQUE (backtest_run_id, match_id)
);

ALTER TABLE model_lab.match_model_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_match_model_predictions"
  ON model_lab.match_model_predictions FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_match_model_predictions"
  ON model_lab.match_model_predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── 5. match_model_evaluations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.match_model_evaluations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id     uuid REFERENCES model_lab.match_model_predictions(id) ON DELETE CASCADE,
  match_id          uuid NOT NULL,

  -- Actual result
  actual_result         text CHECK (actual_result IN ('H','D','A')),
  actual_home_score     integer,
  actual_away_score     integer,
  actual_total_goals    integer,
  actual_btts           boolean,
  actual_over_1_5       boolean,
  actual_over_2_5       boolean,
  actual_over_3_5       boolean,

  -- Prediction echo
  predicted_result      text CHECK (predicted_result IN ('H','D','A')),
  is_result_correct     boolean,

  -- Scoring
  brier_1x2             numeric(10,8),
  log_loss_1x2          numeric(10,8),
  over_1_5_correct      boolean,
  over_2_5_correct      boolean,
  over_3_5_correct      boolean,
  btts_correct          boolean,

  -- Error analysis
  error_category        text,
  error_notes           text,
  calibration_bucket    text,

  created_at            timestamptz DEFAULT now()
);

ALTER TABLE model_lab.match_model_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_match_model_evaluations"
  ON model_lab.match_model_evaluations FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_match_model_evaluations"
  ON model_lab.match_model_evaluations FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── 6. calibration_summary ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.calibration_summary (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id        uuid REFERENCES model_lab.backtest_runs(id),
  model_version_id       uuid REFERENCES model_lab.model_versions(id),
  group_type             text NOT NULL,
  group_key              text NOT NULL,
  sample_size            integer NOT NULL,
  avg_brier_1x2          numeric(10,8),
  avg_log_loss_1x2       numeric(10,8),
  result_accuracy        numeric(8,6),
  over_2_5_accuracy      numeric(8,6),
  btts_accuracy          numeric(8,6),
  home_prediction_bias   numeric(10,6),
  draw_prediction_bias   numeric(10,6),
  away_prediction_bias   numeric(10,6),
  notes                  text,
  created_at             timestamptz DEFAULT now()
);

ALTER TABLE model_lab.calibration_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_calibration_summary"
  ON model_lab.calibration_summary FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "admin_insert_calibration_summary"
  ON model_lab.calibration_summary FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ─── Seed: B3 Historical Backbone v0.1 ───────────────────────────────────────

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
  'b3_historical_backbone_v0_1',
  'B3 Historical Backbone',
  'deterministic_stats',
  'Deterministic baseline using historical archive fields only: score, result, shots, shots on target, corners, fouls, cards, referee when available. No external APIs and no LLM. Training: 2000-07-28 through end of 2017-2018 season. Validation: 2018-2019 season.',
  '2000-07-28',
  '2018-06-30',
  '2018-07-01',
  '2019-06-30',
  '{
    "fields_used": ["result","home_score_ft","away_score_ft","home_score_ht","away_score_ht","total_goals_ft","home_total_shots","away_total_shots","home_shots_on_goal","away_shots_on_goal","home_corner_kicks","away_corner_kicks","home_fouls","away_fouls","home_yellow_cards","away_yellow_cards","home_red_cards","away_red_cards"],
    "fields_excluded": ["ball_possession","lineups","injuries","pass_data","minute_events","weather"],
    "min_team_sample": 10,
    "recent_form_n": [5, 10],
    "min_referee_sample": 20,
    "use_bayesian_shrinkage": true,
    "focus_competitions": ["Premier League","La Liga","Serie A","Bundesliga","Ligue 1","Eredivisie","Sueper Lig"]
  }',
  '{
    "poisson_max_goals": 6,
    "confidence_grade_thresholds": {
      "A": 0.25,
      "B+": 0.18,
      "B": 0.12,
      "C": 0.07,
      "D": 0.03,
      "F": 0.0
    },
    "home_advantage_base": 1.15,
    "bayesian_shrinkage_weight": 0.3,
    "version": "0.1"
  }',
  true
)
ON CONFLICT (version_key) DO NOTHING;
