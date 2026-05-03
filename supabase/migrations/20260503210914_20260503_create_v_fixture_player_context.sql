
/*
  # Create v_fixture_player_context

  Read-only view — one row per (api_football_fixture_id, api_football_player_id, api_football_team_id).

  did_play logic:
    true  if minutes > 0 OR rating IS NOT NULL OR goals_total > 0
               OR cards_yellow > 0 OR cards_red > 0
    false if substitute=true AND minutes IS NULL AND no stat activity

  Notes:
    - null minutes is NOT coerced to 0
    - rating is NOT coerced from NULL to 0
    - unused bench players remain visible with did_play=false
    - raw_payload NOT exposed
*/

CREATE OR REPLACE VIEW v_fixture_player_context AS
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
  f.number,
  f.position,
  f.rating,
  f.captain,
  f.substitute,

  -- did_play: true if any evidence of involvement
  (
    COALESCE(f.minutes, 0) > 0
    OR f.rating IS NOT NULL
    OR COALESCE(f.goals_total, 0) > 0
    OR COALESCE(f.cards_yellow, 0) > 0
    OR COALESCE(f.cards_red, 0) > 0
  )                                         AS did_play,

  f.substitute                              AS was_substitute,
  COALESCE(f.captain, false)               AS was_captain,

  f.goals_total,
  f.assists,
  f.saves,
  f.shots_total,
  f.shots_on,
  f.passes_total,
  f.passes_key,
  f.passes_accuracy,
  f.tackles_total,
  f.tackles_blocks,
  f.tackles_interceptions,
  f.duels_total,
  f.duels_won,
  f.dribbles_attempts,
  f.dribbles_success,
  f.fouls_drawn,
  f.fouls_committed,
  f.cards_yellow,
  f.cards_red,
  f.penalty_scored,
  f.penalty_missed,
  f.penalty_saved,

  -- quality score 0-100
  LEAST(100,
    30  -- base: fixture/player/team ids always present
    + CASE WHEN f.minutes IS NOT NULL  THEN 20 ELSE 0 END
    + CASE WHEN f.position IS NOT NULL AND f.position <> '' THEN 10 ELSE 0 END
    + CASE WHEN f.rating IS NOT NULL   THEN 15 ELSE 0 END
    + CASE WHEN (
        COALESCE(f.goals_total,0) + COALESCE(f.assists,0) + COALESCE(f.tackles_total,0) +
        COALESCE(f.passes_total,0) + COALESCE(f.shots_total,0) > 0
      ) THEN 25 ELSE 0 END
  )::numeric AS fixture_player_quality_score

FROM af_fixture_player_stats f;
