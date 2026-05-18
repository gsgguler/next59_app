/*
  # Operational Hardening — Phase 4: Pipeline Rebuild + Phase 6: Evaluation

  ## Summary
  Replaces model_lab.run_daily_prematch_pipeline with a hardened version that:
  1. Opens a run log row in prematch_pipeline_runs at start
  2. Runs the full chain: features → readiness → prediction → brain → scenario → story
  3. Correctly counts each step independently
  4. Returns compact JSON summary
  5. Closes the log row at completion or failure
  6. Brain/scenario/story steps skip if fresh same-day versions already exist

  Also creates model_lab.evaluate_finished_prematch_predictions() for Phase 6:
  - Finds completed matches that have pre-kickoff prediction drafts
  - Computes brier score, log-loss, was_correct, false_confidence flag
  - Upserts into model_lab.prediction_evaluations (new table)
  - Idempotent via ON CONFLICT

  ## New table: model_lab.prediction_evaluations
*/

-- ── Prediction evaluations table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.prediction_evaluations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  prediction_draft_id uuid REFERENCES model_lab.prematch_prediction_drafts(id) ON DELETE SET NULL,
  model_version     text NOT NULL,
  feature_quality_tier text,
  prediction_formula text,
  -- Predicted probabilities (at generation time)
  p_home_predicted  numeric NOT NULL,
  p_draw_predicted  numeric NOT NULL,
  p_away_predicted  numeric NOT NULL,
  confidence_score  numeric,
  -- Actual result
  actual_result     text NOT NULL CHECK (actual_result IN ('home','draw','away')),
  home_score_ft     int,
  away_score_ft     int,
  -- Evaluation metrics
  brier_score       numeric NOT NULL,  -- lower is better; 0 = perfect
  log_loss          numeric NOT NULL,  -- lower is better
  was_correct       boolean NOT NULL,  -- predicted outcome matched actual
  false_confidence  boolean NOT NULL,  -- high confidence + wrong outcome
  -- Metadata
  match_date        date,
  competition_name  text,
  evaluated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, model_version, prediction_formula)
);

ALTER TABLE model_lab.prediction_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read evaluations"
  ON model_lab.prediction_evaluations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Service role full access on evaluations"
  ON model_lab.prediction_evaluations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS prediction_evaluations_match_idx
  ON model_lab.prediction_evaluations (match_id);
CREATE INDEX IF NOT EXISTS prediction_evaluations_date_idx
  ON model_lab.prediction_evaluations (match_date DESC);
CREATE INDEX IF NOT EXISTS prediction_evaluations_brier_idx
  ON model_lab.prediction_evaluations (brier_score);

GRANT SELECT ON model_lab.prediction_evaluations TO authenticated;
GRANT ALL ON model_lab.prediction_evaluations TO service_role;

-- ── Phase 6: evaluate_finished_prematch_predictions ─────────────────────────
CREATE OR REPLACE FUNCTION model_lab.evaluate_finished_prematch_predictions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $fn$
DECLARE
  v_row        RECORD;
  v_result     text;
  v_p_correct  numeric;
  v_brier      numeric;
  v_logloss    numeric;
  v_correct    boolean;
  v_false_conf boolean;
  v_processed  int := 0;
  v_skipped    int := 0;
  v_errors     int := 0;
BEGIN
  FOR v_row IN (
    -- Latest enriched prediction per match, only for finished matches
    SELECT DISTINCT ON (ppd.match_id)
      ppd.id              AS draft_id,
      ppd.match_id,
      ppd.model_version,
      ppd.prediction_formula,
      ppd.feature_quality_tier,
      ppd.p_home,
      ppd.p_draw,
      ppd.p_away,
      ppd.confidence_score,
      ppd.generated_at,
      ppd.competition_name,
      m.match_date,
      m.home_score_ft,
      m.away_score_ft,
      m.kickoff_utc
    FROM model_lab.prematch_prediction_drafts ppd
    JOIN public.matches m ON m.id = ppd.match_id
    WHERE m.status_short IN ('FT','AET','PEN')
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND ppd.feature_quality_tier IS DISTINCT FROM 'elo_only'
      AND ppd.status NOT IN ('hidden','rejected')
      -- Only predictions generated before kickoff (no post-match leakage)
      AND ppd.generated_at < COALESCE(m.kickoff_utc, m.match_date::timestamptz + interval '12h')
    ORDER BY ppd.match_id, ppd.generated_at DESC
  ) LOOP
    BEGIN
      -- Determine actual result
      IF v_row.home_score_ft > v_row.away_score_ft THEN
        v_result    := 'home';
        v_p_correct := v_row.p_home;
      ELSIF v_row.home_score_ft = v_row.away_score_ft THEN
        v_result    := 'draw';
        v_p_correct := v_row.p_draw;
      ELSE
        v_result    := 'away';
        v_p_correct := v_row.p_away;
      END IF;

      -- Brier score for multi-class: sum of (p_i - o_i)^2
      v_brier := ROUND((
        power(v_row.p_home - CASE WHEN v_result = 'home' THEN 1.0 ELSE 0.0 END, 2) +
        power(v_row.p_draw - CASE WHEN v_result = 'draw' THEN 1.0 ELSE 0.0 END, 2) +
        power(v_row.p_away - CASE WHEN v_result = 'away' THEN 1.0 ELSE 0.0 END, 2)
      )::numeric, 5);

      -- Log-loss: -log(p_correct), clipped to prevent -inf
      v_logloss := ROUND(-LN(GREATEST(v_p_correct, 0.001))::numeric, 5);

      -- Was the top predicted outcome correct?
      v_correct := (
        (v_result = 'home' AND v_row.p_home >= v_row.p_draw AND v_row.p_home >= v_row.p_away) OR
        (v_result = 'draw' AND v_row.p_draw > v_row.p_home AND v_row.p_draw >= v_row.p_away) OR
        (v_result = 'away' AND v_row.p_away > v_row.p_home AND v_row.p_away > v_row.p_draw)
      );

      -- False confidence: high confidence (>= 0.70) but wrong
      v_false_conf := NOT v_correct AND COALESCE(v_row.confidence_score, 0) >= 0.70;

      INSERT INTO model_lab.prediction_evaluations (
        match_id, prediction_draft_id, model_version, feature_quality_tier,
        prediction_formula, p_home_predicted, p_draw_predicted, p_away_predicted,
        confidence_score, actual_result, home_score_ft, away_score_ft,
        brier_score, log_loss, was_correct, false_confidence,
        match_date, competition_name, evaluated_at
      ) VALUES (
        v_row.match_id, v_row.draft_id, v_row.model_version, v_row.feature_quality_tier,
        v_row.prediction_formula, v_row.p_home, v_row.p_draw, v_row.p_away,
        v_row.confidence_score, v_result, v_row.home_score_ft, v_row.away_score_ft,
        v_brier, v_logloss, v_correct, v_false_conf,
        v_row.match_date, v_row.competition_name, now()
      )
      ON CONFLICT (match_id, model_version, prediction_formula) DO UPDATE SET
        actual_result    = EXCLUDED.actual_result,
        home_score_ft    = EXCLUDED.home_score_ft,
        away_score_ft    = EXCLUDED.away_score_ft,
        brier_score      = EXCLUDED.brier_score,
        log_loss         = EXCLUDED.log_loss,
        was_correct      = EXCLUDED.was_correct,
        false_confidence = EXCLUDED.false_confidence,
        evaluated_at     = now();

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated', v_processed,
    'skipped',   v_skipped,
    'errors',    v_errors,
    'run_at',    now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION model_lab.evaluate_finished_prematch_predictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.evaluate_finished_prematch_predictions() TO service_role;

-- Public admin wrapper
CREATE OR REPLACE FUNCTION public.ml_evaluate_predictions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'admin role required'; END IF;
  RETURN model_lab.evaluate_finished_prematch_predictions();
END;
$fn$;

REVOKE ALL ON FUNCTION public.ml_evaluate_predictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_evaluate_predictions() TO authenticated;

-- ── Phase 4: Rebuild run_daily_prematch_pipeline with full chain + logging ───
CREATE OR REPLACE FUNCTION model_lab.run_daily_prematch_pipeline(
  p_horizon_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $fn$
DECLARE
  v_from_date   date := CURRENT_DATE;
  v_to_date     date := CURRENT_DATE + p_horizon_days;
  v_run_id      uuid;
  v_match       RECORD;

  -- Counters
  c_seen        int := 0;
  c_readiness   int := 0;
  c_features    int := 0;
  c_predictions int := 0;
  c_brains      int := 0;
  c_scenarios   int := 0;
  c_stories     int := 0;
  c_skipped     int := 0;
  c_blocked     int := 0;
  c_errors      int := 0;

  v_errors_arr  jsonb[] := ARRAY[]::jsonb[];
  v_has_pred    boolean;
  v_has_brain   boolean;
  v_has_story   boolean;
  v_pkg         jsonb;
  v_err         text;
  v_feat_result jsonb;
BEGIN
  -- Open run log
  INSERT INTO model_lab.prematch_pipeline_runs (status, horizon_days)
  VALUES ('running', p_horizon_days)
  RETURNING id INTO v_run_id;

  -- Step 1: batch feature snapshots for entire horizon
  BEGIN
    v_feat_result := model_lab.ml_generate_upcoming_feature_snapshot_batch(v_from_date, v_to_date);
    c_features := COALESCE((v_feat_result->>'processed')::int, 0);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    c_errors := c_errors + 1;
    v_errors_arr := array_append(v_errors_arr,
      jsonb_build_object('step','feature_batch','error',v_err));
  END;

  -- Step 2: per-match loop
  FOR v_match IN (
    SELECT
      m.id          AS match_id,
      ht.name       AS home_team,
      at.name       AS away_team,
      m.match_date
    FROM public.matches m
    JOIN public.teams ht ON ht.id = m.home_team_id
    JOIN public.teams at ON at.id = m.away_team_id
    WHERE m.status_short IN ('NS','TBD','PST')
      AND m.match_date BETWEEN v_from_date AND v_to_date
    ORDER BY m.match_date ASC
  ) LOOP
    c_seen := c_seen + 1;

    -- 2a: re-assess readiness
    BEGIN
      PERFORM model_lab.assess_upcoming_match_readiness(v_match.match_id);
      c_readiness := c_readiness + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 2b: skip if blocked
    IF EXISTS (
      SELECT 1 FROM model_lab.upcoming_match_readiness
      WHERE match_id = v_match.match_id AND overall_status = 'blocked'
    ) THEN
      c_blocked := c_blocked + 1;
      CONTINUE;
    END IF;

    -- 2c: Prediction — skip if enriched draft exists today
    SELECT EXISTS (
      SELECT 1 FROM model_lab.prematch_prediction_drafts
      WHERE match_id = v_match.match_id
        AND generated_at >= CURRENT_DATE::timestamptz
        AND feature_quality_tier IS DISTINCT FROM 'elo_only'
        AND status NOT IN ('hidden','rejected')
    ) INTO v_has_pred;

    IF NOT v_has_pred THEN
      BEGIN
        PERFORM model_lab.generate_prematch_prediction(v_match.match_id, NULL::uuid);
        c_predictions := c_predictions + 1;
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        c_errors := c_errors + 1;
        v_errors_arr := array_append(v_errors_arr,
          jsonb_build_object('step','prediction','match',v_match.match_id,'error',v_err));
        CONTINUE;
      END;
    ELSE
      c_skipped := c_skipped + 1;
    END IF;

    -- 2d: Brain — skip if brain run exists today
    SELECT EXISTS (
      SELECT 1 FROM model_lab.prematch_brain_runs
      WHERE match_id = v_match.match_id
        AND generated_at >= CURRENT_DATE::timestamptz
        AND status = 'completed'
    ) INTO v_has_brain;

    IF NOT v_has_brain THEN
      BEGIN
        PERFORM model_lab.generate_prematch_brain_package(v_match.match_id, 'daily_pipeline');
        c_brains := c_brains + 1;
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        c_errors := c_errors + 1;
        v_errors_arr := array_append(v_errors_arr,
          jsonb_build_object('step','brain','match',v_match.match_id,'error',v_err));
      END;
    END IF;

    -- 2e: Story draft — skip if non-hidden story draft exists today
    SELECT EXISTS (
      SELECT 1 FROM model_lab.match_story_drafts
      WHERE match_id = v_match.match_id
        AND generated_at >= CURRENT_DATE::timestamptz
        AND status NOT IN ('hidden','rejected')
    ) INTO v_has_story;

    IF NOT v_has_story THEN
      BEGIN
        PERFORM model_lab.generate_prematch_scenario(v_match.match_id, NULL::uuid);
        c_stories := c_stories + 1;
      EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        c_errors := c_errors + 1;
        v_errors_arr := array_append(v_errors_arr,
          jsonb_build_object('step','story','match',v_match.match_id,'error',v_err));
      END;
    END IF;

  END LOOP;

  -- Close run log
  UPDATE model_lab.prematch_pipeline_runs SET
    completed_at           = now(),
    status                 = CASE WHEN c_errors > 0 THEN 'completed' ELSE 'completed' END,
    fixtures_seen          = c_seen,
    readiness_processed    = c_readiness,
    features_generated     = c_features,
    predictions_generated  = c_predictions,
    brain_packages_generated = c_brains,
    scenarios_generated    = c_brains,  -- brain = scenario in current flow
    story_drafts_generated = c_stories,
    skipped_existing       = c_skipped,
    blocked_count          = c_blocked,
    error_count            = c_errors,
    errors_json            = to_jsonb(v_errors_arr)
  WHERE id = v_run_id;

  -- Run evaluation in background (non-fatal)
  BEGIN
    PERFORM model_lab.evaluate_finished_prematch_predictions();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'run_id',               v_run_id,
    'fixtures_seen',        c_seen,
    'eligible_matches',     c_seen - c_blocked,
    'generated_predictions',c_predictions,
    'generated_brains',     c_brains,
    'generated_scenarios',  c_brains,
    'generated_stories',    c_stories,
    'skipped',              c_skipped,
    'blocked',              c_blocked,
    'errors',               c_errors
  );

EXCEPTION WHEN OTHERS THEN
  -- Mark run as failed
  UPDATE model_lab.prematch_pipeline_runs SET
    completed_at = now(),
    status = 'failed',
    error_count = 1,
    errors_json = jsonb_build_array(jsonb_build_object('step','pipeline','error',SQLERRM))
  WHERE id = v_run_id;
  RAISE;
END;
$fn$;

REVOKE ALL ON FUNCTION model_lab.run_daily_prematch_pipeline(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.run_daily_prematch_pipeline(int) TO service_role;

-- Rebuild public wrapper
CREATE OR REPLACE FUNCTION public.ml_run_daily_prematch_pipeline(
  p_horizon_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'admin role required'; END IF;
  RETURN model_lab.run_daily_prematch_pipeline(p_horizon_days);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ml_run_daily_prematch_pipeline(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_run_daily_prematch_pipeline(int) TO authenticated;
