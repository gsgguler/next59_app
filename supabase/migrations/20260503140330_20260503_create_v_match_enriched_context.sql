/*
  # Create v_match_enriched_context

  Read-only view. One row per AF-mapped match.

  Columns:
  - match identity: match_id, api_football_fixture_id, competition, season, date, teams, scores
  - result: H / D / A / null (unknown)
  - enrichment presence flags: has_statistics, has_events, has_lineups, has_expected_goals_provider, has_goals_prevented
  - provider artifact flags: has_provider_timing_artifacts, provider_timing_artifact_count
  - enrichment_tier: full | stats_events | stats_lineups | stats_only | minimal
  - enrichment_quality_score: 0-100 numeric (25pts each: stats/events/lineups/xg)

  Notes:
  - Only covers matches with api_football_fixture_id (5,312 rows)
  - No data is modified
  - Not exposed to public anon role
*/

CREATE OR REPLACE VIEW public.v_match_enriched_context AS
SELECT
  m.id                          AS match_id,
  m.api_football_fixture_id,
  cs.competition_id,
  c.name                        AS competition_name,
  cs.season_id,
  s.year                        AS season_year,
  m.match_date,
  m.home_team_id,
  m.away_team_id,
  m.home_score_ft,
  m.away_score_ft,
  CASE
    WHEN m.home_score_ft IS NULL OR m.away_score_ft IS NULL THEN NULL
    WHEN m.home_score_ft > m.away_score_ft  THEN 'H'
    WHEN m.home_score_ft = m.away_score_ft  THEN 'D'
    ELSE 'A'
  END                           AS result,

  -- Enrichment flags
  (EXISTS (
    SELECT 1 FROM public.match_stats ms
    WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL
  ))                            AS has_statistics,

  (EXISTS (
    SELECT 1 FROM public.api_football_fixture_events e
    WHERE e.match_id = m.id
  ))                            AS has_events,

  (EXISTS (
    SELECT 1 FROM public.api_football_fixture_lineups l
    WHERE l.match_id = m.id
  ))                            AS has_lineups,

  (EXISTS (
    SELECT 1 FROM public.match_stats ms
    WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.expected_goals_provider IS NOT NULL
  ))                            AS has_expected_goals_provider,

  (EXISTS (
    SELECT 1 FROM public.match_stats ms
    WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.goals_prevented IS NOT NULL
  ))                            AS has_goals_prevented,

  -- Provider timing artifacts (elapsed < 0)
  (EXISTS (
    SELECT 1 FROM public.api_football_fixture_events e
    WHERE e.match_id = m.id AND e.elapsed < 0
  ))                            AS has_provider_timing_artifacts,

  COALESCE((
    SELECT COUNT(*) FROM public.api_football_fixture_events e
    WHERE e.match_id = m.id AND e.elapsed < 0
  ), 0)                         AS provider_timing_artifact_count,

  -- Enrichment tier
  CASE
    WHEN (EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL))
     AND (EXISTS (SELECT 1 FROM public.api_football_fixture_events e WHERE e.match_id = m.id))
     AND (EXISTS (SELECT 1 FROM public.api_football_fixture_lineups l WHERE l.match_id = m.id))
      THEN 'full'
    WHEN (EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL))
     AND (EXISTS (SELECT 1 FROM public.api_football_fixture_events e WHERE e.match_id = m.id))
     AND NOT (EXISTS (SELECT 1 FROM public.api_football_fixture_lineups l WHERE l.match_id = m.id))
      THEN 'stats_events'
    WHEN (EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL))
     AND NOT (EXISTS (SELECT 1 FROM public.api_football_fixture_events e WHERE e.match_id = m.id))
     AND (EXISTS (SELECT 1 FROM public.api_football_fixture_lineups l WHERE l.match_id = m.id))
      THEN 'stats_lineups'
    WHEN (EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL))
      THEN 'stats_only'
    ELSE 'minimal'
  END                           AS enrichment_tier,

  -- Quality score 0-100 (25pts each: stats / events / lineups / xg)
  (
    CASE WHEN EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.ball_possession IS NOT NULL) THEN 25 ELSE 0 END
  + CASE WHEN EXISTS (SELECT 1 FROM public.api_football_fixture_events e WHERE e.match_id = m.id) THEN 25 ELSE 0 END
  + CASE WHEN EXISTS (SELECT 1 FROM public.api_football_fixture_lineups l WHERE l.match_id = m.id) THEN 25 ELSE 0 END
  + CASE WHEN EXISTS (SELECT 1 FROM public.match_stats ms WHERE ms.match_id = m.id AND ms.half = 'FT' AND ms.expected_goals_provider IS NOT NULL) THEN 25 ELSE 0 END
  )                             AS enrichment_quality_score

FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.competitions c ON c.id = cs.competition_id
JOIN public.seasons s ON s.id = cs.season_id
WHERE m.api_football_fixture_id IS NOT NULL;
