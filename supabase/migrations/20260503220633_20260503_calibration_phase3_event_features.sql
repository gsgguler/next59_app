/*
  # Calibration Phase 3 — Leakage-Safe Team Pre-Match Event Features

  ## Summary
  Creates `model_lab.v_team_pre_match_event_features`, a leakage-safe view that
  computes rolling event momentum history for each (target_match, team) pair.

  ## Design
  - Source: `public.api_football_fixture_events` joined to match universe
  - Leakage protection: source events only from matches strictly before the target
    match date, and source match_id != target match_id
  - Rolling window: last 10 previous appearances (L10) via ROW_NUMBER()
  - Elapsed < 0 artifacts are excluded (provider data quality filter)
  - Target match events are never included in feature computation

  ## Output Columns (one row per target_match_id + team_id)
  - n_event_matches_l10: number of previous matches with event data available
  - goals_0_15_avg_l10 through goals_76_90_avg_l10: avg goals scored by time window
  - goals_conceded_0_15_avg_l10 through goals_conceded_76_90_avg_l10: avg goals conceded
  - cards_0_15_avg_l10 through cards_76_90_avg_l10: avg yellow cards by window
  - red_cards_avg_l10: avg red cards per match
  - substitutions_avg_l10: avg subs per match
  - late_goal_for_rate_l10: fraction of matches with a goal scored in 76-90 min
  - late_goal_against_rate_l10: fraction of matches conceding in 76-90 min
  - first_goal_for_rate_l10: fraction of matches scoring before 30 min
  - first_goal_against_rate_l10: fraction of matches conceding before 30 min
  - comeback_signal_l10: fraction of matches where team conceded first but still scored
  - late_goal_pressure_l10: fraction of matches where lead was threatened in 76+ min

  ## Security
  - View is in model_lab schema (admin-only access)
  - No new tables, no data writes, read-only computation
*/

CREATE OR REPLACE VIEW model_lab.v_team_pre_match_event_features AS
WITH

-- Base universe: all target matches with their teams
match_teams AS (
  SELECT
    u.match_id    AS target_match_id,
    u.match_date  AS target_match_date,
    u.home_team_id AS team_id,
    'home'         AS role
  FROM model_lab.v_calibration_match_universe u

  UNION ALL

  SELECT
    u.match_id    AS target_match_id,
    u.match_date  AS target_match_date,
    u.away_team_id AS team_id,
    'away'         AS role
  FROM model_lab.v_calibration_match_universe u
),

-- Previous matches for each team from the universe (leakage-safe)
team_prev_matches AS (
  SELECT
    mt.target_match_id,
    mt.team_id,
    src.match_id       AS src_match_id,
    src.match_date     AS src_match_date,
    -- Is this team home or away in the source match?
    CASE WHEN src.home_team_id = mt.team_id THEN 'home' ELSE 'away' END AS src_role,
    src.home_team_id   AS src_home_team_id,
    src.away_team_id   AS src_away_team_id,
    ROW_NUMBER() OVER (
      PARTITION BY mt.target_match_id, mt.team_id
      ORDER BY src.match_date DESC, src.match_id DESC
    ) AS rn_recent
  FROM match_teams mt
  JOIN model_lab.v_calibration_match_universe src
    ON (src.home_team_id = mt.team_id OR src.away_team_id = mt.team_id)
    AND src.match_date < mt.target_match_date
    AND src.match_id != mt.target_match_id
),

-- L10 window only
prev_l10 AS (
  SELECT *
  FROM team_prev_matches
  WHERE rn_recent <= 10
),

-- Raw event rows for the L10 previous matches, for the team's own events
-- elapsed < 0 provider artifacts excluded
event_raw AS (
  SELECT
    p.target_match_id,
    p.team_id,
    p.src_match_id,
    p.src_role,
    p.src_home_team_id,
    p.src_away_team_id,
    e.elapsed,
    e.event_type,
    e.event_detail,
    CASE
      WHEN e.elapsed BETWEEN 0  AND 15  THEN 'w0_15'
      WHEN e.elapsed BETWEEN 16 AND 30  THEN 'w16_30'
      WHEN e.elapsed BETWEEN 31 AND 45  THEN 'w31_45'
      WHEN e.elapsed BETWEEN 46 AND 60  THEN 'w46_60'
      WHEN e.elapsed BETWEEN 61 AND 75  THEN 'w61_75'
      WHEN e.elapsed BETWEEN 76 AND 120 THEN 'w76_90'
      ELSE NULL
    END AS time_window
  FROM prev_l10 p
  JOIN public.api_football_fixture_events e
    ON e.match_id = p.src_match_id
    AND e.elapsed >= 0
    AND e.team_id = p.team_id
),

-- Opponent events for conceded calculations
opp_event_raw AS (
  SELECT
    p.target_match_id,
    p.team_id,
    p.src_match_id,
    e.elapsed,
    e.event_type,
    e.event_detail,
    CASE
      WHEN e.elapsed BETWEEN 0  AND 15  THEN 'w0_15'
      WHEN e.elapsed BETWEEN 16 AND 30  THEN 'w16_30'
      WHEN e.elapsed BETWEEN 31 AND 45  THEN 'w31_45'
      WHEN e.elapsed BETWEEN 46 AND 60  THEN 'w46_60'
      WHEN e.elapsed BETWEEN 61 AND 75  THEN 'w61_75'
      WHEN e.elapsed BETWEEN 76 AND 120 THEN 'w76_90'
      ELSE NULL
    END AS time_window
  FROM prev_l10 p
  JOIN public.api_football_fixture_events e
    ON e.match_id = p.src_match_id
    AND e.elapsed >= 0
    AND e.team_id = CASE
      WHEN p.src_role = 'home' THEN p.src_away_team_id
      ELSE p.src_home_team_id
    END
),

-- Per-match event summaries (team's own events)
match_event_summary AS (
  SELECT
    target_match_id,
    team_id,
    src_match_id,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w0_15')  AS goals_for_0_15,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w16_30') AS goals_for_16_30,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w31_45') AS goals_for_31_45,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w46_60') AS goals_for_46_60,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w61_75') AS goals_for_61_75,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w76_90') AS goals_for_76_90,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w0_15')  AS yellows_0_15,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w16_30') AS yellows_16_30,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w31_45') AS yellows_31_45,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w46_60') AS yellows_46_60,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w61_75') AS yellows_61_75,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card' AND time_window = 'w76_90') AS yellows_76_90,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Red Card') AS red_cards_total,
    COUNT(*) FILTER (WHERE event_type = 'subst') AS subs_total,
    CASE WHEN COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w76_90') > 0 THEN 1 ELSE 0 END AS late_goal_for_flag,
    CASE WHEN COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window IN ('w0_15', 'w16_30')) > 0 THEN 1 ELSE 0 END AS first_goal_for_flag,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty')) AS goals_for_total
  FROM event_raw
  GROUP BY target_match_id, team_id, src_match_id
),

-- Per-match opponent event summaries (conceded)
match_opp_summary AS (
  SELECT
    target_match_id,
    team_id,
    src_match_id,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w0_15')  AS goals_against_0_15,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w16_30') AS goals_against_16_30,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w31_45') AS goals_against_31_45,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w46_60') AS goals_against_46_60,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w61_75') AS goals_against_61_75,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w76_90') AS goals_against_76_90,
    CASE WHEN COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window = 'w76_90') > 0 THEN 1 ELSE 0 END AS late_goal_against_flag,
    CASE WHEN COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty') AND time_window IN ('w0_15', 'w16_30')) > 0 THEN 1 ELSE 0 END AS first_goal_against_flag,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail IN ('Normal Goal', 'Penalty')) AS goals_against_total
  FROM opp_event_raw
  GROUP BY target_match_id, team_id, src_match_id
),

-- All L10 source matches that have at least one event record (for either team)
l10_matches AS (
  SELECT DISTINCT target_match_id, team_id, src_match_id FROM match_event_summary
  UNION
  SELECT DISTINCT target_match_id, team_id, src_match_id FROM match_opp_summary
),

-- Join for combined per-match signals
match_combined AS (
  SELECT
    lm.target_match_id,
    lm.team_id,
    lm.src_match_id,
    COALESCE(es.goals_for_0_15, 0)   AS goals_for_0_15,
    COALESCE(es.goals_for_16_30, 0)  AS goals_for_16_30,
    COALESCE(es.goals_for_31_45, 0)  AS goals_for_31_45,
    COALESCE(es.goals_for_46_60, 0)  AS goals_for_46_60,
    COALESCE(es.goals_for_61_75, 0)  AS goals_for_61_75,
    COALESCE(es.goals_for_76_90, 0)  AS goals_for_76_90,
    COALESCE(es.yellows_0_15, 0)     AS yellows_0_15,
    COALESCE(es.yellows_16_30, 0)    AS yellows_16_30,
    COALESCE(es.yellows_31_45, 0)    AS yellows_31_45,
    COALESCE(es.yellows_46_60, 0)    AS yellows_46_60,
    COALESCE(es.yellows_61_75, 0)    AS yellows_61_75,
    COALESCE(es.yellows_76_90, 0)    AS yellows_76_90,
    COALESCE(es.red_cards_total, 0)  AS red_cards_total,
    COALESCE(es.subs_total, 0)       AS subs_total,
    COALESCE(es.late_goal_for_flag, 0)  AS late_goal_for_flag,
    COALESCE(es.first_goal_for_flag, 0) AS first_goal_for_flag,
    COALESCE(es.goals_for_total, 0)     AS goals_for_total,
    COALESCE(os.goals_against_0_15, 0)   AS goals_against_0_15,
    COALESCE(os.goals_against_16_30, 0)  AS goals_against_16_30,
    COALESCE(os.goals_against_31_45, 0)  AS goals_against_31_45,
    COALESCE(os.goals_against_46_60, 0)  AS goals_against_46_60,
    COALESCE(os.goals_against_61_75, 0)  AS goals_against_61_75,
    COALESCE(os.goals_against_76_90, 0)  AS goals_against_76_90,
    COALESCE(os.late_goal_against_flag, 0)  AS late_goal_against_flag,
    COALESCE(os.first_goal_against_flag, 0) AS first_goal_against_flag,
    COALESCE(os.goals_against_total, 0)     AS goals_against_total,
    -- Comeback: conceded first but still scored
    CASE WHEN COALESCE(os.first_goal_against_flag, 0) = 1
              AND COALESCE(es.goals_for_total, 0) > 0 THEN 1 ELSE 0 END AS comeback_flag,
    -- Late goal pressure: opponent scored 76+ while team was leading overall
    CASE WHEN COALESCE(os.late_goal_against_flag, 0) = 1
              AND COALESCE(es.goals_for_total, 0) > COALESCE(os.goals_against_total, 0) THEN 1 ELSE 0 END AS late_pressure_flag
  FROM l10_matches lm
  LEFT JOIN match_event_summary es USING (target_match_id, team_id, src_match_id)
  LEFT JOIN match_opp_summary os USING (target_match_id, team_id, src_match_id)
)

-- Final aggregation across L10 matches
SELECT
  target_match_id,
  team_id,
  COUNT(DISTINCT src_match_id)                              AS n_event_matches_l10,
  ROUND(AVG(goals_for_0_15)::numeric,  4)                   AS goals_0_15_avg_l10,
  ROUND(AVG(goals_for_16_30)::numeric, 4)                   AS goals_16_30_avg_l10,
  ROUND(AVG(goals_for_31_45)::numeric, 4)                   AS goals_31_45_avg_l10,
  ROUND(AVG(goals_for_46_60)::numeric, 4)                   AS goals_46_60_avg_l10,
  ROUND(AVG(goals_for_61_75)::numeric, 4)                   AS goals_61_75_avg_l10,
  ROUND(AVG(goals_for_76_90)::numeric, 4)                   AS goals_76_90_avg_l10,
  ROUND(AVG(goals_against_0_15)::numeric,  4)               AS goals_conceded_0_15_avg_l10,
  ROUND(AVG(goals_against_16_30)::numeric, 4)               AS goals_conceded_16_30_avg_l10,
  ROUND(AVG(goals_against_31_45)::numeric, 4)               AS goals_conceded_31_45_avg_l10,
  ROUND(AVG(goals_against_46_60)::numeric, 4)               AS goals_conceded_46_60_avg_l10,
  ROUND(AVG(goals_against_61_75)::numeric, 4)               AS goals_conceded_61_75_avg_l10,
  ROUND(AVG(goals_against_76_90)::numeric, 4)               AS goals_conceded_76_90_avg_l10,
  ROUND(AVG(yellows_0_15)::numeric,  4)                     AS cards_0_15_avg_l10,
  ROUND(AVG(yellows_16_30)::numeric, 4)                     AS cards_16_30_avg_l10,
  ROUND(AVG(yellows_31_45)::numeric, 4)                     AS cards_31_45_avg_l10,
  ROUND(AVG(yellows_46_60)::numeric, 4)                     AS cards_46_60_avg_l10,
  ROUND(AVG(yellows_61_75)::numeric, 4)                     AS cards_61_75_avg_l10,
  ROUND(AVG(yellows_76_90)::numeric, 4)                     AS cards_76_90_avg_l10,
  ROUND(AVG(red_cards_total)::numeric, 4)                   AS red_cards_avg_l10,
  ROUND(AVG(subs_total)::numeric, 4)                        AS substitutions_avg_l10,
  ROUND(AVG(late_goal_for_flag)::numeric, 4)                AS late_goal_for_rate_l10,
  ROUND(AVG(late_goal_against_flag)::numeric, 4)            AS late_goal_against_rate_l10,
  ROUND(AVG(first_goal_for_flag)::numeric, 4)               AS first_goal_for_rate_l10,
  ROUND(AVG(first_goal_against_flag)::numeric, 4)           AS first_goal_against_rate_l10,
  ROUND(AVG(comeback_flag)::numeric, 4)                     AS comeback_signal_l10,
  ROUND(AVG(late_pressure_flag)::numeric, 4)                AS late_goal_pressure_l10
FROM match_combined
GROUP BY target_match_id, team_id;
