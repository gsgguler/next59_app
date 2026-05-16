
/*
  # Feature Matrix V2 — Two-Pass Materialisation Function

  ## Summary
  Splits population into two SQL statements to reduce per-statement cost:
  1. INSERT into temp table: compute all rolling L5 form + stats using
     window functions, one row per (match_id, team_id)
  2. INSERT into match_feature_matrix_v2: join temp table to ELO snapshots,
     pivot home/away, insert final feature rows

  This avoids single-statement timeout by distributing work across two
  set-based operations, each manageable within the 60-second window.
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
  out_elo_only       integer,
  out_elo_form       integer,
  out_elo_form_stats integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_inserted       integer := 0;
  v_elo_only       integer := 0;
  v_elo_form       integer := 0;
  v_elo_form_stats integer := 0;
BEGIN

  -- PASS 1: materialise rolling L5 form into temp table
  DROP TABLE IF EXISTS _fm_l5_form;
  CREATE TEMP TABLE _fm_l5_form AS
  WITH team_matches AS (
    SELECT
      match_id, competition_id, match_date,
      home_team_id AS team_id,
      CASE result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END::numeric AS pts,
      home_score_ft::numeric AS gf, away_score_ft::numeric AS ga,
      CASE WHEN away_score_ft=0 THEN 1.0 ELSE 0.0 END AS cs,
      CASE WHEN home_score_ft>0 THEN 1.0 ELSE 0.0 END AS sc,
      CASE WHEN away_score_ft>0 THEN 1.0 ELSE 0.0 END AS con
    FROM model_lab.team_elo_snapshots
    WHERE elo_version=p_elo_version AND competition_name=p_competition_name
    UNION ALL
    SELECT
      match_id, competition_id, match_date,
      away_team_id,
      CASE result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END::numeric,
      away_score_ft::numeric, home_score_ft::numeric,
      CASE WHEN home_score_ft=0 THEN 1.0 ELSE 0.0 END,
      CASE WHEN away_score_ft>0 THEN 1.0 ELSE 0.0 END,
      CASE WHEN home_score_ft>0 THEN 1.0 ELSE 0.0 END
    FROM model_lab.team_elo_snapshots
    WHERE elo_version=p_elo_version AND competition_name=p_competition_name
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY team_id,competition_id ORDER BY match_date,match_id) AS rn
    FROM team_matches
  ),
  lagged AS (
    SELECT match_id, team_id,
      LAG(pts,1) OVER w AS p1, LAG(pts,2) OVER w AS p2, LAG(pts,3) OVER w AS p3, LAG(pts,4) OVER w AS p4, LAG(pts,5) OVER w AS p5,
      LAG(gf,1)  OVER w AS g1, LAG(gf,2)  OVER w AS g2, LAG(gf,3)  OVER w AS g3, LAG(gf,4)  OVER w AS g4, LAG(gf,5)  OVER w AS g5,
      LAG(ga,1)  OVER w AS a1, LAG(ga,2)  OVER w AS a2, LAG(ga,3)  OVER w AS a3, LAG(ga,4)  OVER w AS a4, LAG(ga,5)  OVER w AS a5,
      LAG(cs,1)  OVER w AS c1, LAG(cs,2)  OVER w AS c2, LAG(cs,3)  OVER w AS c3, LAG(cs,4)  OVER w AS c4, LAG(cs,5)  OVER w AS c5,
      LAG(sc,1)  OVER w AS s1, LAG(sc,2)  OVER w AS s2, LAG(sc,3)  OVER w AS s3, LAG(sc,4)  OVER w AS s4, LAG(sc,5)  OVER w AS s5,
      LAG(con,1) OVER w AS n1, LAG(con,2) OVER w AS n2, LAG(con,3) OVER w AS n3, LAG(con,4) OVER w AS n4, LAG(con,5) OVER w AS n5
    FROM ranked
    WINDOW w AS (PARTITION BY team_id,competition_id ORDER BY rn)
  )
  SELECT
    match_id, team_id,
    (CASE WHEN p1 IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN p2 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN p3 IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN p4 IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN p5 IS NOT NULL THEN 1 ELSE 0 END) AS cnt,
    (COALESCE(p1,0)+COALESCE(p2,0)+COALESCE(p3,0)+COALESCE(p4,0)+COALESCE(p5,0))::numeric /
      NULLIF(CASE WHEN p1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN p2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN p3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN p4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN p5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_pts,
    (COALESCE(g1,0)+COALESCE(g2,0)+COALESCE(g3,0)+COALESCE(g4,0)+COALESCE(g5,0))::numeric /
      NULLIF(CASE WHEN g1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN g2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN g3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN g4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN g5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_gf,
    (COALESCE(a1,0)+COALESCE(a2,0)+COALESCE(a3,0)+COALESCE(a4,0)+COALESCE(a5,0))::numeric /
      NULLIF(CASE WHEN a1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN a2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN a3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN a4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN a5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_ga,
    (COALESCE(c1,0)+COALESCE(c2,0)+COALESCE(c3,0)+COALESCE(c4,0)+COALESCE(c5,0))::numeric /
      NULLIF(CASE WHEN c1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN c2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN c3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN c4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN c5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_cs,
    (COALESCE(s1,0)+COALESCE(s2,0)+COALESCE(s3,0)+COALESCE(s4,0)+COALESCE(s5,0))::numeric /
      NULLIF(CASE WHEN s1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN s2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN s3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN s4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN s5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_sc,
    (COALESCE(n1,0)+COALESCE(n2,0)+COALESCE(n3,0)+COALESCE(n4,0)+COALESCE(n5,0))::numeric /
      NULLIF(CASE WHEN n1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN n2 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN n3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN n4 IS NOT NULL THEN 1 ELSE 0 END+
             CASE WHEN n5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_con
  FROM lagged;

  -- PASS 2: materialise rolling L5 stats into temp table
  DROP TABLE IF EXISTS _fm_l5_stats;
  CREATE TEMP TABLE _fm_l5_stats AS
  WITH match_ids AS (
    SELECT match_id, home_team_id, away_team_id, match_date, competition_id,
           ROW_NUMBER() OVER (PARTITION BY home_team_id, competition_id ORDER BY match_date, match_id) AS rn_h,
           ROW_NUMBER() OVER (PARTITION BY away_team_id, competition_id ORDER BY match_date, match_id) AS rn_a
    FROM model_lab.team_elo_snapshots
    WHERE elo_version=p_elo_version AND competition_name=p_competition_name
  ),
  team_stats AS (
    SELECT ms.match_id, ms.team_id,
           ms.total_shots::numeric AS shots,
           ms.shots_on_goal::numeric AS sot,
           ms.corner_kicks::numeric AS corn,
           (COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0)*3)::numeric AS cards,
           fl.rn
    FROM _fm_l5_form fl
    JOIN public.match_stats ms ON ms.match_id=fl.match_id AND ms.team_id=fl.team_id AND ms.half='FT' AND ms.total_shots IS NOT NULL
  ),
  ranked_s AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY rn) AS srn
    FROM team_stats
  ),
  lagged_s AS (
    SELECT match_id, team_id,
      LAG(shots,1) OVER w AS sh1, LAG(shots,2) OVER w AS sh2, LAG(shots,3) OVER w AS sh3, LAG(shots,4) OVER w AS sh4, LAG(shots,5) OVER w AS sh5,
      LAG(sot,1)   OVER w AS st1, LAG(sot,2)   OVER w AS st2, LAG(sot,3)   OVER w AS st3, LAG(sot,4)   OVER w AS st4, LAG(sot,5)   OVER w AS st5,
      LAG(corn,1)  OVER w AS co1, LAG(corn,2)  OVER w AS co2, LAG(corn,3)  OVER w AS co3, LAG(corn,4)  OVER w AS co4, LAG(corn,5)  OVER w AS co5,
      LAG(cards,1) OVER w AS cd1, LAG(cards,2) OVER w AS cd2, LAG(cards,3) OVER w AS cd3, LAG(cards,4) OVER w AS cd4, LAG(cards,5) OVER w AS cd5
    FROM ranked_s
    WINDOW w AS (PARTITION BY team_id ORDER BY srn)
  )
  SELECT match_id, team_id,
    (CASE WHEN sh1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh2 IS NOT NULL THEN 1 ELSE 0 END+
     CASE WHEN sh3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh4 IS NOT NULL THEN 1 ELSE 0 END+
     CASE WHEN sh5 IS NOT NULL THEN 1 ELSE 0 END) AS s_cnt,
    (COALESCE(sh1,0)+COALESCE(sh2,0)+COALESCE(sh3,0)+COALESCE(sh4,0)+COALESCE(sh5,0))::numeric /
      NULLIF(CASE WHEN sh1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh2 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh4 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_shots,
    (COALESCE(st1,0)+COALESCE(st2,0)+COALESCE(st3,0)+COALESCE(st4,0)+COALESCE(st5,0))::numeric /
      NULLIF(CASE WHEN st1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st2 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st4 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_sot,
    (COALESCE(co1,0)+COALESCE(co2,0)+COALESCE(co3,0)+COALESCE(co4,0)+COALESCE(co5,0))::numeric /
      NULLIF(CASE WHEN co1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co2 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co4 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_corn,
    (COALESCE(cd1,0)+COALESCE(cd2,0)+COALESCE(cd3,0)+COALESCE(cd4,0)+COALESCE(cd5,0))::numeric /
      NULLIF(CASE WHEN cd1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd2 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd4 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd5 IS NOT NULL THEN 1 ELSE 0 END,0) AS l5_cards
  FROM lagged_s;

  -- PASS 3: final INSERT joining everything
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
    t.match_id, t.elo_version, p_feature_version,
    t.competition_id, t.competition_name, t.season_label, t.match_date,
    t.home_team_id, t.away_team_id,
    t.pre_match_elo_home, t.pre_match_elo_away,
    ROUND((t.pre_match_elo_home-t.pre_match_elo_away)::numeric,4),
    t.expected_home, t.expected_away,
    ROUND(hf.l5_pts::numeric,4),  ROUND(af.l5_pts::numeric,4),
    ROUND((COALESCE(hf.l5_gf,0)-COALESCE(hf.l5_ga,0))::numeric,4),
    ROUND((COALESCE(af.l5_gf,0)-COALESCE(af.l5_ga,0))::numeric,4),
    ROUND(hf.l5_gf::numeric,4), ROUND(af.l5_gf::numeric,4),
    ROUND(hf.l5_ga::numeric,4), ROUND(af.l5_ga::numeric,4),
    ROUND(hf.l5_cs::numeric,4), ROUND(af.l5_cs::numeric,4),
    ROUND(hf.l5_sc::numeric,4), ROUND(af.l5_sc::numeric,4),
    ROUND(hf.l5_con::numeric,4),ROUND(af.l5_con::numeric,4),
    ROUND(hs.l5_shots::numeric,4), ROUND(as2.l5_shots::numeric,4),
    ROUND(hs.l5_sot::numeric,4),   ROUND(as2.l5_sot::numeric,4),
    ROUND(hs.l5_corn::numeric,4),  ROUND(as2.l5_corn::numeric,4),
    ROUND(hs.l5_cards::numeric,4), ROUND(as2.l5_cards::numeric,4),
    ROUND(CASE WHEN hs.s_cnt>0 THEN (COALESCE(hs.l5_sot,0)*2+COALESCE(hs.l5_shots,0))/10.0 ELSE NULL END::numeric,4),
    ROUND(CASE WHEN as2.s_cnt>0 THEN (COALESCE(as2.l5_sot,0)*2+COALESCE(as2.l5_shots,0))/10.0 ELSE NULL END::numeric,4),
    ROUND(CASE WHEN hf.cnt>0 THEN 1.0/(1.0+COALESCE(hf.l5_ga,2.0)) ELSE NULL END::numeric,6),
    ROUND(CASE WHEN af.cnt>0 THEN 1.0/(1.0+COALESCE(af.l5_ga,2.0)) ELSE NULL END::numeric,6),
    ROUND((COALESCE(hf.l5_pts,0)-COALESCE(af.l5_pts,0))::numeric,4),
    ROUND((CASE WHEN hs.s_cnt>0 THEN (COALESCE(hs.l5_sot,0)*2+COALESCE(hs.l5_shots,0))/10.0 ELSE 0 END
         - CASE WHEN as2.s_cnt>0 THEN (COALESCE(as2.l5_sot,0)*2+COALESCE(as2.l5_shots,0))/10.0 ELSE 0 END)::numeric,4),
    ROUND((CASE WHEN hf.cnt>0 THEN 1.0/(1.0+COALESCE(hf.l5_ga,2.0)) ELSE 0 END
         - CASE WHEN af.cnt>0 THEN 1.0/(1.0+COALESCE(af.l5_ga,2.0)) ELSE 0 END)::numeric,6),
    1, csm.data_quality_tier,
    (t.pre_match_elo_home IS NOT NULL AND t.pre_match_elo_away IS NOT NULL),
    (COALESCE(hf.cnt,0)>=1 AND COALESCE(af.cnt,0)>=1),
    (COALESCE(hs.s_cnt,0)>=1 AND COALESCE(as2.s_cnt,0)>=1),
    CASE
      WHEN t.pre_match_elo_home IS NOT NULL AND COALESCE(hf.cnt,0)>=1 AND COALESCE(af.cnt,0)>=1
        AND COALESCE(hs.s_cnt,0)>=1 AND COALESCE(as2.s_cnt,0)>=1 THEN 'elo_form_stats'
      WHEN t.pre_match_elo_home IS NOT NULL AND COALESCE(hf.cnt,0)>=1 AND COALESCE(af.cnt,0)>=1 THEN 'elo_form'
      WHEN t.pre_match_elo_home IS NOT NULL THEN 'elo_only'
      ELSE 'none'
    END,
    COALESCE(hf.cnt,0)::smallint, COALESCE(af.cnt,0)::smallint,
    t.result_1x2, t.home_score_ft, t.away_score_ft
  FROM model_lab.team_elo_snapshots t
  JOIN model_lab.v_calibration_safe_matches csm ON csm.match_id = t.match_id
  LEFT JOIN _fm_l5_form  hf  ON hf.match_id=t.match_id AND hf.team_id=t.home_team_id
  LEFT JOIN _fm_l5_form  af  ON af.match_id=t.match_id AND af.team_id=t.away_team_id
  LEFT JOIN _fm_l5_stats hs  ON hs.match_id=t.match_id AND hs.team_id=t.home_team_id
  LEFT JOIN _fm_l5_stats as2 ON as2.match_id=t.match_id AND as2.team_id=t.away_team_id
  WHERE t.elo_version=p_elo_version AND t.competition_name=p_competition_name
  ON CONFLICT (match_id, elo_version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  DROP TABLE IF EXISTS _fm_l5_form;
  DROP TABLE IF EXISTS _fm_l5_stats;

  SELECT
    SUM(CASE WHEN feature_quality_tier='elo_only'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form_stats' THEN 1 ELSE 0 END)
  INTO v_elo_only, v_elo_form, v_elo_form_stats
  FROM model_lab.match_feature_matrix_v2
  WHERE elo_version=p_elo_version AND feature_version=p_feature_version
    AND competition_name=p_competition_name;

  RETURN QUERY SELECT p_competition_name::text, v_inserted, v_elo_only, v_elo_form, v_elo_form_stats;

END;
$$;
