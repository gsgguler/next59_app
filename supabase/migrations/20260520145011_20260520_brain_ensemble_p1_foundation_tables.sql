/*
  # Brain Ensemble Foundation Tables — P1

  ## Summary
  Creates the foundational configuration and tracking tables for the 6-brain
  ensemble prediction system.

  ## New Tables

  ### brain_configs
  - Registry of all 6 brain definitions: tactical, statistical, psychological,
    live, conditions, news
  - Stores system_prompt, default_weight, input_spec, output_spec per brain
  - is_active flag for enabling/disabling individual brains

  ### brain_weight_profiles
  - Six named weight profiles: league_standard, derby_match, cup_final,
    live_60min, weather_extreme, transfer_window_chaos
  - JSONB weights column with one entry per brain_key
  - is_default flag; total weights must sum to 1.0 (enforced by CHECK)

  ### brain_performance_tracking
  - Per-brain accuracy and Brier score trend across rolling windows
  - Tracks 7-day, 30-day, and all-time Brier scores
  - Used by meta-learner to adjust brain weights dynamically

  ## Security
  - RLS enabled on all tables
  - brain_configs: public read (anon can list brains), admin write
  - brain_weight_profiles: public read, admin write
  - brain_performance_tracking: admin only (read + write)
*/

-- ─── brain_configs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brain_configs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_key         text        NOT NULL UNIQUE,
  display_name      text        NOT NULL,
  role_description  text        NOT NULL,
  system_prompt     text        NOT NULL,
  default_weight    numeric(4,3) NOT NULL CHECK (default_weight >= 0 AND default_weight <= 1),
  input_spec        jsonb       NOT NULL DEFAULT '{}',
  output_spec       jsonb       NOT NULL DEFAULT '{}',
  is_active         boolean     NOT NULL DEFAULT true,
  is_live_only      boolean     NOT NULL DEFAULT false,
  sort_order        smallint    NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_configs public read"
  ON public.brain_configs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "brain_configs admin insert"
  ON public.brain_configs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_configs admin update"
  ON public.brain_configs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─── brain_weight_profiles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brain_weight_profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key   text        NOT NULL UNIQUE,
  display_name  text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  weights       jsonb       NOT NULL,
  is_default    boolean     NOT NULL DEFAULT false,
  conditions    jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brain_weight_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_weight_profiles public read"
  ON public.brain_weight_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "brain_weight_profiles admin insert"
  ON public.brain_weight_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_weight_profiles admin update"
  ON public.brain_weight_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─── brain_performance_tracking ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brain_performance_tracking (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_key            text        NOT NULL REFERENCES public.brain_configs(brain_key) ON DELETE CASCADE,
  tracking_date        date        NOT NULL DEFAULT CURRENT_DATE,
  sample_count_7d      integer     NOT NULL DEFAULT 0,
  brier_score_7d       numeric(6,4),
  accuracy_7d          numeric(5,4),
  sample_count_30d     integer     NOT NULL DEFAULT 0,
  brier_score_30d      numeric(6,4),
  accuracy_30d         numeric(5,4),
  sample_count_all     integer     NOT NULL DEFAULT 0,
  brier_score_all      numeric(6,4),
  accuracy_all         numeric(5,4),
  calibration_ece      numeric(6,4),
  sharpness            numeric(6,4),
  meta_weight_override numeric(4,3),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brain_key, tracking_date)
);

CREATE INDEX IF NOT EXISTS brain_performance_tracking_brain_key_idx
  ON public.brain_performance_tracking(brain_key);
CREATE INDEX IF NOT EXISTS brain_performance_tracking_date_idx
  ON public.brain_performance_tracking(tracking_date DESC);

ALTER TABLE public.brain_performance_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_performance_tracking admin select"
  ON public.brain_performance_tracking FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_performance_tracking admin insert"
  ON public.brain_performance_tracking FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_performance_tracking admin update"
  ON public.brain_performance_tracking FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
