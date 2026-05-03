/*
  # Calibration Phase 1: Match Universe View

  Creates model_lab.v_calibration_match_universe — one row per eligible completed
  domestic match for the calibration pipeline.

  Scope:
  - FT completed matches with valid home/away scores
  - match_date <= 2025-06-01 (training cutoff)
  - Domestic leagues only (competition_level IS NULL in competitions table
    which is how domestic is stored; UEFA competitions have explicit levels)
  - Excludes World Cup (handled in separate wc_history schema)

  Safety: This view contains ONLY match metadata + outcome labels.
  NO pre-match features included. NO target match stats/events/lineups.
  Output columns are identification + outcome only.

  data_quality_tier based on v_match_enriched_context:
  - full_enriched: has_statistics AND has_events AND has_lineups
  - partial_enriched: has_statistics (but missing events or lineups)
  - basic: no enrichment available
*/

CREATE OR REPLACE VIEW model_lab.v_calibration_match_universe AS
SELECT
  m.id                                                   AS match_id,
  cs.competition_id                                      AS competition_id,
  c.name                                                 AS competition_name,
  cs.season_id                                           AS season_id,
  s.label                                                AS season_label,
  s.year                                                 AS season_year,
  m.match_date                                           AS match_date,
  m.home_team_id                                         AS home_team_id,
  m.away_team_id                                         AS away_team_id,
  m.home_score_ft                                        AS home_score_ft,
  m.away_score_ft                                        AS away_score_ft,
  -- Outcome label: H=home win, D=draw, A=away win
  CASE
    WHEN m.home_score_ft > m.away_score_ft  THEN 'H'
    WHEN m.home_score_ft = m.away_score_ft  THEN 'D'
    WHEN m.home_score_ft < m.away_score_ft  THEN 'A'
  END                                                    AS actual_result_1x2,
  m.home_score_ft                                        AS actual_home_goals,
  m.away_score_ft                                        AS actual_away_goals,
  -- Data quality tier from enrichment context
  COALESCE(
    CASE
      WHEN ec.has_statistics AND ec.has_events AND ec.has_lineups THEN 'full_enriched'
      WHEN ec.has_statistics                                      THEN 'partial_enriched'
      ELSE 'basic'
    END,
    'basic'
  )                                                      AS data_quality_tier,
  COALESCE(ec.has_statistics, false)                     AS has_stats,
  COALESCE(ec.has_events, false)                         AS has_events,
  COALESCE(ec.has_lineups, false)                        AS has_lineups,
  -- Player features available: check if any player stats exist for this fixture
  EXISTS (
    SELECT 1 FROM af_fixture_player_stats fps
    WHERE fps.match_id = m.id
    LIMIT 1
  )                                                      AS has_player_features

FROM matches m
JOIN competition_seasons cs ON cs.id = m.competition_season_id
JOIN competitions c         ON c.id  = cs.competition_id
JOIN seasons s              ON s.id  = cs.season_id
LEFT JOIN v_match_enriched_context ec ON ec.match_id = m.id

WHERE
  -- FT completed with valid score
  m.home_score_ft IS NOT NULL
  AND m.away_score_ft IS NOT NULL
  -- Training cutoff — safe side: only use matches before this date
  AND m.match_date <= '2025-06-01'
  -- Domestic leagues only: competition_level is NULL for domestic,
  -- explicit values ('champions_league', 'europa_league', 'uefa_super_cup') for UEFA
  AND (c.competition_level IS NULL OR c.competition_level = '')
  -- Exclude any competition that is of type 'Cup' with World Cup in name
  -- (WC handled in wc_history schema, not in matches table)
  AND c.name NOT ILIKE '%world cup%'
  AND c.name NOT ILIKE '%copa mundial%'
;

COMMENT ON VIEW model_lab.v_calibration_match_universe IS
  'Phase 1: One row per eligible completed domestic match for calibration. '
  'Contains match metadata and outcome labels only. '
  'No pre-match features, no target match stats/events/lineups. '
  'Safe training cutoff: 2025-06-01.';
