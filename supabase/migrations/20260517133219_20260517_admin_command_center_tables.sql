
/*
  # Admin Command Center Tables

  ## Summary
  Creates the four tables needed for the admin generation, review, and
  publishing workflow. These back the Pre-Match Test Lab, 90-minute Story
  Generator, and the review/approval/publish pipeline.

  ## New Tables

  ### 1. model_lab.admin_generation_jobs
  Tracks every admin-triggered generation request (prediction or story).
  One row per job. Supports async status polling from the UI.

  ### 2. model_lab.prematch_prediction_drafts
  Stores generated pre-match probability predictions (H/D/A). Admin-only.
  Goes through draft → pending_review → approved/rejected → published.

  ### 3. model_lab.match_story_drafts
  Stores the generated 90-minute narrative text. Linked to a prediction draft.
  Same status workflow as predictions.

  ### 4. model_lab.match_story_publications
  Immutable published record. Created when admin clicks Publish. Never deleted.
  Includes full traceability: model_version, feature_version, calibration_version,
  approved_by, published_at.

  ## Security
  - RLS enabled on all tables
  - Admin-only write (authenticated + role check in policy)
  - Published stories readable by authenticated users only (no anon)
  - No anon write access anywhere

  ## Notes
  - status column uses CHECK constraint — no invalid states possible
  - generated_payload stores full JSON of all inputs used (reproducibility)
  - version history: new draft creates new row; old rows never overwritten
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_generation_jobs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.admin_generation_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        text        NOT NULL CHECK (job_type IN (
                                'prediction_draft',
                                'story_draft',
                                'calibration_metrics',
                                'walk_forward',
                                'feature_matrix',
                                'elo_rerun'
                              )),
  match_id        uuid,           -- NULL for non-match jobs
  competition     text,
  season_label    text,
  model_version   text        NOT NULL DEFAULT 'elo_v2_ha0_k20_global',
  feature_version text        NOT NULL DEFAULT 'features_v2_domestic_2026_05',
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','cancelled')),
  triggered_by    uuid        NOT NULL,  -- auth.uid() of admin
  result_id       uuid,           -- FK to draft row once created
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agj_match_id    ON model_lab.admin_generation_jobs(match_id);
CREATE INDEX IF NOT EXISTS idx_agj_status      ON model_lab.admin_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_agj_triggered   ON model_lab.admin_generation_jobs(triggered_by);
CREATE INDEX IF NOT EXISTS idx_agj_created     ON model_lab.admin_generation_jobs(created_at DESC);

ALTER TABLE model_lab.admin_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage generation jobs"
  ON model_lab.admin_generation_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert generation jobs"
  ON model_lab.admin_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update generation jobs"
  ON model_lab.admin_generation_jobs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. prematch_prediction_drafts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.prematch_prediction_drafts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                uuid        NOT NULL,
  competition_name        text        NOT NULL,
  season_label            text        NOT NULL,
  match_date              date        NOT NULL,
  home_team_name          text,
  away_team_name          text,

  -- Model traceability
  model_version           text        NOT NULL,
  feature_version         text        NOT NULL,
  elo_version             text        NOT NULL,
  calibration_version     text        NOT NULL DEFAULT 'none',
  prediction_formula      text        NOT NULL DEFAULT 'formula_v1_binary_plus_draw_heuristic',

  -- Inputs used
  pre_match_elo_home      numeric,
  pre_match_elo_away      numeric,
  raw_p_home_elo          numeric,
  league_cal_correction   numeric,
  feature_quality_tier    text        NOT NULL DEFAULT 'elo_only',
  home_l5_available       smallint,
  away_l5_available       smallint,
  calibration_context     text        NOT NULL DEFAULT 'normal',

  -- Output probabilities
  p_home                  numeric     NOT NULL CHECK (p_home >= 0 AND p_home <= 1),
  p_draw                  numeric     NOT NULL CHECK (p_draw >= 0 AND p_draw <= 1),
  p_away                  numeric     NOT NULL CHECK (p_away >= 0 AND p_away <= 1),
  confidence_score        numeric,
  confidence_tier         text        CHECK (confidence_tier IN ('very_high','high','medium','low','very_low')),

  -- Warnings
  has_calibration_warning boolean     NOT NULL DEFAULT false,
  has_data_warning        boolean     NOT NULL DEFAULT false,
  warnings                text[],

  -- Full input payload for reproducibility
  generated_payload       jsonb,

  -- Workflow
  status                  text        NOT NULL DEFAULT 'draft_generated'
                            CHECK (status IN ('draft_generated','pending_review','approved','rejected','published','hidden')),
  generated_by            uuid        NOT NULL,
  reviewed_by             uuid,
  review_note             text,
  approved_at             timestamptz,
  published_at            timestamptz,
  generated_at            timestamptz NOT NULL DEFAULT now(),

  -- Version history: each regeneration creates a new row
  version                 integer     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ppd_match_id   ON model_lab.prematch_prediction_drafts(match_id);
CREATE INDEX IF NOT EXISTS idx_ppd_status     ON model_lab.prematch_prediction_drafts(status);
CREATE INDEX IF NOT EXISTS idx_ppd_match_date ON model_lab.prematch_prediction_drafts(match_date);
CREATE INDEX IF NOT EXISTS idx_ppd_generated  ON model_lab.prematch_prediction_drafts(generated_at DESC);

ALTER TABLE model_lab.prematch_prediction_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read prediction drafts"
  ON model_lab.prematch_prediction_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert prediction drafts"
  ON model_lab.prematch_prediction_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update prediction drafts"
  ON model_lab.prematch_prediction_drafts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. match_story_drafts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.match_story_drafts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_draft_id     uuid        REFERENCES model_lab.prematch_prediction_drafts(id) ON DELETE SET NULL,
  match_id                uuid        NOT NULL,
  competition_name        text        NOT NULL,
  season_label            text        NOT NULL,
  match_date              date        NOT NULL,
  home_team_name          text,
  away_team_name          text,

  -- Model traceability
  model_version           text        NOT NULL,
  feature_version         text        NOT NULL,
  calibration_version     text        NOT NULL DEFAULT 'none',

  -- Story sections (structured)
  headline                text,
  tactical_summary        text,
  expected_tempo          text,
  key_pressure_zones      text,
  first_goal_sensitivity  text,
  draw_risk_analysis      text,
  favorite_fragility      text,
  late_goal_pressure      text,
  scenario_narrative      text,       -- main 90-minute narrative
  confidence_caveats      text,

  -- Full story text (all sections merged, ready for display)
  full_narrative_text     text,

  -- Source probabilities used to generate story
  p_home                  numeric,
  p_draw                  numeric,
  p_away                  numeric,
  confidence_tier         text,
  feature_quality_tier    text,

  -- Full generation payload for reproducibility
  generated_payload       jsonb,

  -- Workflow
  status                  text        NOT NULL DEFAULT 'draft_generated'
                            CHECK (status IN ('draft_generated','pending_review','approved','rejected','published','hidden')),
  generated_by            uuid        NOT NULL,
  reviewed_by             uuid,
  review_note             text,
  approved_at             timestamptz,
  published_at            timestamptz,
  generated_at            timestamptz NOT NULL DEFAULT now(),

  version                 integer     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_msd_match_id         ON model_lab.match_story_drafts(match_id);
CREATE INDEX IF NOT EXISTS idx_msd_prediction_draft ON model_lab.match_story_drafts(prediction_draft_id);
CREATE INDEX IF NOT EXISTS idx_msd_status           ON model_lab.match_story_drafts(status);
CREATE INDEX IF NOT EXISTS idx_msd_match_date       ON model_lab.match_story_drafts(match_date);

ALTER TABLE model_lab.match_story_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read story drafts"
  ON model_lab.match_story_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert story drafts"
  ON model_lab.match_story_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update story drafts"
  ON model_lab.match_story_drafts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. match_story_publications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.match_story_publications (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_draft_id          uuid        NOT NULL REFERENCES model_lab.match_story_drafts(id),
  prediction_draft_id     uuid        REFERENCES model_lab.prematch_prediction_drafts(id),
  match_id                uuid        NOT NULL,
  competition_name        text        NOT NULL,
  season_label            text        NOT NULL,
  match_date              date        NOT NULL,
  home_team_name          text,
  away_team_name          text,

  -- Full traceability
  model_version           text        NOT NULL,
  feature_version         text        NOT NULL,
  calibration_version     text        NOT NULL DEFAULT 'none',
  prediction_formula      text,

  -- Published content (immutable snapshot)
  headline                text,
  full_narrative_text     text        NOT NULL,
  p_home                  numeric,
  p_draw                  numeric,
  p_away                  numeric,
  confidence_tier         text,
  feature_quality_tier    text,

  -- Approval chain
  generated_by            uuid        NOT NULL,
  approved_by             uuid        NOT NULL,
  published_by            uuid        NOT NULL,
  approved_at             timestamptz NOT NULL,
  published_at            timestamptz NOT NULL DEFAULT now(),

  -- Visibility
  is_visible              boolean     NOT NULL DEFAULT true,
  hidden_at               timestamptz,
  hidden_by               uuid,
  hide_reason             text
);

CREATE INDEX IF NOT EXISTS idx_msp_match_id    ON model_lab.match_story_publications(match_id);
CREATE INDEX IF NOT EXISTS idx_msp_match_date  ON model_lab.match_story_publications(match_date);
CREATE INDEX IF NOT EXISTS idx_msp_is_visible  ON model_lab.match_story_publications(is_visible);
CREATE INDEX IF NOT EXISTS idx_msp_published   ON model_lab.match_story_publications(published_at DESC);

ALTER TABLE model_lab.match_story_publications ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage publications"
  ON model_lab.match_story_publications FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert publications"
  ON model_lab.match_story_publications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update publications"
  ON model_lab.match_story_publications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Authenticated users can read visible publications only
CREATE POLICY "Authenticated users can read visible publications"
  ON model_lab.match_story_publications FOR SELECT
  TO authenticated
  USING (is_visible = true);
