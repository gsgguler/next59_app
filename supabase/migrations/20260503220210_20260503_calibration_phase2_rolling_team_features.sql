/*
  # Calibration Phase 2: Leakage-Safe Rolling Team Pre-Match Features

  Creates model_lab.v_team_pre_match_rolling_features

  One row per (target_match_id, team_id).

  LEAKAGE SAFETY RULE:
  For any target match M at match_date T, all source matches must have
  source_match.match_date < T (strictly before). Target match never
  appears in its own feature computation.

  Rolling windows: last_5, last_10, last_20, season_to_date.

  Candidate internal indices (heuristic, not final model truth):
  - attack_index_l5, defense_resistance_index_l5
  - xg_lite_internal_l5/l10 (internal proxy, not real xG)
  - tempo_index_l5, shot_quality_proxy_l5
  - discipline_risk_l5, set_piece_threat_l5
*/

CREATE OR REPLACE VIEW model_lab.v_team_pre_match_rolling_features AS

WITH
match_base AS (
  SELECT match_id, competition_id, season_id, match_date,
         home_team_id, away_team_id, home_score_ft, away_score_ft, actual_result_1x2
  FROM model_lab.v_calibration_match_universe
),

-- One row per match per team perspective
team_match_results AS (
  SELECT match_id, competition_id, season_id, match_date,
         home_team_id AS team_id,
         home_score_ft AS goals_for, away_score_ft AS goals_against,
         CASE WHEN actual_result_1x2='H' THEN 3 WHEN actual_result_1x2='D' THEN 1 ELSE 0 END AS points,
         (CASE WHEN actual_result_1x2='H' THEN 1 ELSE 0 END)::int AS is_win,
         (CASE WHEN actual_result_1x2='D' THEN 1 ELSE 0 END)::int AS is_draw,
         (CASE WHEN actual_result_1x2='A' THEN 1 ELSE 0 END)::int AS is_loss
  FROM match_base
  UNION ALL
  SELECT match_id, competition_id, season_id, match_date,
         away_team_id AS team_id,
         away_score_ft AS goals_for, home_score_ft AS goals_against,
         CASE WHEN actual_result_1x2='A' THEN 3 WHEN actual_result_1x2='D' THEN 1 ELSE 0 END AS points,
         (CASE WHEN actual_result_1x2='A' THEN 1 ELSE 0 END)::int AS is_win,
         (CASE WHEN actual_result_1x2='D' THEN 1 ELSE 0 END)::int AS is_draw,
         (CASE WHEN actual_result_1x2='H' THEN 1 ELSE 0 END)::int AS is_loss
  FROM match_base
),

-- Stats per team per match with date (from enriched fixtures only)
team_stats AS (
  SELECT tms.match_id, tms.team_id, m.match_date,
         tms.total_shots, tms.shots_on_goal, tms.shots_insidebox,
         tms.shots_outsidebox, tms.blocked_shots, tms.corner_kicks,
         tms.fouls, tms.yellow_cards, tms.red_cards,
         tms.goalkeeper_saves, tms.ball_possession,
         tms.total_passes, tms.passes_percentage,
         tms.expected_goals_provider, tms.has_expected_goals_provider
  FROM v_team_match_stats tms
  JOIN matches m ON m.id = tms.match_id
),

-- Rank source matches per target match (strictly before target date)
src_ranked AS (
  SELECT
    target.match_id         AS target_match_id,
    target.team_id          AS team_id,
    target.match_date       AS target_match_date,
    target.season_id        AS target_season_id,
    src.match_id            AS src_match_id,
    src.goals_for           AS gf,
    src.goals_against       AS ga,
    src.points              AS pts,
    src.is_win              AS win,
    src.is_draw             AS draw,
    src.is_loss             AS loss,
    src.season_id           AS src_season_id,
    ROW_NUMBER() OVER (
      PARTITION BY target.match_id, target.team_id
      ORDER BY src.match_date DESC, src.match_id DESC
    )                       AS rn_recent,
    CASE WHEN src.season_id = target.season_id THEN 1 ELSE 0 END AS same_season
  FROM team_match_results target
  JOIN team_match_results src
    ON  src.team_id    = target.team_id
    AND src.match_date < target.match_date
    AND src.match_id  != target.match_id
),

-- Rank stats source matches per target match
stats_ranked AS (
  SELECT
    target.match_id    AS target_match_id,
    target.team_id     AS team_id,
    ts.match_id        AS src_match_id,
    ts.total_shots, ts.shots_on_goal, ts.shots_insidebox,
    ts.shots_outsidebox, ts.blocked_shots, ts.corner_kicks,
    ts.fouls, ts.yellow_cards, ts.red_cards,
    ts.goalkeeper_saves, ts.ball_possession,
    ts.total_passes, ts.passes_percentage,
    ts.expected_goals_provider, ts.has_expected_goals_provider,
    ROW_NUMBER() OVER (
      PARTITION BY target.match_id, target.team_id
      ORDER BY ts.match_date DESC, ts.match_id DESC
    ) AS rn_recent
  FROM team_match_results target
  JOIN team_stats ts
    ON  ts.team_id    = target.team_id
    AND ts.match_date < target.match_date
    AND ts.match_id  != target.match_id
)

SELECT
  sr.target_match_id                                            AS target_match_id,
  sr.team_id                                                    AS team_id,
  sr.target_match_date                                          AS target_match_date,

  -- FORM L5
  COUNT(*) FILTER (WHERE sr.rn_recent <= 5)                    AS matches_played_l5,
  AVG(sr.pts::numeric)  FILTER (WHERE sr.rn_recent <= 5)       AS points_per_match_l5,
  AVG(sr.win::numeric)  FILTER (WHERE sr.rn_recent <= 5)       AS win_rate_l5,
  AVG(sr.draw::numeric) FILTER (WHERE sr.rn_recent <= 5)       AS draw_rate_l5,
  AVG(sr.loss::numeric) FILTER (WHERE sr.rn_recent <= 5)       AS loss_rate_l5,
  AVG(sr.gf::numeric)   FILTER (WHERE sr.rn_recent <= 5)       AS goals_for_avg_l5,
  AVG(sr.ga::numeric)   FILTER (WHERE sr.rn_recent <= 5)       AS goals_against_avg_l5,
  AVG((sr.gf - sr.ga)::numeric) FILTER (WHERE sr.rn_recent <= 5) AS goal_diff_avg_l5,

  -- FORM L10
  COUNT(*) FILTER (WHERE sr.rn_recent <= 10)                   AS matches_played_l10,
  AVG(sr.pts::numeric)  FILTER (WHERE sr.rn_recent <= 10)      AS points_per_match_l10,
  AVG(sr.win::numeric)  FILTER (WHERE sr.rn_recent <= 10)      AS win_rate_l10,
  AVG(sr.draw::numeric) FILTER (WHERE sr.rn_recent <= 10)      AS draw_rate_l10,
  AVG(sr.loss::numeric) FILTER (WHERE sr.rn_recent <= 10)      AS loss_rate_l10,
  AVG(sr.gf::numeric)   FILTER (WHERE sr.rn_recent <= 10)      AS goals_for_avg_l10,
  AVG(sr.ga::numeric)   FILTER (WHERE sr.rn_recent <= 10)      AS goals_against_avg_l10,
  AVG((sr.gf - sr.ga)::numeric) FILTER (WHERE sr.rn_recent <= 10) AS goal_diff_avg_l10,

  -- FORM L20
  COUNT(*) FILTER (WHERE sr.rn_recent <= 20)                   AS matches_played_l20,
  AVG(sr.pts::numeric)  FILTER (WHERE sr.rn_recent <= 20)      AS points_per_match_l20,
  AVG(sr.win::numeric)  FILTER (WHERE sr.rn_recent <= 20)      AS win_rate_l20,
  AVG(sr.draw::numeric) FILTER (WHERE sr.rn_recent <= 20)      AS draw_rate_l20,
  AVG(sr.loss::numeric) FILTER (WHERE sr.rn_recent <= 20)      AS loss_rate_l20,
  AVG(sr.gf::numeric)   FILTER (WHERE sr.rn_recent <= 20)      AS goals_for_avg_l20,
  AVG(sr.ga::numeric)   FILTER (WHERE sr.rn_recent <= 20)      AS goals_against_avg_l20,
  AVG((sr.gf - sr.ga)::numeric) FILTER (WHERE sr.rn_recent <= 20) AS goal_diff_avg_l20,

  -- SEASON TO DATE
  COUNT(*) FILTER (WHERE sr.same_season = 1)                   AS matches_played_std,
  AVG(sr.pts::numeric)  FILTER (WHERE sr.same_season = 1)      AS points_per_match_std,
  AVG(sr.win::numeric)  FILTER (WHERE sr.same_season = 1)      AS win_rate_std,
  AVG(sr.gf::numeric)   FILTER (WHERE sr.same_season = 1)      AS goals_for_avg_std,
  AVG(sr.ga::numeric)   FILTER (WHERE sr.same_season = 1)      AS goals_against_avg_std,

  -- STATS L5
  AVG(st.total_shots)       FILTER (WHERE st.rn_recent <= 5)   AS shots_avg_l5,
  AVG(st.shots_on_goal)     FILTER (WHERE st.rn_recent <= 5)   AS shots_on_goal_avg_l5,
  AVG(st.shots_insidebox)   FILTER (WHERE st.rn_recent <= 5)   AS shots_insidebox_avg_l5,
  AVG(st.shots_outsidebox)  FILTER (WHERE st.rn_recent <= 5)   AS shots_outsidebox_avg_l5,
  AVG(st.blocked_shots)     FILTER (WHERE st.rn_recent <= 5)   AS blocked_shots_avg_l5,
  AVG(st.corner_kicks)      FILTER (WHERE st.rn_recent <= 5)   AS corners_avg_l5,
  AVG(st.fouls)             FILTER (WHERE st.rn_recent <= 5)   AS fouls_avg_l5,
  AVG(st.yellow_cards)      FILTER (WHERE st.rn_recent <= 5)   AS yellow_cards_avg_l5,
  AVG(st.red_cards)         FILTER (WHERE st.rn_recent <= 5)   AS red_cards_avg_l5,
  AVG(st.goalkeeper_saves)  FILTER (WHERE st.rn_recent <= 5)   AS goalkeeper_saves_avg_l5,
  AVG(st.ball_possession)   FILTER (WHERE st.rn_recent <= 5)   AS possession_avg_l5,
  AVG(st.total_passes)      FILTER (WHERE st.rn_recent <= 5)   AS passes_avg_l5,
  AVG(st.passes_percentage) FILTER (WHERE st.rn_recent <= 5)   AS pass_accuracy_avg_l5,

  -- STATS L10
  AVG(st.total_shots)       FILTER (WHERE st.rn_recent <= 10)  AS shots_avg_l10,
  AVG(st.shots_on_goal)     FILTER (WHERE st.rn_recent <= 10)  AS shots_on_goal_avg_l10,
  AVG(st.shots_insidebox)   FILTER (WHERE st.rn_recent <= 10)  AS shots_insidebox_avg_l10,
  AVG(st.blocked_shots)     FILTER (WHERE st.rn_recent <= 10)  AS blocked_shots_avg_l10,
  AVG(st.corner_kicks)      FILTER (WHERE st.rn_recent <= 10)  AS corners_avg_l10,
  AVG(st.fouls)             FILTER (WHERE st.rn_recent <= 10)  AS fouls_avg_l10,
  AVG(st.yellow_cards)      FILTER (WHERE st.rn_recent <= 10)  AS yellow_cards_avg_l10,
  AVG(st.red_cards)         FILTER (WHERE st.rn_recent <= 10)  AS red_cards_avg_l10,
  AVG(st.goalkeeper_saves)  FILTER (WHERE st.rn_recent <= 10)  AS goalkeeper_saves_avg_l10,
  AVG(st.ball_possession)   FILTER (WHERE st.rn_recent <= 10)  AS possession_avg_l10,
  AVG(st.passes_percentage) FILTER (WHERE st.rn_recent <= 10)  AS pass_accuracy_avg_l10,

  -- Provider xG history (previous matches only)
  AVG(st.expected_goals_provider) FILTER (
    WHERE st.rn_recent <= 5 AND st.has_expected_goals_provider
  )                                                             AS expected_goals_provider_avg_l5,
  AVG(st.expected_goals_provider) FILTER (
    WHERE st.rn_recent <= 10 AND st.has_expected_goals_provider
  )                                                             AS expected_goals_provider_avg_l10,
  BOOL_OR(st.has_expected_goals_provider) FILTER (WHERE st.rn_recent <= 10)  AS has_xg_provider_history,
  COUNT(*) FILTER (WHERE st.rn_recent <= 10 AND st.has_expected_goals_provider) AS xg_provider_coverage_l10,

  -- CANDIDATE INTERNAL INDICES (heuristic, not final model truth)

  -- attack_index_l5: shots quality proxy normalized ~0-3 range
  CASE WHEN COUNT(st.src_match_id) FILTER (WHERE st.rn_recent <= 5) > 0 THEN
    (COALESCE(AVG(st.shots_on_goal)   FILTER (WHERE st.rn_recent <= 5), 0) * 2.0
   + COALESCE(AVG(st.shots_insidebox) FILTER (WHERE st.rn_recent <= 5), 0) * 1.5
   + COALESCE(AVG(st.total_shots)     FILTER (WHERE st.rn_recent <= 5), 0)) / 10.0
  ELSE
    COALESCE(AVG(sr.gf::numeric) FILTER (WHERE sr.rn_recent <= 5), 0) / 3.0
  END                                                           AS attack_index_l5,

  -- defense_resistance_index_l5
  1.0 / (1.0 + COALESCE(AVG(sr.ga::numeric) FILTER (WHERE sr.rn_recent <= 5), 2.0))
                                                                AS defense_resistance_index_l5,

  -- xg_lite_internal_l5 (internal proxy only)
  CASE
    WHEN AVG(st.expected_goals_provider) FILTER (WHERE st.rn_recent <= 5 AND st.has_expected_goals_provider) IS NOT NULL
    THEN AVG(st.expected_goals_provider) FILTER (WHERE st.rn_recent <= 5 AND st.has_expected_goals_provider) * 0.65
       + COALESCE(AVG(st.shots_on_goal)  FILTER (WHERE st.rn_recent <= 5), 0) * 0.35 * 0.35
    WHEN AVG(st.shots_on_goal) FILTER (WHERE st.rn_recent <= 5) IS NOT NULL
    THEN AVG(st.shots_on_goal) FILTER (WHERE st.rn_recent <= 5) * 0.35
    ELSE COALESCE(AVG(sr.gf::numeric) FILTER (WHERE sr.rn_recent <= 5), 0)
  END                                                           AS xg_lite_internal_l5,

  -- xg_lite_internal_l10
  CASE
    WHEN AVG(st.expected_goals_provider) FILTER (WHERE st.rn_recent <= 10 AND st.has_expected_goals_provider) IS NOT NULL
    THEN AVG(st.expected_goals_provider) FILTER (WHERE st.rn_recent <= 10 AND st.has_expected_goals_provider) * 0.65
       + COALESCE(AVG(st.shots_on_goal)  FILTER (WHERE st.rn_recent <= 10), 0) * 0.35 * 0.35
    WHEN AVG(st.shots_on_goal) FILTER (WHERE st.rn_recent <= 10) IS NOT NULL
    THEN AVG(st.shots_on_goal) FILTER (WHERE st.rn_recent <= 10) * 0.35
    ELSE COALESCE(AVG(sr.gf::numeric) FILTER (WHERE sr.rn_recent <= 10), 0)
  END                                                           AS xg_lite_internal_l10,

  -- tempo_index_l5
  CASE WHEN AVG(st.total_passes) FILTER (WHERE st.rn_recent <= 5) IS NOT NULL THEN
    (COALESCE(AVG(st.total_passes)  FILTER (WHERE st.rn_recent <= 5), 400) / 500.0
   + COALESCE(AVG(st.corner_kicks) FILTER (WHERE st.rn_recent <= 5), 4)   / 12.0) / 2.0
  ELSE NULL END                                                 AS tempo_index_l5,

  -- shot_quality_proxy_l5
  CASE WHEN COALESCE(AVG(st.total_shots) FILTER (WHERE st.rn_recent <= 5), 0) > 0 THEN
    COALESCE(AVG(st.shots_insidebox) FILTER (WHERE st.rn_recent <= 5), 0)
    / NULLIF(AVG(st.total_shots) FILTER (WHERE st.rn_recent <= 5), 0)
  ELSE NULL END                                                 AS shot_quality_proxy_l5,

  -- discipline_risk_l5
  COALESCE(AVG(st.yellow_cards) FILTER (WHERE st.rn_recent <= 5), 0)
  + COALESCE(AVG(st.red_cards)  FILTER (WHERE st.rn_recent <= 5), 0) * 3.0
                                                                AS discipline_risk_l5,

  -- set_piece_threat_l5
  COALESCE(AVG(st.corner_kicks) FILTER (WHERE st.rn_recent <= 5), 0) AS set_piece_threat_l5,

  -- Stats availability
  COUNT(st.src_match_id) FILTER (WHERE st.rn_recent <= 5)      AS stats_matches_l5,
  COUNT(st.src_match_id) FILTER (WHERE st.rn_recent <= 10)     AS stats_matches_l10,
  (COUNT(st.src_match_id) FILTER (WHERE st.rn_recent <= 5) > 0) AS has_stats_features

FROM src_ranked sr
LEFT JOIN stats_ranked st
  ON  st.target_match_id = sr.target_match_id
  AND st.team_id         = sr.team_id
  AND st.src_match_id    = sr.src_match_id

GROUP BY sr.target_match_id, sr.team_id, sr.target_match_date;

COMMENT ON VIEW model_lab.v_team_pre_match_rolling_features IS
  'Phase 2: Leakage-safe rolling pre-match features. '
  'All source matches strictly before target_match_date. '
  'xg_lite_internal is an internal proxy only, not real xG.';
