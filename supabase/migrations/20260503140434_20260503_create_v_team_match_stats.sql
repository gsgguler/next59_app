/*
  # Create v_team_match_stats

  Read-only view. One row per match/team for AF-enriched statistics.

  Sources match_stats (half='FT') for AF-mapped matches only.
  Exposes AF-enriched columns alongside existing stats columns.

  Quality flags:
  - has_expected_goals_provider: true if xg is populated (not zero)
  - has_goals_prevented: true if goals_prevented is populated (not zero)
  - stats_quality_score: 0-100
      20pts: ball_possession populated
      20pts: total_shots populated
      20pts: passes_accurate populated
      20pts: goalkeeper_saves populated
      20pts: expected_goals_provider populated

  IMPORTANT:
  - NULL expected_goals_provider must NOT be treated as zero
  - NULL goals_prevented must NOT be treated as zero
  - These are optional sparse features
*/

CREATE OR REPLACE VIEW public.v_team_match_stats AS
SELECT
  ms.match_id,
  ms.team_id,
  m.api_football_fixture_id,

  -- Shot profile
  ms.total_shots,
  ms.shots_on_goal,
  ms.shots_off_goal,
  ms.blocked_shots,
  ms.shots_insidebox,
  ms.shots_outsidebox,

  -- Set pieces / discipline
  ms.corner_kicks,
  ms.fouls,
  ms.yellow_cards,
  ms.red_cards,
  ms.offsides,

  -- Goalkeeper
  ms.goalkeeper_saves,

  -- Possession / passing
  ms.ball_possession,
  ms.total_passes,
  ms.passes_accurate,
  ms.passes_percentage,

  -- Optional sparse features — DO NOT treat NULL as zero
  ms.expected_goals_provider,
  ms.goals_prevented,

  -- Presence flags
  (ms.expected_goals_provider IS NOT NULL) AS has_expected_goals_provider,
  (ms.goals_prevented IS NOT NULL)         AS has_goals_prevented,

  -- Quality score 0-100
  (
    CASE WHEN ms.ball_possession     IS NOT NULL THEN 20 ELSE 0 END
  + CASE WHEN ms.total_shots         IS NOT NULL THEN 20 ELSE 0 END
  + CASE WHEN ms.passes_accurate     IS NOT NULL THEN 20 ELSE 0 END
  + CASE WHEN ms.goalkeeper_saves    IS NOT NULL THEN 20 ELSE 0 END
  + CASE WHEN ms.expected_goals_provider IS NOT NULL THEN 20 ELSE 0 END
  )                                        AS stats_quality_score

FROM public.match_stats ms
JOIN public.matches m ON m.id = ms.match_id
WHERE ms.half = 'FT'
AND m.api_football_fixture_id IS NOT NULL;
