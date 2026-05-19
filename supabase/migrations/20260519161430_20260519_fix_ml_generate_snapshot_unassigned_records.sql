/*
  # Fix ml_generate_upcoming_feature_snapshot — guard unassigned records

  ## Problem
  When standings/team_stats/venue are not found, the SELECT INTO leaves the record
  variable uninitialized. Accessing fields on an uninitialized record raises error 55000.

  ## Fix
  Replace record variables for standings, team_stats, and venue with explicit scalar
  variables. Each field is fetched directly into a typed scalar, defaulting to NULL.
*/

CREATE OR REPLACE FUNCTION model_lab.ml_generate_upcoming_feature_snapshot(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public', 'pg_temp'
AS $$
DECLARE
v_match              record;
v_elo_home           numeric;
v_elo_away           numeric;
v_feat_version       text := 'features_v2_domestic_2026_05';

-- Rolling home
v_home_l5            record;
v_home_l10           record;
v_home_l20           record;

-- Rolling away
v_away_l5            record;
v_away_l10           record;
v_away_l20           record;

-- AF enrichment IDs
v_af_home_team_id    integer;
v_af_away_team_id    integer;
v_af_league_id       integer;
v_af_season          integer;
v_af_fixture_id      integer;

-- Injury counts
v_inj_home           integer := 0;
v_inj_away           integer := 0;

-- Feature quality
v_has_form           boolean := false;
v_has_standings      boolean := false;
v_has_injuries       boolean := false;
v_has_team_stats     boolean := false;
v_has_venue          boolean := false;
v_quality_tier       text := 'elo_only';

-- Standings scalars
v_st_rank_home       integer;
v_st_rank_away       integer;
v_st_points_home     integer;
v_st_points_away     integer;
v_st_gd_home         integer;
v_st_gd_away         integer;
v_st_form_home       text;
v_st_form_away       text;
v_st_desc_home       text;
v_st_desc_away       text;

-- Team stats scalars
v_ts_goals_for_home        numeric;
v_ts_goals_for_away        numeric;
v_ts_goals_ag_home         numeric;
v_ts_goals_ag_away         numeric;
v_ts_cs_rate_home          numeric;
v_ts_cs_rate_away          numeric;
v_ts_fts_rate_home         numeric;
v_ts_fts_rate_away         numeric;
v_ts_att_base_home         numeric;
v_ts_att_base_away         numeric;
v_ts_def_base_home         numeric;
v_ts_def_base_away         numeric;

-- Venue scalars
v_venue_id           integer;
v_venue_name         text;
v_venue_city         text;
v_venue_capacity     integer;
v_venue_surface      text;
v_venue_altitude     numeric;
v_venue_warning      text;

v_snapshot           jsonb;
BEGIN
-- 1. Load match
SELECT
  m.*,
  comp.name   AS competition_name,
  s.label     AS season_label,
  ht.name     AS home_team_name,
  at.name     AS away_team_name,
  ht.id       AS home_team_uuid,
  at.id       AS away_team_uuid
INTO v_match
FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.competitions comp ON comp.id = cs.competition_id
JOIN public.seasons s ON s.id = cs.season_id
JOIN public.teams ht ON ht.id = m.home_team_id
JOIN public.teams at ON at.id = m.away_team_id
WHERE m.id = p_match_id;

IF NOT FOUND THEN
  RETURN jsonb_build_object('error', 'match_not_found', 'match_id', p_match_id);
END IF;

-- 2. ELO
SELECT elo_overall INTO v_elo_home
FROM model_lab.team_elo_ratings
WHERE team_id = v_match.home_team_uuid
ORDER BY last_match_date DESC NULLS LAST LIMIT 1;

SELECT elo_overall INTO v_elo_away
FROM model_lab.team_elo_ratings
WHERE team_id = v_match.away_team_uuid
ORDER BY last_match_date DESC NULLS LAST LIMIT 1;

-- 3. Rolling form L5 home
SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.home_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.home_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid
       THEN COALESCE(m.home_score_ft,0)-COALESCE(m.away_score_ft,0)
       ELSE COALESCE(m.away_score_ft,0)-COALESCE(m.home_score_ft,0) END) AS goal_diff_avg,
  SUM(CASE WHEN (m.home_team_id=v_match.home_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.home_team_uuid AND m.result='A') THEN 1 ELSE 0 END)::numeric
    /NULLIF(COUNT(*),0) AS win_rate,
  SUM(CASE WHEN m.result='D' THEN 1 ELSE 0 END)::numeric/NULLIF(COUNT(*),0) AS draw_rate,
  SUM(CASE WHEN (m.home_team_id=v_match.home_team_uuid AND m.result='A')
            OR (m.away_team_id=v_match.home_team_uuid AND m.result='H') THEN 1 ELSE 0 END)::numeric
    /NULLIF(COUNT(*),0) AS loss_rate
INTO v_home_l5
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.home_team_uuid OR m2.away_team_id=v_match.home_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 5) m;

SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.home_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.home_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg
INTO v_home_l10
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.home_team_uuid OR m2.away_team_id=v_match.home_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 10) m;

SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.home_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.home_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.home_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg
INTO v_home_l20
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.home_team_uuid OR m2.away_team_id=v_match.home_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 20) m;

SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.away_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.away_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid
       THEN COALESCE(m.home_score_ft,0)-COALESCE(m.away_score_ft,0)
       ELSE COALESCE(m.away_score_ft,0)-COALESCE(m.home_score_ft,0) END) AS goal_diff_avg,
  SUM(CASE WHEN (m.home_team_id=v_match.away_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.away_team_uuid AND m.result='A') THEN 1 ELSE 0 END)::numeric
    /NULLIF(COUNT(*),0) AS win_rate,
  SUM(CASE WHEN m.result='D' THEN 1 ELSE 0 END)::numeric/NULLIF(COUNT(*),0) AS draw_rate,
  SUM(CASE WHEN (m.home_team_id=v_match.away_team_uuid AND m.result='A')
            OR (m.away_team_id=v_match.away_team_uuid AND m.result='H') THEN 1 ELSE 0 END)::numeric
    /NULLIF(COUNT(*),0) AS loss_rate
INTO v_away_l5
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.away_team_uuid OR m2.away_team_id=v_match.away_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 5) m;

SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.away_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.away_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg
INTO v_away_l10
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.away_team_uuid OR m2.away_team_id=v_match.away_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 10) m;

SELECT COUNT(*) AS n_matches,
  SUM(CASE WHEN (m.home_team_id=v_match.away_team_uuid AND m.result='H')
            OR (m.away_team_id=v_match.away_team_uuid AND m.result='A') THEN 3
           WHEN m.result='D' THEN 1 ELSE 0 END) AS form_points,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.home_score_ft,0)
           ELSE COALESCE(m.away_score_ft,0) END) AS goals_for_avg,
  AVG(CASE WHEN m.home_team_id=v_match.away_team_uuid THEN COALESCE(m.away_score_ft,0)
           ELSE COALESCE(m.home_score_ft,0) END) AS goals_against_avg
INTO v_away_l20
FROM (SELECT * FROM public.matches m2
  WHERE (m2.home_team_id=v_match.away_team_uuid OR m2.away_team_id=v_match.away_team_uuid)
    AND m2.result IS NOT NULL
    AND to_timestamp(m2.timestamp)<to_timestamp(v_match.timestamp)
    AND m2.id!=p_match_id
  ORDER BY m2.timestamp DESC LIMIT 20) m;

-- Form quality tier
v_has_form := COALESCE(v_home_l5.n_matches, 0) >= 3 OR COALESCE(v_away_l5.n_matches, 0) >= 3;
IF v_has_form THEN v_quality_tier := 'elo_form'; END IF;

-- AF IDs
SELECT afm.af_fixture_id INTO v_af_fixture_id
FROM public.af_fixture_mappings afm WHERE afm.match_id = p_match_id LIMIT 1;

IF v_af_fixture_id IS NOT NULL THEN
  SELECT league_id, season INTO v_af_league_id, v_af_season
  FROM shared.af_fixtures_raw WHERE fixture_id = v_af_fixture_id LIMIT 1;

  SELECT (raw_response->'teams'->'home'->>'id')::integer,
         (raw_response->'teams'->'away'->>'id')::integer
  INTO v_af_home_team_id, v_af_away_team_id
  FROM shared.af_fixtures_raw WHERE fixture_id = v_af_fixture_id LIMIT 1;
END IF;

-- Standings — scalar fetch
IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
  SELECT rank, points, goal_difference, form_string, description
  INTO v_st_rank_home, v_st_points_home, v_st_gd_home, v_st_form_home, v_st_desc_home
  FROM public.af_standings_normalized
  WHERE af_league_id=v_af_league_id AND af_season=v_af_season AND af_team_id=v_af_home_team_id LIMIT 1;

  SELECT rank, points, goal_difference, form_string, description
  INTO v_st_rank_away, v_st_points_away, v_st_gd_away, v_st_form_away, v_st_desc_away
  FROM public.af_standings_normalized
  WHERE af_league_id=v_af_league_id AND af_season=v_af_season AND af_team_id=v_af_away_team_id LIMIT 1;

  v_has_standings := v_st_rank_home IS NOT NULL AND v_st_rank_away IS NOT NULL;
END IF;

-- Team statistics — scalar fetch
IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
  SELECT goals_for_avg, goals_against_avg, clean_sheet_rate, failed_to_score_rate,
         goals_for_home_avg, goals_against_home_avg
  INTO v_ts_goals_for_home, v_ts_goals_ag_home, v_ts_cs_rate_home, v_ts_fts_rate_home,
       v_ts_att_base_home, v_ts_def_base_home
  FROM public.af_team_statistics_normalized
  WHERE af_league_id=v_af_league_id AND af_season=v_af_season AND af_team_id=v_af_home_team_id LIMIT 1;

  SELECT goals_for_avg, goals_against_avg, clean_sheet_rate, failed_to_score_rate,
         goals_for_away_avg, goals_against_away_avg
  INTO v_ts_goals_for_away, v_ts_goals_ag_away, v_ts_cs_rate_away, v_ts_fts_rate_away,
       v_ts_att_base_away, v_ts_def_base_away
  FROM public.af_team_statistics_normalized
  WHERE af_league_id=v_af_league_id AND af_season=v_af_season AND af_team_id=v_af_away_team_id LIMIT 1;

  v_has_team_stats := v_ts_goals_for_home IS NOT NULL AND v_ts_goals_for_away IS NOT NULL;
END IF;

-- Injuries
IF v_af_fixture_id IS NOT NULL THEN
  SELECT COUNT(*) INTO v_inj_home FROM public.af_injuries_normalized
  WHERE af_fixture_id=v_af_fixture_id AND af_team_id=v_af_home_team_id;
  SELECT COUNT(*) INTO v_inj_away FROM public.af_injuries_normalized
  WHERE af_fixture_id=v_af_fixture_id AND af_team_id=v_af_away_team_id;
  v_has_injuries := true;
END IF;

-- Venue — scalar fetch
IF v_af_fixture_id IS NOT NULL THEN
  SELECT vn.af_venue_id, vn.name, vn.city, vn.capacity, vn.surface,
         vn.altitude_meters, vn.venue_context_warning
  INTO v_venue_id, v_venue_name, v_venue_city, v_venue_capacity, v_venue_surface,
       v_venue_altitude, v_venue_warning
  FROM shared.af_fixtures_raw afr
  JOIN public.af_venues_normalized vn
    ON vn.af_venue_id = (afr.raw_response->'fixture'->'venue'->>'id')::integer
  WHERE afr.fixture_id=v_af_fixture_id LIMIT 1;
  v_has_venue := v_venue_id IS NOT NULL;
END IF;

-- Quality tier upgrade
IF v_has_team_stats AND v_has_form THEN v_quality_tier := 'elo_form_stats'; END IF;

-- Injury warning
DECLARE
  v_inj_total   integer := COALESCE(v_inj_home,0) + COALESCE(v_inj_away,0);
  v_inj_warning text    := 'none';
BEGIN
  IF v_inj_total >= 6 THEN v_inj_warning := 'severe';
  ELSIF v_inj_total >= 3 THEN v_inj_warning := 'moderate';
  ELSIF v_inj_total >= 1 THEN v_inj_warning := 'mild';
  END IF;

  INSERT INTO model_lab.prematch_upcoming_feature_snapshots (
    match_id, feature_version, competition_season_id, match_date, home_team_id, away_team_id,
    home_matches_l5, home_form_l5, home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
    home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
    home_matches_l10, home_form_l10, home_goals_for_avg_l10, home_goals_against_avg_l10,
    home_matches_l20, home_form_l20,
    away_matches_l5, away_form_l5, away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
    away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
    away_matches_l10, away_form_l10, away_goals_for_avg_l10, away_goals_against_avg_l10,
    away_matches_l20, away_form_l20,
    diff_form_l5, diff_goals_for_l5, diff_goals_against_l5,
    feature_quality_tier, has_form_features,
    standings_rank_home, standings_rank_away,
    standings_points_home, standings_points_away,
    standings_gd_home, standings_gd_away,
    standings_form_home, standings_form_away,
    standings_description_home, standings_description_away,
    standings_rank_gap, has_standings_features,
    injury_count_home, injury_count_away, injury_count_total,
    injury_warning_level, has_injuries_features,
    season_goals_for_avg_home, season_goals_for_avg_away,
    season_goals_against_avg_home, season_goals_against_avg_away,
    season_clean_sheet_rate_home, season_clean_sheet_rate_away,
    season_failed_score_rate_home, season_failed_score_rate_away,
    home_attack_baseline, away_attack_baseline,
    home_defense_baseline, away_defense_baseline,
    has_team_stats_features,
    venue_id, venue_name, venue_city, venue_capacity, venue_surface,
    venue_altitude_meters, venue_context_warning, has_venue_features,
    generated_at
  )
  VALUES (
    p_match_id, v_feat_version, v_match.competition_season_id,
    to_timestamp(v_match.timestamp)::date, v_match.home_team_uuid, v_match.away_team_uuid,
    COALESCE(v_home_l5.n_matches,0)::smallint, COALESCE(v_home_l5.form_points,0)::smallint,
    v_home_l5.win_rate, v_home_l5.draw_rate, v_home_l5.loss_rate,
    v_home_l5.goals_for_avg, v_home_l5.goals_against_avg, v_home_l5.goal_diff_avg,
    COALESCE(v_home_l10.n_matches,0)::smallint, COALESCE(v_home_l10.form_points,0)::smallint,
    v_home_l10.goals_for_avg, v_home_l10.goals_against_avg,
    COALESCE(v_home_l20.n_matches,0)::smallint, COALESCE(v_home_l20.form_points,0)::smallint,
    COALESCE(v_away_l5.n_matches,0)::smallint, COALESCE(v_away_l5.form_points,0)::smallint,
    v_away_l5.win_rate, v_away_l5.draw_rate, v_away_l5.loss_rate,
    v_away_l5.goals_for_avg, v_away_l5.goals_against_avg, v_away_l5.goal_diff_avg,
    COALESCE(v_away_l10.n_matches,0)::smallint, COALESCE(v_away_l10.form_points,0)::smallint,
    v_away_l10.goals_for_avg, v_away_l10.goals_against_avg,
    COALESCE(v_away_l20.n_matches,0)::smallint, COALESCE(v_away_l20.form_points,0)::smallint,
    COALESCE(v_home_l5.form_points,0)-COALESCE(v_away_l5.form_points,0),
    COALESCE(v_home_l5.goals_for_avg,0)-COALESCE(v_away_l5.goals_for_avg,0),
    COALESCE(v_home_l5.goals_against_avg,0)-COALESCE(v_away_l5.goals_against_avg,0),
    v_quality_tier, v_has_form,
    v_st_rank_home, v_st_rank_away,
    v_st_points_home, v_st_points_away,
    v_st_gd_home, v_st_gd_away,
    v_st_form_home, v_st_form_away,
    v_st_desc_home, v_st_desc_away,
    CASE WHEN v_st_rank_home IS NOT NULL AND v_st_rank_away IS NOT NULL
         THEN v_st_rank_home - v_st_rank_away ELSE NULL END,
    v_has_standings,
    COALESCE(v_inj_home,0), COALESCE(v_inj_away,0),
    COALESCE(v_inj_home,0)+COALESCE(v_inj_away,0),
    v_inj_warning, v_has_injuries,
    v_ts_goals_for_home, v_ts_goals_for_away,
    v_ts_goals_ag_home, v_ts_goals_ag_away,
    v_ts_cs_rate_home, v_ts_cs_rate_away,
    v_ts_fts_rate_home, v_ts_fts_rate_away,
    v_ts_att_base_home, v_ts_att_base_away,
    v_ts_def_base_home, v_ts_def_base_away,
    v_has_team_stats,
    v_venue_id, v_venue_name, v_venue_city, v_venue_capacity, v_venue_surface,
    v_venue_altitude, v_venue_warning, v_has_venue,
    now()
  )
  ON CONFLICT (match_id) DO UPDATE SET
    feature_version              = EXCLUDED.feature_version,
    home_matches_l5              = EXCLUDED.home_matches_l5,
    home_form_l5                 = EXCLUDED.home_form_l5,
    home_win_rate_l5             = EXCLUDED.home_win_rate_l5,
    home_goals_for_avg_l5        = EXCLUDED.home_goals_for_avg_l5,
    home_goals_against_avg_l5    = EXCLUDED.home_goals_against_avg_l5,
    away_matches_l5              = EXCLUDED.away_matches_l5,
    away_form_l5                 = EXCLUDED.away_form_l5,
    away_win_rate_l5             = EXCLUDED.away_win_rate_l5,
    away_goals_for_avg_l5        = EXCLUDED.away_goals_for_avg_l5,
    away_goals_against_avg_l5    = EXCLUDED.away_goals_against_avg_l5,
    feature_quality_tier         = EXCLUDED.feature_quality_tier,
    has_form_features            = EXCLUDED.has_form_features,
    standings_rank_home          = EXCLUDED.standings_rank_home,
    standings_rank_away          = EXCLUDED.standings_rank_away,
    standings_points_home        = EXCLUDED.standings_points_home,
    standings_points_away        = EXCLUDED.standings_points_away,
    standings_gd_home            = EXCLUDED.standings_gd_home,
    standings_gd_away            = EXCLUDED.standings_gd_away,
    standings_form_home          = EXCLUDED.standings_form_home,
    standings_form_away          = EXCLUDED.standings_form_away,
    standings_description_home   = EXCLUDED.standings_description_home,
    standings_description_away   = EXCLUDED.standings_description_away,
    standings_rank_gap           = EXCLUDED.standings_rank_gap,
    has_standings_features       = EXCLUDED.has_standings_features,
    injury_count_home            = EXCLUDED.injury_count_home,
    injury_count_away            = EXCLUDED.injury_count_away,
    injury_count_total           = EXCLUDED.injury_count_total,
    injury_warning_level         = EXCLUDED.injury_warning_level,
    has_injuries_features        = EXCLUDED.has_injuries_features,
    season_goals_for_avg_home    = EXCLUDED.season_goals_for_avg_home,
    season_goals_for_avg_away    = EXCLUDED.season_goals_for_avg_away,
    season_goals_against_avg_home= EXCLUDED.season_goals_against_avg_home,
    season_goals_against_avg_away= EXCLUDED.season_goals_against_avg_away,
    season_clean_sheet_rate_home = EXCLUDED.season_clean_sheet_rate_home,
    season_clean_sheet_rate_away = EXCLUDED.season_clean_sheet_rate_away,
    season_failed_score_rate_home= EXCLUDED.season_failed_score_rate_home,
    season_failed_score_rate_away= EXCLUDED.season_failed_score_rate_away,
    home_attack_baseline         = EXCLUDED.home_attack_baseline,
    away_attack_baseline         = EXCLUDED.away_attack_baseline,
    home_defense_baseline        = EXCLUDED.home_defense_baseline,
    away_defense_baseline        = EXCLUDED.away_defense_baseline,
    has_team_stats_features      = EXCLUDED.has_team_stats_features,
    venue_id                     = EXCLUDED.venue_id,
    venue_name                   = EXCLUDED.venue_name,
    venue_city                   = EXCLUDED.venue_city,
    venue_capacity               = EXCLUDED.venue_capacity,
    venue_surface                = EXCLUDED.venue_surface,
    venue_altitude_meters        = EXCLUDED.venue_altitude_meters,
    venue_context_warning        = EXCLUDED.venue_context_warning,
    has_venue_features           = EXCLUDED.has_venue_features,
    generated_at                 = now();

  v_snapshot := jsonb_build_object(
    'match_id',          p_match_id,
    'quality_tier',      v_quality_tier,
    'has_form',          v_has_form,
    'has_standings',     v_has_standings,
    'has_injuries',      v_has_injuries,
    'has_team_stats',    v_has_team_stats,
    'has_venue',         v_has_venue,
    'injury_count_home', COALESCE(v_inj_home,0),
    'injury_count_away', COALESCE(v_inj_away,0),
    'injury_warning',    v_inj_warning,
    'elo_home',          v_elo_home,
    'elo_away',          v_elo_away,
    'home_l5',           COALESCE(v_home_l5.n_matches,0),
    'away_l5',           COALESCE(v_away_l5.n_matches,0)
  );

  RETURN v_snapshot;
END;
END;
$$;
