
/*
  # Fix ELO column references in assessment and prediction functions

  ## Problem
  assess_upcoming_match_readiness and generate_prematch_prediction used
  `current_elo`, `elo_version`, and `rated_through` which do not exist on
  model_lab.team_elo_ratings.

  ## Correct schema
  model_lab.team_elo_ratings columns: team_id, competition_id, season_label,
  elo_overall, elo_home, elo_away, last_match_date, matches_played

  ELO readiness check: look up most recent team_elo_ratings row for the team
  via last_match_date within 60 days of the match.

  model_lab.team_elo_snapshots columns: match_id, competition_id, competition_name,
  season_label, match_date, home_team_id, away_team_id, pre_match_elo_home,
  pre_match_elo_away (per-match ELO snapshot).

  For prediction generation: use team_elo_snapshots (pre_match ELO) when available,
  fall back to team_elo_ratings (season aggregate).
*/

-- === Fix assess_upcoming_match_readiness ===

CREATE OR REPLACE FUNCTION model_lab.assess_upcoming_match_readiness(p_match_id uuid)
RETURNS model_lab.upcoming_match_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match         public.matches%ROWTYPE;
  v_comp_name     text;
  v_season_label  text;
  v_home_name     text;
  v_away_name     text;

  v_elo_ready     boolean := false;
  v_feat_ready    boolean := false;
  v_cal_ready     boolean := false;
  v_lineup_avail  boolean := false;
  v_stats_avail   boolean := false;
  v_pred_ready    boolean := false;
  v_scenario_rdy  boolean := false;

  v_feat_tier     text;
  v_elo_home      numeric;
  v_elo_away      numeric;
  v_home_l5       smallint := 0;
  v_away_l5       smallint := 0;
  v_cal_brier     numeric;
  v_pred_status   text;

  v_warnings      text[] := '{}';
  v_blocking      text[] := '{}';
  v_status        text;
  v_result        model_lab.upcoming_match_readiness;

  v_home_elo_cnt  int;
  v_away_elo_cnt  int;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_id % not found in public.matches', p_match_id;
  END IF;

  SELECT c.name, cs.football_data_uk_season_label
  INTO v_comp_name, v_season_label
  FROM public.competition_seasons cs
  JOIN public.competitions c ON c.id = cs.competition_id
  WHERE cs.id = v_match.competition_season_id;

  v_comp_name := COALESCE(v_comp_name, 'Unknown');
  IF v_comp_name = 'Unknown' THEN
    v_warnings := v_warnings || 'competition name could not be resolved';
  END IF;

  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;

  -- === ELO READINESS ===
  -- Use team_elo_ratings: most recent row per team within 60 days of match
  SELECT COUNT(*), MAX(elo_overall)
  INTO v_home_elo_cnt, v_elo_home
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.home_team_id
    AND last_match_date >= v_match.match_date - INTERVAL '60 days'
    AND last_match_date <= v_match.match_date;

  SELECT COUNT(*), MAX(elo_overall)
  INTO v_away_elo_cnt, v_elo_away
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.away_team_id
    AND last_match_date >= v_match.match_date - INTERVAL '60 days'
    AND last_match_date <= v_match.match_date;

  -- Fallback: any row for the team regardless of date
  IF v_home_elo_cnt = 0 THEN
    SELECT COUNT(*), MAX(elo_overall) INTO v_home_elo_cnt, v_elo_home
    FROM model_lab.team_elo_ratings WHERE team_id = v_match.home_team_id;
  END IF;
  IF v_away_elo_cnt = 0 THEN
    SELECT COUNT(*), MAX(elo_overall) INTO v_away_elo_cnt, v_elo_away
    FROM model_lab.team_elo_ratings WHERE team_id = v_match.away_team_id;
  END IF;

  v_elo_ready := (v_home_elo_cnt > 0 AND v_away_elo_cnt > 0);
  IF NOT v_elo_ready THEN
    v_blocking := v_blocking || 'ELO ratings missing for one or both teams';
  END IF;

  -- === FEATURE READINESS ===
  SELECT
    COALESCE(has_form_features OR has_stats_features, false),
    CASE
      WHEN has_stats_features THEN 'elo_form_stats'
      WHEN has_form_features  THEN 'elo_form'
      ELSE 'elo_only'
    END,
    COALESCE(home_l5_matches_available, 0)::smallint,
    COALESCE(away_l5_matches_available, 0)::smallint
  INTO v_feat_ready, v_feat_tier, v_home_l5, v_away_l5
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_feat_ready := false;
    v_feat_tier  := null;
    v_warnings   := v_warnings || 'no feature matrix row found; elo_only fallback possible';
  ELSIF v_home_l5 < 3 OR v_away_l5 < 3 THEN
    v_warnings := v_warnings || format(
      'thin form history: home_l5=%s away_l5=%s (min recommended: 3)',
      v_home_l5, v_away_l5
    );
  END IF;

  -- === CALIBRATION READINESS ===
  SELECT rolling_brier_l50
  INTO v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC
  LIMIT 1;

  v_cal_ready := FOUND AND v_cal_brier IS NOT NULL;
  IF NOT v_cal_ready THEN
    v_warnings := v_warnings || format(
      'no calibration state for "%s"; league draw prior fallback will apply',
      v_comp_name
    );
  END IF;

  -- === LINEUP AVAILABILITY ===
  BEGIN
    IF v_match.api_football_fixture_id IS NOT NULL THEN
      PERFORM 1
      FROM af.fixture_lineups
      WHERE api_fixture_id = v_match.api_football_fixture_id
      LIMIT 1;
      v_lineup_avail := FOUND;
    ELSE
      v_lineup_avail := false;
      v_warnings := v_warnings || 'no api_football_fixture_id; lineup check skipped';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_lineup_avail := false;
    v_warnings := v_warnings || 'af.fixture_lineups not accessible; lineup status unknown';
  END;

  -- === STATS AVAILABILITY ===
  SELECT COALESCE(has_stats, false)
  INTO v_stats_avail
  FROM model_lab.prematch_feature_matrix_snapshot_v1
  WHERE match_id = p_match_id
  ORDER BY snapshot_created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN v_stats_avail := false; END IF;

  -- === PREDICTION READINESS ===
  SELECT status INTO v_pred_status
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  v_pred_ready := FOUND;

  -- === SCENARIO READINESS ===
  BEGIN
    PERFORM 1 FROM model_lab.match_story_drafts WHERE match_id = p_match_id LIMIT 1;
    v_scenario_rdy := FOUND;
  EXCEPTION WHEN OTHERS THEN
    v_scenario_rdy := false;
  END;

  -- === OVERALL STATUS ===
  IF v_elo_ready AND v_feat_ready AND v_cal_ready THEN
    v_status := 'ready';
  ELSIF v_elo_ready AND (v_feat_ready OR v_cal_ready) THEN
    v_status := 'partial';
  ELSE
    v_status := 'blocked';
  END IF;

  INSERT INTO model_lab.upcoming_match_readiness (
    match_id, competition_name, season_label, match_date, kickoff_utc,
    home_team_name, away_team_name,
    elo_readiness, feature_readiness, calibration_readiness,
    lineup_availability, stats_availability, prediction_readiness, scenario_readiness,
    feature_quality_tier, elo_home, elo_away,
    home_l5_available, away_l5_available,
    calibration_brier_l50, prediction_status,
    warnings, overall_status, blocking_reasons,
    assessed_at, assessment_version
  )
  VALUES (
    p_match_id, v_comp_name, v_season_label, v_match.match_date,
    CASE WHEN v_match.timestamp IS NOT NULL THEN to_timestamp(v_match.timestamp) ELSE NULL END,
    COALESCE(v_home_name, 'Unknown'), COALESCE(v_away_name, 'Unknown'),
    v_elo_ready, v_feat_ready, v_cal_ready,
    v_lineup_avail, v_stats_avail, v_pred_ready, v_scenario_rdy,
    v_feat_tier, v_elo_home, v_elo_away,
    v_home_l5, v_away_l5,
    v_cal_brier, v_pred_status,
    v_warnings, v_status, v_blocking,
    now(), 'v1'
  )
  ON CONFLICT (match_id) DO UPDATE SET
    competition_name        = EXCLUDED.competition_name,
    season_label            = EXCLUDED.season_label,
    match_date              = EXCLUDED.match_date,
    kickoff_utc             = EXCLUDED.kickoff_utc,
    home_team_name          = EXCLUDED.home_team_name,
    away_team_name          = EXCLUDED.away_team_name,
    elo_readiness           = EXCLUDED.elo_readiness,
    feature_readiness       = EXCLUDED.feature_readiness,
    calibration_readiness   = EXCLUDED.calibration_readiness,
    lineup_availability     = EXCLUDED.lineup_availability,
    stats_availability      = EXCLUDED.stats_availability,
    prediction_readiness    = EXCLUDED.prediction_readiness,
    scenario_readiness      = EXCLUDED.scenario_readiness,
    feature_quality_tier    = EXCLUDED.feature_quality_tier,
    elo_home                = EXCLUDED.elo_home,
    elo_away                = EXCLUDED.elo_away,
    home_l5_available       = EXCLUDED.home_l5_available,
    away_l5_available       = EXCLUDED.away_l5_available,
    calibration_brier_l50   = EXCLUDED.calibration_brier_l50,
    prediction_status       = EXCLUDED.prediction_status,
    warnings                = EXCLUDED.warnings,
    overall_status          = EXCLUDED.overall_status,
    blocking_reasons        = EXCLUDED.blocking_reasons,
    assessed_at             = EXCLUDED.assessed_at,
    assessment_version      = EXCLUDED.assessment_version;

  SELECT * INTO v_result FROM model_lab.upcoming_match_readiness WHERE match_id = p_match_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.assess_upcoming_match_readiness(uuid) TO authenticated;


-- === Fix generate_prematch_prediction ===
-- Use team_elo_snapshots (pre_match_elo_home/away) first, then team_elo_ratings fallback

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

  v_elo_version    text := 'elo_v2_ha0_k20_global';
  v_feat_version   text := 'features_v2_domestic_2026_05';
  v_formula        text := 'formula_v2_draw_recalibrated';
  v_model_version  text := 'gold_replay_v1';

  v_elo_home       numeric;
  v_elo_away       numeric;
  v_elo_gap        numeric;

  v_draw_prior     numeric := 0.26;
  v_cal_correction numeric := 0.0;
  v_cal_brier      numeric;
  v_cal_context    text := 'post_covid';

  v_feat_tier      text := 'elo_only';
  v_home_l5        smallint := 0;
  v_away_l5        smallint := 0;
  v_has_form       boolean  := false;
  v_has_stats      boolean  := false;

  v_raw_p_home     numeric;
  v_raw_p_away     numeric;
  v_p_draw         numeric;
  v_p_home         numeric;
  v_p_away         numeric;
  v_residual       numeric;
  v_closeness      numeric;
  v_total          numeric;

  v_confidence     numeric;
  v_conf_tier      text;
  v_draw_risk      text;
  v_upset_risk     text;
  v_fav_fragility  text;

  v_warnings       text[] := '{}';
  v_has_cal_warn   boolean := false;
  v_has_data_warn  boolean := false;

  v_job_id         uuid;
  v_draft          model_lab.prematch_prediction_drafts;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_id % not found', p_match_id; END IF;

  IF v_match.status_short IN ('FT', 'AET', 'PEN') THEN
    RAISE EXCEPTION 'match % is already finished (status: %)', p_match_id, v_match.status_short;
  END IF;

  SELECT c.name, cs.football_data_uk_season_label
  INTO v_comp_name, v_season_label
  FROM public.competition_seasons cs
  JOIN public.competitions c ON c.id = cs.competition_id
  WHERE cs.id = v_match.competition_season_id;

  v_comp_name := COALESCE(v_comp_name, 'Unknown');
  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;

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

  -- ELO: try team_elo_snapshots (most recent pre_match ELO for this team)
  SELECT pre_match_elo_home INTO v_elo_home
  FROM model_lab.team_elo_snapshots
  WHERE home_team_id = v_match.home_team_id
    AND match_date <= v_match.match_date
  ORDER BY match_date DESC
  LIMIT 1;

  SELECT pre_match_elo_away INTO v_elo_away
  FROM model_lab.team_elo_snapshots
  WHERE away_team_id = v_match.away_team_id
    AND match_date <= v_match.match_date
  ORDER BY match_date DESC
  LIMIT 1;

  -- Fallback: team_elo_ratings aggregate
  IF v_elo_home IS NULL THEN
    SELECT elo_overall INTO v_elo_home
    FROM model_lab.team_elo_ratings
    WHERE team_id = v_match.home_team_id
    ORDER BY last_match_date DESC
    LIMIT 1;
  END IF;
  IF v_elo_away IS NULL THEN
    SELECT elo_overall INTO v_elo_away
    FROM model_lab.team_elo_ratings
    WHERE team_id = v_match.away_team_id
    ORDER BY last_match_date DESC
    LIMIT 1;
  END IF;

  IF v_elo_home IS NULL THEN
    v_elo_home := 1500;
    v_warnings := v_warnings || 'home ELO not found; using 1500 default';
    v_has_data_warn := true;
  END IF;
  IF v_elo_away IS NULL THEN
    v_elo_away := 1500;
    v_warnings := v_warnings || 'away ELO not found; using 1500 default';
    v_has_data_warn := true;
  END IF;

  v_elo_gap := v_elo_home - v_elo_away;

  -- Feature tier
  SELECT
    COALESCE(has_form_features, false),
    COALESCE(has_stats_features, false),
    COALESCE(home_l5_matches_available, 0)::smallint,
    COALESCE(away_l5_matches_available, 0)::smallint,
    COALESCE(feature_quality_tier, 'elo_only')
  INTO v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_feat_tier     := 'elo_only';
    v_warnings      := v_warnings || 'feature matrix row absent; elo_only tier applied';
    v_has_data_warn := true;
  END IF;

  -- Calibration correction
  SELECT COALESCE(current_home_correction, 0.0), rolling_brier_l50
  INTO v_cal_correction, v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_cal_correction := 0.0;
    v_warnings := v_warnings || format('no calibration state for "%s"; correction=0', v_comp_name);
    v_has_cal_warn := true;
  END IF;

  -- Draw prior
  SELECT COALESCE(post_covid_draw_rate, overall_draw_rate, 0.26)
  INTO v_draw_prior
  FROM model_lab.league_draw_priors
  WHERE competition_name = v_comp_name;

  IF NOT FOUND THEN
    v_draw_prior := 0.26;
    v_warnings := v_warnings || format('no draw prior for "%s"; using 0.26', v_comp_name);
    v_has_cal_warn := true;
  END IF;

  -- Formula v2_draw_recalibrated
  v_raw_p_home := GREATEST(0.05, LEAST(0.90,
    1.0 / (1.0 + power(10.0, -v_elo_gap / 400.0)) + COALESCE(v_cal_correction, 0.0)
  ));
  v_raw_p_away := 1.0 - v_raw_p_home;

  v_closeness  := GREATEST(0.0, 1.0 - abs(v_elo_gap) / 400.0);
  v_p_draw     := GREATEST(0.10, LEAST(0.32, v_draw_prior * v_closeness * 1.5));
  v_residual   := 1.0 - v_p_draw;
  v_p_home     := v_residual * (v_raw_p_home / (v_raw_p_home + v_raw_p_away));
  v_p_away     := v_residual * (v_raw_p_away / (v_raw_p_home + v_raw_p_away));

  v_total  := v_p_home + v_p_draw + v_p_away;
  v_p_home := ROUND(v_p_home / v_total, 4);
  v_p_draw := ROUND(v_p_draw / v_total, 4);
  v_p_away := ROUND(1.0 - v_p_home - v_p_draw, 4);

  -- Confidence
  v_confidence := 0.40 + LEAST(0.40, abs(v_elo_gap) / 500.0);
  IF v_feat_tier IN ('elo_form', 'elo_form_stats') AND v_home_l5 >= 3 AND v_away_l5 >= 3 THEN
    v_confidence := v_confidence + 0.10;
  END IF;
  IF v_feat_tier = 'elo_form_stats' THEN v_confidence := v_confidence + 0.05; END IF;
  IF v_cal_brier IS NOT NULL AND v_cal_brier > 0.26 THEN
    v_confidence := v_confidence - 0.05;
    v_warnings := v_warnings || format('brier %.3f > 0.26; confidence reduced', v_cal_brier);
  END IF;
  IF v_has_cal_warn THEN v_confidence := v_confidence - 0.10; END IF;
  v_confidence := GREATEST(0.20, LEAST(0.95, ROUND(v_confidence, 3)));

  v_conf_tier := CASE
    WHEN v_confidence >= 0.70 THEN 'high'
    WHEN v_confidence >= 0.50 THEN 'medium'
    ELSE 'low'
  END;

  v_draw_risk := CASE
    WHEN v_p_draw >= 0.28 THEN 'high'
    WHEN v_p_draw >= 0.22 THEN 'medium'
    ELSE 'low'
  END;
  v_upset_risk := CASE
    WHEN v_p_home > 0.60 AND v_p_away >= 0.20 THEN 'medium'
    WHEN v_p_home <= 0.40 THEN 'high'
    ELSE 'low'
  END;
  v_fav_fragility := CASE
    WHEN abs(v_elo_gap) < 50  THEN 'high'
    WHEN abs(v_elo_gap) < 150 THEN 'medium'
    ELSE 'low'
  END;

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
      'elo_gap',        v_elo_gap,
      'draw_prior',     v_draw_prior,
      'closeness',      v_closeness,
      'cal_correction', v_cal_correction,
      'draw_risk',      v_draw_risk,
      'upset_risk',     v_upset_risk,
      'fav_fragility',  v_fav_fragility,
      'generated_at',   now()::text
    ),
    'pending_review', p_triggered_by, now(), 1
  );

  UPDATE model_lab.admin_generation_jobs
  SET status = 'completed', completed_at = now()
  WHERE id = v_job_id;

  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness(p_match_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  RETURN v_draft;

EXCEPTION WHEN OTHERS THEN
  IF v_job_id IS NOT NULL THEN
    UPDATE model_lab.admin_generation_jobs
    SET status = 'failed', error_message = SQLERRM, completed_at = now()
    WHERE id = v_job_id;
  END IF;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_prediction(uuid, uuid) TO authenticated;
