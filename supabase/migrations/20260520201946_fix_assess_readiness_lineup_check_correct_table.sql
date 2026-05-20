/*
  # Fix assess_upcoming_match_readiness: lineup check uses wrong schema

  ## Problem
  Step 4 of assess_upcoming_match_readiness() runs:
    EXECUTE format('SELECT COUNT(*) > 0 FROM af.fixture_lineups WHERE fixture_id = %L', ...)
  
  The schema "af" does not exist. The real table is:
    public.api_football_fixture_lineups  (af_fixture_id column)
  
  The EXCEPTION handler silently sets v_lineup_ready = false, so lineup_availability
  is always false and a noisy log warning is generated on every assessment run.

  ## Fix
  Replace the dynamic EXECUTE with a direct EXISTS query against the correct table.
  The column is api_football_fixture_lineups.af_fixture_id (integer).
*/

CREATE OR REPLACE FUNCTION model_lab.assess_upcoming_match_readiness(p_match_id uuid)
RETURNS model_lab.upcoming_match_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public, shared
AS $$
DECLARE
v_match              record;
v_feature            record;
v_snapshot           record;
v_af_fixture_id      integer;
v_af_league_id       integer;
v_af_season          integer;
v_af_home_team_id    integer;
v_af_away_team_id    integer;

v_elo_ready          boolean := false;
v_feature_ready      boolean := false;
v_cal_ready          boolean := false;
v_lineup_ready       boolean := false;
v_stats_ready        boolean := false;
v_pred_ready         boolean := false;
v_scenario_ready     boolean := false;
v_standings_ready    boolean := false;
v_injuries_ready     boolean := false;
v_team_stats_ready   boolean := false;
v_venue_ready        boolean := false;

v_feat_tier          text := 'elo_only';
v_elo_home_val       numeric;
v_elo_away_val       numeric;
v_home_l5            smallint := 0;
v_away_l5            smallint := 0;
v_brier              numeric;
v_pred_status        text;
v_inj_warning        text;

v_status             text := 'blocked';
v_warnings           text[] := '{}';
v_blockers           text[] := '{}';
v_enrichment_score   smallint := 0;

v_result             model_lab.upcoming_match_readiness;
BEGIN
SELECT
  m.*,
  comp.name      AS competition_name,
  s.label        AS season_label,
  ht.name        AS home_team_name,
  at.name        AS away_team_name,
  ht.id          AS home_team_uuid,
  at.id          AS away_team_uuid
INTO v_match
FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.competitions comp      ON comp.id = cs.competition_id
JOIN public.seasons s              ON s.id = cs.season_id
JOIN public.teams ht               ON ht.id = m.home_team_id
JOIN public.teams at               ON at.id = m.away_team_id
WHERE m.id = p_match_id;

IF NOT FOUND THEN RETURN NULL; END IF;

-- 1. ELO
SELECT elo_overall INTO v_elo_home_val
FROM model_lab.team_elo_ratings
WHERE team_id = v_match.home_team_uuid
ORDER BY last_match_date DESC NULLS LAST LIMIT 1;

SELECT elo_overall INTO v_elo_away_val
FROM model_lab.team_elo_ratings
WHERE team_id = v_match.away_team_uuid
ORDER BY last_match_date DESC NULLS LAST LIMIT 1;

v_elo_ready := v_elo_home_val IS NOT NULL AND v_elo_away_val IS NOT NULL;
IF NOT v_elo_ready THEN
  v_blockers := array_append(v_blockers, 'missing_elo');
END IF;

-- 2. Feature readiness
SELECT feature_quality_tier, has_form_features,
       home_matches_l5, away_matches_l5
INTO v_snapshot
FROM model_lab.prematch_upcoming_feature_snapshots
WHERE match_id = p_match_id;

IF v_snapshot IS NOT NULL THEN
  v_feat_tier     := COALESCE(v_snapshot.feature_quality_tier, 'elo_only');
  v_home_l5       := COALESCE(v_snapshot.home_matches_l5, 0);
  v_away_l5       := COALESCE(v_snapshot.away_matches_l5, 0);
  v_feature_ready := v_snapshot.has_form_features OR v_feat_tier = 'elo_form_stats';
ELSE
  SELECT feature_quality_tier, has_form_features
  INTO v_feature
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  LIMIT 1;

  IF v_feature IS NOT NULL THEN
    v_feat_tier     := COALESCE(v_feature.feature_quality_tier, 'elo_only');
    v_feature_ready := COALESCE(v_feature.has_form_features, false);
  END IF;
END IF;

IF NOT v_feature_ready THEN
  v_warnings := array_append(v_warnings, 'missing_form_features');
END IF;

-- 3. Calibration
SELECT rolling_brier_l50 INTO v_brier
FROM model_lab.league_calibration_state
WHERE competition_name = v_match.competition_name
LIMIT 1;

v_cal_ready := v_brier IS NOT NULL;
IF NOT v_cal_ready THEN
  v_warnings := array_append(v_warnings, 'missing_calibration');
END IF;

-- 4. Lineup — use correct table: public.api_football_fixture_lineups
--    (replaced broken EXECUTE against non-existent af.fixture_lineups schema)
IF v_match.api_football_fixture_id IS NOT NULL THEN
  v_lineup_ready := EXISTS (
    SELECT 1 FROM public.api_football_fixture_lineups
    WHERE af_fixture_id = v_match.api_football_fixture_id
    LIMIT 1
  );
END IF;

-- 5. Stats
SELECT has_stats INTO v_stats_ready
FROM model_lab.prematch_feature_matrix_snapshot_v1
WHERE match_id = p_match_id LIMIT 1;
v_stats_ready := COALESCE(v_stats_ready, false);

-- 6. Prediction
SELECT status INTO v_pred_status
FROM model_lab.prematch_prediction_drafts
WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected') LIMIT 1;
v_pred_ready := v_pred_status IS NOT NULL;

-- 7. Scenario
v_scenario_ready := EXISTS (
  SELECT 1 FROM model_lab.match_story_drafts
  WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected')
);

-- 8. AF IDs
SELECT afm.af_fixture_id INTO v_af_fixture_id
FROM public.af_fixture_mappings afm
WHERE afm.match_id = p_match_id LIMIT 1;

IF v_af_fixture_id IS NOT NULL THEN
  SELECT league_id, season
  INTO v_af_league_id, v_af_season
  FROM shared.af_fixtures_raw WHERE fixture_id = v_af_fixture_id LIMIT 1;

  SELECT
    (raw_response->'teams'->'home'->>'id')::integer,
    (raw_response->'teams'->'away'->>'id')::integer
  INTO v_af_home_team_id, v_af_away_team_id
  FROM shared.af_fixtures_raw WHERE fixture_id = v_af_fixture_id LIMIT 1;
END IF;

-- Standings
IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
  v_standings_ready :=
    EXISTS (SELECT 1 FROM public.af_standings_normalized
            WHERE af_league_id = v_af_league_id AND af_season = v_af_season
              AND af_team_id = v_af_home_team_id)
    AND
    EXISTS (SELECT 1 FROM public.af_standings_normalized
            WHERE af_league_id = v_af_league_id AND af_season = v_af_season
              AND af_team_id = v_af_away_team_id);
END IF;
IF NOT v_standings_ready THEN
  v_warnings := array_append(v_warnings, 'missing_standings');
END IF;

-- Injuries
IF v_af_fixture_id IS NOT NULL THEN
  v_injuries_ready :=
    EXISTS (SELECT 1 FROM public.af_injuries_normalized WHERE af_fixture_id = v_af_fixture_id)
    OR
    EXISTS (SELECT 1 FROM public.af_injuries_normalized
            WHERE af_league_id = v_af_league_id AND af_season = v_af_season
              AND af_fixture_id IS NULL);

  DECLARE
    v_inj_count integer;
  BEGIN
    SELECT COUNT(*) INTO v_inj_count
    FROM public.af_injuries_normalized WHERE af_fixture_id = v_af_fixture_id;
    IF COALESCE(v_inj_count, 0) >= 6 THEN
      v_inj_warning := 'severe';
      v_warnings := array_append(v_warnings, 'high_context_uncertainty');
    ELSIF COALESCE(v_inj_count, 0) >= 3 THEN
      v_inj_warning := 'moderate';
      v_warnings := array_append(v_warnings, 'key_player_absence_detected');
    ELSIF COALESCE(v_inj_count, 0) >= 1 THEN
      v_inj_warning := 'mild';
    ELSE
      v_inj_warning := 'none';
    END IF;
  END;
END IF;
IF NOT v_injuries_ready THEN
  v_warnings := array_append(v_warnings, 'missing_injuries');
END IF;

-- Team statistics
IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
  v_team_stats_ready :=
    EXISTS (SELECT 1 FROM public.af_team_statistics_normalized
            WHERE af_league_id = v_af_league_id AND af_season = v_af_season
              AND af_team_id = v_af_home_team_id)
    AND
    EXISTS (SELECT 1 FROM public.af_team_statistics_normalized
            WHERE af_league_id = v_af_league_id AND af_season = v_af_season
              AND af_team_id = v_af_away_team_id);
END IF;
IF NOT v_team_stats_ready THEN
  v_warnings := array_append(v_warnings, 'missing_team_statistics');
END IF;

-- Venue
IF v_af_fixture_id IS NOT NULL THEN
  v_venue_ready := EXISTS (
    SELECT 1 FROM shared.af_fixtures_raw afr
    JOIN public.af_venues_normalized vn
      ON vn.af_venue_id = (afr.raw_response->'fixture'->'venue'->>'id')::integer
    WHERE afr.fixture_id = v_af_fixture_id
  );
END IF;
IF NOT v_venue_ready THEN
  v_warnings := array_append(v_warnings, 'missing_venue');
END IF;

-- Enrichment score
v_enrichment_score :=
  (v_standings_ready::int) + (v_injuries_ready::int) +
  (v_team_stats_ready::int) + (v_venue_ready::int);

-- Overall status
IF v_elo_ready AND v_feature_ready AND v_cal_ready THEN
  v_status := 'ready';
ELSIF v_elo_ready AND (v_feature_ready OR v_cal_ready) THEN
  v_status := 'partial';
ELSE
  v_status := 'blocked';
  IF NOT v_elo_ready THEN
    v_blockers := array_append(v_blockers, 'elo_missing');
  END IF;
END IF;

-- Upsert
INSERT INTO model_lab.upcoming_match_readiness (
  match_id, competition_name, season_label, match_date, kickoff_utc,
  home_team_name, away_team_name,
  elo_readiness, feature_readiness, calibration_readiness,
  lineup_availability, stats_availability, prediction_readiness, scenario_readiness,
  standings_readiness, injuries_readiness, team_statistics_readiness, venue_readiness,
  enrichment_score, injury_warning_level,
  feature_quality_tier, elo_home, elo_away,
  home_l5_available, away_l5_available,
  calibration_brier_l50, prediction_status,
  warnings, overall_status, blocking_reasons,
  assessed_at, assessment_version
)
VALUES (
  p_match_id, v_match.competition_name, v_match.season_label,
  to_timestamp(v_match.timestamp)::date, to_timestamp(v_match.timestamp),
  v_match.home_team_name, v_match.away_team_name,
  v_elo_ready, v_feature_ready, v_cal_ready,
  v_lineup_ready, v_stats_ready, v_pred_ready, v_scenario_ready,
  v_standings_ready, v_injuries_ready, v_team_stats_ready, v_venue_ready,
  v_enrichment_score, v_inj_warning,
  v_feat_tier, v_elo_home_val, v_elo_away_val,
  v_home_l5, v_away_l5,
  v_brier, v_pred_status,
  v_warnings, v_status, v_blockers,
  now(), 'v3'
)
ON CONFLICT (match_id) DO UPDATE SET
  elo_readiness             = EXCLUDED.elo_readiness,
  feature_readiness         = EXCLUDED.feature_readiness,
  calibration_readiness     = EXCLUDED.calibration_readiness,
  lineup_availability       = EXCLUDED.lineup_availability,
  stats_availability        = EXCLUDED.stats_availability,
  prediction_readiness      = EXCLUDED.prediction_readiness,
  scenario_readiness        = EXCLUDED.scenario_readiness,
  standings_readiness       = EXCLUDED.standings_readiness,
  injuries_readiness        = EXCLUDED.injuries_readiness,
  team_statistics_readiness = EXCLUDED.team_statistics_readiness,
  venue_readiness           = EXCLUDED.venue_readiness,
  enrichment_score          = EXCLUDED.enrichment_score,
  injury_warning_level      = EXCLUDED.injury_warning_level,
  feature_quality_tier      = EXCLUDED.feature_quality_tier,
  elo_home                  = EXCLUDED.elo_home,
  elo_away                  = EXCLUDED.elo_away,
  home_l5_available         = EXCLUDED.home_l5_available,
  away_l5_available         = EXCLUDED.away_l5_available,
  calibration_brier_l50     = EXCLUDED.calibration_brier_l50,
  prediction_status         = EXCLUDED.prediction_status,
  warnings                  = EXCLUDED.warnings,
  overall_status            = EXCLUDED.overall_status,
  blocking_reasons          = EXCLUDED.blocking_reasons,
  assessed_at               = now(),
  assessment_version        = 'v3';

SELECT * INTO v_result
FROM model_lab.upcoming_match_readiness
WHERE match_id = p_match_id;

RETURN v_result;
END;
$$;
