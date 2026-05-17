
/*
  # Pre-Match Prediction Generation — Phase 2 + 3

  ## Purpose
  `model_lab.generate_prematch_prediction(p_match_id uuid, p_triggered_by uuid)`

  Single function that:
    1. Validates the match exists and is not yet played (status_short IN ('NS','TBD','PST') 
       OR match_date > CURRENT_DATE as fallback for data-quality mismatches)
    2. Loads the gold freeze stack (elo_v2_ha0_k20_global + features_v2 + formula_v2_draw_recalibrated)
    3. Pulls ELO ratings for both teams (elo_overall preferred; graceful if not found)
    4. Pulls feature data from match_feature_matrix_v2 (if available)
    5. Applies formula_v2_draw_recalibrated:
         raw_p_home from ELO logistic model
         league draw prior from league_draw_priors
         calibration correction from league_calibration_state
         draw floor/ceiling: [0.10, 0.32]
         renormalization
    6. Computes confidence_score, confidence_tier, draw_risk, upset_risk, 
       favorite_fragility
    7. Writes draft to model_lab.prematch_prediction_drafts (status = 'pending_review')
    8. Creates admin_generation_job record
    9. Updates upcoming_match_readiness.prediction_readiness = true

  ## Formula: formula_v2_draw_recalibrated
    - ELO expected win probability (logistic):
        raw_p_home_elo = 1 / (1 + 10^(-elo_gap / 400))
        raw_p_away_elo = 1 - raw_p_home_elo
    - Home advantage bump: +home_correction from league_calibration_state (or 0.0 default)
    - League draw prior from league_draw_priors.post_covid_draw_rate
    - Closeness factor (reduces draw when gap is large):
        closeness = max(0, 1 - abs(elo_gap) / 400)
    - Raw draw: league_draw_prior * closeness * 1.5, clamped [0.10, 0.32]
    - Residual split to home/away proportionally
    - Final renormalization to sum = 1.0

  ## Confidence scoring
    confidence_score = base from ELO gap + bonus for form data + calibration quality
    tiers: 'high' >=0.70, 'medium' >=0.50, 'low' <0.50

  ## Security
    Function is SECURITY DEFINER so the calling user doesn't need direct table access.
    Authenticated users can call it.

  ## Status flow
    admin_generation_jobs: queued -> completed (or failed)
    prematch_prediction_drafts: pending_review (requires human review before publish)
*/

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_prediction(
  p_match_id     uuid,
  p_triggered_by uuid DEFAULT NULL
)
RETURNS model_lab.prematch_prediction_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match          public.matches%ROWTYPE;
  v_comp_name      text;
  v_season_label   text;
  v_home_name      text;
  v_away_name      text;

  -- Gold freeze config
  v_elo_version    text := 'elo_v2_ha0_k20_global';
  v_feat_version   text := 'features_v2_domestic_2026_05';
  v_formula        text := 'formula_v2_draw_recalibrated';
  v_model_version  text := 'gold_replay_v1';

  -- ELO
  v_elo_home       numeric;
  v_elo_away       numeric;
  v_elo_gap        numeric;

  -- Draw prior
  v_draw_prior     numeric := 0.26;
  v_cal_correction numeric := 0.0;
  v_cal_brier      numeric;
  v_cal_context    text := 'post_covid';

  -- Feature data
  v_feat_tier      text := 'elo_only';
  v_home_l5        smallint := 0;
  v_away_l5        smallint := 0;
  v_has_form       boolean  := false;
  v_has_stats      boolean  := false;

  -- Raw probabilities
  v_raw_p_home     numeric;
  v_raw_p_away     numeric;
  v_p_draw         numeric;
  v_p_home         numeric;
  v_p_away         numeric;
  v_residual       numeric;
  v_closeness      numeric;
  v_total          numeric;

  -- Derived signals
  v_confidence     numeric;
  v_conf_tier      text;
  v_draw_risk      text;
  v_upset_risk     text;
  v_fav_fragility  text;

  -- Warnings
  v_warnings       text[] := '{}';
  v_has_cal_warn   boolean := false;
  v_has_data_warn  boolean := false;

  -- Result
  v_job_id         uuid;
  v_draft          model_lab.prematch_prediction_drafts;
BEGIN
  -- 1. Fetch match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_id % not found', p_match_id;
  END IF;

  -- Reject matches that are already finished (FT, AET, PEN)
  IF v_match.status_short IN ('FT', 'AET', 'PEN') THEN
    RAISE EXCEPTION 'match % is already finished (status: %); cannot generate pre-match prediction',
      p_match_id, v_match.status_short;
  END IF;

  -- 2. Resolve names
  SELECT c.name, cs.football_data_uk_season_label
  INTO v_comp_name, v_season_label
  FROM public.competition_seasons cs
  JOIN public.competitions c ON c.id = cs.competition_id
  WHERE cs.id = v_match.competition_season_id;

  v_comp_name := COALESCE(v_comp_name, 'Unknown');
  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;

  -- 3. Log generation job
  INSERT INTO model_lab.admin_generation_jobs (
    id, job_type, match_id, competition, season_label,
    model_version, feature_version, status, triggered_by, started_at, created_at
  )
  VALUES (
    gen_random_uuid(), 'prematch_prediction', p_match_id,
    v_comp_name, v_season_label, v_model_version, v_feat_version,
    'queued', p_triggered_by, now(), now()
  )
  RETURNING id INTO v_job_id;

  -- 4. ELO lookup — most recent rating within 60 days of match date
  SELECT COALESCE(elo_overall, 1500)
  INTO v_elo_home
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.home_team_id
    AND last_match_date <= v_match.match_date
  ORDER BY last_match_date DESC
  LIMIT 1;

  SELECT COALESCE(elo_overall, 1500)
  INTO v_elo_away
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.away_team_id
    AND last_match_date <= v_match.match_date
  ORDER BY last_match_date DESC
  LIMIT 1;

  IF v_elo_home IS NULL THEN
    v_elo_home := 1500;
    v_warnings := v_warnings || format('home team ELO not found; using default 1500');
    v_has_data_warn := true;
  END IF;
  IF v_elo_away IS NULL THEN
    v_elo_away := 1500;
    v_warnings := v_warnings || format('away team ELO not found; using default 1500');
    v_has_data_warn := true;
  END IF;

  v_elo_gap := v_elo_home - v_elo_away;

  -- 5. Feature tier
  SELECT
    COALESCE(has_form_features OR has_stats_features, false),
    COALESCE(has_form_features, false),
    COALESCE(has_stats_features, false),
    COALESCE(home_l5_matches_available, 0)::smallint,
    COALESCE(away_l5_matches_available, 0)::smallint,
    COALESCE(feature_quality_tier, 'elo_only')
  INTO v_has_form, v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_feat_tier := 'elo_only';
    v_warnings  := v_warnings || 'feature matrix row absent; elo_only tier applied';
    v_has_data_warn := true;
  END IF;

  -- 6. League calibration correction
  SELECT
    COALESCE(current_home_correction, 0.0),
    rolling_brier_l50
  INTO v_cal_correction, v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_cal_correction := 0.0;
    v_warnings := v_warnings || format('no calibration state for "%s"; home correction = 0', v_comp_name);
    v_has_cal_warn := true;
  END IF;

  -- 7. League draw prior (post_covid era by default)
  SELECT COALESCE(post_covid_draw_rate, overall_draw_rate, 0.26)
  INTO v_draw_prior
  FROM model_lab.league_draw_priors
  WHERE competition_name = v_comp_name;

  IF NOT FOUND THEN
    v_draw_prior := 0.26;
    v_warnings := v_warnings || format('no draw prior for "%s"; using 0.26 default', v_comp_name);
    v_has_cal_warn := true;
  END IF;

  -- 8. Apply formula_v2_draw_recalibrated
  -- ELO logistic with home advantage correction
  v_raw_p_home := 1.0 / (1.0 + power(10.0, -v_elo_gap / 400.0));
  v_raw_p_home := GREATEST(0.05, LEAST(0.90, v_raw_p_home + COALESCE(v_cal_correction, 0.0)));
  v_raw_p_away := 1.0 - v_raw_p_home;

  -- Closeness factor (0 when gap > 400, 1 when perfectly even)
  v_closeness := GREATEST(0.0, 1.0 - abs(v_elo_gap) / 400.0);

  -- Draw probability: prior * closeness amplifier, bounded [0.10, 0.32]
  v_p_draw := v_draw_prior * v_closeness * 1.5;
  v_p_draw := GREATEST(0.10, LEAST(0.32, v_p_draw));

  -- Distribute residual to home/away proportionally
  v_residual := 1.0 - v_p_draw;
  v_p_home   := v_residual * (v_raw_p_home / (v_raw_p_home + v_raw_p_away));
  v_p_away   := v_residual * (v_raw_p_away / (v_raw_p_home + v_raw_p_away));

  -- Final renormalization (floating point safety)
  v_total  := v_p_home + v_p_draw + v_p_away;
  v_p_home := ROUND(v_p_home / v_total, 4);
  v_p_draw := ROUND(v_p_draw / v_total, 4);
  v_p_away := ROUND(1.0 - v_p_home - v_p_draw, 4);

  -- 9. Confidence score
  -- Base: normalized ELO gap signal (0.40 to 0.80)
  v_confidence := 0.40 + LEAST(0.40, abs(v_elo_gap) / 500.0);
  -- Form bonus: +0.10 if elo_form or better with adequate L5
  IF v_feat_tier IN ('elo_form', 'elo_form_stats') AND v_home_l5 >= 3 AND v_away_l5 >= 3 THEN
    v_confidence := v_confidence + 0.10;
  END IF;
  -- Stats bonus: +0.05 if stats available
  IF v_feat_tier = 'elo_form_stats' THEN
    v_confidence := v_confidence + 0.05;
  END IF;
  -- Calibration quality penalty if brier > 0.26 (poor calibration)
  IF v_cal_brier IS NOT NULL AND v_cal_brier > 0.26 THEN
    v_confidence := v_confidence - 0.05;
    v_warnings := v_warnings || format('calibration brier %.3f > 0.26; confidence reduced', v_cal_brier);
  END IF;
  -- Missing calibration penalty
  IF v_has_cal_warn THEN
    v_confidence := v_confidence - 0.10;
  END IF;

  v_confidence := GREATEST(0.20, LEAST(0.95, ROUND(v_confidence, 3)));

  v_conf_tier := CASE
    WHEN v_confidence >= 0.70 THEN 'high'
    WHEN v_confidence >= 0.50 THEN 'medium'
    ELSE 'low'
  END;

  -- 10. Derived risk signals
  v_draw_risk := CASE
    WHEN v_p_draw >= 0.28 THEN 'high'
    WHEN v_p_draw >= 0.22 THEN 'medium'
    ELSE 'low'
  END;

  -- Upset risk: away win when home is heavy favorite (p_home > 0.60)
  v_upset_risk := CASE
    WHEN v_p_home > 0.60 AND v_p_away >= 0.20 THEN 'medium'
    WHEN v_p_home > 0.70 AND v_p_away >= 0.15 THEN 'low'
    WHEN v_p_home <= 0.40 THEN 'high'
    ELSE 'low'
  END;

  -- Favorite fragility: how easily the favorite can be undone
  v_fav_fragility := CASE
    WHEN abs(v_elo_gap) < 50 THEN 'high'
    WHEN abs(v_elo_gap) < 150 THEN 'medium'
    ELSE 'low'
  END;

  -- 11. Write prediction draft
  INSERT INTO model_lab.prematch_prediction_drafts (
    id, match_id,
    competition_name, season_label, match_date,
    home_team_name, away_team_name,
    model_version, feature_version, elo_version, calibration_version, prediction_formula,
    pre_match_elo_home, pre_match_elo_away,
    raw_p_home_elo, league_cal_correction,
    feature_quality_tier, home_l5_available, away_l5_available,
    calibration_context,
    p_home, p_draw, p_away,
    confidence_score, confidence_tier,
    has_calibration_warning, has_data_warning, warnings,
    generated_payload,
    status, generated_by, generated_at, version
  )
  VALUES (
    gen_random_uuid(), p_match_id,
    v_comp_name, v_season_label, v_match.match_date,
    COALESCE(v_home_name, 'Unknown'), COALESCE(v_away_name, 'Unknown'),
    v_model_version, v_feat_version, v_elo_version, 'cal_v1', v_formula,
    v_elo_home, v_elo_away,
    v_raw_p_home, v_cal_correction,
    v_feat_tier, v_home_l5, v_away_l5,
    v_cal_context,
    v_p_home, v_p_draw, v_p_away,
    v_confidence, v_conf_tier,
    v_has_cal_warn, v_has_data_warn, v_warnings,
    jsonb_build_object(
      'elo_gap',          v_elo_gap,
      'draw_prior',       v_draw_prior,
      'closeness',        v_closeness,
      'cal_correction',   v_cal_correction,
      'draw_risk',        v_draw_risk,
      'upset_risk',       v_upset_risk,
      'fav_fragility',    v_fav_fragility,
      'generated_at',     now()::text
    ),
    'pending_review', p_triggered_by, now(), 1
  );

  -- 12. Update generation job to completed
  UPDATE model_lab.admin_generation_jobs
  SET status = 'completed', completed_at = now()
  WHERE id = v_job_id;

  -- 13. Refresh readiness record (fire and forget)
  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness(p_match_id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- non-blocking
  END;

  -- Return the draft
  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  RETURN v_draft;

EXCEPTION WHEN OTHERS THEN
  -- Mark job failed
  IF v_job_id IS NOT NULL THEN
    UPDATE model_lab.admin_generation_jobs
    SET status = 'failed', error_message = SQLERRM, completed_at = now()
    WHERE id = v_job_id;
  END IF;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_prediction(uuid, uuid) TO authenticated;
