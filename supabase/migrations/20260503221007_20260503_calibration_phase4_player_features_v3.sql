/*
  # Calibration Phase 4 v3 — Leakage-Safe Team Pre-Match Player Features (final)

  ## Summary
  Creates `model_lab.v_team_pre_match_player_features`.
  Aggregates rolling player performance signals per (target_match, team) pair
  using only matches strictly before the target match date (leakage-safe).

  ## Join Chain for team resolution
  prev_l10 (target_match_id, team_id UUID, src_match_id)
    → api_football_fixture_lineup_players (match_id + team_id → api_football_fixture_id)
    → api_football_fixture_lineups (lineup_id → api_football_team_id)
    → af_fixture_player_stats (api_football_fixture_id + api_football_team_id → player rows)

  ## Leakage Protection
  All source matches have match_date < target_match_date AND match_id != target_match_id.
  Target match player data is never touched.
*/

DROP VIEW IF EXISTS model_lab.v_team_pre_match_player_features;

CREATE VIEW model_lab.v_team_pre_match_player_features AS
WITH

match_teams AS (
  SELECT u.match_id AS target_match_id, u.match_date AS target_match_date, u.home_team_id AS team_id
  FROM model_lab.v_calibration_match_universe u
  UNION ALL
  SELECT u.match_id AS target_match_id, u.match_date AS target_match_date, u.away_team_id AS team_id
  FROM model_lab.v_calibration_match_universe u
),

-- L10 previous matches per (target_match, team) — leakage-safe
prev_l10 AS (
  SELECT target_match_id, team_id, src_match_id
  FROM (
    SELECT
      mt.target_match_id,
      mt.team_id,
      src.match_id AS src_match_id,
      ROW_NUMBER() OVER (
        PARTITION BY mt.target_match_id, mt.team_id
        ORDER BY src.match_date DESC, src.match_id DESC
      ) AS rn
    FROM match_teams mt
    JOIN model_lab.v_calibration_match_universe src
      ON (src.home_team_id = mt.team_id OR src.away_team_id = mt.team_id)
      AND src.match_date < mt.target_match_date
      AND src.match_id != mt.target_match_id
  ) ranked
  WHERE rn <= 10
),

-- Resolve api_football_fixture_id and api_football_team_id for each (team_id UUID, src_match_id)
-- via lineup tables that bridge UUID → integer provider IDs
team_af_ids AS (
  SELECT DISTINCT
    p.target_match_id,
    p.team_id,
    p.src_match_id,
    lp.api_football_fixture_id,
    ln.api_football_team_id
  FROM prev_l10 p
  JOIN public.api_football_fixture_lineup_players lp
    ON lp.match_id = p.src_match_id
    AND lp.team_id = p.team_id
  JOIN public.api_football_fixture_lineups ln
    ON ln.id = lp.lineup_id
),

-- Player stats joined via resolved integer IDs, only players who played (minutes > 0)
player_stats AS (
  SELECT
    t.target_match_id,
    t.team_id,
    t.src_match_id,
    ps.api_football_player_id,
    ps.substitute,
    ps.captain,
    ps.rating,
    COALESCE(ps.minutes, 0)               AS minutes,
    COALESCE(ps.goals_total, 0)           AS goals_total,
    COALESCE(ps.assists, 0)               AS assists,
    COALESCE(ps.shots_total, 0)           AS shots_total,
    COALESCE(ps.shots_on, 0)              AS shots_on,
    COALESCE(ps.passes_key, 0)            AS passes_key,
    COALESCE(ps.duels_total, 0)           AS duels_total,
    COALESCE(ps.duels_won, 0)             AS duels_won,
    COALESCE(ps.tackles_interceptions, 0) AS tackles_interceptions,
    COALESCE(ps.cards_yellow, 0)          AS cards_yellow,
    COALESCE(ps.cards_red, 0)             AS cards_red,
    COALESCE(ps.fouls_committed, 0)       AS fouls_committed,
    COALESCE(ps.fouls_drawn, 0)           AS fouls_drawn
  FROM team_af_ids t
  JOIN public.af_fixture_player_stats ps
    ON ps.api_football_fixture_id = t.api_football_fixture_id
    AND ps.api_football_team_id   = t.api_football_team_id
  WHERE COALESCE(ps.minutes, 0) > 0
),

-- Per-match aggregated signals
match_agg AS (
  SELECT
    target_match_id,
    team_id,
    src_match_id,
    COUNT(*)                                                              AS n_players,
    ROUND(AVG(rating)::numeric, 4)                                        AS avg_squad_rating,
    ROUND(AVG(rating) FILTER (WHERE substitute = false)::numeric, 4)     AS avg_starter_rating,
    ROUND(AVG(minutes)::numeric, 2)                                       AS avg_minutes,
    ROUND(AVG(goals_total)::numeric, 4)                                   AS avg_goals,
    ROUND(AVG(assists)::numeric, 4)                                       AS avg_assists,
    ROUND(AVG(shots_total)::numeric, 4)                                   AS avg_shots_total,
    ROUND(AVG(shots_on)::numeric, 4)                                      AS avg_shots_on,
    ROUND(AVG(passes_key)::numeric, 4)                                    AS avg_passes_key,
    ROUND(
      NULLIF(SUM(duels_won), 0)::numeric /
      NULLIF(SUM(duels_total), 0)::numeric,
    4)                                                                    AS duels_won_rate,
    ROUND(AVG(tackles_interceptions)::numeric, 4)                         AS avg_tackles_interceptions,
    ROUND(AVG(cards_yellow)::numeric, 4)                                  AS avg_cards_yellow,
    ROUND(AVG(cards_red)::numeric, 4)                                     AS avg_cards_red,
    ROUND(AVG(fouls_committed)::numeric, 4)                               AS avg_fouls_committed,
    ROUND(AVG(fouls_drawn)::numeric, 4)                                   AS avg_fouls_drawn,
    MAX(api_football_player_id) FILTER (WHERE captain = true)             AS captain_player_id
  FROM player_stats
  GROUP BY target_match_id, team_id, src_match_id
),

-- Most-frequent captain per (target_match, team) for stability metric
captain_top AS (
  SELECT DISTINCT ON (target_match_id, team_id)
    target_match_id,
    team_id,
    count_val AS top_captain_count
  FROM (
    SELECT
      target_match_id,
      team_id,
      captain_player_id,
      COUNT(*) AS count_val
    FROM match_agg
    WHERE captain_player_id IS NOT NULL
    GROUP BY target_match_id, team_id, captain_player_id
  ) cap_counts
  ORDER BY target_match_id, team_id, count_val DESC
)

-- Final rollup across L10 source matches per (target_match, team)
SELECT
  ma.target_match_id,
  ma.team_id,
  COUNT(DISTINCT ma.src_match_id)                        AS n_player_matches_l10,
  ROUND(AVG(ma.avg_squad_rating)::numeric, 4)            AS avg_squad_rating_l10,
  ROUND(AVG(ma.avg_starter_rating)::numeric, 4)          AS avg_starter_rating_l10,
  ROUND(AVG(ma.avg_minutes)::numeric, 2)                 AS avg_minutes_played_l10,
  ROUND(AVG(ma.avg_goals)::numeric, 4)                   AS avg_goals_per_player_l10,
  ROUND(AVG(ma.avg_assists)::numeric, 4)                 AS avg_assists_per_player_l10,
  ROUND(AVG(ma.avg_shots_total)::numeric, 4)             AS avg_shots_total_l10,
  ROUND(AVG(ma.avg_shots_on)::numeric, 4)                AS avg_shots_on_target_l10,
  ROUND(AVG(ma.avg_passes_key)::numeric, 4)              AS avg_passes_key_l10,
  ROUND(AVG(ma.duels_won_rate)::numeric, 4)              AS avg_duels_won_rate_l10,
  ROUND(AVG(ma.avg_tackles_interceptions)::numeric, 4)   AS avg_tackles_interceptions_l10,
  ROUND(AVG(ma.avg_cards_yellow)::numeric, 4)            AS avg_cards_yellow_l10,
  ROUND(AVG(ma.avg_cards_red)::numeric, 4)               AS avg_cards_red_l10,
  ROUND(AVG(ma.avg_fouls_committed)::numeric, 4)         AS avg_fouls_committed_l10,
  ROUND(AVG(ma.avg_fouls_drawn)::numeric, 4)             AS avg_fouls_drawn_l10,
  ROUND(
    COALESCE(ct.top_captain_count, 0)::numeric /
    NULLIF(
      COUNT(DISTINCT ma.src_match_id) FILTER (WHERE ma.captain_player_id IS NOT NULL),
      0
    ),
    4
  )                                                      AS captain_stability_l10
FROM match_agg ma
LEFT JOIN captain_top ct
  ON ct.target_match_id = ma.target_match_id
  AND ct.team_id = ma.team_id
GROUP BY ma.target_match_id, ma.team_id, ct.top_captain_count;
