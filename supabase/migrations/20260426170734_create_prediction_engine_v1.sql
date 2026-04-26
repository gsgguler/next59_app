/*
  # MVP Prediction Engine v1 — Feature Engineering + Heuristic Model

  1. New Functions
    - `compute_team_features(team_uuid, before_date)` — returns team form stats
    - `compute_match_features(match_uuid)` — returns full feature set for a match
    - `generate_prediction_v1(match_uuid)` — generates heuristic predictions and inserts into predictions table

  2. Feature Engineering
    - Last 5 match form (points, goals for/against, clean sheets)
    - Home/away split form
    - Head-to-head last 3 meetings
    - League average goals per game
    - Neutral venue handling

  3. Heuristic Algorithm
    - 1X2 probabilities with form/home-advantage/H2H adjustments
    - Over 2.5 goals probability
    - BTTS probability
    - Confidence scoring based on data availability
    - All stored in model_output_raw jsonb

  4. Notes
    - Handles teams with zero historical data (conservative defaults)
    - Idempotent: marks existing predictions as superseded
    - Uses existing predictions schema (one row per match per version)
*/

-- ═══════════════════════════════════════════
-- FUNCTION: compute_team_features
-- Returns form stats for a given team before a given date
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_team_features(
  p_team_id uuid,
  p_before timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_last5 jsonb;
  v_home_form jsonb;
  v_away_form jsonb;
  v_total_matches int;
BEGIN
  -- Count total finished matches for this team
  SELECT COUNT(*) INTO v_total_matches
  FROM matches
  WHERE (home_team_id = p_team_id OR away_team_id = p_team_id)
    AND status = 'finished'
    AND kickoff_at < p_before;

  -- Last 5 matches (any venue)
  WITH last5 AS (
    SELECT
      home_team_id, away_team_id,
      home_goals_ft, away_goals_ft,
      CASE
        WHEN home_team_id = p_team_id AND home_goals_ft > away_goals_ft THEN 3
        WHEN away_team_id = p_team_id AND away_goals_ft > home_goals_ft THEN 3
        WHEN home_goals_ft = away_goals_ft THEN 1
        ELSE 0
      END AS points,
      CASE
        WHEN home_team_id = p_team_id THEN home_goals_ft
        ELSE away_goals_ft
      END AS goals_for,
      CASE
        WHEN home_team_id = p_team_id THEN away_goals_ft
        ELSE home_goals_ft
      END AS goals_against
    FROM matches
    WHERE (home_team_id = p_team_id OR away_team_id = p_team_id)
      AND status = 'finished'
      AND kickoff_at < p_before
    ORDER BY kickoff_at DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'matches_used', COUNT(*),
    'avg_points', COALESCE(ROUND(AVG(points)::numeric, 3), 0),
    'avg_goals_for', COALESCE(ROUND(AVG(goals_for)::numeric, 3), 0),
    'avg_goals_against', COALESCE(ROUND(AVG(goals_against)::numeric, 3), 0),
    'clean_sheet_rate', COALESCE(ROUND(COUNT(*) FILTER (WHERE goals_against = 0)::numeric / NULLIF(COUNT(*), 0), 3), 0)
  ) INTO v_last5
  FROM last5;

  -- Home form (all home matches)
  WITH home AS (
    SELECT home_goals_ft AS gf, away_goals_ft AS ga,
      CASE
        WHEN home_goals_ft > away_goals_ft THEN 3
        WHEN home_goals_ft = away_goals_ft THEN 1
        ELSE 0
      END AS points
    FROM matches
    WHERE home_team_id = p_team_id
      AND status = 'finished'
      AND kickoff_at < p_before
    ORDER BY kickoff_at DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'matches_used', COUNT(*),
    'avg_points', COALESCE(ROUND(AVG(points)::numeric, 3), 0),
    'avg_goals_for', COALESCE(ROUND(AVG(gf)::numeric, 3), 0),
    'avg_goals_against', COALESCE(ROUND(AVG(ga)::numeric, 3), 0)
  ) INTO v_home_form
  FROM home;

  -- Away form (all away matches)
  WITH away AS (
    SELECT away_goals_ft AS gf, home_goals_ft AS ga,
      CASE
        WHEN away_goals_ft > home_goals_ft THEN 3
        WHEN away_goals_ft = home_goals_ft THEN 1
        ELSE 0
      END AS points
    FROM matches
    WHERE away_team_id = p_team_id
      AND status = 'finished'
      AND kickoff_at < p_before
    ORDER BY kickoff_at DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'matches_used', COUNT(*),
    'avg_points', COALESCE(ROUND(AVG(points)::numeric, 3), 0),
    'avg_goals_for', COALESCE(ROUND(AVG(gf)::numeric, 3), 0),
    'avg_goals_against', COALESCE(ROUND(AVG(ga)::numeric, 3), 0)
  ) INTO v_away_form
  FROM away;

  RETURN jsonb_build_object(
    'total_historical_matches', v_total_matches,
    'last5', v_last5,
    'home_form', v_home_form,
    'away_form', v_away_form
  );
END;
$$;


-- ═══════════════════════════════════════════
-- FUNCTION: compute_h2h_features
-- Returns head-to-head stats for two teams
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_h2h_features(
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_before timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH h2h AS (
    SELECT
      home_team_id, away_team_id,
      home_goals_ft, away_goals_ft,
      COALESCE(home_goals_ft, 0) + COALESCE(away_goals_ft, 0) AS total_goals
    FROM matches
    WHERE status = 'finished'
      AND kickoff_at < p_before
      AND (
        (home_team_id = p_home_team_id AND away_team_id = p_away_team_id)
        OR (home_team_id = p_away_team_id AND away_team_id = p_home_team_id)
      )
    ORDER BY kickoff_at DESC
    LIMIT 3
  )
  SELECT jsonb_build_object(
    'meetings', COUNT(*),
    'home_wins', COUNT(*) FILTER (WHERE
      (home_team_id = p_home_team_id AND home_goals_ft > away_goals_ft)
      OR (away_team_id = p_home_team_id AND away_goals_ft > home_goals_ft)
    ),
    'draws', COUNT(*) FILTER (WHERE home_goals_ft = away_goals_ft),
    'away_wins', COUNT(*) FILTER (WHERE
      (home_team_id = p_away_team_id AND home_goals_ft > away_goals_ft)
      OR (away_team_id = p_away_team_id AND away_goals_ft > home_goals_ft)
    ),
    'avg_total_goals', COALESCE(ROUND(AVG(total_goals)::numeric, 2), 0)
  ) INTO v_result
  FROM h2h;

  RETURN v_result;
END;
$$;


-- ═══════════════════════════════════════════
-- FUNCTION: compute_league_avg_goals
-- Returns average goals per game for a competition season
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_league_avg_goals(
  p_competition_season_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_avg numeric;
BEGIN
  SELECT COALESCE(
    ROUND(AVG(COALESCE(home_goals_ft, 0) + COALESCE(away_goals_ft, 0))::numeric, 3),
    2.500
  ) INTO v_avg
  FROM matches
  WHERE competition_season_id = p_competition_season_id
    AND status = 'finished';

  RETURN v_avg;
END;
$$;
