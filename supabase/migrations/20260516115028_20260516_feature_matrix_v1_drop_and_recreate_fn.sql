/*
  # Feature Matrix V1 — Drop old populate function, recreate bulk set-based version
*/

DROP FUNCTION IF EXISTS model_lab.ml_populate_feature_matrix_v1(text, text);

CREATE FUNCTION model_lab.ml_populate_feature_matrix_v1(
  p_feature_version text DEFAULT 'features_v1_domestic_2026_05',
  p_elo_version      text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_competition   text,
  out_rows_inserted bigint,
  out_rows_skipped  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp    record;
  v_ins     bigint;
BEGIN
  FOR v_comp IN
    SELECT DISTINCT
      tes.competition_id  AS cid,
      tes.competition_name AS cname
    FROM model_lab.team_elo_snapshots tes
    WHERE tes.elo_version = p_elo_version
    ORDER BY tes.competition_name
  LOOP

    WITH
    base AS (
      SELECT
        tes.match_id, tes.competition_id, tes.competition_name,
        tes.season_label, tes.match_date,
        tes.home_team_id, tes.away_team_id,
        tes.home_score_ft, tes.away_score_ft, tes.result_1x2,
        tes.pre_match_elo_home, tes.pre_match_elo_away,
        tes.expected_home, tes.expected_away,
        csm.data_quality_tier
      FROM model_lab.team_elo_snapshots tes
      JOIN model_lab.v_calibration_safe_matches csm ON csm.match_id = tes.match_id
      WHERE tes.elo_version = p_elo_version
        AND tes.competition_id = v_comp.cid
    ),
    team_match_log AS (
      SELECT b.match_id, b.competition_id, b.match_date,
             b.home_team_id AS team_id,
             b.home_score_ft AS gf, b.away_score_ft AS ga,
             CASE b.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END AS pts
      FROM base b
      UNION ALL
      SELECT b.match_id, b.competition_id, b.match_date,
             b.away_team_id,
             b.away_score_ft, b.home_score_ft,
             CASE b.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
      FROM base b
    ),
    home_prior_ranked AS (
      SELECT b.match_id AS target_match_id, tml.match_id AS src_match_id,
             tml.gf, tml.ga, tml.pts,
             ROW_NUMBER() OVER (
               PARTITION BY b.match_id
               ORDER BY tml.match_date DESC, tml.match_id DESC
             ) AS rn
      FROM base b
      JOIN team_match_log tml
        ON tml.team_id = b.home_team_id
        AND tml.competition_id = b.competition_id
        AND tml.match_date < b.match_date
        AND tml.match_id <> b.match_id
    ),
    away_prior_ranked AS (
      SELECT b.match_id AS target_match_id, tml.match_id AS src_match_id,
             tml.gf, tml.ga, tml.pts,
             ROW_NUMBER() OVER (
               PARTITION BY b.match_id
               ORDER BY tml.match_date DESC, tml.match_id DESC
             ) AS rn
      FROM base b
      JOIN team_match_log tml
        ON tml.team_id = b.away_team_id
        AND tml.competition_id = b.competition_id
        AND tml.match_date < b.match_date
        AND tml.match_id <> b.match_id
    ),
    home_form AS (
      SELECT target_match_id,
             COUNT(*)::integer                              AS cnt,
             AVG(pts::numeric)                             AS form_pts,
             AVG(gf::numeric)                              AS goals_for,
             AVG(ga::numeric)                              AS goals_against,
             AVG(CASE WHEN ga = 0 THEN 1.0 ELSE 0.0 END)  AS cs_rate,
             AVG(CASE WHEN gf > 0 THEN 1.0 ELSE 0.0 END)  AS sc_rate,
             AVG(CASE WHEN ga > 0 THEN 1.0 ELSE 0.0 END)  AS con_rate
      FROM home_prior_ranked WHERE rn <= 5
      GROUP BY target_match_id
    ),
    away_form AS (
      SELECT target_match_id,
             COUNT(*)::integer                              AS cnt,
             AVG(pts::numeric)                             AS form_pts,
             AVG(gf::numeric)                              AS goals_for,
             AVG(ga::numeric)                              AS goals_against,
             AVG(CASE WHEN ga = 0 THEN 1.0 ELSE 0.0 END)  AS cs_rate,
             AVG(CASE WHEN gf > 0 THEN 1.0 ELSE 0.0 END)  AS sc_rate,
             AVG(CASE WHEN ga > 0 THEN 1.0 ELSE 0.0 END)  AS con_rate
      FROM away_prior_ranked WHERE rn <= 5
      GROUP BY target_match_id
    ),
    home_stats AS (
      SELECT hpr.target_match_id,
             COUNT(ms.match_id)::integer                           AS scnt,
             AVG(ms.total_shots::numeric)                          AS shots,
             AVG(ms.shots_on_goal::numeric)                        AS sot,
             AVG(ms.corner_kicks::numeric)                         AS corners,
             AVG((COALESCE(ms.yellow_cards,0)
                  + COALESCE(ms.red_cards,0)*3)::numeric)          AS cards
      FROM home_prior_ranked hpr
      JOIN base b ON b.match_id = hpr.target_match_id
      JOIN public.match_stats ms
        ON ms.match_id = hpr.src_match_id
        AND ms.team_id = b.home_team_id
        AND ms.half    = 'FT'
        AND ms.total_shots IS NOT NULL
      WHERE hpr.rn <= 5
      GROUP BY hpr.target_match_id
    ),
    away_stats AS (
      SELECT apr.target_match_id,
             COUNT(ms.match_id)::integer                           AS scnt,
             AVG(ms.total_shots::numeric)                          AS shots,
             AVG(ms.shots_on_goal::numeric)                        AS sot,
             AVG(ms.corner_kicks::numeric)                         AS corners,
             AVG((COALESCE(ms.yellow_cards,0)
                  + COALESCE(ms.red_cards,0)*3)::numeric)          AS cards
      FROM away_prior_ranked apr
      JOIN base b ON b.match_id = apr.target_match_id
      JOIN public.match_stats ms
        ON ms.match_id = apr.src_match_id
        AND ms.team_id = b.away_team_id
        AND ms.half    = 'FT'
        AND ms.total_shots IS NOT NULL
      WHERE apr.rn <= 5
      GROUP BY apr.target_match_id
    )
    INSERT INTO model_lab.match_feature_matrix_v1 (
      match_id, competition_id, competition_name, season_label, match_date,
      home_team_id, away_team_id, feature_version, elo_version,
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
      b.match_id, b.competition_id, b.competition_name, b.season_label, b.match_date,
      b.home_team_id, b.away_team_id,
      p_feature_version, p_elo_version,
      b.pre_match_elo_home, b.pre_match_elo_away,
      b.pre_match_elo_home - b.pre_match_elo_away,
      b.expected_home, b.expected_away,
      ROUND(hf.form_pts,   4),        ROUND(af.form_pts,   4),
      ROUND(hf.goals_for - COALESCE(hf.goals_against,0), 4),
      ROUND(af.goals_for - COALESCE(af.goals_against,0), 4),
      ROUND(hf.goals_for,  4),        ROUND(af.goals_for,  4),
      ROUND(hf.goals_against, 4),     ROUND(af.goals_against, 4),
      ROUND(hf.cs_rate,    4),        ROUND(af.cs_rate,    4),
      ROUND(hf.sc_rate,    4),        ROUND(af.sc_rate,    4),
      ROUND(hf.con_rate,   4),        ROUND(af.con_rate,   4),
      ROUND(hs.shots,   4),           ROUND(ast.shots,  4),
      ROUND(hs.sot,     4),           ROUND(ast.sot,    4),
      ROUND(hs.corners, 4),           ROUND(ast.corners,4),
      ROUND(hs.cards,   4),           ROUND(ast.cards,  4),
      ROUND(CASE WHEN COALESCE(hs.scnt,0) > 0
              THEN (COALESCE(hs.sot,0)*2 + COALESCE(hs.shots,0)) / 10.0
              ELSE NULL END, 4),
      ROUND(CASE WHEN COALESCE(ast.scnt,0) > 0
              THEN (COALESCE(ast.sot,0)*2 + COALESCE(ast.shots,0)) / 10.0
              ELSE NULL END, 4),
      ROUND(CASE WHEN COALESCE(hf.cnt,0) > 0
              THEN 1.0 / (1.0 + COALESCE(hf.goals_against,2.0))
              ELSE NULL END, 6),
      ROUND(CASE WHEN COALESCE(af.cnt,0) > 0
              THEN 1.0 / (1.0 + COALESCE(af.goals_against,2.0))
              ELSE NULL END, 6),
      -- Gaps
      ROUND(COALESCE(hf.form_pts,0) - COALESCE(af.form_pts,0), 4),
      ROUND(
        COALESCE(CASE WHEN COALESCE(hs.scnt,0)>0 THEN (COALESCE(hs.sot,0)*2+COALESCE(hs.shots,0))/10.0 ELSE 0 END,0)
        - COALESCE(CASE WHEN COALESCE(ast.scnt,0)>0 THEN (COALESCE(ast.sot,0)*2+COALESCE(ast.shots,0))/10.0 ELSE 0 END,0),
        4),
      ROUND(
        COALESCE(CASE WHEN COALESCE(hf.cnt,0)>0 THEN 1.0/(1.0+COALESCE(hf.goals_against,2.0)) ELSE 0 END,0)
        - COALESCE(CASE WHEN COALESCE(af.cnt,0)>0 THEN 1.0/(1.0+COALESCE(af.goals_against,2.0)) ELSE 0 END,0),
        6),
      1::smallint,
      b.data_quality_tier,
      -- Coverage
      (b.pre_match_elo_home IS NOT NULL AND b.pre_match_elo_away IS NOT NULL),
      (COALESCE(hf.cnt,0) >= 1 AND COALESCE(af.cnt,0) >= 1),
      (COALESCE(hs.scnt,0) >= 1 AND COALESCE(ast.scnt,0) >= 1),
      CASE
        WHEN (b.pre_match_elo_home IS NOT NULL)
             AND (COALESCE(hf.cnt,0) >= 1 AND COALESCE(af.cnt,0) >= 1)
             AND (COALESCE(hs.scnt,0) >= 1 AND COALESCE(ast.scnt,0) >= 1)
          THEN 'elo_form_stats'
        WHEN (b.pre_match_elo_home IS NOT NULL)
             AND (COALESCE(hf.cnt,0) >= 1 AND COALESCE(af.cnt,0) >= 1)
          THEN 'elo_form'
        WHEN (b.pre_match_elo_home IS NOT NULL)
          THEN 'elo_only'
        ELSE 'none'
      END,
      COALESCE(hf.cnt,0)::smallint,
      COALESCE(af.cnt,0)::smallint,
      b.result_1x2, b.home_score_ft, b.away_score_ft
    FROM base b
    LEFT JOIN home_form hf  ON hf.target_match_id = b.match_id
    LEFT JOIN away_form af  ON af.target_match_id = b.match_id
    LEFT JOIN home_stats hs ON hs.target_match_id = b.match_id
    LEFT JOIN away_stats ast ON ast.target_match_id = b.match_id
    ON CONFLICT (match_id) DO NOTHING;

    GET DIAGNOSTICS v_ins = ROW_COUNT;
    RETURN QUERY SELECT v_comp.cname, v_ins, 0::bigint;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_populate_feature_matrix_v1(text, text) TO authenticated;
