/*
  # Brain Ensemble Orchestration & Snapshot Tables — P2

  ## Summary
  Creates the operational tables for the brain ensemble execution pipeline:
  per-run orchestration log, immutable prediction snapshots, and meta-learner
  model versioning.

  ## New Tables

  ### brain_orchestra_runs
  - One row per full orchestration run (pre-match or live revision)
  - Per-brain status, latency, raw output, and error stored in JSONB
  - Links to the final ensemble_prediction_snapshot produced by this run
  - match_id (uuid) + run_type + started_at forms unique run identity

  ### ensemble_prediction_snapshots
  - Immutable ledger of every ensemble prediction
  - Stores all 6 brain outputs plus final fused probabilities
  - is_locked = true prevents further updates (enforced by trigger)
  - previous_snapshot_id creates auditable version chain
  - Public read so consumers can see prediction history
  - predicted_outcome is a generated column (home_win/draw/away_win)

  ### meta_learner_models
  - Versioned meta-learner model registry
  - Stores feature_importance, training_sample_count, brier_score
  - is_active flag; only one active model at a time (enforced by trigger)
  - model_artifact JSONB stores serialized weight vector

  ## Security
  - RLS on all three tables
  - ensemble_prediction_snapshots: public SELECT, admin INSERT,
    UPDATE blocked on locked rows by both RLS and trigger
  - brain_orchestra_runs: admin only
  - meta_learner_models: admin only

  ## Important Notes
  1. matches.id is uuid — all FK references use uuid
  2. Immutability enforced at two levels: RLS UPDATE policy + BEFORE UPDATE trigger
  3. Only one active meta-learner at a time via BEFORE INSERT/UPDATE trigger
*/

-- ─── ensemble_prediction_snapshots (created first — orchestra_runs FK refs it) ─

CREATE TABLE IF NOT EXISTS public.ensemble_prediction_snapshots (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  snapshot_version      smallint    NOT NULL DEFAULT 1,
  snapshot_type         text        NOT NULL CHECK (snapshot_type IN ('prematch','live','final')),
  match_minute          integer,
  weight_profile_key    text,
  -- All 6 brain outputs
  brain_outputs         jsonb       NOT NULL DEFAULT '{}',
  effective_weights     jsonb       NOT NULL DEFAULT '{}',
  -- Fused result
  home_prob             numeric(5,4) NOT NULL,
  draw_prob             numeric(5,4) NOT NULL,
  away_prob             numeric(5,4) NOT NULL,
  predicted_outcome     text         GENERATED ALWAYS AS (
    CASE
      WHEN home_prob >= draw_prob AND home_prob >= away_prob THEN 'home_win'
      WHEN away_prob >= draw_prob AND away_prob >= home_prob THEN 'away_win'
      ELSE 'draw'
    END
  ) STORED,
  ensemble_confidence   numeric(4,3) NOT NULL DEFAULT 0,
  uncertainty_low       numeric(5,4),
  uncertainty_high      numeric(5,4),
  meta_learner_version  text,
  -- Post-match outcome tracking
  actual_outcome        text        CHECK (actual_outcome IN ('home_win','draw','away_win')),
  brier_score           numeric(6,4),
  was_correct           boolean,
  -- Immutability
  is_locked             boolean     NOT NULL DEFAULT false,
  locked_at             timestamptz,
  -- Version chain
  previous_snapshot_id  uuid        REFERENCES public.ensemble_prediction_snapshots(id) ON DELETE SET NULL,
  -- Explanation
  explanation_json      jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, snapshot_version)
);

CREATE INDEX IF NOT EXISTS ensemble_snapshots_match_id_idx
  ON public.ensemble_prediction_snapshots(match_id);
CREATE INDEX IF NOT EXISTS ensemble_snapshots_snapshot_type_idx
  ON public.ensemble_prediction_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS ensemble_snapshots_created_at_idx
  ON public.ensemble_prediction_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS ensemble_snapshots_is_locked_idx
  ON public.ensemble_prediction_snapshots(is_locked);

ALTER TABLE public.ensemble_prediction_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ensemble_snapshots public select"
  ON public.ensemble_prediction_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "ensemble_snapshots admin insert"
  ON public.ensemble_prediction_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "ensemble_snapshots admin update unlocked"
  ON public.ensemble_prediction_snapshots FOR UPDATE
  TO authenticated
  USING (
    is_locked = false
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Trigger: block updates on locked rows
CREATE OR REPLACE FUNCTION public.prevent_locked_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'ensemble_prediction_snapshots: row % is locked and cannot be modified', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensemble_snapshot_lock_guard
  BEFORE UPDATE ON public.ensemble_prediction_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_snapshot_mutation();

-- ─── brain_orchestra_runs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brain_orchestra_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  run_type            text        NOT NULL CHECK (run_type IN ('prematch','live_revision','manual')),
  triggered_by        text        NOT NULL DEFAULT 'cron',
  weight_profile_key  text        REFERENCES public.brain_weight_profiles(profile_key) ON DELETE SET NULL,
  effective_weights   jsonb       NOT NULL DEFAULT '{}',
  match_minute        integer,
  brain_results       jsonb       NOT NULL DEFAULT '[]',
  brains_completed    smallint    NOT NULL DEFAULT 0,
  brains_failed       smallint    NOT NULL DEFAULT 0,
  fusion_method       text        NOT NULL DEFAULT 'weighted_average',
  meta_learner_version text,
  final_home_prob     numeric(5,4),
  final_draw_prob     numeric(5,4),
  final_away_prob     numeric(5,4),
  ensemble_confidence numeric(4,3),
  uncertainty_low     numeric(5,4),
  uncertainty_high    numeric(5,4),
  snapshot_id         uuid        REFERENCES public.ensemble_prediction_snapshots(id) ON DELETE SET NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  total_latency_ms    integer,
  status              text        NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','partial','failed')),
  error_message       text
);

CREATE INDEX IF NOT EXISTS brain_orchestra_runs_match_id_idx
  ON public.brain_orchestra_runs(match_id);
CREATE INDEX IF NOT EXISTS brain_orchestra_runs_status_idx
  ON public.brain_orchestra_runs(status);
CREATE INDEX IF NOT EXISTS brain_orchestra_runs_started_at_idx
  ON public.brain_orchestra_runs(started_at DESC);

ALTER TABLE public.brain_orchestra_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_orchestra_runs admin select"
  ON public.brain_orchestra_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_orchestra_runs admin insert"
  ON public.brain_orchestra_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "brain_orchestra_runs admin update"
  ON public.brain_orchestra_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─── meta_learner_models ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_learner_models (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version         text        NOT NULL UNIQUE,
  model_type            text        NOT NULL DEFAULT 'weighted_average'
                                    CHECK (model_type IN ('weighted_average','xgboost_stacking','bayesian')),
  training_sample_count integer     NOT NULL DEFAULT 0,
  training_from_date    date,
  training_to_date      date,
  feature_importance    jsonb       NOT NULL DEFAULT '{}',
  learned_weights       jsonb       NOT NULL DEFAULT '{}',
  bayesian_priors       jsonb       NOT NULL DEFAULT '{}',
  validation_brier      numeric(6,4),
  validation_accuracy   numeric(5,4),
  validation_ece        numeric(6,4),
  model_artifact        jsonb       NOT NULL DEFAULT '{}',
  is_active             boolean     NOT NULL DEFAULT false,
  activated_at          timestamptz,
  retrain_trigger       text        CHECK (retrain_trigger IN ('scheduled','brier_threshold','manual')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_learner_models_is_active_idx
  ON public.meta_learner_models(is_active);
CREATE INDEX IF NOT EXISTS meta_learner_models_created_at_idx
  ON public.meta_learner_models(created_at DESC);

ALTER TABLE public.meta_learner_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_learner_models admin select"
  ON public.meta_learner_models FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "meta_learner_models admin insert"
  ON public.meta_learner_models FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "meta_learner_models admin update"
  ON public.meta_learner_models FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- Ensure only one active meta-learner model at a time
CREATE OR REPLACE FUNCTION public.enforce_single_active_meta_learner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.meta_learner_models
    SET is_active = false
    WHERE is_active = true AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meta_learner_single_active
  BEFORE INSERT OR UPDATE ON public.meta_learner_models
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_active_meta_learner();
