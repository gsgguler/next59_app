
-- ── WC Qualifier Model Features ───────────────────────────────────────────────
-- One row per WC2026 team. Confidence-weighted feature layer for prediction engine.

CREATE TABLE wc_qualifier_model_features (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_team_id               text        NOT NULL UNIQUE,
  team_name                       text        NOT NULL,
  confederation                   text,
  qualification_method            text        CHECK (qualification_method IN ('qualifier','host','intercontinental_playoff')),
  is_host_nation                  boolean     DEFAULT false,
  provider_sources                jsonb       DEFAULT '{}'::jsonb,

  -- Official result features
  qualifier_matches_played        int,
  qualifier_wins                  int,
  qualifier_draws                 int,
  qualifier_losses                int,
  qualifier_points                int,
  qualifier_points_per_match      numeric(6,3),
  qualifier_win_rate              numeric(6,3),
  qualifier_draw_rate             numeric(6,3),
  qualifier_loss_rate             numeric(6,3),
  qualifier_goals_for             int,
  qualifier_goals_against         int,
  qualifier_goal_difference       int,
  qualifier_goals_for_per_match   numeric(6,3),
  qualifier_goals_against_per_match numeric(6,3),
  qualifier_clean_sheets          int,
  qualifier_failed_to_score       int,

  -- Detailed stats features
  stats_matches_available         int         DEFAULT 0,
  stats_coverage_pct              numeric(5,3) DEFAULT 0,
  avg_total_shots                 numeric(6,2),
  avg_shots_on_goal               numeric(6,2),
  avg_shots_on_goal_rate          numeric(5,3),
  avg_possession_pct              numeric(5,1),
  avg_corners                     numeric(6,2),
  avg_fouls                       numeric(6,2),
  avg_yellow_cards                numeric(6,2),
  avg_red_cards                   numeric(6,2),

  -- xG features
  xg_matches_available            int         DEFAULT 0,
  xg_coverage_pct                 numeric(5,3) DEFAULT 0,
  xg_for_total                    numeric(8,3),
  xg_against_total                numeric(8,3),
  xg_for_per_match                numeric(6,3),
  xg_against_per_match            numeric(6,3),
  xg_difference_per_match         numeric(6,3),

  -- Event/lineup/player coverage
  events_matches_available        int         DEFAULT 0,
  events_coverage_pct             numeric(5,3) DEFAULT 0,
  lineups_matches_available       int         DEFAULT 0,
  lineups_coverage_pct            numeric(5,3) DEFAULT 0,
  players_matches_available       int         DEFAULT 0,
  players_coverage_pct            numeric(5,3) DEFAULT 0,

  -- Data quality / confidence
  official_results_confidence     numeric(4,2) DEFAULT 0,
  detailed_stats_confidence       numeric(4,2) DEFAULT 0,
  xg_confidence                   numeric(4,2) DEFAULT 0,
  overall_qualifier_data_confidence numeric(4,2) DEFAULT 0,
  missing_stats_reason            text,
  model_usage_notes               text,

  -- Host nation placeholders
  host_recent_competitive_form_available  boolean DEFAULT false,
  host_recent_competitive_form_source     text,
  host_recent_competitive_form_notes      text,

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE wc_qualifier_model_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_wc_qualifier_model_features"
  ON wc_qualifier_model_features FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "service_write_wc_qualifier_model_features"
  ON wc_qualifier_model_features FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Populate function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION populate_wc_qualifier_model_features()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM wc_qualifier_model_features;

  INSERT INTO wc_qualifier_model_features (
    canonical_team_id, team_name, confederation, qualification_method, is_host_nation,
    provider_sources,
    qualifier_matches_played, qualifier_wins, qualifier_draws, qualifier_losses,
    qualifier_points, qualifier_points_per_match,
    qualifier_win_rate, qualifier_draw_rate, qualifier_loss_rate,
    qualifier_goals_for, qualifier_goals_against, qualifier_goal_difference,
    qualifier_goals_for_per_match, qualifier_goals_against_per_match,
    qualifier_clean_sheets, qualifier_failed_to_score,
    stats_matches_available, stats_coverage_pct,
    avg_total_shots, avg_shots_on_goal, avg_shots_on_goal_rate,
    avg_possession_pct, avg_corners, avg_fouls, avg_yellow_cards, avg_red_cards,
    xg_matches_available, xg_coverage_pct,
    xg_for_total, xg_against_total, xg_for_per_match, xg_against_per_match, xg_difference_per_match,
    events_matches_available, events_coverage_pct,
    lineups_matches_available, lineups_coverage_pct,
    players_matches_available, players_coverage_pct,
    official_results_confidence, detailed_stats_confidence, xg_confidence,
    overall_qualifier_data_confidence,
    missing_stats_reason, model_usage_notes,
    updated_at
  )
  WITH wc_teams AS (
    SELECT DISTINCT ON (team_id) team_id, team_name
    FROM (
      SELECT home_api_team_id::text AS team_id, home_team_name AS team_name
        FROM wc2026_fixtures WHERE stage_code = 'Group Stage' AND home_api_team_id IS NOT NULL
      UNION ALL
      SELECT away_api_team_id::text, away_team_name
        FROM wc2026_fixtures WHERE stage_code = 'Group Stage' AND away_api_team_id IS NOT NULL
    ) t
    ORDER BY team_id
  ),
  -- Best summary row per team (most matches if multiple confed rows)
  summary AS (
    SELECT DISTINCT ON (provider_team_id) *
    FROM wc_qualifier_team_summary
    WHERE provider = 'api_football'
    ORDER BY provider_team_id, matches_played DESC NULLS LAST
  ),
  -- Event/lineup/player coverage counts from fixtures (per team, each side)
  fixture_cov AS (
    SELECT
      tid,
      COUNT(*) FILTER (WHERE events_available  = true AND status_short IN ('FT','AET','PEN')) AS ev_n,
      COUNT(*) FILTER (WHERE lineups_available  = true AND status_short IN ('FT','AET','PEN')) AS lu_n,
      COUNT(*) FILTER (WHERE players_available  = true AND status_short IN ('FT','AET','PEN')) AS pl_n
    FROM (
      SELECT home_provider_team_id AS tid, status_short, events_available, lineups_available, players_available
        FROM wc_qualifier_fixtures WHERE provider = 'api_football'
      UNION ALL
      SELECT away_provider_team_id, status_short, events_available, lineups_available, players_available
        FROM wc_qualifier_fixtures WHERE provider = 'api_football'
    ) t
    GROUP BY tid
  ),
  base AS (
    SELECT
      t.team_id,
      COALESCE(s.team_name, t.team_name)                         AS team_name,
      s.confederation,
      CASE WHEN t.team_id IN ('5529','2384','16') THEN 'host' ELSE 'qualifier' END AS qual_method,
      t.team_id IN ('5529','2384','16')                           AS is_host,
      -- official results
      s.matches_played,
      s.wins, s.draws, s.losses, s.points,
      s.points_per_match, s.win_rate, s.draw_rate, s.loss_rate,
      s.goals_for, s.goals_against, s.goal_difference,
      s.goals_for_per_match, s.goals_against_per_match,
      s.clean_sheets, s.failed_to_score,
      -- stats/xg counts from raw_sources_json
      COALESCE((s.raw_sources_json->>'stats_rows')::int, 0) AS stats_n,
      COALESCE((s.raw_sources_json->>'xg_rows')::int,   0) AS xg_n,
      -- avg stats
      s.avg_total_shots, s.avg_shots_on_goal,
      s.avg_possession_pct, s.avg_corners, s.avg_fouls,
      s.avg_yellow_cards, s.avg_red_cards,
      -- xG (summary already has both for/against)
      s.total_xg    AS xg_for_total,
      s.total_xga   AS xg_against_total,
      s.xg_per_match,
      s.xga_per_match,
      s.xg_difference,
      -- event/lineup/player coverage
      COALESCE(fc.ev_n, 0) AS ev_n,
      COALESCE(fc.lu_n, 0) AS lu_n,
      COALESCE(fc.pl_n, 0) AS pl_n
    FROM wc_teams t
    LEFT JOIN summary s ON s.provider_team_id = t.team_id
    LEFT JOIN fixture_cov fc ON fc.tid = t.team_id
  ),
  with_ratios AS (
    SELECT *,
      CASE WHEN COALESCE(matches_played,0) > 0
           THEN stats_n::numeric / matches_played ELSE 0 END AS stats_cov,
      CASE WHEN COALESCE(matches_played,0) > 0
           THEN xg_n::numeric / matches_played   ELSE 0 END AS xg_cov,
      CASE WHEN COALESCE(matches_played,0) > 0
           THEN ev_n::numeric / matches_played   ELSE 0 END AS ev_cov,
      CASE WHEN COALESCE(matches_played,0) > 0
           THEN lu_n::numeric / matches_played   ELSE 0 END AS lu_cov,
      CASE WHEN COALESCE(matches_played,0) > 0
           THEN pl_n::numeric / matches_played   ELSE 0 END AS pl_cov,
      CASE WHEN COALESCE(avg_total_shots, 0) > 0
           THEN avg_shots_on_goal / avg_total_shots ELSE NULL END AS sog_rate
    FROM base
  ),
  with_conf AS (
    SELECT *,
      -- official_results_confidence
      CASE WHEN is_host                           THEN 0.00
           WHEN COALESCE(matches_played,0) > 0   THEN 1.00
           ELSE 0.00 END AS off_conf,
      -- detailed_stats_confidence
      CASE WHEN is_host          THEN 0.00
           WHEN stats_cov >= 0.90 THEN 1.00
           WHEN stats_cov >= 0.70 THEN 0.85
           WHEN stats_cov >= 0.50 THEN 0.65
           WHEN stats_cov >= 0.25 THEN 0.40
           WHEN stats_cov >  0    THEN 0.25
           ELSE 0.00 END AS stats_conf,
      -- xg_confidence
      CASE WHEN is_host         THEN 0.00
           WHEN xg_cov >= 0.90 THEN 1.00
           WHEN xg_cov >= 0.50 THEN 0.60
           WHEN xg_cov >  0    THEN 0.30
           ELSE 0.00 END AS xg_conf_val
    FROM with_ratios
  )
  SELECT
    team_id,
    team_name,
    confederation,
    qual_method,
    is_host,
    jsonb_build_object(
      'api_football', CASE WHEN matches_played > 0 THEN true ELSE false END,
      'sportmonks',   false
    ),
    -- Official results
    matches_played, wins, draws, losses, points,
    points_per_match, win_rate, draw_rate, loss_rate,
    goals_for, goals_against, goal_difference,
    goals_for_per_match, goals_against_per_match,
    clean_sheets, failed_to_score,
    -- Stats coverage
    stats_n,
    ROUND(stats_cov::numeric, 3),
    avg_total_shots,
    avg_shots_on_goal,
    ROUND(sog_rate::numeric, 3),
    avg_possession_pct,
    avg_corners, avg_fouls, avg_yellow_cards, avg_red_cards,
    -- xG
    xg_n,
    ROUND(xg_cov::numeric, 3),
    ROUND(xg_for_total::numeric,   3),
    ROUND(xg_against_total::numeric, 3),
    ROUND(xg_per_match::numeric,   3),
    ROUND(xga_per_match::numeric,  3),
    CASE WHEN xg_per_match IS NOT NULL AND xga_per_match IS NOT NULL
         THEN ROUND((xg_per_match - xga_per_match)::numeric, 3)
         ELSE NULL END,
    -- Coverage
    ev_n, ROUND(ev_cov::numeric, 3),
    lu_n, ROUND(lu_cov::numeric, 3),
    pl_n, ROUND(pl_cov::numeric, 3),
    -- Confidence
    ROUND(off_conf::numeric,   2),
    ROUND(stats_conf::numeric, 2),
    ROUND(xg_conf_val::numeric, 2),
    ROUND((off_conf * 0.60 + stats_conf * 0.30 + xg_conf_val * 0.10)::numeric, 2),
    -- missing_stats_reason
    CASE
      WHEN is_host                                          THEN 'Host nation — auto-qualified, no qualifier campaign'
      WHEN matches_played IS NULL                           THEN 'No qualifier summary found'
      WHEN stats_n = 0 AND COALESCE(matches_played,0) > 0  THEN 'Provider gap — no stats available from API-Football or Sportmonks'
      WHEN stats_cov < 0.50 AND COALESCE(matches_played,0) > 0
        THEN 'Partial coverage — stats for ' || stats_n || '/' || matches_played || ' matches'
      ELSE NULL
    END,
    -- model_usage_notes
    CASE
      WHEN is_host
        THEN 'Host nation: use recent competitive form layer. Do not compare qualifier record against non-host teams.'
      WHEN confederation = 'OFC'
        THEN 'OFC: official results + goals only. No shots/possession/xG available from any provider.'
      WHEN confederation IN ('CAF','AFC') AND stats_cov < 0.50
        THEN 'Partial stats: weight model features by stats_coverage_pct. Use official results as primary signal.'
      WHEN xg_cov = 0 AND off_conf = 1.00
        THEN 'Full official results available. xG not provided for this confederation — use shots as proxy when available.'
      WHEN off_conf = 1.00 AND stats_conf >= 0.85 AND xg_conf_val >= 0.60
        THEN 'Full data: high confidence across all model feature dimensions.'
      ELSE 'Partial data available. Reference confidence scores before using in model.'
    END,
    now()
  FROM with_conf;

  RETURN jsonb_build_object(
    'rows_inserted', (SELECT COUNT(*) FROM wc_qualifier_model_features),
    'hosts',         (SELECT COUNT(*) FROM wc_qualifier_model_features WHERE is_host_nation = true),
    'non_hosts',     (SELECT COUNT(*) FROM wc_qualifier_model_features WHERE is_host_nation = false),
    'avg_overall_confidence', (
      SELECT ROUND(AVG(overall_qualifier_data_confidence)::numeric, 3)
      FROM wc_qualifier_model_features
    ),
    'by_confederation', (
      SELECT jsonb_object_agg(
        COALESCE(confederation, 'host_no_conf'),
        jsonb_build_object(
          'teams',          cnt,
          'avg_official',   ROUND(avg_off::numeric,   2),
          'avg_stats',      ROUND(avg_st::numeric,    2),
          'avg_xg',         ROUND(avg_xg::numeric,    2),
          'avg_overall',    ROUND(avg_ov::numeric,    2)
        )
      )
      FROM (
        SELECT
          COALESCE(confederation, '?') AS confederation,
          COUNT(*) AS cnt,
          AVG(official_results_confidence)      AS avg_off,
          AVG(detailed_stats_confidence)        AS avg_st,
          AVG(xg_confidence)                    AS avg_xg,
          AVG(overall_qualifier_data_confidence) AS avg_ov
        FROM wc_qualifier_model_features
        GROUP BY COALESCE(confederation, '?')
      ) sub
    )
  );
END;
$$;

-- Execute immediately
SELECT populate_wc_qualifier_model_features();
