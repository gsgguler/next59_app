
/*
  # Feature Matrix V2 — Window-Function Based Population

  ## Summary
  Replaces the LATERAL-subquery approach with a pure window-function strategy.
  Computes rolling L5 form using LAG() windows over pre-ranked team match sequences,
  then pivots home/away per target match. Single INSERT...SELECT with no subqueries
  per row — O(n log n) instead of O(n*5).

  ## Algorithm
  1. team_matches CTE: one row per (team, match) from ELO snapshots, with
     team-relative columns (points earned, goals scored/conceded)
  2. team_l5 CTE: uses LAG(1..5) OVER (PARTITION BY team, competition ORDER BY match_date)
     to pull the 5 previous match values — strictly pre-match
  3. team_l5_agg: averages the 5 lag values per team per match
  4. stats_l5: similar approach over match_stats joined to team_matches
  5. Final assembly joins home + away L5 per match_id

  ## Safety
  - All LAG windows use PARTITION BY team_id, competition_id — no cross-competition leakage
  - Strictly prior rows: LAG reads previous rows in date order, never current row
  - ON CONFLICT DO NOTHING — idempotent
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
  v_inserted        integer := 0;
  v_elo_only        integer := 0;
  v_elo_form        integer := 0;
  v_elo_form_stats  integer := 0;
BEGIN

  WITH
  -- Step 1: flatten matches to one row per (team, match) with team-relative stats
  team_matches AS (
    SELECT
      tes.match_id,
      tes.competition_id,
      tes.match_date,
      tes.home_team_id        AS home_tid,
      tes.away_team_id        AS away_tid,
      -- home team perspective
      tes.home_team_id        AS team_id,
      CASE tes.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END::numeric AS pts,
      tes.home_score_ft::numeric   AS gf,
      tes.away_score_ft::numeric   AS ga,
      CASE WHEN tes.away_score_ft = 0 THEN 1.0 ELSE 0.0 END  AS cs,
      CASE WHEN tes.home_score_ft > 0 THEN 1.0 ELSE 0.0 END  AS sc,
      CASE WHEN tes.away_score_ft > 0 THEN 1.0 ELSE 0.0 END  AS con
    FROM model_lab.team_elo_snapshots tes
    WHERE tes.elo_version      = p_elo_version
      AND tes.competition_name = p_competition_name

    UNION ALL

    SELECT
      tes.match_id,
      tes.competition_id,
      tes.match_date,
      tes.home_team_id,
      tes.away_team_id,
      -- away team perspective
      tes.away_team_id,
      CASE tes.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END::numeric,
      tes.away_score_ft::numeric,
      tes.home_score_ft::numeric,
      CASE WHEN tes.home_score_ft = 0 THEN 1.0 ELSE 0.0 END,
      CASE WHEN tes.away_score_ft > 0 THEN 1.0 ELSE 0.0 END,
      CASE WHEN tes.home_score_ft > 0 THEN 1.0 ELSE 0.0 END
    FROM model_lab.team_elo_snapshots tes
    WHERE tes.elo_version      = p_elo_version
      AND tes.competition_name = p_competition_name
  ),

  -- Step 2: rank matches per team in chronological order
  team_ranked AS (
    SELECT
      tm.*,
      ROW_NUMBER() OVER (
        PARTITION BY team_id, competition_id
        ORDER BY match_date ASC, match_id ASC
      ) AS rn
    FROM team_matches tm
  ),

  -- Step 3: LAG to get previous 5 matches per team
  team_lagged AS (
    SELECT
      match_id,
      team_id,
      competition_id,
      -- pts L5: lag 1-5
      LAG(pts,1) OVER w AS pts1, LAG(pts,2) OVER w AS pts2,
      LAG(pts,3) OVER w AS pts3, LAG(pts,4) OVER w AS pts4,
      LAG(pts,5) OVER w AS pts5,
      -- gf L5
      LAG(gf,1) OVER w AS gf1, LAG(gf,2) OVER w AS gf2,
      LAG(gf,3) OVER w AS gf3, LAG(gf,4) OVER w AS gf4,
      LAG(gf,5) OVER w AS gf5,
      -- ga L5
      LAG(ga,1) OVER w AS ga1, LAG(ga,2) OVER w AS ga2,
      LAG(ga,3) OVER w AS ga3, LAG(ga,4) OVER w AS ga4,
      LAG(ga,5) OVER w AS ga5,
      -- cs L5
      LAG(cs,1) OVER w AS cs1, LAG(cs,2) OVER w AS cs2,
      LAG(cs,3) OVER w AS cs3, LAG(cs,4) OVER w AS cs4,
      LAG(cs,5) OVER w AS cs5,
      -- sc L5
      LAG(sc,1) OVER w AS sc1, LAG(sc,2) OVER w AS sc2,
      LAG(sc,3) OVER w AS sc3, LAG(sc,4) OVER w AS sc4,
      LAG(sc,5) OVER w AS sc5,
      -- con L5
      LAG(con,1) OVER w AS con1, LAG(con,2) OVER w AS con2,
      LAG(con,3) OVER w AS con3, LAG(con,4) OVER w AS con4,
      LAG(con,5) OVER w AS con5
    FROM team_ranked
    WINDOW w AS (PARTITION BY team_id, competition_id ORDER BY rn ASC)
  ),

  -- Step 4: aggregate L5 per (team, match) — count non-nulls, avg available
  team_l5 AS (
    SELECT
      match_id,
      team_id,
      -- count available prior matches (max 5)
      (CASE WHEN pts1 IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN pts2 IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN pts3 IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN pts4 IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN pts5 IS NOT NULL THEN 1 ELSE 0 END)  AS l5_cnt,
      -- avg pts
      (COALESCE(pts1,0)+COALESCE(pts2,0)+COALESCE(pts3,0)+COALESCE(pts4,0)+COALESCE(pts5,0))
      / NULLIF((CASE WHEN pts1 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN pts2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN pts3 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN pts4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN pts5 IS NOT NULL THEN 1 ELSE 0 END), 0) AS l5_pts,
      (COALESCE(gf1,0)+COALESCE(gf2,0)+COALESCE(gf3,0)+COALESCE(gf4,0)+COALESCE(gf5,0))
      / NULLIF((CASE WHEN gf1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN gf2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN gf3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN gf4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN gf5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_gf,
      (COALESCE(ga1,0)+COALESCE(ga2,0)+COALESCE(ga3,0)+COALESCE(ga4,0)+COALESCE(ga5,0))
      / NULLIF((CASE WHEN ga1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN ga2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN ga3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN ga4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN ga5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_ga,
      (COALESCE(cs1,0)+COALESCE(cs2,0)+COALESCE(cs3,0)+COALESCE(cs4,0)+COALESCE(cs5,0))
      / NULLIF((CASE WHEN cs1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cs2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN cs3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cs4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN cs5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_cs,
      (COALESCE(sc1,0)+COALESCE(sc2,0)+COALESCE(sc3,0)+COALESCE(sc4,0)+COALESCE(sc5,0))
      / NULLIF((CASE WHEN sc1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sc2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN sc3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sc4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN sc5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_sc,
      (COALESCE(con1,0)+COALESCE(con2,0)+COALESCE(con3,0)+COALESCE(con4,0)+COALESCE(con5,0))
      / NULLIF((CASE WHEN con1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN con2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN con3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN con4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN con5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_con
    FROM team_lagged
  ),

  -- Step 5: stats from match_stats — one row per (team, match)
  stats_base AS (
    SELECT
      ms.match_id,
      ms.team_id,
      ms.total_shots::numeric AS shots,
      ms.shots_on_goal::numeric AS sot,
      ms.corner_kicks::numeric AS corn,
      (COALESCE(ms.yellow_cards,0) + COALESCE(ms.red_cards,0)*3)::numeric AS cards,
      tr.rn
    FROM public.match_stats ms
    JOIN team_ranked tr
      ON tr.match_id = ms.match_id
     AND tr.team_id  = ms.team_id
    WHERE ms.half = 'FT'
      AND ms.total_shots IS NOT NULL
  ),

  stats_lagged AS (
    SELECT
      match_id, team_id,
      LAG(shots,1) OVER w AS sh1, LAG(shots,2) OVER w AS sh2,
      LAG(shots,3) OVER w AS sh3, LAG(shots,4) OVER w AS sh4,
      LAG(shots,5) OVER w AS sh5,
      LAG(sot,1)   OVER w AS st1, LAG(sot,2)   OVER w AS st2,
      LAG(sot,3)   OVER w AS st3, LAG(sot,4)   OVER w AS st4,
      LAG(sot,5)   OVER w AS st5,
      LAG(corn,1)  OVER w AS co1, LAG(corn,2)  OVER w AS co2,
      LAG(corn,3)  OVER w AS co3, LAG(corn,4)  OVER w AS co4,
      LAG(corn,5)  OVER w AS co5,
      LAG(cards,1) OVER w AS cd1, LAG(cards,2) OVER w AS cd2,
      LAG(cards,3) OVER w AS cd3, LAG(cards,4) OVER w AS cd4,
      LAG(cards,5) OVER w AS cd5
    FROM stats_base
    WINDOW w AS (PARTITION BY team_id ORDER BY rn ASC)
  ),

  stats_l5 AS (
    SELECT
      match_id, team_id,
      (CASE WHEN sh1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh2 IS NOT NULL THEN 1 ELSE 0 END+
       CASE WHEN sh3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh4 IS NOT NULL THEN 1 ELSE 0 END+
       CASE WHEN sh5 IS NOT NULL THEN 1 ELSE 0 END) AS s_cnt,
      (COALESCE(sh1,0)+COALESCE(sh2,0)+COALESCE(sh3,0)+COALESCE(sh4,0)+COALESCE(sh5,0))
      / NULLIF((CASE WHEN sh1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN sh3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN sh4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN sh5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_shots,
      (COALESCE(st1,0)+COALESCE(st2,0)+COALESCE(st3,0)+COALESCE(st4,0)+COALESCE(st5,0))
      / NULLIF((CASE WHEN st1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN st3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN st4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN st5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_sot,
      (COALESCE(co1,0)+COALESCE(co2,0)+COALESCE(co3,0)+COALESCE(co4,0)+COALESCE(co5,0))
      / NULLIF((CASE WHEN co1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN co3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN co4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN co5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_corn,
      (COALESCE(cd1,0)+COALESCE(cd2,0)+COALESCE(cd3,0)+COALESCE(cd4,0)+COALESCE(cd5,0))
      / NULLIF((CASE WHEN cd1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd2 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN cd3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN cd4 IS NOT NULL THEN 1 ELSE 0 END+
                CASE WHEN cd5 IS NOT NULL THEN 1 ELSE 0 END),0) AS l5_cards
    FROM stats_lagged
  ),

  -- Step 6: Base match info from ELO snapshots
  matches AS (
    SELECT
      tes.match_id,
      tes.elo_version,
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
    m.match_id, m.elo_version, p_feature_version,
    m.competition_id, m.competition_name, m.season_label, m.match_date,
    m.home_team_id, m.away_team_id,
    m.pre_match_elo_home, m.pre_match_elo_away,
    ROUND((m.pre_match_elo_home - m.pre_match_elo_away)::numeric, 4),
    m.expected_home_elo, m.expected_away_elo,
    -- form
    ROUND(hf.l5_pts::numeric,4),  ROUND(af.l5_pts::numeric,4),
    ROUND((COALESCE(hf.l5_gf,0)-COALESCE(hf.l5_ga,0))::numeric,4),
    ROUND((COALESCE(af.l5_gf,0)-COALESCE(af.l5_ga,0))::numeric,4),
    ROUND(hf.l5_gf::numeric,4),   ROUND(af.l5_gf::numeric,4),
    ROUND(hf.l5_ga::numeric,4),   ROUND(af.l5_ga::numeric,4),
    ROUND(hf.l5_cs::numeric,4),   ROUND(af.l5_cs::numeric,4),
    ROUND(hf.l5_sc::numeric,4),   ROUND(af.l5_sc::numeric,4),
    ROUND(hf.l5_con::numeric,4),  ROUND(af.l5_con::numeric,4),
    -- stats
    ROUND(hs.l5_shots::numeric,4), ROUND(as2.l5_shots::numeric,4),
    ROUND(hs.l5_sot::numeric,4),   ROUND(as2.l5_sot::numeric,4),
    ROUND(hs.l5_corn::numeric,4),  ROUND(as2.l5_corn::numeric,4),
    ROUND(hs.l5_cards::numeric,4), ROUND(as2.l5_cards::numeric,4),
    -- attack index
    ROUND(CASE WHEN hs.s_cnt > 0
      THEN (COALESCE(hs.l5_sot,0)*2+COALESCE(hs.l5_shots,0))/10.0 ELSE NULL END::numeric,4),
    ROUND(CASE WHEN as2.s_cnt > 0
      THEN (COALESCE(as2.l5_sot,0)*2+COALESCE(as2.l5_shots,0))/10.0 ELSE NULL END::numeric,4),
    -- defense index
    ROUND(CASE WHEN hf.l5_cnt > 0
      THEN 1.0/(1.0+COALESCE(hf.l5_ga,2.0)) ELSE NULL END::numeric,6),
    ROUND(CASE WHEN af.l5_cnt > 0
      THEN 1.0/(1.0+COALESCE(af.l5_ga,2.0)) ELSE NULL END::numeric,6),
    -- differentials
    ROUND((COALESCE(hf.l5_pts,0)-COALESCE(af.l5_pts,0))::numeric,4),
    ROUND((CASE WHEN hs.s_cnt>0 THEN (COALESCE(hs.l5_sot,0)*2+COALESCE(hs.l5_shots,0))/10.0 ELSE 0 END
         - CASE WHEN as2.s_cnt>0 THEN (COALESCE(as2.l5_sot,0)*2+COALESCE(as2.l5_shots,0))/10.0 ELSE 0 END)::numeric,4),
    ROUND((CASE WHEN hf.l5_cnt>0 THEN 1.0/(1.0+COALESCE(hf.l5_ga,2.0)) ELSE 0 END
         - CASE WHEN af.l5_cnt>0 THEN 1.0/(1.0+COALESCE(af.l5_ga,2.0)) ELSE 0 END)::numeric,6),
    1, m.data_quality_tier,
    -- coverage
    (m.pre_match_elo_home IS NOT NULL AND m.pre_match_elo_away IS NOT NULL),
    (COALESCE(hf.l5_cnt,0) >= 1 AND COALESCE(af.l5_cnt,0) >= 1),
    (COALESCE(hs.s_cnt,0) >= 1 AND COALESCE(as2.s_cnt,0) >= 1),
    CASE
      WHEN m.pre_match_elo_home IS NOT NULL
        AND COALESCE(hf.l5_cnt,0)>=1 AND COALESCE(af.l5_cnt,0)>=1
        AND COALESCE(hs.s_cnt,0)>=1  AND COALESCE(as2.s_cnt,0)>=1 THEN 'elo_form_stats'
      WHEN m.pre_match_elo_home IS NOT NULL
        AND COALESCE(hf.l5_cnt,0)>=1 AND COALESCE(af.l5_cnt,0)>=1 THEN 'elo_form'
      WHEN m.pre_match_elo_home IS NOT NULL THEN 'elo_only'
      ELSE 'none'
    END,
    COALESCE(hf.l5_cnt,0)::smallint,
    COALESCE(af.l5_cnt,0)::smallint,
    m.result_1x2, m.home_score_ft, m.away_score_ft
  FROM matches m
  LEFT JOIN team_l5  hf  ON hf.match_id = m.match_id AND hf.team_id = m.home_team_id
  LEFT JOIN team_l5  af  ON af.match_id = m.match_id AND af.team_id = m.away_team_id
  LEFT JOIN stats_l5 hs  ON hs.match_id = m.match_id AND hs.team_id = m.home_team_id
  LEFT JOIN stats_l5 as2 ON as2.match_id = m.match_id AND as2.team_id = m.away_team_id
  ON CONFLICT (match_id, elo_version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT
    SUM(CASE WHEN feature_quality_tier='elo_only'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form'       THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form_stats' THEN 1 ELSE 0 END)
  INTO v_elo_only, v_elo_form, v_elo_form_stats
  FROM model_lab.match_feature_matrix_v2
  WHERE elo_version      = p_elo_version
    AND feature_version  = p_feature_version
    AND competition_name = p_competition_name;

  RETURN QUERY SELECT
    p_competition_name::text,
    v_inserted, v_elo_only, v_elo_form, v_elo_form_stats;

END;
$$;
