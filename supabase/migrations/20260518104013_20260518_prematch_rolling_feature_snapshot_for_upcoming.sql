
/*
  # Prematch Rolling Feature Snapshot for Upcoming Matches

  ## Purpose
  The existing match_feature_matrix_v1/v2 and prematch_feature_matrix_snapshot_v1 require
  a completed match result (result_1x2 NOT NULL) before they can store a row. This means
  upcoming 2025/26 fixtures always have feature_readiness=false and fall back to elo_only.

  This migration creates:
  1. model_lab.prematch_upcoming_feature_snapshots — stores pre-match rolling features for
     upcoming fixtures (no result columns, no leakage)
  2. model_lab.ml_generate_upcoming_feature_snapshot(p_match_id uuid) — computes and upserts
     the feature row for one upcoming match using only pre-match historical data
  3. model_lab.ml_generate_upcoming_features_batch(p_from_date date, p_to_date date) — batch
     runner for all upcoming matches in a date range
  4. A public wrapper ml_generate_upcoming_feature_snapshot(uuid) for RPC access

  ## Design constraints
  - Strictly pre-match: only completed matches (home_score_ft IS NOT NULL) with
    match_date < target match_date are used as lookback data
  - No future leakage: the target match_id row is never included in its own lookback
  - Idempotent: uses ON CONFLICT DO UPDATE so safe to re-run
  - No result columns stored — only form vectors

  ## New table: prematch_upcoming_feature_snapshots
  Primary key: match_id (one row per upcoming match, regenerable)
  Columns mirror the rolling portion of prematch_feature_matrix_snapshot_v1 plus derived
  composite indices (attack_index, defense_resistance, xg_lite, tempo, shot_quality,
  discipline_risk, set_piece_threat, fatigue_proxy, late_goal_prior) for both home/away teams.

  ## Security
  - RLS enabled, admin-only write, authenticated read
*/

-- ─── 1. Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.prematch_upcoming_feature_snapshots (
  match_id                  uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,

  -- metadata
  home_team_id              uuid NOT NULL,
  away_team_id              uuid NOT NULL,
  competition_season_id     uuid,
  match_date                date,
  feature_version           text NOT NULL DEFAULT 'rolling_v1_2026',
  generated_at              timestamptz NOT NULL DEFAULT now(),

  -- ── home rolling form ──────────────────────────────────────────────────────
  home_matches_l5           int,
  home_matches_l10          int,
  home_matches_l20          int,
  home_form_l5              numeric(6,4),   -- points per match
  home_form_l10             numeric(6,4),
  home_form_l20             numeric(6,4),
  home_win_rate_l5          numeric(6,4),
  home_draw_rate_l5         numeric(6,4),
  home_loss_rate_l5         numeric(6,4),
  home_win_rate_l10         numeric(6,4),
  home_draw_rate_l10        numeric(6,4),
  home_goals_for_avg_l5     numeric(6,3),
  home_goals_against_avg_l5 numeric(6,3),
  home_goal_diff_avg_l5     numeric(6,3),
  home_goals_for_avg_l10    numeric(6,3),
  home_goals_against_avg_l10 numeric(6,3),
  home_goal_diff_avg_l10    numeric(6,3),
  home_clean_sheet_rate_l10 numeric(6,4),

  -- home stats features (may be NULL if no AF stats available)
  home_shots_avg_l5         numeric(6,2),
  home_shots_on_goal_avg_l5 numeric(6,2),
  home_corners_avg_l5       numeric(6,2),
  home_fouls_avg_l5         numeric(6,2),
  home_yellow_cards_avg_l5  numeric(6,2),
  home_possession_avg_l5    numeric(6,2),
  home_pass_accuracy_avg_l5 numeric(6,2),
  home_gk_saves_avg_l10     numeric(6,2),

  -- home composite indices
  home_attack_index_l5      numeric(8,4),
  home_defense_resistance_l5 numeric(8,4),
  home_xg_lite_l5           numeric(8,4),
  home_tempo_index_l5       numeric(8,4),
  home_shot_quality_l5      numeric(8,4),
  home_discipline_risk_l5   numeric(8,4),
  home_set_piece_threat_l5  numeric(8,4),
  home_has_stats_features   boolean NOT NULL DEFAULT false,

  -- ── away rolling form ──────────────────────────────────────────────────────
  away_matches_l5           int,
  away_matches_l10          int,
  away_matches_l20          int,
  away_form_l5              numeric(6,4),
  away_form_l10             numeric(6,4),
  away_form_l20             numeric(6,4),
  away_win_rate_l5          numeric(6,4),
  away_draw_rate_l5         numeric(6,4),
  away_loss_rate_l5         numeric(6,4),
  away_win_rate_l10         numeric(6,4),
  away_draw_rate_l10        numeric(6,4),
  away_goals_for_avg_l5     numeric(6,3),
  away_goals_against_avg_l5 numeric(6,3),
  away_goal_diff_avg_l5     numeric(6,3),
  away_goals_for_avg_l10    numeric(6,3),
  away_goals_against_avg_l10 numeric(6,3),
  away_goal_diff_avg_l10    numeric(6,3),
  away_clean_sheet_rate_l10 numeric(6,4),

  -- away stats features
  away_shots_avg_l5         numeric(6,2),
  away_shots_on_goal_avg_l5 numeric(6,2),
  away_corners_avg_l5       numeric(6,2),
  away_fouls_avg_l5         numeric(6,2),
  away_yellow_cards_avg_l5  numeric(6,2),
  away_possession_avg_l5    numeric(6,2),
  away_pass_accuracy_avg_l5 numeric(6,2),
  away_gk_saves_avg_l10     numeric(6,2),

  -- away composite indices
  away_attack_index_l5      numeric(8,4),
  away_defense_resistance_l5 numeric(8,4),
  away_xg_lite_l5           numeric(8,4),
  away_tempo_index_l5       numeric(8,4),
  away_shot_quality_l5      numeric(8,4),
  away_discipline_risk_l5   numeric(8,4),
  away_set_piece_threat_l5  numeric(8,4),
  away_has_stats_features   boolean NOT NULL DEFAULT false,

  -- ── differential features ─────────────────────────────────────────────────
  diff_form_l5              numeric(8,4),
  diff_form_l10             numeric(8,4),
  diff_goals_for_l5         numeric(8,3),
  diff_goals_against_l5     numeric(8,3),
  diff_attack_index_l5      numeric(8,4),
  diff_defense_resistance_l5 numeric(8,4),
  diff_xg_lite_l5           numeric(8,4),

  -- ── derived quality flags ─────────────────────────────────────────────────
  feature_quality_tier      text NOT NULL DEFAULT 'elo_only',
  has_form_features         boolean NOT NULL DEFAULT false,
  is_promoted_team          boolean NOT NULL DEFAULT false,
  promoted_team_bootstrap   boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pufs_match_date ON model_lab.prematch_upcoming_feature_snapshots(match_date);
CREATE INDEX IF NOT EXISTS idx_pufs_generated_at ON model_lab.prematch_upcoming_feature_snapshots(generated_at DESC);

-- RLS
ALTER TABLE model_lab.prematch_upcoming_feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read upcoming feature snapshots"
  ON model_lab.prematch_upcoming_feature_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert upcoming feature snapshots"
  ON model_lab.prematch_upcoming_feature_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update upcoming feature snapshots"
  ON model_lab.prematch_upcoming_feature_snapshots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Grant
GRANT SELECT ON model_lab.prematch_upcoming_feature_snapshots TO authenticated;
GRANT INSERT, UPDATE ON model_lab.prematch_upcoming_feature_snapshots TO authenticated;
GRANT ALL ON model_lab.prematch_upcoming_feature_snapshots TO service_role;


-- ─── 2. Core function: compute + upsert for one match ────────────────────────

CREATE OR REPLACE FUNCTION model_lab.ml_generate_upcoming_feature_snapshot(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match          record;
  v_home           record;
  v_away           record;
  v_h_stats        record;
  v_a_stats        record;
  v_tier           text;
  v_has_form       boolean;
  v_result         jsonb;
BEGIN
  -- Load target match
  SELECT m.id, m.home_team_id, m.away_team_id, m.match_date, m.competition_season_id,
         m.status_short
  INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match not found', 'match_id', p_match_id);
  END IF;

  -- Reject completed matches (should use full feature matrix instead)
  IF v_match.status_short IN ('FT','AET','PEN','AWD','WO') THEN
    RETURN jsonb_build_object('error', 'match already completed, use full feature matrix', 'match_id', p_match_id);
  END IF;

  -- ── Compute home team rolling form ──────────────────────────────────────────
  WITH team_history AS (
    SELECT
      m.id AS match_id,
      m.match_date,
      CASE WHEN m.home_team_id = v_match.home_team_id THEN m.home_score_ft ELSE m.away_score_ft END AS goals_for,
      CASE WHEN m.home_team_id = v_match.home_team_id THEN m.away_score_ft ELSE m.home_score_ft END AS goals_against,
      CASE
        WHEN (m.home_team_id = v_match.home_team_id AND m.result = 'H') OR
             (m.away_team_id = v_match.home_team_id AND m.result = 'A') THEN 3
        WHEN m.result = 'D' THEN 1
        ELSE 0
      END AS pts,
      CASE
        WHEN (m.home_team_id = v_match.home_team_id AND m.result = 'H') OR
             (m.away_team_id = v_match.home_team_id AND m.result = 'A') THEN 1 ELSE 0
      END AS is_win,
      CASE WHEN m.result = 'D' THEN 1 ELSE 0 END AS is_draw,
      ROW_NUMBER() OVER (ORDER BY m.match_date DESC, m.id DESC) AS rn
    FROM public.matches m
    WHERE (m.home_team_id = v_match.home_team_id OR m.away_team_id = v_match.home_team_id)
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND m.match_date < v_match.match_date
      AND m.id <> p_match_id
  )
  SELECT
    COUNT(*) FILTER (WHERE rn <= 5)::int           AS m5,
    COUNT(*) FILTER (WHERE rn <= 10)::int          AS m10,
    COUNT(*) FILTER (WHERE rn <= 20)::int          AS m20,
    AVG(pts::numeric) FILTER (WHERE rn <= 5)       AS form5,
    AVG(pts::numeric) FILTER (WHERE rn <= 10)      AS form10,
    AVG(pts::numeric) FILTER (WHERE rn <= 20)      AS form20,
    AVG(is_win::numeric) FILTER (WHERE rn <= 5)    AS win5,
    AVG(is_draw::numeric) FILTER (WHERE rn <= 5)   AS draw5,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 5) AS gf5,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 5) AS ga5,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 10) AS gf10,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 10) AS ga10,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 20) AS gf20,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 20) AS ga20,
    AVG(is_win::numeric) FILTER (WHERE rn <= 10)   AS win10,
    AVG(is_draw::numeric) FILTER (WHERE rn <= 10)  AS draw10,
    AVG(CASE WHEN goals_against = 0 THEN 1 ELSE 0 END::numeric) FILTER (WHERE rn <= 10) AS cs10
  INTO v_home
  FROM team_history;

  -- ── Compute away team rolling form ──────────────────────────────────────────
  WITH team_history AS (
    SELECT
      m.id AS match_id,
      m.match_date,
      CASE WHEN m.home_team_id = v_match.away_team_id THEN m.home_score_ft ELSE m.away_score_ft END AS goals_for,
      CASE WHEN m.home_team_id = v_match.away_team_id THEN m.away_score_ft ELSE m.home_score_ft END AS goals_against,
      CASE
        WHEN (m.home_team_id = v_match.away_team_id AND m.result = 'H') OR
             (m.away_team_id = v_match.away_team_id AND m.result = 'A') THEN 3
        WHEN m.result = 'D' THEN 1
        ELSE 0
      END AS pts,
      CASE
        WHEN (m.home_team_id = v_match.away_team_id AND m.result = 'H') OR
             (m.away_team_id = v_match.away_team_id AND m.result = 'A') THEN 1 ELSE 0
      END AS is_win,
      CASE WHEN m.result = 'D' THEN 1 ELSE 0 END AS is_draw,
      ROW_NUMBER() OVER (ORDER BY m.match_date DESC, m.id DESC) AS rn
    FROM public.matches m
    WHERE (m.home_team_id = v_match.away_team_id OR m.away_team_id = v_match.away_team_id)
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND m.match_date < v_match.match_date
      AND m.id <> p_match_id
  )
  SELECT
    COUNT(*) FILTER (WHERE rn <= 5)::int           AS m5,
    COUNT(*) FILTER (WHERE rn <= 10)::int          AS m10,
    COUNT(*) FILTER (WHERE rn <= 20)::int          AS m20,
    AVG(pts::numeric) FILTER (WHERE rn <= 5)       AS form5,
    AVG(pts::numeric) FILTER (WHERE rn <= 10)      AS form10,
    AVG(pts::numeric) FILTER (WHERE rn <= 20)      AS form20,
    AVG(is_win::numeric) FILTER (WHERE rn <= 5)    AS win5,
    AVG(is_draw::numeric) FILTER (WHERE rn <= 5)   AS draw5,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 5) AS gf5,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 5) AS ga5,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 10) AS gf10,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 10) AS ga10,
    AVG(goals_for::numeric) FILTER (WHERE rn <= 20) AS gf20,
    AVG(goals_against::numeric) FILTER (WHERE rn <= 20) AS ga20,
    AVG(is_win::numeric) FILTER (WHERE rn <= 10)   AS win10,
    AVG(is_draw::numeric) FILTER (WHERE rn <= 10)  AS draw10,
    AVG(CASE WHEN goals_against = 0 THEN 1 ELSE 0 END::numeric) FILTER (WHERE rn <= 10) AS cs10
  INTO v_away
  FROM team_history;

  -- ── Home stats features (from v_team_match_stats via matches) ───────────────
  WITH stats_history AS (
    SELECT
      tms.match_id, m.match_date,
      tms.total_shots, tms.shots_on_goal, tms.shots_insidebox,
      tms.corner_kicks, tms.fouls, tms.yellow_cards, tms.red_cards,
      tms.goalkeeper_saves, tms.ball_possession, tms.passes_percentage,
      tms.expected_goals_provider,
      ROW_NUMBER() OVER (ORDER BY m.match_date DESC, m.id DESC) AS rn
    FROM public.v_team_match_stats tms
    JOIN public.matches m ON m.id = tms.match_id
    WHERE tms.team_id = v_match.home_team_id
      AND m.match_date < v_match.match_date
      AND m.id <> p_match_id
      AND m.home_score_ft IS NOT NULL
  )
  SELECT
    AVG(total_shots) FILTER (WHERE rn <= 5)          AS shots5,
    AVG(shots_on_goal) FILTER (WHERE rn <= 5)        AS sog5,
    AVG(shots_insidebox) FILTER (WHERE rn <= 5)      AS sib5,
    AVG(corner_kicks) FILTER (WHERE rn <= 5)         AS cor5,
    AVG(fouls) FILTER (WHERE rn <= 5)                AS fouls5,
    AVG(yellow_cards) FILTER (WHERE rn <= 5)         AS yc5,
    AVG(ball_possession) FILTER (WHERE rn <= 5)      AS poss5,
    AVG(passes_percentage) FILTER (WHERE rn <= 5)    AS pacc5,
    AVG(goalkeeper_saves) FILTER (WHERE rn <= 10)    AS gks10,
    AVG(expected_goals_provider) FILTER (WHERE rn <= 5 AND expected_goals_provider IS NOT NULL) AS xgp5,
    COUNT(*) FILTER (WHERE rn <= 5) > 0              AS has_stats
  INTO v_h_stats
  FROM stats_history;

  -- ── Away stats features ──────────────────────────────────────────────────────
  WITH stats_history AS (
    SELECT
      tms.match_id, m.match_date,
      tms.total_shots, tms.shots_on_goal, tms.shots_insidebox,
      tms.corner_kicks, tms.fouls, tms.yellow_cards, tms.red_cards,
      tms.goalkeeper_saves, tms.ball_possession, tms.passes_percentage,
      tms.expected_goals_provider,
      ROW_NUMBER() OVER (ORDER BY m.match_date DESC, m.id DESC) AS rn
    FROM public.v_team_match_stats tms
    JOIN public.matches m ON m.id = tms.match_id
    WHERE tms.team_id = v_match.away_team_id
      AND m.match_date < v_match.match_date
      AND m.id <> p_match_id
      AND m.home_score_ft IS NOT NULL
  )
  SELECT
    AVG(total_shots) FILTER (WHERE rn <= 5)          AS shots5,
    AVG(shots_on_goal) FILTER (WHERE rn <= 5)        AS sog5,
    AVG(shots_insidebox) FILTER (WHERE rn <= 5)      AS sib5,
    AVG(corner_kicks) FILTER (WHERE rn <= 5)         AS cor5,
    AVG(fouls) FILTER (WHERE rn <= 5)                AS fouls5,
    AVG(yellow_cards) FILTER (WHERE rn <= 5)         AS yc5,
    AVG(ball_possession) FILTER (WHERE rn <= 5)      AS poss5,
    AVG(passes_percentage) FILTER (WHERE rn <= 5)    AS pacc5,
    AVG(goalkeeper_saves) FILTER (WHERE rn <= 10)    AS gks10,
    AVG(expected_goals_provider) FILTER (WHERE rn <= 5 AND expected_goals_provider IS NOT NULL) AS xgp5,
    COUNT(*) FILTER (WHERE rn <= 5) > 0              AS has_stats
  INTO v_a_stats
  FROM stats_history;

  -- ── Determine feature quality tier ──────────────────────────────────────────
  v_has_form := COALESCE(v_home.m5, 0) >= 3 AND COALESCE(v_away.m5, 0) >= 3;

  IF v_has_form AND COALESCE(v_h_stats.has_stats, false) AND COALESCE(v_a_stats.has_stats, false) THEN
    v_tier := 'elo_form_stats';
  ELSIF v_has_form THEN
    v_tier := 'elo_form';
  ELSE
    v_tier := 'elo_only';
  END IF;

  -- ── Upsert ───────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.prematch_upcoming_feature_snapshots (
    match_id, home_team_id, away_team_id, competition_season_id, match_date,
    feature_version, generated_at,

    home_matches_l5, home_matches_l10, home_matches_l20,
    home_form_l5, home_form_l10, home_form_l20,
    home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
    home_win_rate_l10, home_draw_rate_l10,
    home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
    home_goals_for_avg_l10, home_goals_against_avg_l10, home_goal_diff_avg_l10,
    home_clean_sheet_rate_l10,
    home_shots_avg_l5, home_shots_on_goal_avg_l5, home_corners_avg_l5,
    home_fouls_avg_l5, home_yellow_cards_avg_l5, home_possession_avg_l5,
    home_pass_accuracy_avg_l5, home_gk_saves_avg_l10,
    home_attack_index_l5, home_defense_resistance_l5, home_xg_lite_l5,
    home_tempo_index_l5, home_shot_quality_l5, home_discipline_risk_l5,
    home_set_piece_threat_l5, home_has_stats_features,

    away_matches_l5, away_matches_l10, away_matches_l20,
    away_form_l5, away_form_l10, away_form_l20,
    away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
    away_win_rate_l10, away_draw_rate_l10,
    away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
    away_goals_for_avg_l10, away_goals_against_avg_l10, away_goal_diff_avg_l10,
    away_clean_sheet_rate_l10,
    away_shots_avg_l5, away_shots_on_goal_avg_l5, away_corners_avg_l5,
    away_fouls_avg_l5, away_yellow_cards_avg_l5, away_possession_avg_l5,
    away_pass_accuracy_avg_l5, away_gk_saves_avg_l10,
    away_attack_index_l5, away_defense_resistance_l5, away_xg_lite_l5,
    away_tempo_index_l5, away_shot_quality_l5, away_discipline_risk_l5,
    away_set_piece_threat_l5, away_has_stats_features,

    diff_form_l5, diff_form_l10, diff_goals_for_l5, diff_goals_against_l5,
    diff_attack_index_l5, diff_defense_resistance_l5, diff_xg_lite_l5,

    feature_quality_tier, has_form_features
  )
  VALUES (
    p_match_id, v_match.home_team_id, v_match.away_team_id,
    v_match.competition_season_id, v_match.match_date,
    'rolling_v1_2026', now(),

    -- home form
    COALESCE(v_home.m5, 0), COALESCE(v_home.m10, 0), COALESCE(v_home.m20, 0),
    v_home.form5, v_home.form10, v_home.form20,
    v_home.win5, v_home.draw5,
    CASE WHEN v_home.win5 IS NOT NULL AND v_home.draw5 IS NOT NULL
         THEN 1.0 - v_home.win5 - v_home.draw5 ELSE NULL END,
    v_home.win10, v_home.draw10,
    v_home.gf5, v_home.ga5,
    COALESCE(v_home.gf5, 0) - COALESCE(v_home.ga5, 0),
    v_home.gf10, v_home.ga10,
    COALESCE(v_home.gf10, 0) - COALESCE(v_home.ga10, 0),
    v_home.cs10,
    -- home stats
    v_h_stats.shots5, v_h_stats.sog5, v_h_stats.cor5,
    v_h_stats.fouls5, v_h_stats.yc5, v_h_stats.poss5,
    v_h_stats.pacc5, v_h_stats.gks10,
    -- home indices
    CASE WHEN v_h_stats.has_stats
         THEN (COALESCE(v_h_stats.sog5,0)*2.0 + COALESCE(v_h_stats.sib5,0)*1.5 + COALESCE(v_h_stats.shots5,0)) / 10.0
         ELSE COALESCE(v_home.gf5,0) / 3.0 END,
    1.0 / (1.0 + COALESCE(v_home.ga5, 2.0)),
    CASE WHEN v_h_stats.xgp5 IS NOT NULL
         THEN v_h_stats.xgp5 * 0.65 + COALESCE(v_h_stats.sog5,0) * 0.35 * 0.35
         WHEN v_h_stats.sog5 IS NOT NULL THEN v_h_stats.sog5 * 0.35
         ELSE COALESCE(v_home.gf5, 0) END,
    CASE WHEN v_h_stats.shots5 IS NOT NULL
         THEN (COALESCE(v_h_stats.pacc5,400)/500.0 + COALESCE(v_h_stats.cor5,4)/12.0) / 2.0
         ELSE NULL END,
    CASE WHEN COALESCE(v_h_stats.shots5,0) > 0
         THEN COALESCE(v_h_stats.sib5,0) / NULLIF(v_h_stats.shots5,0)
         ELSE NULL END,
    COALESCE(v_h_stats.yc5,0) + COALESCE((SELECT AVG(red_cards) FROM public.v_team_match_stats WHERE team_id = v_match.home_team_id LIMIT 5), 0) * 3.0,
    COALESCE(v_h_stats.cor5, 0),
    COALESCE(v_h_stats.has_stats, false),

    -- away form
    COALESCE(v_away.m5, 0), COALESCE(v_away.m10, 0), COALESCE(v_away.m20, 0),
    v_away.form5, v_away.form10, v_away.form20,
    v_away.win5, v_away.draw5,
    CASE WHEN v_away.win5 IS NOT NULL AND v_away.draw5 IS NOT NULL
         THEN 1.0 - v_away.win5 - v_away.draw5 ELSE NULL END,
    v_away.win10, v_away.draw10,
    v_away.gf5, v_away.ga5,
    COALESCE(v_away.gf5, 0) - COALESCE(v_away.ga5, 0),
    v_away.gf10, v_away.ga10,
    COALESCE(v_away.gf10, 0) - COALESCE(v_away.ga10, 0),
    v_away.cs10,
    -- away stats
    v_a_stats.shots5, v_a_stats.sog5, v_a_stats.cor5,
    v_a_stats.fouls5, v_a_stats.yc5, v_a_stats.poss5,
    v_a_stats.pacc5, v_a_stats.gks10,
    -- away indices
    CASE WHEN v_a_stats.has_stats
         THEN (COALESCE(v_a_stats.sog5,0)*2.0 + COALESCE(v_a_stats.sib5,0)*1.5 + COALESCE(v_a_stats.shots5,0)) / 10.0
         ELSE COALESCE(v_away.gf5,0) / 3.0 END,
    1.0 / (1.0 + COALESCE(v_away.ga5, 2.0)),
    CASE WHEN v_a_stats.xgp5 IS NOT NULL
         THEN v_a_stats.xgp5 * 0.65 + COALESCE(v_a_stats.sog5,0) * 0.35 * 0.35
         WHEN v_a_stats.sog5 IS NOT NULL THEN v_a_stats.sog5 * 0.35
         ELSE COALESCE(v_away.gf5, 0) END,
    CASE WHEN v_a_stats.shots5 IS NOT NULL
         THEN (COALESCE(v_a_stats.pacc5,400)/500.0 + COALESCE(v_a_stats.cor5,4)/12.0) / 2.0
         ELSE NULL END,
    CASE WHEN COALESCE(v_a_stats.shots5,0) > 0
         THEN COALESCE(v_a_stats.sib5,0) / NULLIF(v_a_stats.shots5,0)
         ELSE NULL END,
    COALESCE(v_a_stats.yc5,0) + COALESCE((SELECT AVG(red_cards) FROM public.v_team_match_stats WHERE team_id = v_match.away_team_id LIMIT 5), 0) * 3.0,
    COALESCE(v_a_stats.cor5, 0),
    COALESCE(v_a_stats.has_stats, false),

    -- differentials
    COALESCE(v_home.form5, 0) - COALESCE(v_away.form5, 0),
    COALESCE(v_home.form10, 0) - COALESCE(v_away.form10, 0),
    COALESCE(v_home.gf5, 0) - COALESCE(v_away.gf5, 0),
    COALESCE(v_home.ga5, 0) - COALESCE(v_away.ga5, 0),
    NULL, NULL, NULL,  -- diff indices computed post-upsert if needed

    v_tier, v_has_form
  )
  ON CONFLICT (match_id) DO UPDATE SET
    generated_at              = EXCLUDED.generated_at,
    feature_version           = EXCLUDED.feature_version,
    home_matches_l5           = EXCLUDED.home_matches_l5,
    home_matches_l10          = EXCLUDED.home_matches_l10,
    home_form_l5              = EXCLUDED.home_form_l5,
    home_form_l10             = EXCLUDED.home_form_l10,
    home_win_rate_l5          = EXCLUDED.home_win_rate_l5,
    home_draw_rate_l5         = EXCLUDED.home_draw_rate_l5,
    home_loss_rate_l5         = EXCLUDED.home_loss_rate_l5,
    home_win_rate_l10         = EXCLUDED.home_win_rate_l10,
    home_goals_for_avg_l5     = EXCLUDED.home_goals_for_avg_l5,
    home_goals_against_avg_l5 = EXCLUDED.home_goals_against_avg_l5,
    home_goal_diff_avg_l5     = EXCLUDED.home_goal_diff_avg_l5,
    home_goals_for_avg_l10    = EXCLUDED.home_goals_for_avg_l10,
    home_goals_against_avg_l10= EXCLUDED.home_goals_against_avg_l10,
    home_clean_sheet_rate_l10 = EXCLUDED.home_clean_sheet_rate_l10,
    home_shots_avg_l5         = EXCLUDED.home_shots_avg_l5,
    home_shots_on_goal_avg_l5 = EXCLUDED.home_shots_on_goal_avg_l5,
    home_corners_avg_l5       = EXCLUDED.home_corners_avg_l5,
    home_attack_index_l5      = EXCLUDED.home_attack_index_l5,
    home_defense_resistance_l5= EXCLUDED.home_defense_resistance_l5,
    home_xg_lite_l5           = EXCLUDED.home_xg_lite_l5,
    home_has_stats_features   = EXCLUDED.home_has_stats_features,
    away_matches_l5           = EXCLUDED.away_matches_l5,
    away_matches_l10          = EXCLUDED.away_matches_l10,
    away_form_l5              = EXCLUDED.away_form_l5,
    away_form_l10             = EXCLUDED.away_form_l10,
    away_win_rate_l5          = EXCLUDED.away_win_rate_l5,
    away_draw_rate_l5         = EXCLUDED.away_draw_rate_l5,
    away_loss_rate_l5         = EXCLUDED.away_loss_rate_l5,
    away_win_rate_l10         = EXCLUDED.away_win_rate_l10,
    away_goals_for_avg_l5     = EXCLUDED.away_goals_for_avg_l5,
    away_goals_against_avg_l5 = EXCLUDED.away_goals_against_avg_l5,
    away_goal_diff_avg_l5     = EXCLUDED.away_goal_diff_avg_l5,
    away_goals_for_avg_l10    = EXCLUDED.away_goals_for_avg_l10,
    away_goals_against_avg_l10= EXCLUDED.away_goals_against_avg_l10,
    away_clean_sheet_rate_l10 = EXCLUDED.away_clean_sheet_rate_l10,
    away_shots_avg_l5         = EXCLUDED.away_shots_avg_l5,
    away_shots_on_goal_avg_l5 = EXCLUDED.away_shots_on_goal_avg_l5,
    away_corners_avg_l5       = EXCLUDED.away_corners_avg_l5,
    away_attack_index_l5      = EXCLUDED.away_attack_index_l5,
    away_defense_resistance_l5= EXCLUDED.away_defense_resistance_l5,
    away_xg_lite_l5           = EXCLUDED.away_xg_lite_l5,
    away_has_stats_features   = EXCLUDED.away_has_stats_features,
    diff_form_l5              = EXCLUDED.diff_form_l5,
    diff_form_l10             = EXCLUDED.diff_form_l10,
    feature_quality_tier      = EXCLUDED.feature_quality_tier,
    has_form_features         = EXCLUDED.has_form_features;

  v_result := jsonb_build_object(
    'match_id',            p_match_id,
    'feature_tier',        v_tier,
    'has_form',            v_has_form,
    'home_matches_l5',     COALESCE(v_home.m5, 0),
    'away_matches_l5',     COALESCE(v_away.m5, 0),
    'home_has_stats',      COALESCE(v_h_stats.has_stats, false),
    'away_has_stats',      COALESCE(v_a_stats.has_stats, false)
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION model_lab.ml_generate_upcoming_feature_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.ml_generate_upcoming_feature_snapshot(uuid) TO service_role;


-- ─── 3. Batch runner ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.ml_generate_upcoming_features_batch(
  p_from_date date DEFAULT CURRENT_DATE,
  p_to_date   date DEFAULT CURRENT_DATE + 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match_id   uuid;
  v_processed  int := 0;
  v_errors     text[] := '{}';
  v_results    jsonb[] := '{}';
  v_r          jsonb;
BEGIN
  FOR v_match_id IN
    SELECT m.id
    FROM public.matches m
    WHERE m.match_date BETWEEN p_from_date AND p_to_date
      AND m.status_short IN ('NS','TBD','PST')
      AND m.home_score_ft IS NULL
    ORDER BY m.match_date
  LOOP
    BEGIN
      v_r := model_lab.ml_generate_upcoming_feature_snapshot(v_match_id);
      v_results := array_append(v_results, v_r);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, v_match_id::text || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'errors',    to_json(v_errors)::jsonb,
    'results',   to_json(v_results)::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION model_lab.ml_generate_upcoming_features_batch(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.ml_generate_upcoming_features_batch(date, date) TO service_role;


-- ─── 4. Public wrappers for PostgREST RPC ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_generate_upcoming_feature_snapshot(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN model_lab.ml_generate_upcoming_feature_snapshot(p_match_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ml_generate_upcoming_features_batch(
  p_from_date date DEFAULT CURRENT_DATE,
  p_to_date   date DEFAULT CURRENT_DATE + 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN model_lab.ml_generate_upcoming_features_batch(p_from_date, p_to_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_generate_upcoming_feature_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ml_generate_upcoming_features_batch(date, date) TO authenticated;
