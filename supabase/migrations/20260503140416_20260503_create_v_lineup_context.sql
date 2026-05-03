/*
  # Create v_lineup_context

  Read-only view. One row per match/team combination in api_football_fixture_lineups.

  Columns:
  - match_id, team_id, api_football_fixture_id
  - formation, has_formation, has_starting_xi
  - starter_count, bench_count
  - missing_position_count, missing_grid_count, missing_number_count
  - lineup_quality_score: 0-100
      25pts: has_formation
      25pts: starter_count = 11
      25pts: missing_position_count = 0
      25pts: missing_grid_count = 0 (starters only)
*/

CREATE OR REPLACE VIEW public.v_lineup_context AS
SELECT
  l.match_id,
  l.team_id,
  l.api_football_fixture_id,
  l.formation,
  (l.formation IS NOT NULL AND l.formation <> '')            AS has_formation,

  -- Player aggregates from lineup players
  COUNT(p.id)                                               AS total_players,
  COUNT(p.id) FILTER (WHERE p.is_starting = true)          AS starter_count,
  COUNT(p.id) FILTER (WHERE p.is_starting = false)         AS bench_count,
  (COUNT(p.id) FILTER (WHERE p.is_starting = true)) >= 11  AS has_starting_xi,

  -- Quality gaps
  COUNT(p.id) FILTER (WHERE p.position IS NULL)            AS missing_position_count,
  COUNT(p.id) FILTER (WHERE p.grid IS NULL AND p.is_starting = true) AS missing_grid_count,
  COUNT(p.id) FILTER (WHERE p.player_number IS NULL)       AS missing_number_count,

  -- Quality score 0-100
  (
    CASE WHEN l.formation IS NOT NULL AND l.formation <> '' THEN 25 ELSE 0 END
  + CASE WHEN (COUNT(p.id) FILTER (WHERE p.is_starting = true)) >= 11 THEN 25 ELSE 0 END
  + CASE WHEN (COUNT(p.id) FILTER (WHERE p.position IS NULL)) = 0 THEN 25 ELSE 0 END
  + CASE WHEN (COUNT(p.id) FILTER (WHERE p.grid IS NULL AND p.is_starting = true)) = 0 THEN 25 ELSE 0 END
  )                                                         AS lineup_quality_score

FROM public.api_football_fixture_lineups l
LEFT JOIN public.api_football_fixture_lineup_players p ON p.lineup_id = l.id
GROUP BY l.id, l.match_id, l.team_id, l.api_football_fixture_id, l.formation;
