/*
  # Update generate_prematch_scenario to use Master Brain output

  ## Changes
  Replaces the previous scenario generation with a Brain-integrated version.
  The scenario now reflects what each brain saw — no fake events, no fabricated
  player actions, no invented scorelines.

  The 9 narrative sections are now driven by:
  - Probability Brain: probability framing + ELO context
  - Draw Risk Brain: draw pressure narrative
  - Upset Risk Brain: fragility / favorite-dominance framing
  - Tempo Brain: attacking flow expectations
  - Late Pressure Brain: second-half dynamics framing
  - Calibration Brain: uncertainty context
  - Data Quality Brain: confidence qualifier + warnings

  If a brain package does not yet exist for the match, it is auto-generated first.
*/

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_scenario(
  p_match_id     uuid,
  p_triggered_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_draft_id        uuid;
  v_story_id        uuid;
  v_brain_pkg       jsonb;
  v_master          jsonb;
  v_sub             jsonb;

  v_competition     text;
  v_home_name       text;
  v_away_name       text;
  v_match_date      date;

  v_prob            jsonb;
  v_draw            jsonb;
  v_upset           jsonb;
  v_tempo           jsonb;
  v_late            jsonb;
  v_cal             jsonb;
  v_dq              jsonb;

  v_p_home          numeric;
  v_p_draw          numeric;
  v_p_away          numeric;
  v_elo_gap         numeric;
  v_scenario_tone   text;
  v_final_conf      text;
  v_publish_rec     text;
  v_warnings        jsonb;

  -- Narrative sections
  s_headline        text;
  s_match_context   text;
  s_probability_view text;
  s_draw_analysis   text;
  s_upset_risk      text;
  s_tempo_outlook   text;
  s_late_dynamics   text;
  s_calibration_note text;
  s_data_confidence text;

BEGIN
  -- ─────────────────────────────────────────────────────────
  -- Load match metadata
  -- ─────────────────────────────────────────────────────────
  SELECT c.name, ht.name, at2.name, m.match_date
  INTO v_competition, v_home_name, v_away_name, v_match_date
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  JOIN public.competitions c  ON c.id  = cs.competition_id
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  WHERE m.id = p_match_id;

  IF v_competition IS NULL THEN
    RAISE EXCEPTION 'match % not found', p_match_id;
  END IF;

  -- ─────────────────────────────────────────────────────────
  -- Ensure prediction draft exists
  -- ─────────────────────────────────────────────────────────
  SELECT id INTO v_draft_id
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    BEGIN
      PERFORM model_lab.generate_prematch_prediction(p_match_id, p_triggered_by);
      SELECT id INTO v_draft_id
      FROM model_lab.prematch_prediction_drafts
      WHERE match_id = p_match_id
      ORDER BY created_at DESC LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- ─────────────────────────────────────────────────────────
  -- Fetch or generate brain package
  -- ─────────────────────────────────────────────────────────
  v_brain_pkg := public.ml_get_latest_brain_package(p_match_id);

  IF v_brain_pkg IS NULL THEN
    v_brain_pkg := model_lab.generate_prematch_brain_package(p_match_id, p_triggered_by);
  END IF;

  v_master        := v_brain_pkg->'master_brain';
  v_sub           := v_brain_pkg->'sub_brains';
  v_prob          := v_sub->'probability';
  v_draw          := v_sub->'draw_risk';
  v_upset         := v_sub->'upset_risk';
  v_tempo         := v_sub->'tempo';
  v_late          := v_sub->'late_pressure';
  v_cal           := v_sub->'calibration';
  v_dq            := v_sub->'data_quality';

  v_p_home        := COALESCE((v_prob->>'p_home')::numeric, 0.40);
  v_p_draw        := COALESCE((v_prob->>'p_draw')::numeric, 0.28);
  v_p_away        := COALESCE((v_prob->>'p_away')::numeric, 0.32);
  v_elo_gap       := COALESCE((v_prob->>'elo_gap')::numeric, 0);
  v_scenario_tone := COALESCE(v_master->>'scenario_tone', 'balanced_tension');
  v_final_conf    := COALESCE(v_master->>'final_confidence', 'low');
  v_publish_rec   := COALESCE(v_master->>'publish_recommendation', 'review_required');
  v_warnings      := COALESCE(v_master->'warnings', '[]'::jsonb);

  -- ─────────────────────────────────────────────────────────
  -- SECTION 1: Headline
  -- ─────────────────────────────────────────────────────────
  s_headline := CASE v_scenario_tone
    WHEN 'favorite_control'  THEN format('%s vs %s — %s Expected to Control', v_home_name, v_away_name,
      CASE WHEN v_p_home > v_p_away THEN v_home_name ELSE v_away_name END)
    WHEN 'draw_pressure'     THEN format('%s vs %s — Expect a Tightly Contested Battle', v_home_name, v_away_name)
    WHEN 'upset_watch'       THEN format('%s vs %s — Upset Alert: Favorite Under Pressure', v_home_name, v_away_name)
    WHEN 'balanced_tension'  THEN format('%s vs %s — Two Sides in Close Contention', v_home_name, v_away_name)
    WHEN 'low_data_caution'  THEN format('%s vs %s — Limited Data: Low Confidence Analysis', v_home_name, v_away_name)
    ELSE format('%s vs %s', v_home_name, v_away_name)
  END;

  -- ─────────────────────────────────────────────────────────
  -- SECTION 2: Match context
  -- ─────────────────────────────────────────────────────────
  s_match_context := format(
    '%s fixture in %s. ELO ratings: %s at %.0f, %s at %.0f (gap: %s%s).',
    to_char(v_match_date, 'FMDay, DD Month YYYY'),
    v_competition,
    v_home_name, COALESCE((v_prob->>'elo_home')::numeric, 1500),
    v_away_name, COALESCE((v_prob->>'elo_away')::numeric, 1500),
    CASE WHEN v_elo_gap >= 0 THEN '+' ELSE '' END,
    round(v_elo_gap::numeric, 0)::text
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 3: Probability view
  -- ─────────────────────────────────────────────────────────
  s_probability_view := format(
    'The model assigns %s a %.0f%% probability of winning at home, with a draw at %.0f%% and %s winning away at %.0f%%. '
    || 'Overall prediction confidence is %s (score: %.2f).',
    v_home_name, v_p_home * 100,
    v_p_draw * 100,
    v_away_name, v_p_away * 100,
    v_final_conf,
    COALESCE((v_prob->>'confidence_score')::numeric, 0.35)
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 4: Draw analysis
  -- ─────────────────────────────────────────────────────────
  s_draw_analysis := format(
    'Draw risk classification: %s. %s League draw prior: %.0f%%. Model draw estimate: %.0f%% (gap: %s%s pp).',
    upper(COALESCE(v_draw->>'draw_risk_level', 'unknown')),
    COALESCE(v_draw->>'draw_pressure', ''),
    COALESCE((v_draw->>'league_draw_prior')::numeric, 0.25) * 100,
    COALESCE((v_draw->>'model_p_draw')::numeric, 0.28) * 100,
    CASE WHEN COALESCE((v_draw->>'draw_calibration_gap')::numeric, 0) >= 0 THEN '+' ELSE '' END,
    round(COALESCE((v_draw->>'draw_calibration_gap')::numeric, 0) * 100, 1)::text
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 5: Upset risk
  -- ─────────────────────────────────────────────────────────
  s_upset_risk := format(
    'Upset risk: %s fragility. Favorite (%s, %.0f%% win prob) faces %.0f%% underdog win probability. '
    || '%s',
    COALESCE(v_upset->>'favorite_fragility', 'unknown'),
    COALESCE(v_upset->>'favorite_side', 'home'),
    COALESCE((v_upset->>'favorite_win_probability')::numeric, 0.5) * 100,
    COALESCE((v_upset->>'upset_probability')::numeric, 0.3) * 100,
    COALESCE(v_upset->>'overconfidence_warning', '')
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 6: Tempo outlook
  -- ─────────────────────────────────────────────────────────
  s_tempo_outlook := format(
    'Expected match tempo: %s. %s '
    || 'Combined L5 goals/game: %.1f (home %.1f + away %.1f). '
    || 'Note: No specific game events are predicted.',
    upper(COALESCE(v_tempo->>'expected_tempo', 'balanced')),
    COALESCE(v_tempo->>'tempo_reason', ''),
    COALESCE((v_tempo->>'combined_l5_goals')::numeric, 2.7),
    COALESCE((v_tempo->>'home_l5_goals')::numeric, 1.5),
    COALESCE((v_tempo->>'away_l5_goals')::numeric, 1.2)
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 7: Late dynamics
  -- ─────────────────────────────────────────────────────────
  s_late_dynamics := format(
    'Late-match pressure index: %s. %s '
    || 'Closeness index: %.2f. Attack index: %.2f. '
    || 'Note: No minute-specific or score-specific predictions are made.',
    upper(COALESCE(v_late->>'late_goal_pressure', 'medium')),
    COALESCE(v_late->>'late_reason', ''),
    COALESCE((v_late->>'closeness_index')::numeric, 0.5),
    COALESCE((v_late->>'attack_index')::numeric, 1.0)
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 8: Calibration note
  -- ─────────────────────────────────────────────────────────
  s_calibration_note := format(
    'Calibration status for %s: %s (Brier L50=%.3f). Home correction: %s%.3f. '
    || 'Production candidate: %s.',
    v_competition,
    upper(COALESCE(v_cal->>'brier_status', 'unknown')),
    COALESCE((v_cal->>'rolling_brier_l50')::numeric, 0.25),
    CASE WHEN COALESCE((v_cal->>'home_correction')::numeric, 0) >= 0 THEN '+' ELSE '' END,
    COALESCE((v_cal->>'home_correction')::numeric, 0),
    COALESCE((v_cal->>'production_candidate')::boolean, false)::text
  );

  -- ─────────────────────────────────────────────────────────
  -- SECTION 9: Data confidence
  -- ─────────────────────────────────────────────────────────
  s_data_confidence := format(
    'Data quality: %s tier. ELO ready: %s. Features ready: %s. Lineup ready: %s. Calibration ready: %s. '
    || 'Publish recommendation: %s.%s',
    upper(COALESCE(v_dq->>'feature_quality_tier', 'unknown')),
    (v_dq->>'elo_ready'),
    (v_dq->>'feature_ready'),
    (v_dq->>'lineup_ready'),
    (v_dq->>'calibration_ready'),
    upper(v_publish_rec),
    CASE
      WHEN jsonb_array_length(v_warnings) > 0
      THEN ' Active warnings: ' || jsonb_array_length(v_warnings)::text || ' brain(s) flagged.'
      ELSE ' No active warnings.'
    END
  );

  -- ─────────────────────────────────────────────────────────
  -- Write to match_story_drafts
  -- ─────────────────────────────────────────────────────────
  INSERT INTO model_lab.match_story_drafts (
    match_id,
    prediction_draft_id,
    status,
    generated_by,
    headline,
    sections
  ) VALUES (
    p_match_id,
    v_draft_id,
    'pending_review',
    COALESCE(p_triggered_by, 'brain_orchestration_v1'),
    s_headline,
    jsonb_build_object(
      'match_context',     s_match_context,
      'probability_view',  s_probability_view,
      'draw_analysis',     s_draw_analysis,
      'upset_risk',        s_upset_risk,
      'tempo_outlook',     s_tempo_outlook,
      'late_dynamics',     s_late_dynamics,
      'calibration_note',  s_calibration_note,
      'data_confidence',   s_data_confidence,
      'brain_run_id',      v_brain_pkg->>'brain_run_id',
      'scenario_tone',     v_scenario_tone,
      'publish_recommendation', v_publish_rec
    )
  ) RETURNING id INTO v_story_id;

  -- Log job
  INSERT INTO model_lab.admin_generation_jobs (
    match_id, job_type, status, triggered_by,
    input_payload, output_payload
  ) VALUES (
    p_match_id, 'prematch_scenario', 'completed',
    p_triggered_by,
    jsonb_build_object('match_id', p_match_id, 'brain_integrated', true),
    jsonb_build_object('story_draft_id', v_story_id, 'brain_run_id', v_brain_pkg->>'brain_run_id', 'scenario_tone', v_scenario_tone)
  );

  RETURN v_story_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO model_lab.admin_generation_jobs (
    match_id, job_type, status, triggered_by, error_message
  ) VALUES (
    p_match_id, 'prematch_scenario', 'failed', p_triggered_by, SQLERRM
  );
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_scenario(uuid, text) TO service_role;

-- Update generate_full_prematch_package to include brain generation
CREATE OR REPLACE FUNCTION model_lab.generate_full_prematch_package(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_prediction_id uuid;
  v_brain_pkg     jsonb;
  v_story_id      uuid;
BEGIN
  -- Step 1: prediction
  PERFORM model_lab.generate_prematch_prediction(p_match_id, 'full_package');
  SELECT id INTO v_prediction_id
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY created_at DESC LIMIT 1;

  -- Step 2: brain package
  v_brain_pkg := model_lab.generate_prematch_brain_package(p_match_id, 'full_package');

  -- Step 3: scenario (uses brain package)
  v_story_id := model_lab.generate_prematch_scenario(p_match_id, 'full_package');

  RETURN jsonb_build_object(
    'prediction_draft_id', v_prediction_id,
    'brain_run_id',        v_brain_pkg->>'brain_run_id',
    'story_draft_id',      v_story_id,
    'master_brain',        v_brain_pkg->'master_brain'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_full_prematch_package(uuid) TO service_role;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.ml_generate_full_prematch_package(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  RETURN model_lab.generate_full_prematch_package(p_match_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_generate_full_prematch_package(uuid) TO authenticated;
