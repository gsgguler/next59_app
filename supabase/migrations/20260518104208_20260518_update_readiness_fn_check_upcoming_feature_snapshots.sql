
/*
  # Update assess_upcoming_match_readiness to check prematch_upcoming_feature_snapshots

  Previously feature_readiness was always false for upcoming 2025/26 fixtures because
  match_feature_matrix_v2 only contains completed matches.

  Now also checks prematch_upcoming_feature_snapshots — if that table has a row with
  has_form_features=true for the match, feature_readiness becomes true.
*/

CREATE OR REPLACE FUNCTION model_lab.assess_upcoming_match_readiness(
  p_match_id uuid
)
RETURNS model_lab.upcoming_match_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match          record;
  v_comp_name      text;
  v_home_name      text;
  v_away_name      text;
  v_season_label   text;
  v_kickoff_utc    timestamptz;

  v_elo_version    text := 'elo_v2_ha0_k20_global';
  v_staleness_days int  := 45;

  v_elo_home       numeric;
  v_elo_away       numeric;
  v_elo_home_date  date;
  v_elo_away_date  date;
  v_elo_ready      boolean := false;

  v_feat_ready     boolean := false;
  v_feat_tier      text    := 'elo_only';
  v_home_l5        int     := 0;
  v_away_l5        int     := 0;
  v_has_form       boolean := false;
  v_has_stats      boolean := false;

  v_cal_ready      boolean := false;
  v_cal_brier      numeric;

  v_lineup_avail   boolean := false;
  v_stats_avail    boolean := false;

  v_pred_ready     boolean := false;
  v_story_ready    boolean := false;
  v_pred_status    text;

  v_warnings       text[]  := '{}';
  v_blocking       text[]  := '{}';
  v_overall        text;
  v_result         model_lab.upcoming_match_readiness;
BEGIN
  -- Load match
  SELECT m.id, m.home_team_id, m.away_team_id, m.match_date,
         m.competition_season_id, m.status_short,
         to_timestamp(m.timestamp) AS kickoff_utc
  INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match % not found', p_match_id;
  END IF;

  -- Meta
  SELECT c.name, COALESCE(cs.football_data_uk_season_label, s.label, cs.id::text)
  INTO v_comp_name, v_season_label
  FROM public.competition_seasons cs
  JOIN public.competitions c ON c.id = cs.competition_id
  LEFT JOIN public.seasons s ON s.id = cs.season_id
  WHERE cs.id = v_match.competition_season_id;

  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;
  v_kickoff_utc := v_match.kickoff_utc;

  -- ── ELO readiness ───────────────────────────────────────────────────────────
  SELECT elo_overall, last_match_date INTO v_elo_home, v_elo_home_date
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.home_team_id
  ORDER BY last_match_date DESC NULLS LAST
  LIMIT 1;

  SELECT elo_overall, last_match_date INTO v_elo_away, v_elo_away_date
  FROM model_lab.team_elo_ratings
  WHERE team_id = v_match.away_team_id
  ORDER BY last_match_date DESC NULLS LAST
  LIMIT 1;

  IF v_elo_home IS NOT NULL AND v_elo_away IS NOT NULL THEN
    IF v_elo_home_date >= v_match.match_date - v_staleness_days
    OR v_elo_away_date >= v_match.match_date - v_staleness_days THEN
      v_elo_ready := true;
    ELSE
      v_warnings := array_append(v_warnings, 'ELO ratings stale (>' || v_staleness_days || ' days)');
      -- Still mark ready for promoted teams that played recently in lower division
      v_elo_ready := true;
    END IF;
  ELSE
    v_blocking := array_append(v_blocking, 'ELO ratings missing for one or both teams');
  END IF;

  -- ── Feature readiness ────────────────────────────────────────────────────────
  -- Check match_feature_matrix_v2 first (completed historical matches)
  SELECT
    COALESCE(has_form_features, false),
    COALESCE(has_stats_features, false),
    COALESCE(home_l5_matches_available, 0),
    COALESCE(away_l5_matches_available, 0),
    COALESCE(feature_quality_tier, 'elo_only')
  INTO v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC
  LIMIT 1;

  -- Fallback: prematch_upcoming_feature_snapshots (upcoming 2025/26 fixtures)
  IF NOT FOUND THEN
    SELECT
      COALESCE(has_form_features, false),
      COALESCE(home_has_stats_features OR away_has_stats_features, false),
      COALESCE(home_matches_l5, 0),
      COALESCE(away_matches_l5, 0),
      COALESCE(feature_quality_tier, 'elo_only')
    INTO v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
    FROM model_lab.prematch_upcoming_feature_snapshots
    WHERE match_id = p_match_id;
  END IF;

  IF v_has_form AND (v_home_l5 >= 3 OR v_away_l5 >= 3) THEN
    v_feat_ready := true;
  ELSIF v_home_l5 > 0 OR v_away_l5 > 0 THEN
    v_feat_ready := false;
    v_warnings := array_append(v_warnings,
      'partial form data (home_l5=' || v_home_l5 || ', away_l5=' || v_away_l5 || ')');
  ELSE
    v_warnings := array_append(v_warnings, 'no feature matrix row; elo_only tier');
  END IF;

  -- ── Calibration readiness ───────────────────────────────────────────────────
  SELECT rolling_brier_l50 INTO v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_cal_brier IS NOT NULL THEN
    v_cal_ready := true;
    IF v_cal_brier > 0.30 THEN
      v_warnings := array_append(v_warnings, 'calibration brier elevated (' || round(v_cal_brier,3) || ')');
    END IF;
  ELSE
    v_warnings := array_append(v_warnings, 'no calibration state for ' || COALESCE(v_comp_name, 'unknown'));
  END IF;

  -- ── Lineup availability (optional, non-blocking) ────────────────────────────
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM af.fixture_lineups fl
      JOIN af.af_fixture_mappings fm ON fm.af_fixture_id = fl.af_fixture_id
      WHERE fm.match_id = p_match_id AND fl.formation IS NOT NULL
      LIMIT 1
    ) INTO v_lineup_avail;
  EXCEPTION WHEN OTHERS THEN
    v_lineup_avail := false;
  END;

  -- ── Stats availability (non-blocking) ───────────────────────────────────────
  v_stats_avail := v_has_stats;

  -- ── Prediction / Story readiness ─────────────────────────────────────────────
  SELECT status INTO v_pred_status
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  v_pred_ready  := v_pred_status IS NOT NULL;
  v_story_ready := EXISTS (
    SELECT 1 FROM model_lab.match_story_drafts
    WHERE match_id = p_match_id
    ORDER BY generated_at DESC
    LIMIT 1
  );

  -- ── Overall status ──────────────────────────────────────────────────────────
  IF array_length(v_blocking, 1) > 0 THEN
    v_overall := 'blocked';
  ELSIF v_elo_ready AND v_feat_ready AND v_cal_ready THEN
    v_overall := 'ready';
  ELSE
    v_overall := 'partial';
  END IF;

  -- ── Upsert ──────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.upcoming_match_readiness (
    match_id, competition_name, season_label, match_date, kickoff_utc,
    home_team_name, away_team_name,
    elo_readiness, feature_readiness, calibration_readiness,
    lineup_availability, stats_availability,
    prediction_readiness, scenario_readiness,
    feature_quality_tier, elo_home, elo_away,
    home_l5_available, away_l5_available,
    calibration_brier_l50, prediction_status,
    warnings, overall_status, blocking_reasons,
    assessed_at
  )
  VALUES (
    p_match_id, v_comp_name, v_season_label, v_match.match_date, v_kickoff_utc,
    v_home_name, v_away_name,
    v_elo_ready, v_feat_ready, v_cal_ready,
    v_lineup_avail, v_stats_avail,
    v_pred_ready, v_story_ready,
    v_feat_tier, v_elo_home, v_elo_away,
    v_home_l5, v_away_l5,
    v_cal_brier, v_pred_status,
    v_warnings, v_overall, v_blocking,
    now()
  )
  ON CONFLICT (match_id) DO UPDATE SET
    competition_name       = EXCLUDED.competition_name,
    season_label           = EXCLUDED.season_label,
    match_date             = EXCLUDED.match_date,
    kickoff_utc            = EXCLUDED.kickoff_utc,
    home_team_name         = EXCLUDED.home_team_name,
    away_team_name         = EXCLUDED.away_team_name,
    elo_readiness          = EXCLUDED.elo_readiness,
    feature_readiness      = EXCLUDED.feature_readiness,
    calibration_readiness  = EXCLUDED.calibration_readiness,
    lineup_availability    = EXCLUDED.lineup_availability,
    stats_availability     = EXCLUDED.stats_availability,
    prediction_readiness   = EXCLUDED.prediction_readiness,
    scenario_readiness     = EXCLUDED.scenario_readiness,
    feature_quality_tier   = EXCLUDED.feature_quality_tier,
    elo_home               = EXCLUDED.elo_home,
    elo_away               = EXCLUDED.elo_away,
    home_l5_available      = EXCLUDED.home_l5_available,
    away_l5_available      = EXCLUDED.away_l5_available,
    calibration_brier_l50  = EXCLUDED.calibration_brier_l50,
    prediction_status      = EXCLUDED.prediction_status,
    warnings               = EXCLUDED.warnings,
    overall_status         = EXCLUDED.overall_status,
    blocking_reasons       = EXCLUDED.blocking_reasons,
    assessed_at            = EXCLUDED.assessed_at;

  SELECT * INTO v_result
  FROM model_lab.upcoming_match_readiness
  WHERE match_id = p_match_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.assess_upcoming_match_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION model_lab.assess_upcoming_match_readiness(uuid) TO service_role;
