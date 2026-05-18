/*
  # Pre-Match Brain Orchestration — Storage Tables

  ## Purpose
  Stores the outputs of the Sub-Brain → Master Brain orchestration system.
  All tables are append-only, versioned, and admin-only (no public read).

  ## Tables

  1. **`model_lab.prematch_brain_runs`**
     - One row per match per invocation of generate_prematch_brain_package()
     - Tracks model/feature/formula versions and run status

  2. **`model_lab.prematch_brain_outputs`**
     - One row per sub-brain per run
     - brain_name: probability | draw_risk | upset_risk | tempo | late_pressure | calibration | data_quality
     - output_json holds brain-specific structured output

  3. **`model_lab.prematch_master_brain_outputs`**
     - One row per run
     - Aggregated Master Brain verdict: readiness, confidence, scenario tone, publish recommendation
     - Includes full warnings_json array and master_summary text

  ## Security
  - RLS enabled on all three tables
  - No public or anon access
  - Only authenticated admin users (via app_metadata.role = 'admin') can SELECT
  - Service role INSERT only (functions run as SECURITY DEFINER)
*/

-- ─────────────────────────────────────────────────────
-- 1. prematch_brain_runs
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.prematch_brain_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  prediction_draft_id uuid REFERENCES model_lab.prematch_prediction_drafts(id) ON DELETE SET NULL,
  model_version       text NOT NULL DEFAULT 'elo_v2_ha0_k20_global',
  feature_version     text NOT NULL DEFAULT 'features_v2_domestic_2026_05',
  formula_version     text NOT NULL DEFAULT 'formula_v2_draw_recalibrated',
  status              text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  generated_at        timestamptz NOT NULL DEFAULT now(),
  generated_by        text
);

CREATE INDEX IF NOT EXISTS idx_pbr_match_id ON model_lab.prematch_brain_runs(match_id);
CREATE INDEX IF NOT EXISTS idx_pbr_generated_at ON model_lab.prematch_brain_runs(generated_at DESC);

ALTER TABLE model_lab.prematch_brain_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read brain runs"
  ON model_lab.prematch_brain_runs FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─────────────────────────────────────────────────────
-- 2. prematch_brain_outputs
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.prematch_brain_outputs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_run_id     uuid NOT NULL REFERENCES model_lab.prematch_brain_runs(id) ON DELETE CASCADE,
  brain_name       text NOT NULL
                     CHECK (brain_name IN (
                       'probability', 'draw_risk', 'upset_risk',
                       'tempo', 'late_pressure', 'calibration', 'data_quality'
                     )),
  brain_version    text NOT NULL DEFAULT 'v1',
  output_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  warning_level    text NOT NULL DEFAULT 'none'
                     CHECK (warning_level IN ('none', 'low', 'medium', 'high')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbo_brain_run_id ON model_lab.prematch_brain_outputs(brain_run_id);
CREATE INDEX IF NOT EXISTS idx_pbo_brain_name   ON model_lab.prematch_brain_outputs(brain_name);

ALTER TABLE model_lab.prematch_brain_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read brain outputs"
  ON model_lab.prematch_brain_outputs FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─────────────────────────────────────────────────────
-- 3. prematch_master_brain_outputs
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.prematch_master_brain_outputs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_run_id           uuid NOT NULL UNIQUE REFERENCES model_lab.prematch_brain_runs(id) ON DELETE CASCADE,
  final_readiness        text NOT NULL DEFAULT 'partial'
                           CHECK (final_readiness IN ('ready', 'partial', 'blocked')),
  final_confidence       text NOT NULL DEFAULT 'low'
                           CHECK (final_confidence IN ('high', 'medium', 'low', 'insufficient')),
  scenario_tone          text NOT NULL DEFAULT 'balanced_tension'
                           CHECK (scenario_tone IN (
                             'favorite_control', 'balanced_tension',
                             'draw_pressure', 'upset_watch', 'low_data_caution'
                           )),
  publish_recommendation text NOT NULL DEFAULT 'review_required'
                           CHECK (publish_recommendation IN (
                             'publish_safe', 'review_required', 'do_not_publish'
                           )),
  master_summary         text NOT NULL DEFAULT '',
  warnings_json          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmbo_brain_run_id ON model_lab.prematch_master_brain_outputs(brain_run_id);

ALTER TABLE model_lab.prematch_master_brain_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read master brain outputs"
  ON model_lab.prematch_master_brain_outputs FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Grant INSERT to service_role (functions run as SECURITY DEFINER)
GRANT INSERT, SELECT ON model_lab.prematch_brain_runs TO service_role;
GRANT INSERT, SELECT ON model_lab.prematch_brain_outputs TO service_role;
GRANT INSERT, SELECT, UPDATE ON model_lab.prematch_master_brain_outputs TO service_role;
