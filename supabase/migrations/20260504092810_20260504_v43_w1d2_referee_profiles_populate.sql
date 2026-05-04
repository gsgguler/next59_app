/*
  # v4.3-W1-D2 Part B: Populate referee_profiles

  Aggregates per-referee stats from matches + match_stats.
  home/away split via matches.home_team_id / away_team_id.
  Minimum 10 matches with stats for inclusion.
  370 referees expected.
*/

WITH per_match AS (
  SELECT
    m.referee,
    m.id AS match_id,
    m.match_date,
    -- combined totals
    SUM(ms.yellow_cards) AS total_yellow,
    SUM(ms.red_cards)    AS total_red,
    SUM(ms.fouls)        AS total_fouls,
    -- home team only
    MAX(CASE WHEN ms.team_id = m.home_team_id THEN ms.yellow_cards END) AS home_yellow,
    -- away team only
    MAX(CASE WHEN ms.team_id = m.away_team_id THEN ms.yellow_cards END) AS away_yellow
  FROM public.matches m
  JOIN public.match_stats ms ON ms.match_id = m.id
  WHERE m.referee IS NOT NULL
  GROUP BY m.referee, m.id, m.match_date
),
aggregated AS (
  SELECT
    referee,
    COUNT(*)                                   AS matches_officiated,
    ROUND(AVG(total_yellow), 2)                AS avg_yellow_cards,
    ROUND(AVG(total_red), 3)                   AS avg_red_cards,
    ROUND(AVG(total_fouls), 2)                 AS avg_fouls,
    ROUND(AVG(home_yellow), 3)                 AS home_yellow_rate,
    ROUND(AVG(away_yellow), 3)                 AS away_yellow_rate,
    MIN(match_date)                            AS first_match_date,
    MAX(match_date)                            AS last_match_date
  FROM per_match
  GROUP BY referee
  HAVING COUNT(*) >= 10
),
with_bias AS (
  SELECT *,
    CASE
      WHEN (home_yellow_rate + away_yellow_rate) > 0
      THEN ROUND(
        (home_yellow_rate - away_yellow_rate) /
        (home_yellow_rate + away_yellow_rate), 4)
      ELSE 0
    END AS home_bias_score
  FROM aggregated
),
with_percentiles AS (
  SELECT *,
    NTILE(100) OVER (ORDER BY avg_yellow_cards DESC) AS card_intensity_percentile,
    NTILE(100) OVER (ORDER BY avg_fouls DESC)        AS whistle_intensity_percentile
  FROM with_bias
)
INSERT INTO shared.referee_profiles (
  referee_name, matches_officiated,
  avg_yellow_cards, avg_red_cards, avg_fouls,
  home_yellow_rate, away_yellow_rate, home_bias_score,
  card_intensity_percentile, whistle_intensity_percentile,
  first_match_date, last_match_date,
  active
)
SELECT
  referee,
  matches_officiated,
  avg_yellow_cards, avg_red_cards, avg_fouls,
  home_yellow_rate, away_yellow_rate, home_bias_score,
  card_intensity_percentile, whistle_intensity_percentile,
  first_match_date, last_match_date,
  (last_match_date >= CURRENT_DATE - INTERVAL '180 days') AS active
FROM with_percentiles
ON CONFLICT (referee_name) DO NOTHING;
