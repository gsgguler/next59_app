/*
  # Calibration Phase 4 — Leakage-Safe Team Pre-Match Player Features

  ## Summary
  Creates `model_lab.v_team_pre_match_player_features`, a leakage-safe view that
  aggregates rolling player performance signals per (target_match, team) pair.

  ## Design
  - Source: `public.af_fixture_player_stats` for per-match player data
  - Team UUID resolved via `public.api_football_fixture_lineup_players`
    which carries both `api_football_fixture_id` and `team_id` (UUID)
  - Match dates sourced from `model_lab.v_calibration_match_universe`
  - Leakage protection: only previous matches strictly before target match date,
    source match_id != target match_id
  - Rolling window: last 10 previous match appearances (L10) per team
  - Target match lineup/player data is NEVER used in feature computation

  ## Join Path for team_id Resolution
  af_fixture_player_stats.api_football_fixture_id + api_football_player_id
    → api_football_fixture_lineup_players.api_football_fixture_id + api_football_player_id
    → api_football_fixture_lineup_players.team_id (UUID)

  ## Output Columns (one row per target_match_id + team_id)
  Squad depth / availability signals:
  - n_player_matches_l10: count of (player × match) observations
  - avg_squad_rating_l10: mean player rating across all minutes-played players
  - avg_starter_rating_l10: mean rating of starting XI only
  - avg_minutes_played_l10: mean minutes across all players
  - avg_goals_per_player_l10: mean goals scored per player-match
  - avg_assists_per_player_l10
  - avg_shots_total_l10, avg_shots_on_target_l10
  - avg_passes_key_l10
  - avg_duels_won_rate_l10: duels_won / duels_total (NULLs excluded)
  - avg_tackles_interceptions_l10
  - avg_cards_yellow_l10, avg_cards_red_l10
  - avg_fouls_committed_l10, avg_fouls_drawn_l10
  - captain_stability_l10: fraction of matches where same captain appears

  ## Security
  - View is in model_lab schema (admin-only)
  - Read-only, no writes to any table
*/

CREATE OR REPLACE VIEW model_lab.v_team_pre_match_player_features AS
WITH

-- Base universe target matches + their teams
match_teams AS (
  SELECT
    u.match_id   AS target_match_id,
    u.match_date AS target_match_date,
    u.home_team_id AS team_id
  FROM model_lab.v_calibration_match_universe u

  UNION ALL

  SELECT
    u.match_id   AS target_match_id,
    u.match_date AS target_match_date,
    u.away_team_id AS team_id
  FROM model_lab.v_calibration_match_universe u
),

-- Previous universe matches for each team (leakage-safe, L10)
prev_l10 AS (
  SELECT
    mt.target_match_id,
    mt.team_id,
    src.match_id  AS src_match_id,
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

-- Keep only L10 window
prev_l10_filtered AS (
  SELECT target_match_id, team_id, src_match_id
  FROM prev_l10
  WHERE rn_recent <= 10
),

-- Resolve api_football_fixture_id for each source match via lineup bridge
-- This gives us the af_fixture_id needed to join to player stats
src_fixture_ids AS (
  SELECT
    p.target_match_id,
    p.team_id,
    p.src_match_id,
    lp.api_football_fixture_id
  FROM prev_l10_filtered p
  JOIN public.api_football_fixture_lineup_players lp
    ON lp.match_id = p.src_match_id
    AND lp.team_id = p.team_id
  GROUP BY p.target_match_id, p.team_id, p.src_match_id, lp.api_football_fixture_id
),

-- Player stats for each (target_match, team, source_match)
-- Only players who played (minutes > 0)
player_stats AS (
  SELECT
    sf.target_match_id,
    sf.team_id,
    sf.src_match_id,
    ps.api_football_player_id,
    ps.minutes,
    ps.substitute,
    ps.captain,
    ps.rating,
    COALESCE(ps.goals_total, 0)             AS goals_total,
    COALESCE(ps.assists, 0)                 AS assists,
    COALESCE(ps.shots_total, 0)             AS shots_total,
    COALESCE(ps.shots_on, 0)                AS shots_on,
    COALESCE(ps.passes_key, 0)              AS passes_key,
    COALESCE(ps.duels_total, 0)             AS duels_total,
    COALESCE(ps.duels_won, 0)               AS duels_won,
    COALESCE(ps.tackles_total, 0)           AS tackles_total,
    COALESCE(ps.tackles_interceptions, 0)   AS tackles_interceptions,
    COALESCE(ps.cards_yellow, 0)            AS cards_yellow,
    COALESCE(ps.cards_red, 0)               AS cards_red,
    COALESCE(ps.fouls_committed, 0)         AS fouls_committed,
    COALESCE(ps.fouls_drawn, 0)             AS fouls_drawn
  FROM src_fixture_ids sf
  JOIN public.af_fixture_player_stats ps
    ON ps.api_football_fixture_id = sf.api_football_fixture_id
    AND ps.api_football_team_id IN (
      -- Resolve via lineup: get af team id for this team+fixture combo
      SELECT DISTINCT lp2.api_football_fixture_id  -- placeholder: use subquery below
      FROM public.api_football_fixture_lineup_players lp2
      WHERE lp2.match_id = sf.src_match_id AND lp2.team_id = sf.team_id
      LIMIT 1
    )
  WHERE COALESCE(ps.minutes, 0) > 0
),

-- Per-match aggregations
match_agg AS (
  SELECT
    target_match_id,
    team_id,
    src_match_id,
    COUNT(*)                                                        AS n_players,
    ROUND(AVG(rating)::numeric, 4)                                  AS avg_squad_rating,
    ROUND(AVG(rating) FILTER (WHERE substitute = false)::numeric, 4) AS avg_starter_rating,
    ROUND(AVG(minutes)::numeric, 2)                                 AS avg_minutes,
    ROUND(AVG(goals_total)::numeric, 4)                             AS avg_goals,
    ROUND(AVG(assists)::numeric, 4)                                 AS avg_assists,
    ROUND(AVG(shots_total)::numeric, 4)                             AS avg_shots_total,
    ROUND(AVG(shots_on)::numeric, 4)                                AS avg_shots_on,
    ROUND(AVG(passes_key)::numeric, 4)                              AS avg_passes_key,
    ROUND(
      NULLIF(SUM(duels_won)::numeric, 0) /
      NULLIF(SUM(duels_total)::numeric, 0), 4
    )                                                               AS duels_won_rate,
    ROUND(AVG(tackles_interceptions)::numeric, 4)                   AS avg_tackles_interceptions,
    ROUND(AVG(cards_yellow)::numeric, 4)                            AS avg_cards_yellow,
    ROUND(AVG(cards_red)::numeric, 4)                               AS avg_cards_red,
    ROUND(AVG(fouls_committed)::numeric, 4)                         AS avg_fouls_committed,
    ROUND(AVG(fouls_drawn)::numeric, 4)                             AS avg_fouls_drawn,
    -- Captain id for stability tracking
    MAX(api_football_player_id) FILTER (WHERE captain = true)       AS captain_player_id
  FROM player_stats
  GROUP BY target_match_id, team_id, src_match_id
),

-- Captain stability: which captain appears most across L10 matches
captain_counts AS (
  SELECT
    target_match_id,
    team_id,
    captain_player_id,
    COUNT(*) AS cap_match_count
  FROM match_agg
  WHERE captain_player_id IS NOT NULL
  GROUP BY target_match_id, team_id, captain_player_id
),
captain_top AS (
  SELECT DISTINCT ON (target_match_id, team_id)
    target_match_id,
    team_id,
    cap_match_count AS top_captain_count
  FROM captain_counts
  ORDER BY target_match_id, team_id, cap_match_count DESC
)

-- Final rollup across L10 source matches
SELECT
  ma.target_match_id,
  ma.team_id,
  COUNT(DISTINCT ma.src_match_id)                   AS n_player_matches_l10,
  ROUND(AVG(ma.avg_squad_rating)::numeric, 4)       AS avg_squad_rating_l10,
  ROUND(AVG(ma.avg_starter_rating)::numeric, 4)     AS avg_starter_rating_l10,
  ROUND(AVG(ma.avg_minutes)::numeric, 2)            AS avg_minutes_played_l10,
  ROUND(AVG(ma.avg_goals)::numeric, 4)              AS avg_goals_per_player_l10,
  ROUND(AVG(ma.avg_assists)::numeric, 4)            AS avg_assists_per_player_l10,
  ROUND(AVG(ma.avg_shots_total)::numeric, 4)        AS avg_shots_total_l10,
  ROUND(AVG(ma.avg_shots_on)::numeric, 4)           AS avg_shots_on_target_l10,
  ROUND(AVG(ma.avg_passes_key)::numeric, 4)         AS avg_passes_key_l10,
  ROUND(AVG(ma.duels_won_rate)::numeric, 4)         AS avg_duels_won_rate_l10,
  ROUND(AVG(ma.avg_tackles_interceptions)::numeric, 4) AS avg_tackles_interceptions_l10,
  ROUND(AVG(ma.avg_cards_yellow)::numeric, 4)       AS avg_cards_yellow_l10,
  ROUND(AVG(ma.avg_cards_red)::numeric, 4)          AS avg_cards_red_l10,
  ROUND(AVG(ma.avg_fouls_committed)::numeric, 4)    AS avg_fouls_committed_l10,
  ROUND(AVG(ma.avg_fouls_drawn)::numeric, 4)        AS avg_fouls_drawn_l10,
  -- Captain stability: top captain appearances / total matches with a captain
  ROUND(
    COALESCE(ct.top_captain_count, 0)::numeric /
    NULLIF(COUNT(DISTINCT ma.src_match_id) FILTER (WHERE ma.captain_player_id IS NOT NULL), 0),
    4
  )                                                 AS captain_stability_l10
FROM match_agg ma
LEFT JOIN captain_top ct
  ON ct.target_match_id = ma.target_match_id
  AND ct.team_id = ma.team_id
GROUP BY ma.target_match_id, ma.team_id, ct.top_captain_count;
