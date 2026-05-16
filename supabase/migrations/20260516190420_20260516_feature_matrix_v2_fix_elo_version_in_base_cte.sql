
/*
  # Feature Matrix V2 — Fix: add elo_version to base CTE

  The previous function omitted elo_version from the base CTE SELECT,
  causing a column-not-found error in the assembled CTE.
  This replaces the function with the corrected version.
*/

DROP FUNCTION IF EXISTS model_lab.ml_populate_feature_matrix_v2_competition(text, text, text);

CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_matrix_v2_competition(
  p_competition_name  text    DEFAULT 'Premier League',
  p_feature_version   text    DEFAULT 'features_v2_domestic_2026_05',
  p_elo_version       text    DEFAULT 'elo_v2_ha0_k20_global'
)
RETURNS TABLE (
  out_competition    text,
  out_inserted       integer,
  out_skipped        integer,
  out_elo_only       integer,
  out_elo_form       integer,
  out_elo_form_stats integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_inserted        integer := 0;
  v_skipped         integer := 0;
  v_elo_only        integer := 0;
  v_elo_form        integer := 0;
  v_elo_form_stats  integer := 0;
BEGIN

  WITH
  base AS (
    SELECT
      tes.match_id,
      tes.elo_version,                          -- explicitly included
      tes.competition_id,
      tes.competition_name,
      tes.season_label,
      tes.match_date,
      tes.home_team_id,
      tes.away_team_id,
      tes.home_score_ft,
      tes.away_score_ft,
      tes.result_1x2,
      tes.pre_match_elo_home,
      tes.pre_match_elo_away,
      tes.expected_home  AS expected_home_elo,
      tes.expected_away  AS expected_away_elo,
      csm.data_quality_tier
    FROM model_lab.team_elo_snapshots tes
    JOIN model_lab.v_calibration_safe_matches csm ON csm.match_id = tes.match_id
    WHERE tes.elo_version      = p_elo_version
      AND tes.competition_name = p_competition_name
  ),

  home_form AS (
    SELECT b.match_id, lf.*
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer AS hf_cnt,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN CASE s.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE s.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric)                                          AS hf_pts,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN s.home_score_ft ELSE s.away_score_ft END::numeric) AS hf_gf,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN s.away_score_ft ELSE s.home_score_ft END::numeric) AS hf_ga,
        AVG(CASE WHEN s.home_team_id = b.home_team_id AND s.away_score_ft = 0 THEN 1.0
                 WHEN s.away_team_id = b.home_team_id AND s.home_score_ft = 0 THEN 1.0
                 ELSE 0.0 END)                                     AS hf_cs,
        AVG(CASE WHEN s.home_team_id = b.home_team_id AND s.home_score_ft > 0 THEN 1.0
                 WHEN s.away_team_id = b.home_team_id AND s.away_score_ft > 0 THEN 1.0
                 ELSE 0.0 END)                                     AS hf_sc,
        AVG(CASE WHEN s.home_team_id = b.home_team_id AND s.away_score_ft > 0 THEN 1.0
                 WHEN s.away_team_id = b.home_team_id AND s.home_score_ft > 0 THEN 1.0
                 ELSE 0.0 END)                                     AS hf_con
      FROM (
        SELECT * FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version    = p_elo_version
          AND src.competition_id = b.competition_id
          AND (src.home_team_id  = b.home_team_id OR src.away_team_id = b.home_team_id)
          AND src.match_date     < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) s
    ) lf
  ),

  away_form AS (
    SELECT b.match_id, lf.*
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer AS af_cnt,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN CASE s.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE s.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric)                                          AS af_pts,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN s.home_score_ft ELSE s.away_score_ft END::numeric) AS af_gf,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN s.away_score_ft ELSE s.home_score_ft END::numeric) AS af_ga,
        AVG(CASE WHEN s.home_team_id = b.away_team_id AND s.away_score_ft = 0 THEN 1.0
                 WHEN s.away_team_id = b.away_team_id AND s.home_score_ft = 0 THEN 1.0
                 ELSE 0.0 END)                                     AS af_cs,
        AVG(CASE WHEN s.home_team_id = b.away_team_id AND s.home_score_ft > 0 THEN 1.0
                 WHEN s.away_team_id = b.away_team_id AND s.away_score_ft > 0 THEN 1.0
                 ELSE 0.0 END)                                     AS af_sc,
        AVG(CASE WHEN s.home_team_id = b.away_team_id AND s.away_score_ft > 0 THEN 1.0
                 WHEN s.away_team_id = b.away_team_id AND s.home_score_ft > 0 THEN 1.0
                 ELSE 0.0 END)                                     AS af_con
      FROM (
        SELECT * FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version    = p_elo_version
          AND src.competition_id = b.competition_id
          AND (src.home_team_id  = b.away_team_id OR src.away_team_id = b.away_team_id)
          AND src.match_date     < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) s
    ) lf
  ),

  home_stats AS (
    SELECT b.match_id, ls.*
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                           AS hs_cnt,
        AVG(ms.total_shots::numeric)                               AS hs_shots,
        AVG(ms.shots_on_goal::numeric)                             AS hs_sot,
        AVG(ms.corner_kicks::numeric)                              AS hs_corn,
        AVG((COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0)*3)::numeric) AS hs_cards
      FROM (
        SELECT src.match_id AS mid
        FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version    = p_elo_version
          AND src.competition_id = b.competition_id
          AND (src.home_team_id  = b.home_team_id OR src.away_team_id = b.home_team_id)
          AND src.match_date     < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) ranked
      JOIN public.match_stats ms
        ON ms.match_id = ranked.mid
       AND ms.team_id  = b.home_team_id
       AND ms.half     = 'FT'
       AND ms.total_shots IS NOT NULL
    ) ls
  ),

  away_stats AS (
    SELECT b.match_id, ls.*
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                           AS as_cnt,
        AVG(ms.total_shots::numeric)                               AS as_shots,
        AVG(ms.shots_on_goal::numeric)                             AS as_sot,
        AVG(ms.corner_kicks::numeric)                              AS as_corn,
        AVG((COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0)*3)::numeric) AS as_cards
      FROM (
        SELECT src.match_id AS mid
        FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version    = p_elo_version
          AND src.competition_id = b.competition_id
          AND (src.home_team_id  = b.away_team_id OR src.away_team_id = b.away_team_id)
          AND src.match_date     < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) ranked
      JOIN public.match_stats ms
        ON ms.match_id = ranked.mid
       AND ms.team_id  = b.away_team_id
       AND ms.half     = 'FT'
       AND ms.total_shots IS NOT NULL
    ) ls
  )

  INSERT INTO model_lab.match_feature_matrix_v2 (
    match_id, elo_version, feature_version,
    competition_id, competition_name, season_label, match_date,
    home_team_id, away_team_id,
    pre_match_elo_home, pre_match_elo_away, elo_gap_home,
    expected_home_elo, expected_away_elo,
    recent_form_points_home_l5, recent_form_points_away_l5,
    recent_goal_diff_home_l5,   recent_goal_diff_away_l5,
    rolling_goals_for_home_l5,  rolling_goals_for_away_l5,
    rolling_goals_against_home_l5, rolling_goals_against_away_l5,
    clean_sheet_rate_home_l5,   clean_sheet_rate_away_l5,
    scoring_rate_home_l5,       scoring_rate_away_l5,
    concede_rate_home_l5,       concede_rate_away_l5,
    rolling_shots_home_l5,      rolling_shots_away_l5,
    rolling_shots_on_target_home_l5, rolling_shots_on_target_away_l5,
    rolling_corners_home_l5,    rolling_corners_away_l5,
    rolling_cards_home_l5,      rolling_cards_away_l5,
    attack_index_home_l5,       attack_index_away_l5,
    defense_index_home_l5,      defense_index_away_l5,
    form_gap_home, attack_gap_home, defense_gap_home,
    home_advantage_flag, data_quality_tier,
    has_elo_features, has_form_features, has_stats_features,
    feature_quality_tier,
    home_l5_matches_available, away_l5_matches_available,
    result_1x2, home_score_ft, away_score_ft
  )
  SELECT
    b.match_id,
    b.elo_version,
    p_feature_version,
    b.competition_id, b.competition_name, b.season_label, b.match_date,
    b.home_team_id, b.away_team_id,
    b.pre_match_elo_home, b.pre_match_elo_away,
    ROUND((b.pre_match_elo_home - b.pre_match_elo_away)::numeric, 4),
    b.expected_home_elo, b.expected_away_elo,
    ROUND(hf.hf_pts,4), ROUND(af.af_pts,4),
    ROUND((COALESCE(hf.hf_gf,0) - COALESCE(hf.hf_ga,0))::numeric, 4),
    ROUND((COALESCE(af.af_gf,0) - COALESCE(af.af_ga,0))::numeric, 4),
    ROUND(hf.hf_gf,4), ROUND(af.af_gf,4),
    ROUND(hf.hf_ga,4), ROUND(af.af_ga,4),
    ROUND(hf.hf_cs,4), ROUND(af.af_cs,4),
    ROUND(hf.hf_sc,4), ROUND(af.af_sc,4),
    ROUND(hf.hf_con,4), ROUND(af.af_con,4),
    ROUND(hs.hs_shots,4), ROUND(as2.as_shots,4),
    ROUND(hs.hs_sot,4),   ROUND(as2.as_sot,4),
    ROUND(hs.hs_corn,4),  ROUND(as2.as_corn,4),
    ROUND(hs.hs_cards,4), ROUND(as2.as_cards,4),
    -- attack index
    ROUND(CASE WHEN hs.hs_cnt > 0
      THEN (COALESCE(hs.hs_sot,0)*2 + COALESCE(hs.hs_shots,0)) / 10.0
      ELSE NULL END::numeric, 4),
    ROUND(CASE WHEN as2.as_cnt > 0
      THEN (COALESCE(as2.as_sot,0)*2 + COALESCE(as2.as_shots,0)) / 10.0
      ELSE NULL END::numeric, 4),
    -- defense index
    ROUND(CASE WHEN hf.hf_cnt > 0
      THEN 1.0 / (1.0 + COALESCE(hf.hf_ga, 2.0))
      ELSE NULL END::numeric, 6),
    ROUND(CASE WHEN af.af_cnt > 0
      THEN 1.0 / (1.0 + COALESCE(af.af_ga, 2.0))
      ELSE NULL END::numeric, 6),
    -- differentials
    ROUND((COALESCE(hf.hf_pts,0) - COALESCE(af.af_pts,0))::numeric, 4),
    ROUND((CASE WHEN hs.hs_cnt > 0 THEN (COALESCE(hs.hs_sot,0)*2+COALESCE(hs.hs_shots,0))/10.0 ELSE 0 END
         - CASE WHEN as2.as_cnt > 0 THEN (COALESCE(as2.as_sot,0)*2+COALESCE(as2.as_shots,0))/10.0 ELSE 0 END)::numeric, 4),
    ROUND((CASE WHEN hf.hf_cnt > 0 THEN 1.0/(1.0+COALESCE(hf.hf_ga,2.0)) ELSE 0 END
         - CASE WHEN af.af_cnt > 0 THEN 1.0/(1.0+COALESCE(af.af_ga,2.0)) ELSE 0 END)::numeric, 6),
    1,
    b.data_quality_tier,
    -- coverage
    (b.pre_match_elo_home IS NOT NULL AND b.pre_match_elo_away IS NOT NULL),
    (COALESCE(hf.hf_cnt,0) >= 1 AND COALESCE(af.af_cnt,0) >= 1),
    (COALESCE(hs.hs_cnt,0) >= 1 AND COALESCE(as2.as_cnt,0) >= 1),
    CASE
      WHEN (b.pre_match_elo_home IS NOT NULL)
        AND (COALESCE(hf.hf_cnt,0)>=1 AND COALESCE(af.af_cnt,0)>=1)
        AND (COALESCE(hs.hs_cnt,0)>=1 AND COALESCE(as2.as_cnt,0)>=1) THEN 'elo_form_stats'
      WHEN (b.pre_match_elo_home IS NOT NULL)
        AND (COALESCE(hf.hf_cnt,0)>=1 AND COALESCE(af.af_cnt,0)>=1) THEN 'elo_form'
      WHEN (b.pre_match_elo_home IS NOT NULL) THEN 'elo_only'
      ELSE 'none'
    END,
    COALESCE(hf.hf_cnt,0)::smallint,
    COALESCE(af.af_cnt,0)::smallint,
    b.result_1x2, b.home_score_ft, b.away_score_ft
  FROM base b
  LEFT JOIN home_form  hf  ON hf.match_id  = b.match_id
  LEFT JOIN away_form  af  ON af.match_id  = b.match_id
  LEFT JOIN home_stats hs  ON hs.match_id  = b.match_id
  LEFT JOIN away_stats as2 ON as2.match_id = b.match_id
  ON CONFLICT (match_id, elo_version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT
    SUM(CASE WHEN feature_quality_tier = 'elo_only'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier = 'elo_form'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier = 'elo_form_stats' THEN 1 ELSE 0 END)
  INTO v_elo_only, v_elo_form, v_elo_form_stats
  FROM model_lab.match_feature_matrix_v2
  WHERE elo_version      = p_elo_version
    AND feature_version  = p_feature_version
    AND competition_name = p_competition_name;

  RETURN QUERY SELECT
    p_competition_name::text,
    v_inserted, v_skipped,
    v_elo_only, v_elo_form, v_elo_form_stats;

END;
$$;
