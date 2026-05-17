
/*
  # Fix array append in assess_upcoming_match_readiness

  Replace v_warnings := v_warnings || 'string' with
  v_warnings := array_append(v_warnings, 'string') inside EXCEPTION handlers
  where the text || text operator is being resolved instead of text[] || text[].

  Root cause: inside EXCEPTION blocks, the planner sometimes can't infer
  that a bare string literal is text[] — using array_append() is unambiguous.
*/

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

  v_warnings      text[] := ARRAY[]::text[];
  v_blocking      text[] := ARRAY[]::text[];
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
    v_warnings := array_append(v_warnings, 'competition name could not be resolved');
  END IF;

  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;

  -- ELO READINESS
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
    v_blocking := array_append(v_blocking, 'ELO ratings missing for one or both teams');
  END IF;

  -- FEATURE READINESS
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
    v_warnings   := array_append(v_warnings, 'no feature matrix row found; elo_only fallback possible');
  ELSIF v_home_l5 < 3 OR v_away_l5 < 3 THEN
    v_warnings := array_append(v_warnings,
      format('thin form history: home_l5=%s away_l5=%s (min: 3)', v_home_l5, v_away_l5));
  END IF;

  -- CALIBRATION READINESS
  SELECT rolling_brier_l50
  INTO v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC
  LIMIT 1;

  v_cal_ready := FOUND AND v_cal_brier IS NOT NULL;
  IF NOT v_cal_ready THEN
    v_warnings := array_append(v_warnings,
      format('no calibration state for "%s"; draw prior fallback will apply', v_comp_name));
  END IF;

  -- LINEUP AVAILABILITY
  BEGIN
    IF v_match.api_football_fixture_id IS NOT NULL THEN
      PERFORM 1 FROM af.fixture_lineups
      WHERE api_fixture_id = v_match.api_football_fixture_id LIMIT 1;
      v_lineup_avail := FOUND;
    ELSE
      v_lineup_avail := false;
      v_warnings := array_append(v_warnings, 'no api_football_fixture_id; lineup check skipped');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_lineup_avail := false;
    v_warnings := array_append(v_warnings, 'af.fixture_lineups not accessible');
  END;

  -- STATS AVAILABILITY
  SELECT COALESCE(has_stats, false)
  INTO v_stats_avail
  FROM model_lab.prematch_feature_matrix_snapshot_v1
  WHERE match_id = p_match_id
  ORDER BY snapshot_created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN v_stats_avail := false; END IF;

  -- PREDICTION READINESS
  SELECT status INTO v_pred_status
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC LIMIT 1;
  v_pred_ready := FOUND;

  -- SCENARIO READINESS
  BEGIN
    PERFORM 1 FROM model_lab.match_story_drafts WHERE match_id = p_match_id LIMIT 1;
    v_scenario_rdy := FOUND;
  EXCEPTION WHEN OTHERS THEN
    v_scenario_rdy := false;
  END;

  -- OVERALL STATUS
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
