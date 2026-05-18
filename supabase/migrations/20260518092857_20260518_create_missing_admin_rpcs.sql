/*
  # Create 9 missing admin RPCs

  ## Purpose
  9 RPCs are called by admin frontend pages but do not exist in the database,
  causing every page to display error banners. This migration creates all of them.

  ## Column notes (from schema inspection)
  - matches: home_score_ft / away_score_ft (not home_score / away_score)
  - matches: NO home_elo / away_elo columns
  - match_story_drafts: home_team_name / away_team_name / status (not workflow_state)
  - prematch_prediction_drafts: confidence_score (numeric), status (text)

  ## New Functions (all in public schema)

  1. ml_admin_get_elo_version_stats()
  2. ml_admin_get_feature_matrix_stats()
  3. ml_admin_get_walk_forward_folds()
  4. ml_admin_get_calibration_summary()
  5. ml_admin_get_matches_without_stories(p_limit int)
  6. ml_admin_generate_match_story(p_match_id uuid, p_generated_by uuid)
  7. ml_admin_get_publishing_queue(p_limit, p_filter, p_competition, p_date_from, p_date_to)
  8. ml_admin_generate_prematch_prediction(p_match_id uuid, p_elo_version text, p_feature_version text)
  9. admin_match_readiness(p_from text, p_to text)

  ## Security
  All SECURITY DEFINER with explicit search_path. GRANT to authenticated only.
*/

-- ─── 1. ml_admin_get_elo_version_stats ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_elo_version_stats()
RETURNS TABLE (
  elo_version        text,
  snapshot_count     bigint,
  competition_count  bigint,
  latest_match_date  date,
  avg_brier          numeric,
  avg_log_loss       numeric,
  calibration_gap    numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    r.run_key                               AS elo_version,
    COUNT(s.id)                             AS snapshot_count,
    COUNT(DISTINCT s.competition_id)        AS competition_count,
    MAX(s.match_date)                       AS latest_match_date,
    NULL::numeric                           AS avg_brier,
    NULL::numeric                           AS avg_log_loss,
    NULL::numeric                           AS calibration_gap
  FROM model_lab.elo_computation_runs r
  LEFT JOIN model_lab.match_elo_snapshots s ON s.elo_run_id = r.id
  WHERE r.status = 'completed'
  GROUP BY r.run_key
  ORDER BY MAX(s.match_date) DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_elo_version_stats() TO authenticated;

-- ─── 2. ml_admin_get_feature_matrix_stats ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_feature_matrix_stats()
RETURNS TABLE (
  feature_version    text,
  elo_version        text,
  total_rows         bigint,
  tier_1_count       bigint,
  tier_2_count       bigint,
  tier_3_count       bigint,
  competition_count  bigint,
  latest_match_date  date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    fm.feature_version,
    fm.elo_version,
    COUNT(*)                                                                        AS total_rows,
    COUNT(*) FILTER (WHERE fm.feature_quality_tier = 'elo_form_stats')             AS tier_1_count,
    COUNT(*) FILTER (WHERE fm.feature_quality_tier = 'elo_form')                   AS tier_2_count,
    COUNT(*) FILTER (WHERE fm.feature_quality_tier = 'elo_only')                   AS tier_3_count,
    COUNT(DISTINCT fm.competition_id)                                               AS competition_count,
    MAX(fm.match_date)                                                              AS latest_match_date
  FROM model_lab.match_feature_matrix_v2 fm
  GROUP BY fm.feature_version, fm.elo_version
  ORDER BY MAX(fm.match_date) DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_feature_matrix_stats() TO authenticated;

-- ─── 3. ml_admin_get_walk_forward_folds ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_walk_forward_folds()
RETURNS TABLE (
  test_year    integer,
  match_count  integer,
  avg_brier    numeric,
  avg_log_loss numeric,
  hit_rate     numeric,
  run_key      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    f.test_year,
    f.test_match_count                                                              AS match_count,
    AVG(m.metric_value) FILTER (WHERE m.metric_name = 'brier_score')               AS avg_brier,
    AVG(m.metric_value) FILTER (WHERE m.metric_name = 'log_loss')                  AS avg_log_loss,
    AVG(m.metric_value) FILTER (WHERE m.metric_name = 'accuracy')                  AS hit_rate,
    r.run_key
  FROM model_lab.walk_forward_folds f
  JOIN model_lab.walk_forward_runs r ON r.id = f.run_id
  LEFT JOIN model_lab.walk_forward_metrics m ON m.fold_id = f.id
  GROUP BY f.test_year, f.test_match_count, r.run_key
  ORDER BY r.run_key, f.test_year;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_walk_forward_folds() TO authenticated;

-- ─── 4. ml_admin_get_calibration_summary ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_calibration_summary()
RETURNS TABLE (
  competition_name  text,
  tier              integer,
  match_count       integer,
  avg_brier         numeric,
  avg_log_loss      numeric,
  hit_rate          numeric,
  calibration_gap   numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    cs.competition_name,
    NULL::integer                              AS tier,
    cs.matches_evaluated                       AS match_count,
    cs.rolling_brier_l50                       AS avg_brier,
    cs.rolling_logloss_l50                     AS avg_log_loss,
    cs.rolling_accuracy_l50                    AS hit_rate,
    (cs.home_bias_l50 + cs.away_bias_l50) / 2.0  AS calibration_gap
  FROM model_lab.league_calibration_state cs
  ORDER BY cs.competition_name;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_calibration_summary() TO authenticated;

-- ─── 5. ml_admin_get_matches_without_stories ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_matches_without_stories(p_limit integer DEFAULT 50)
RETURNS TABLE (
  match_id         uuid,
  match_date       text,
  home_team        text,
  away_team        text,
  competition_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    m.id                              AS match_id,
    m.match_date::text                AS match_date,
    ht.name                           AS home_team,
    at2.name                          AS away_team,
    COALESCE(c.name, '')              AS competition_name
  FROM public.matches m
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  LEFT JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  LEFT JOIN public.competitions c         ON c.id  = cs.competition_id
  LEFT JOIN model_lab.match_story_drafts sd ON sd.match_id = m.id
  WHERE sd.id IS NULL
    AND m.status_short IN ('FT', 'AET', 'PEN')
  ORDER BY m.match_date DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_matches_without_stories(integer) TO authenticated;

-- ─── 6. ml_admin_generate_match_story ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_generate_match_story(
  p_match_id     uuid,
  p_generated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_home_team   text;
  v_away_team   text;
  v_competition text;
  v_match_date  date;
BEGIN
  SELECT
    ht.name,
    at2.name,
    COALESCE(c.name, 'Unknown'),
    m.match_date
  INTO v_home_team, v_away_team, v_competition, v_match_date
  FROM public.matches m
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  LEFT JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  LEFT JOIN public.competitions c         ON c.id  = cs.competition_id
  WHERE m.id = p_match_id;

  IF v_home_team IS NULL THEN
    RAISE EXCEPTION 'Match not found: %', p_match_id;
  END IF;

  INSERT INTO model_lab.match_story_drafts (
    match_id,
    competition_name,
    match_date,
    home_team_name,
    away_team_name,
    status,
    generated_by,
    generated_at
  ) VALUES (
    p_match_id,
    v_competition,
    v_match_date,
    v_home_team,
    v_away_team,
    'draft_generated',
    p_generated_by,
    now()
  )
  ON CONFLICT (match_id) DO UPDATE
    SET status       = 'draft_generated',
        generated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_generate_match_story(uuid, uuid) TO authenticated;

-- ─── 7. ml_admin_get_publishing_queue ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_get_publishing_queue(
  p_limit       integer DEFAULT 200,
  p_filter      text    DEFAULT NULL,
  p_competition text    DEFAULT NULL,
  p_date_from   text    DEFAULT NULL,
  p_date_to     text    DEFAULT NULL
)
RETURNS TABLE (
  match_id              uuid,
  match_date            text,
  competition_name      text,
  home_team             text,
  away_team             text,
  home_score            integer,
  away_score            integer,
  has_prediction        boolean,
  prediction_state      text,
  prediction_confidence numeric,
  has_story             boolean,
  story_state           text,
  has_publication       boolean,
  publication_visible   boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT
    m.id                                  AS match_id,
    m.match_date::text                    AS match_date,
    COALESCE(c.name, '')                  AS competition_name,
    ht.name                               AS home_team,
    at2.name                              AS away_team,
    m.home_score_ft                       AS home_score,
    m.away_score_ft                       AS away_score,
    (pd.id IS NOT NULL)                   AS has_prediction,
    pd.status                             AS prediction_state,
    pd.confidence_score                   AS prediction_confidence,
    (sd.id IS NOT NULL)                   AS has_story,
    sd.status                             AS story_state,
    false                                 AS has_publication,
    false                                 AS publication_visible
  FROM public.matches m
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  LEFT JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  LEFT JOIN public.competitions c         ON c.id  = cs.competition_id
  LEFT JOIN model_lab.prematch_prediction_drafts pd ON pd.match_id = m.id
  LEFT JOIN model_lab.match_story_drafts         sd ON sd.match_id = m.id
  WHERE (p_date_from   IS NULL OR m.match_date >= p_date_from::date)
    AND (p_date_to     IS NULL OR m.match_date <= p_date_to::date)
    AND (p_competition IS NULL OR c.name = p_competition)
    AND (
      p_filter IS NULL
      OR (p_filter = 'needs_prediction' AND pd.id IS NULL)
      OR (p_filter = 'needs_story'      AND sd.id IS NULL)
      OR (p_filter = 'needs_review'     AND (pd.status = 'pending_review' OR sd.status = 'pending_review'))
      OR (p_filter = 'published'        AND (pd.status = 'published'      OR sd.status = 'published'))
    )
  ORDER BY m.match_date DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_get_publishing_queue(integer, text, text, text, text) TO authenticated;

-- ─── 8. ml_admin_generate_prematch_prediction ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.ml_admin_generate_prematch_prediction(
  p_match_id        uuid,
  p_elo_version     text DEFAULT 'elo_v2_ha0_k20_global',
  p_feature_version text DEFAULT 'features_v2_domestic_2026_05'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_fm              record;
  v_cal             record;
  v_home_team       text;
  v_away_team       text;
  v_match_date      date;
  v_p_home          numeric;
  v_p_draw          numeric;
  v_p_away          numeric;
  v_raw_home        numeric;
  v_raw_away        numeric;
  v_elo_diff        numeric;
  v_base_draw       numeric;
  v_draw_correction numeric;
  v_total           numeric;
  v_confidence      numeric;
  v_warnings        text[];
  v_form_home       text;
  v_form_away       text;
BEGIN
  SELECT * INTO v_fm
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
    AND elo_version = p_elo_version
  ORDER BY populated_at DESC
  LIMIT 1;

  IF v_fm IS NULL THEN
    RAISE EXCEPTION 'No feature matrix row for match % with elo_version %', p_match_id, p_elo_version;
  END IF;

  SELECT ht.name, at2.name, m.match_date
  INTO v_home_team, v_away_team, v_match_date
  FROM public.matches m
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  WHERE m.id = p_match_id;

  SELECT * INTO v_cal
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_fm.competition_name
  ORDER BY updated_at DESC
  LIMIT 1;

  v_elo_diff        := COALESCE(v_fm.pre_match_elo_home, 1500) - COALESCE(v_fm.pre_match_elo_away, 1500);
  v_raw_home        := 1.0 / (1.0 + power(10.0, -v_elo_diff / 400.0));
  v_raw_away        := 1.0 - v_raw_home;
  v_draw_correction := COALESCE(v_cal.current_home_correction, 0);

  v_base_draw := 0.26 * (1.0 - ABS(v_elo_diff) / 800.0);
  v_base_draw := GREATEST(0.10, LEAST(0.40, v_base_draw));

  v_p_home := GREATEST(0.05, v_raw_home * (1.0 - v_base_draw) + v_draw_correction * 0.5);
  v_p_away := GREATEST(0.05, v_raw_away * (1.0 - v_base_draw) - v_draw_correction * 0.5);
  v_p_draw := GREATEST(0.05, 1.0 - v_p_home - v_p_away);

  v_total  := v_p_home + v_p_draw + v_p_away;
  v_p_home := v_p_home / v_total;
  v_p_draw := v_p_draw / v_total;
  v_p_away := v_p_away / v_total;

  v_confidence := CASE v_fm.feature_quality_tier
    WHEN 'elo_form_stats' THEN 0.82
    WHEN 'elo_form'       THEN 0.68
    ELSE 0.52
  END;

  v_form_home := CASE
    WHEN COALESCE(v_fm.recent_form_points_home_l5, 0) >= 10 THEN 'excellent'
    WHEN COALESCE(v_fm.recent_form_points_home_l5, 0) >= 7  THEN 'good'
    WHEN COALESCE(v_fm.recent_form_points_home_l5, 0) >= 4  THEN 'average'
    ELSE 'poor'
  END;
  v_form_away := CASE
    WHEN COALESCE(v_fm.recent_form_points_away_l5, 0) >= 10 THEN 'excellent'
    WHEN COALESCE(v_fm.recent_form_points_away_l5, 0) >= 7  THEN 'good'
    WHEN COALESCE(v_fm.recent_form_points_away_l5, 0) >= 4  THEN 'average'
    ELSE 'poor'
  END;

  v_warnings := ARRAY[]::text[];
  IF v_fm.feature_quality_tier = 'elo_only' THEN
    v_warnings := array_append(v_warnings, 'No recent form data — ELO-only prediction');
  END IF;
  IF v_cal IS NULL THEN
    v_warnings := array_append(v_warnings, 'No calibration data for this competition');
  END IF;
  IF COALESCE(v_fm.home_l5_matches_available, 0) < 3 THEN
    v_warnings := array_append(v_warnings, 'Home team has fewer than 3 recent matches');
  END IF;
  IF COALESCE(v_fm.away_l5_matches_available, 0) < 3 THEN
    v_warnings := array_append(v_warnings, 'Away team has fewer than 3 recent matches');
  END IF;

  RETURN jsonb_build_object(
    'match_id',          p_match_id,
    'home_team',         v_home_team,
    'away_team',         v_away_team,
    'match_date',        v_match_date,
    'p_home',            round(v_p_home, 4),
    'p_draw',            round(v_p_draw, 4),
    'p_away',            round(v_p_away, 4),
    'confidence',        v_confidence,
    'feature_tier',      CASE v_fm.feature_quality_tier
                           WHEN 'elo_form_stats' THEN 1
                           WHEN 'elo_form'       THEN 2
                           ELSE 3
                         END,
    'elo_home',          v_fm.pre_match_elo_home,
    'elo_away',          v_fm.pre_match_elo_away,
    'elo_diff',          round(v_elo_diff, 1),
    'home_l5_pts',       v_fm.recent_form_points_home_l5,
    'away_l5_pts',       v_fm.recent_form_points_away_l5,
    'home_form_quality', v_form_home,
    'away_form_quality', v_form_away,
    'warnings',          to_jsonb(v_warnings),
    'elo_version',       p_elo_version,
    'feature_version',   p_feature_version
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_generate_prematch_prediction(uuid, text, text) TO authenticated;

-- ─── 9. admin_match_readiness ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_match_readiness(
  p_from text DEFAULT NULL,
  p_to   text DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  match_date     text,
  match_time     text,
  home_team      text,
  away_team      text,
  competition    text,
  status_short   text,
  has_prediction boolean,
  has_narrative  boolean,
  has_events     boolean,
  has_lineup     boolean,
  has_stats      boolean,
  has_elo        boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH match_base AS (
    SELECT
      m.id,
      m.match_date,
      m.match_time,
      ht.name                  AS home_team,
      at2.name                 AS away_team,
      COALESCE(c.name, '')     AS competition,
      m.status_short
    FROM public.matches m
    JOIN public.teams ht  ON ht.id  = m.home_team_id
    JOIN public.teams at2 ON at2.id = m.away_team_id
    LEFT JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    LEFT JOIN public.competitions c         ON c.id  = cs.competition_id
    WHERE (p_from IS NULL OR m.match_date >= p_from::date)
      AND (p_to   IS NULL OR m.match_date <= p_to::date)
    ORDER BY m.match_date, m.match_time
    LIMIT 500
  ),
  pred_set AS (
    SELECT DISTINCT match_id FROM public.predictions
    WHERE match_id IN (SELECT id FROM match_base)
      AND superseded_by IS NULL
  ),
  evt_set AS (
    SELECT DISTINCT match_id FROM public.match_events
    WHERE match_id IN (SELECT id FROM match_base)
  ),
  lineup_set AS (
    SELECT DISTINCT match_id FROM public.lineups
    WHERE match_id IN (SELECT id FROM match_base)
  ),
  stats_set AS (
    SELECT DISTINCT match_id FROM public.match_stats
    WHERE match_id IN (SELECT id FROM match_base)
  )
  SELECT
    mb.id,
    mb.match_date::text,
    mb.match_time::text,
    mb.home_team,
    mb.away_team,
    mb.competition,
    mb.status_short,
    (ps.match_id IS NOT NULL)  AS has_prediction,
    false                       AS has_narrative,
    (es.match_id IS NOT NULL)  AS has_events,
    (ls.match_id IS NOT NULL)  AS has_lineup,
    (ss.match_id IS NOT NULL)  AS has_stats,
    false                       AS has_elo
  FROM match_base mb
  LEFT JOIN pred_set   ps ON ps.match_id = mb.id
  LEFT JOIN evt_set    es ON es.match_id = mb.id
  LEFT JOIN lineup_set ls ON ls.match_id = mb.id
  LEFT JOIN stats_set  ss ON ss.match_id = mb.id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_match_readiness(text, text) TO authenticated;
