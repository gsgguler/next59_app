
-- Build wc_qualifier_team_summary for all confederations
-- Sources:
--   UEFA/CONMEBOL/CONCACAF/OFC/Intercontinental: computed from wc_qualifier_fixtures + wc_qualifier_team_match_stats
--   AFC/CAF (no detail sync yet): computed from wc_qualifier_fixtures (scores) + wc_qualifier_standings (W/D/L/GF/GA)

-- ─── 1. Fixture-based summary (all confederations where we have fixture scores) ─────────────

INSERT INTO wc_qualifier_team_summary (
  provider, provider_team_id, team_name, confederation,
  matches_played, wins, draws, losses,
  goals_for, goals_against, goal_difference,
  points, points_per_match, win_rate, draw_rate, loss_rate,
  goals_for_per_match, goals_against_per_match,
  clean_sheets, failed_to_score,
  avg_possession_pct, avg_total_shots, avg_shots_on_goal,
  avg_corners, avg_fouls, avg_yellow_cards, avg_red_cards,
  total_xg, xg_per_match,
  raw_sources_json, updated_at
)
WITH home_agg AS (
  SELECT
    home_provider_team_id AS team_id,
    home_team_name        AS team_name,
    confederation,
    SUM(CASE WHEN home_score > away_score THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
    SUM(CASE WHEN home_score < away_score THEN 1 ELSE 0 END) AS losses,
    SUM(COALESCE(home_score, 0)) AS gf,
    SUM(COALESCE(away_score, 0)) AS ga,
    SUM(CASE WHEN COALESCE(away_score, 1) = 0 THEN 1 ELSE 0 END) AS clean_sheets,
    SUM(CASE WHEN COALESCE(home_score, 1) = 0 THEN 1 ELSE 0 END) AS failed_to_score
  FROM wc_qualifier_fixtures
  WHERE provider = 'api_football'
    AND status_short IN ('FT','AET','PEN')
    AND home_score IS NOT NULL
  GROUP BY home_provider_team_id, home_team_name, confederation
),
away_agg AS (
  SELECT
    away_provider_team_id AS team_id,
    away_team_name        AS team_name,
    confederation,
    SUM(CASE WHEN away_score > home_score THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN away_score = home_score THEN 1 ELSE 0 END) AS draws,
    SUM(CASE WHEN away_score < home_score THEN 1 ELSE 0 END) AS losses,
    SUM(COALESCE(away_score, 0)) AS gf,
    SUM(COALESCE(home_score, 0)) AS ga,
    SUM(CASE WHEN COALESCE(home_score, 1) = 0 THEN 1 ELSE 0 END) AS clean_sheets,
    SUM(CASE WHEN COALESCE(away_score, 1) = 0 THEN 1 ELSE 0 END) AS failed_to_score
  FROM wc_qualifier_fixtures
  WHERE provider = 'api_football'
    AND status_short IN ('FT','AET','PEN')
    AND away_score IS NOT NULL
  GROUP BY away_provider_team_id, away_team_name, confederation
),
combined AS (
  SELECT
    COALESCE(h.team_id, a.team_id) AS team_id,
    COALESCE(h.team_name, a.team_name) AS team_name,
    COALESCE(h.confederation, a.confederation) AS confederation,
    COALESCE(h.wins,0) + COALESCE(a.wins,0) AS wins,
    COALESCE(h.draws,0) + COALESCE(a.draws,0) AS draws,
    COALESCE(h.losses,0) + COALESCE(a.losses,0) AS losses,
    COALESCE(h.gf,0) + COALESCE(a.gf,0) AS gf,
    COALESCE(h.ga,0) + COALESCE(a.ga,0) AS ga,
    COALESCE(h.clean_sheets,0) + COALESCE(a.clean_sheets,0) AS clean_sheets,
    COALESCE(h.failed_to_score,0) + COALESCE(a.failed_to_score,0) AS failed_to_score
  FROM home_agg h FULL OUTER JOIN away_agg a
    ON h.team_id = a.team_id AND h.confederation = a.confederation
),
stats_agg AS (
  SELECT
    provider_team_id,
    AVG(ball_possession_pct) FILTER (WHERE ball_possession_pct IS NOT NULL) AS avg_poss,
    AVG(total_shots)         FILTER (WHERE total_shots IS NOT NULL)         AS avg_shots,
    AVG(shots_on_goal)       FILTER (WHERE shots_on_goal IS NOT NULL)       AS avg_shots_on,
    AVG(corner_kicks)        FILTER (WHERE corner_kicks IS NOT NULL)        AS avg_corners,
    AVG(fouls)               FILTER (WHERE fouls IS NOT NULL)               AS avg_fouls,
    AVG(yellow_cards)        FILTER (WHERE yellow_cards IS NOT NULL)        AS avg_yellow,
    AVG(red_cards)           FILTER (WHERE red_cards IS NOT NULL)           AS avg_red,
    SUM(provider_xg)         FILTER (WHERE provider_xg IS NOT NULL)        AS total_xg,
    COUNT(*)                                                                AS stat_rows
  FROM wc_qualifier_team_match_stats
  WHERE provider = 'api_football'
  GROUP BY provider_team_id
)
SELECT
  'api_football',
  c.team_id,
  c.team_name,
  c.confederation,
  c.wins + c.draws + c.losses,
  c.wins, c.draws, c.losses,
  c.gf, c.ga,
  c.gf - c.ga,
  c.wins * 3 + c.draws,
  ROUND(((c.wins * 3 + c.draws)::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  ROUND((c.wins::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  ROUND((c.draws::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  ROUND((c.losses::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  ROUND((c.gf::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  ROUND((c.ga::numeric / NULLIF(c.wins + c.draws + c.losses, 0)), 3),
  c.clean_sheets,
  c.failed_to_score,
  ROUND(s.avg_poss::numeric, 1),
  ROUND(s.avg_shots::numeric, 2),
  ROUND(s.avg_shots_on::numeric, 2),
  ROUND(s.avg_corners::numeric, 2),
  ROUND(s.avg_fouls::numeric, 2),
  ROUND(s.avg_yellow::numeric, 2),
  ROUND(s.avg_red::numeric, 2),
  ROUND(s.total_xg::numeric, 3),
  ROUND((s.total_xg / NULLIF(c.wins + c.draws + c.losses, 0))::numeric, 3),
  jsonb_build_object('source', 'fixture_aggregation', 'stat_rows', COALESCE(s.stat_rows, 0)),
  NOW()
FROM combined c
LEFT JOIN stats_agg s ON s.provider_team_id = c.team_id
WHERE c.wins + c.draws + c.losses > 0
ON CONFLICT (provider, provider_team_id, confederation) DO UPDATE SET
  team_name           = EXCLUDED.team_name,
  matches_played      = EXCLUDED.matches_played,
  wins                = EXCLUDED.wins,
  draws               = EXCLUDED.draws,
  losses              = EXCLUDED.losses,
  goals_for           = EXCLUDED.goals_for,
  goals_against       = EXCLUDED.goals_against,
  goal_difference     = EXCLUDED.goal_difference,
  points              = EXCLUDED.points,
  points_per_match    = EXCLUDED.points_per_match,
  win_rate            = EXCLUDED.win_rate,
  draw_rate           = EXCLUDED.draw_rate,
  loss_rate           = EXCLUDED.loss_rate,
  goals_for_per_match = EXCLUDED.goals_for_per_match,
  goals_against_per_match = EXCLUDED.goals_against_per_match,
  clean_sheets        = EXCLUDED.clean_sheets,
  failed_to_score     = EXCLUDED.failed_to_score,
  avg_possession_pct  = EXCLUDED.avg_possession_pct,
  avg_total_shots     = EXCLUDED.avg_total_shots,
  avg_shots_on_goal   = EXCLUDED.avg_shots_on_goal,
  avg_corners         = EXCLUDED.avg_corners,
  avg_fouls           = EXCLUDED.avg_fouls,
  avg_yellow_cards    = EXCLUDED.avg_yellow_cards,
  avg_red_cards       = EXCLUDED.avg_red_cards,
  total_xg            = EXCLUDED.total_xg,
  xg_per_match        = EXCLUDED.xg_per_match,
  raw_sources_json    = EXCLUDED.raw_sources_json,
  updated_at          = NOW();
