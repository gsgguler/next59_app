
/*
  # Create v_team_lineup_strength_context

  Read-only view — one row per (api_football_fixture_id, api_football_team_id).

  Source: v_fixture_player_context

  Position buckets:
    GK / G / Goalkeeper                   → goalkeeper
    D / DF / CB / LB / RB / WB / Defender → defensive
    M / MF / DM / CM / AM / Midfielder    → midfield
    F / FW / ST / LW / RW / Attacker      → attacking
    anything else                         → unknown

  Notes:
    - avg_starter_rating_non_null: only non-null ratings among starters
    - candidate score fields are explicitly named _candidate; no final weights hardcoded
    - starter_strength_score_candidate: avg non-null rating × (played_count / NULLIF(starter_count,0))
    - bench_impact_score_candidate: sum of bench goals+assists, raw count only
*/

CREATE OR REPLACE VIEW v_team_lineup_strength_context AS

WITH bucketed AS (
  SELECT
    f.competition_type,
    f.match_id,
    f.af_uefa_fixture_id,
    f.api_football_fixture_id,
    f.api_football_team_id,
    f.team_name,
    f.api_football_player_id,
    f.player_name,
    f.minutes,
    f.rating,
    f.position,
    f.substitute,
    f.did_play,
    f.captain                                   AS is_captain,
    f.goals_total,
    f.assists,

    -- starter vs bench
    CASE WHEN NOT f.substitute THEN 1 ELSE 0 END AS is_starter,
    CASE WHEN f.substitute     THEN 1 ELSE 0 END AS is_bench,

    -- position bucket
    CASE
      WHEN upper(f.position) IN ('GK','G','GOALKEEPER') THEN 'goalkeeper'
      WHEN upper(f.position) ~ '^(D|DF|CB|LB|RB|WB|LWB|RWB|DEFENDER|CENTRE.BACK|FULL.BACK)' THEN 'defensive'
      WHEN upper(f.position) ~ '^(M|MF|DM|CDM|CM|CAM|AM|LM|RM|MIDFIELDER|MIDFIELD)' THEN 'midfield'
      WHEN upper(f.position) ~ '^(F|FW|ST|CF|LW|RW|SS|ATTACKER|FORWARD|STRIKER|WINGER)' THEN 'attacking'
      ELSE 'unknown'
    END AS position_bucket

  FROM v_fixture_player_context f
)

SELECT
  competition_type,
  match_id,
  af_uefa_fixture_id,
  api_football_fixture_id,
  api_football_team_id,
  team_name,

  -- counts
  SUM(is_starter)                           AS starter_count,
  SUM(is_bench)                             AS bench_count,
  SUM(CASE WHEN did_play THEN 1 ELSE 0 END) AS played_count,
  SUM(CASE WHEN is_bench = 1 AND NOT did_play THEN 1 ELSE 0 END) AS unused_sub_count,

  -- captain
  MAX(CASE WHEN is_captain THEN api_football_player_id END) AS captain_player_id,
  MAX(CASE WHEN is_captain THEN player_name END)           AS captain_name,

  -- starter rating (non-null only)
  AVG(CASE WHEN is_starter = 1 THEN rating END)             AS avg_starter_rating_non_null,
  COUNT(CASE WHEN is_starter = 1 AND rating IS NOT NULL THEN 1 END) AS starter_rating_count,

  -- starter minutes
  SUM(CASE WHEN is_starter = 1 THEN COALESCE(minutes, 0) END) AS total_starter_minutes,

  -- position buckets
  COUNT(CASE WHEN position_bucket = 'attacking'  AND is_starter = 1 THEN 1 END) AS attacking_player_count,
  COUNT(CASE WHEN position_bucket = 'midfield'   AND is_starter = 1 THEN 1 END) AS midfield_player_count,
  COUNT(CASE WHEN position_bucket = 'defensive'  AND is_starter = 1 THEN 1 END) AS defensive_player_count,
  COUNT(CASE WHEN position_bucket = 'goalkeeper' AND is_starter = 1 THEN 1 END) AS goalkeeper_count,
  COUNT(CASE WHEN position_bucket = 'unknown'    AND is_starter = 1 THEN 1 END) AS unknown_position_count,

  -- data quality signals
  COUNT(CASE WHEN minutes IS NULL AND did_play THEN 1 END) AS missing_minutes_count,
  COUNT(CASE WHEN rating  IS NULL AND is_starter = 1 THEN 1 END) AS missing_rating_count,

  -- lineup quality score 0-100
  LEAST(100,
    30  -- base
    + CASE WHEN SUM(is_starter) >= 11 THEN 20 ELSE 0 END
    + CASE WHEN COUNT(CASE WHEN is_starter = 1 AND rating IS NOT NULL THEN 1 END) >= 6 THEN 20 ELSE 0 END
    + CASE WHEN COUNT(CASE WHEN position_bucket = 'unknown' AND is_starter = 1 THEN 1 END) = 0 THEN 15 ELSE 0 END
    + CASE WHEN COUNT(CASE WHEN minutes IS NULL AND did_play THEN 1 END) = 0 THEN 15 ELSE 0 END
  )::numeric AS lineup_player_quality_score,

  -- CANDIDATE SCORES — not final weights
  -- starter_strength_score_candidate: avg non-null starter rating, penalised by rating coverage
  ROUND(
    COALESCE(AVG(CASE WHEN is_starter = 1 THEN rating END), 0)
    * LEAST(1.0, COUNT(CASE WHEN is_starter = 1 AND rating IS NOT NULL THEN 1 END)::numeric
                 / NULLIF(SUM(is_starter), 0))
  , 3) AS starter_strength_score_candidate,

  -- bench_impact_score_candidate: raw event count from bench players who played
  SUM(CASE WHEN is_bench = 1 AND did_play
           THEN COALESCE(goals_total,0) + COALESCE(assists,0) ELSE 0 END
  )::numeric AS bench_impact_score_candidate

FROM bucketed
GROUP BY competition_type, match_id, af_uefa_fixture_id,
         api_football_fixture_id, api_football_team_id, team_name;
