
/*
  # Create v_player_season_form

  Read-only view — one row per (api_football_player_id, season, competition_type, league_id).

  Multi-team strategy:
    - Season totals are SUMMED across all teams (no contribution dropped)
    - current_or_last_team_id: resolved from the latest fixture date in af_fixture_player_stats
      via matches.match_date join; falls back to provider row order (created_at); else 'needs_review'
    - max_minutes_team_id: team with most accumulated minutes that season
    - primary_roster_team_id = current_or_last_team_id (for pre-match team-strength context)

  Notes:
    - rating averaged over non-null rows only
    - minutes/appearances NULL kept as NULL (not coerced to 0)
    - count/event fields use COALESCE(v,0) since NULL means absent in provider context
    - raw_payload is NOT exposed
    - 2024 partial_provider_stats_warning set when null_minutes or null_appearances is heavy
*/

CREATE OR REPLACE VIEW v_player_season_form AS

WITH season_totals AS (
  SELECT
    s.api_football_player_id,
    s.player_name,
    s.season,
    s.competition_type,
    s.league_id,

    -- season aggregates (SUM across all teams)
    SUM(s.appearances)                          AS appearances_total,
    SUM(s.lineups)                              AS lineups_total,
    SUM(s.minutes)                              AS minutes_total,
    SUM(COALESCE(s.goals_total, 0))             AS goals_total,
    SUM(COALESCE(s.assists, 0))                 AS assists_total,
    SUM(COALESCE(s.saves, 0))                   AS saves_total,
    SUM(COALESCE(s.shots_total, 0))             AS shots_total,
    SUM(COALESCE(s.shots_on, 0))                AS shots_on,
    SUM(COALESCE(s.passes_total, 0))            AS passes_total,
    SUM(COALESCE(s.passes_key, 0))              AS passes_key,
    AVG(NULLIF(s.passes_accuracy, 0))           AS passes_accuracy_avg,
    SUM(COALESCE(s.tackles_total, 0))           AS tackles_total,
    SUM(COALESCE(s.tackles_blocks, 0))          AS blocks_total,
    SUM(COALESCE(s.tackles_interceptions, 0))   AS interceptions_total,
    SUM(COALESCE(s.duels_total, 0))             AS duels_total,
    SUM(COALESCE(s.duels_won, 0))               AS duels_won,
    SUM(COALESCE(s.dribbles_attempts, 0))       AS dribbles_attempts,
    SUM(COALESCE(s.dribbles_success, 0))        AS dribbles_success,
    SUM(COALESCE(s.fouls_drawn, 0))             AS fouls_drawn,
    SUM(COALESCE(s.fouls_committed, 0))         AS fouls_committed,
    SUM(COALESCE(s.cards_yellow, 0))            AS yellow_cards,
    SUM(COALESCE(s.cards_red, 0))               AS red_cards,
    SUM(COALESCE(s.penalty_scored, 0))          AS penalties_scored,
    SUM(COALESCE(s.penalty_missed, 0))          AS penalties_missed,
    SUM(COALESCE(s.penalty_saved, 0))           AS penalties_saved,

    -- rating (non-null average only)
    AVG(s.rating)                               AS rating_avg,
    COUNT(s.rating)                             AS rating_count,
    (COUNT(s.rating) > 0)                       AS has_rating,

    -- team breadth
    COUNT(DISTINCT s.api_football_team_id)      AS team_count,
    array_agg(DISTINCT s.team_name ORDER BY s.team_name) AS team_names,
    (COUNT(DISTINCT s.api_football_team_id) > 1) AS has_multi_team_season,

    -- position mode (most frequent non-null)
    MODE() WITHIN GROUP (ORDER BY s.position)   AS primary_position,

    -- null heaviness for partial warning
    SUM(CASE WHEN s.minutes IS NULL THEN 1 ELSE 0 END)      AS _null_minutes_rows,
    SUM(CASE WHEN s.appearances IS NULL THEN 1 ELSE 0 END)  AS _null_appearances_rows,
    COUNT(*)                                                 AS _total_rows

  FROM af_player_season_stats s
  GROUP BY s.api_football_player_id, s.player_name, s.season, s.competition_type, s.league_id
),

-- max-minutes team per player/season/competition
max_minutes_team AS (
  SELECT DISTINCT ON (api_football_player_id, season, competition_type, league_id)
    api_football_player_id,
    season,
    competition_type,
    league_id,
    api_football_team_id   AS max_minutes_team_id,
    team_name              AS max_minutes_team_name,
    COALESCE(minutes, 0)   AS max_minutes_for_team
  FROM af_player_season_stats
  ORDER BY api_football_player_id, season, competition_type, league_id,
           COALESCE(minutes, 0) DESC
),

-- current/last team resolved from fixture-level date (domestic only; UEFA has no fixture player stats)
latest_fixture_team AS (
  SELECT DISTINCT ON (f.api_football_player_id, s.season, s.competition_type, s.league_id)
    f.api_football_player_id,
    s.season,
    s.competition_type,
    s.league_id,
    f.api_football_team_id   AS current_or_last_team_id,
    f.team_name              AS current_or_last_team_name,
    m.match_date             AS last_team_match_date,
    'verified_by_latest_fixture'::text AS resolution_status
  FROM af_fixture_player_stats f
  JOIN matches m ON m.id = f.match_id
  -- join season stats to get competition scope
  JOIN af_player_season_stats s
    ON s.api_football_player_id = f.api_football_player_id
   AND s.api_football_team_id   = f.api_football_team_id
   AND s.season = EXTRACT(YEAR FROM m.match_date)::int
  WHERE m.match_date IS NOT NULL
  ORDER BY f.api_football_player_id, s.season, s.competition_type, s.league_id,
           m.match_date DESC
),

-- fallback: provider row order (created_at) for players without fixture-level data (UEFA)
provider_order_team AS (
  SELECT DISTINCT ON (api_football_player_id, season, competition_type, league_id)
    api_football_player_id,
    season,
    competition_type,
    league_id,
    api_football_team_id   AS current_or_last_team_id,
    team_name              AS current_or_last_team_name,
    NULL::date             AS last_team_match_date,
    'inferred_from_provider_order'::text AS resolution_status
  FROM af_player_season_stats
  ORDER BY api_football_player_id, season, competition_type, league_id, created_at DESC
)

SELECT
  t.api_football_player_id,
  t.player_name,
  t.season,
  t.competition_type,
  t.league_id,

  -- team identity/context
  COALESCE(lf.current_or_last_team_id, po.current_or_last_team_id)   AS current_or_last_team_id,
  COALESCE(lf.current_or_last_team_name, po.current_or_last_team_name) AS current_or_last_team_name,
  COALESCE(lf.last_team_match_date, po.last_team_match_date)          AS last_team_match_date,
  COALESCE(lf.current_or_last_team_id, po.current_or_last_team_id)   AS primary_roster_team_id,
  COALESCE(lf.current_or_last_team_name, po.current_or_last_team_name) AS primary_roster_team_name,

  mm.max_minutes_team_id,
  mm.max_minutes_team_name,
  mm.max_minutes_for_team,

  t.team_count,
  t.team_names,
  t.has_multi_team_season,
  -- transferred_midseason: multi-team and season_totals > 0 minutes confirm actual play
  (t.has_multi_team_season AND COALESCE(t.minutes_total, 0) > 0) AS transferred_midseason,

  COALESCE(lf.resolution_status, po.resolution_status, 'needs_review') AS current_team_resolution_status,

  -- season totals
  t.appearances_total,
  t.lineups_total,
  t.minutes_total,
  t.primary_position,
  t.goals_total,
  t.assists_total,
  t.saves_total,
  t.shots_total,
  t.shots_on,
  t.passes_total,
  t.passes_key,
  t.passes_accuracy_avg,
  t.tackles_total,
  t.blocks_total,
  t.interceptions_total,
  t.duels_total,
  t.duels_won,
  t.dribbles_attempts,
  t.dribbles_success,
  t.fouls_drawn,
  t.fouls_committed,
  t.yellow_cards,
  t.red_cards,
  t.penalties_scored,
  t.penalties_missed,
  t.penalties_saved,
  t.rating_avg,
  t.rating_count,
  t.has_rating,

  -- partial warning: >30% of rows missing minutes or appearances
  (t._null_minutes_rows::numeric / NULLIF(t._total_rows, 0) > 0.3
   OR t._null_appearances_rows::numeric / NULLIF(t._total_rows, 0) > 0.3
  ) AS partial_provider_stats_warning,

  -- quality score 0-100
  LEAST(100,
    30  -- base: id + name + season + competition
    + CASE WHEN t.minutes_total IS NOT NULL        THEN 20 ELSE 0 END
    + CASE WHEN t.appearances_total IS NOT NULL    THEN 10 ELSE 0 END
    + CASE WHEN t.rating_count > 0                THEN 10 ELSE 0 END
    + CASE WHEN t.goals_total + t.assists_total > 0 OR t.tackles_total > 0 THEN 15 ELSE 0 END
    + CASE WHEN lf.resolution_status = 'verified_by_latest_fixture' THEN 15 ELSE 0 END
  )::numeric AS season_form_quality_score

FROM season_totals t
LEFT JOIN max_minutes_team mm
  ON mm.api_football_player_id = t.api_football_player_id
 AND mm.season = t.season
 AND mm.competition_type = t.competition_type
 AND mm.league_id = t.league_id
LEFT JOIN latest_fixture_team lf
  ON lf.api_football_player_id = t.api_football_player_id
 AND lf.season = t.season
 AND lf.competition_type = t.competition_type
 AND lf.league_id = t.league_id
LEFT JOIN provider_order_team po
  ON po.api_football_player_id = t.api_football_player_id
 AND po.season = t.season
 AND po.competition_type = t.competition_type
 AND po.league_id = t.league_id
 AND lf.api_football_player_id IS NULL;  -- only use fallback when fixture resolution failed
