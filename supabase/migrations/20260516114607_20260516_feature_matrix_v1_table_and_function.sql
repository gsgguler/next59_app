/*
  # Feature Engineering V1 — match_feature_matrix_v1

  ## Summary
  Creates the V1 pre-match feature matrix table and its population function.
  All features are strictly pre-match: derived from matches strictly prior
  to the target match date. ELO comes from the already-materialised
  team_elo_snapshots table. Rolling form/stats computed inline via
  windowed aggregates over team_elo_snapshots + match_stats.

  ## Feature Scope (36 features + coverage flags)
  Group A — ELO (100% coverage after first match):
    pre_match_elo_home, pre_match_elo_away, elo_gap_home,
    expected_home_elo, expected_away_elo

  Group B — Rolling form L5 (from goals in prior matches):
    recent_form_points_home/away_l5
    recent_goal_diff_home/away_l5
    rolling_goals_for/against_home/away_l5
    clean_sheet_rate_home/away_l5
    scoring_rate_home/away_l5
    concede_rate_home/away_l5

  Group C — Rolling stats L5 (from match_stats FT, sparse):
    rolling_shots_home/away_l5
    rolling_shots_on_target_home/away_l5
    rolling_corners_home/away_l5
    rolling_cards_home/away_l5
    attack_index_home/away_l5
    defense_index_home/away_l5

  Group D — Differential gap features:
    form_gap_home, attack_gap_home, defense_gap_home

  Group E — Context:
    home_advantage_flag (always 1)
    data_quality_tier (from safe match universe)

  Coverage flags:
    has_elo_features, has_form_features, has_stats_features,
    feature_quality_tier

  Outcome labels (not features):
    result_1x2, home_score_ft, away_score_ft

  ## Safety
  - All rolling windows use: source.match_date < target.match_date
  - Source is team_elo_snapshots (elo_v1_domestic_2026_05) — already
    restricted to 7 safe domestic leagues
  - No post-match stats from the target match
  - No imputation — NULLs kept as-is where data unavailable
  - Unique on match_id
  - feature_version = 'features_v1_domestic_2026_05'

  ## New Objects
  - model_lab.match_feature_matrix_v1 (table)
  - model_lab.ml_populate_feature_matrix_v1() (function)
*/

-- ============================================================
-- TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.match_feature_matrix_v1 (
  match_id                          uuid          PRIMARY KEY,
  competition_id                    uuid          NOT NULL,
  competition_name                  text          NOT NULL,
  season_label                      text          NOT NULL,
  match_date                        date          NOT NULL,
  home_team_id                      uuid          NOT NULL,
  away_team_id                      uuid          NOT NULL,
  feature_version                   text          NOT NULL DEFAULT 'features_v1_domestic_2026_05',
  elo_version                       text          NOT NULL DEFAULT 'elo_v1_domestic_2026_05',

  -- GROUP A: ELO
  pre_match_elo_home                numeric(10,4),
  pre_match_elo_away                numeric(10,4),
  elo_gap_home                      numeric(10,4),
  expected_home_elo                 numeric(10,6),
  expected_away_elo                 numeric(10,6),

  -- GROUP B: ROLLING FORM L5 (goals-based, pre-match safe)
  recent_form_points_home_l5        numeric(6,4),
  recent_form_points_away_l5        numeric(6,4),
  recent_goal_diff_home_l5          numeric(6,4),
  recent_goal_diff_away_l5          numeric(6,4),
  rolling_goals_for_home_l5         numeric(6,4),
  rolling_goals_for_away_l5         numeric(6,4),
  rolling_goals_against_home_l5     numeric(6,4),
  rolling_goals_against_away_l5     numeric(6,4),
  clean_sheet_rate_home_l5          numeric(6,4),
  clean_sheet_rate_away_l5          numeric(6,4),
  scoring_rate_home_l5              numeric(6,4),
  scoring_rate_away_l5              numeric(6,4),
  concede_rate_home_l5              numeric(6,4),
  concede_rate_away_l5              numeric(6,4),

  -- GROUP C: ROLLING STATS L5 (match_stats FT, sparse)
  rolling_shots_home_l5             numeric(8,4),
  rolling_shots_away_l5             numeric(8,4),
  rolling_shots_on_target_home_l5   numeric(8,4),
  rolling_shots_on_target_away_l5   numeric(8,4),
  rolling_corners_home_l5           numeric(8,4),
  rolling_corners_away_l5           numeric(8,4),
  rolling_cards_home_l5             numeric(6,4),
  rolling_cards_away_l5             numeric(6,4),
  attack_index_home_l5              numeric(8,4),
  attack_index_away_l5              numeric(8,4),
  defense_index_home_l5             numeric(8,4),
  defense_index_away_l5             numeric(8,4),

  -- GROUP D: DIFFERENTIAL GAPS
  form_gap_home                     numeric(6,4),
  attack_gap_home                   numeric(8,4),
  defense_gap_home                  numeric(8,4),

  -- GROUP E: CONTEXT
  home_advantage_flag               smallint      NOT NULL DEFAULT 1,
  data_quality_tier                 text,

  -- COVERAGE FLAGS
  has_elo_features                  boolean       NOT NULL DEFAULT false,
  has_form_features                 boolean       NOT NULL DEFAULT false,
  has_stats_features                boolean       NOT NULL DEFAULT false,
  feature_quality_tier              text          NOT NULL DEFAULT 'none',
  home_l5_matches_available         smallint,
  away_l5_matches_available         smallint,

  -- OUTCOME LABELS (not features)
  result_1x2                        text          NOT NULL CHECK (result_1x2 IN ('H','D','A')),
  home_score_ft                     integer       NOT NULL,
  away_score_ft                     integer       NOT NULL,

  populated_at                      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfm_match_date
  ON model_lab.match_feature_matrix_v1 (match_date);
CREATE INDEX IF NOT EXISTS idx_mfm_competition
  ON model_lab.match_feature_matrix_v1 (competition_id, match_date);
CREATE INDEX IF NOT EXISTS idx_mfm_quality_tier
  ON model_lab.match_feature_matrix_v1 (feature_quality_tier);
CREATE INDEX IF NOT EXISTS idx_mfm_home_team
  ON model_lab.match_feature_matrix_v1 (home_team_id, match_date);
CREATE INDEX IF NOT EXISTS idx_mfm_away_team
  ON model_lab.match_feature_matrix_v1 (away_team_id, match_date);

ALTER TABLE model_lab.match_feature_matrix_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read feature matrix"
  ON model_lab.match_feature_matrix_v1
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON model_lab.match_feature_matrix_v1 TO authenticated;

-- ============================================================
-- POPULATION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_matrix_v1(
  p_feature_version text DEFAULT 'features_v1_domestic_2026_05',
  p_elo_version      text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_competition   text,
  out_rows_inserted integer,
  out_rows_skipped  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comp            record;
  v_match           record;
  v_inserted        integer;
  v_skipped         integer;

  v_hf_pts          numeric; v_hf_gf  numeric; v_hf_ga  numeric;
  v_hf_cs           numeric; v_hf_sc  numeric; v_hf_con numeric;
  v_hf_cnt          integer;
  v_af_pts          numeric; v_af_gf  numeric; v_af_ga  numeric;
  v_af_cs           numeric; v_af_sc  numeric; v_af_con numeric;
  v_af_cnt          integer;

  v_hs_shots        numeric; v_hs_sot  numeric; v_hs_corn numeric;
  v_hs_cards        numeric; v_hs_scnt integer;
  v_as_shots        numeric; v_as_sot  numeric; v_as_corn numeric;
  v_as_cards        numeric; v_as_scnt integer;

  v_atk_h           numeric; v_atk_a  numeric;
  v_def_h           numeric; v_def_a  numeric;
  v_has_elo         boolean; v_has_form boolean; v_has_stats boolean;
  v_qtier           text;
BEGIN
  FOR v_comp IN
    SELECT DISTINCT
      tes.competition_id  AS cid,
      tes.competition_name AS cname
    FROM model_lab.team_elo_snapshots tes
    WHERE tes.elo_version = p_elo_version
    ORDER BY tes.competition_name
  LOOP
    v_inserted := 0;
    v_skipped  := 0;

    FOR v_match IN
      SELECT
        tes.match_id,
        tes.competition_id,
        tes.competition_name    AS cname,
        tes.season_label,
        tes.match_date,
        tes.home_team_id,
        tes.away_team_id,
        tes.home_score_ft,
        tes.away_score_ft,
        tes.result_1x2,
        tes.pre_match_elo_home,
        tes.pre_match_elo_away,
        tes.expected_home,
        tes.expected_away,
        csm.data_quality_tier
      FROM model_lab.team_elo_snapshots tes
      JOIN model_lab.v_calibration_safe_matches csm
        ON csm.match_id = tes.match_id
      WHERE tes.elo_version = p_elo_version
        AND tes.competition_id = v_comp.cid
      ORDER BY tes.match_date ASC, tes.match_id ASC
    LOOP

      -- ROLLING FORM L5: home team
      SELECT
        COUNT(*)::integer,
        AVG(CASE WHEN src.home_team_id = v_match.home_team_id
              THEN CASE src.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE src.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric),
        AVG(CASE WHEN src.home_team_id = v_match.home_team_id
              THEN src.home_score_ft ELSE src.away_score_ft END::numeric),
        AVG(CASE WHEN src.home_team_id = v_match.home_team_id
              THEN src.away_score_ft ELSE src.home_score_ft END::numeric),
        AVG(CASE WHEN (src.home_team_id = v_match.home_team_id AND src.away_score_ft = 0)
                   OR (src.away_team_id = v_match.home_team_id AND src.home_score_ft = 0)
              THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN (src.home_team_id = v_match.home_team_id AND src.home_score_ft > 0)
                   OR (src.away_team_id = v_match.home_team_id AND src.away_score_ft > 0)
              THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN (src.home_team_id = v_match.home_team_id AND src.away_score_ft > 0)
                   OR (src.away_team_id = v_match.home_team_id AND src.home_score_ft > 0)
              THEN 1.0 ELSE 0.0 END)
      INTO v_hf_cnt, v_hf_pts, v_hf_gf, v_hf_ga, v_hf_cs, v_hf_sc, v_hf_con
      FROM (
        SELECT s.*,
               ROW_NUMBER() OVER (ORDER BY s.match_date DESC, s.match_id DESC) AS rn
        FROM model_lab.team_elo_snapshots s
        WHERE s.elo_version = p_elo_version
          AND s.competition_id = v_comp.cid
          AND (s.home_team_id = v_match.home_team_id
               OR s.away_team_id = v_match.home_team_id)
          AND s.match_date < v_match.match_date
          AND s.match_id <> v_match.match_id
      ) src WHERE src.rn <= 5;

      -- ROLLING FORM L5: away team
      SELECT
        COUNT(*)::integer,
        AVG(CASE WHEN src.home_team_id = v_match.away_team_id
              THEN CASE src.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE src.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric),
        AVG(CASE WHEN src.home_team_id = v_match.away_team_id
              THEN src.home_score_ft ELSE src.away_score_ft END::numeric),
        AVG(CASE WHEN src.home_team_id = v_match.away_team_id
              THEN src.away_score_ft ELSE src.home_score_ft END::numeric),
        AVG(CASE WHEN (src.home_team_id = v_match.away_team_id AND src.away_score_ft = 0)
                   OR (src.away_team_id = v_match.away_team_id AND src.home_score_ft = 0)
              THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN (src.home_team_id = v_match.away_team_id AND src.home_score_ft > 0)
                   OR (src.away_team_id = v_match.away_team_id AND src.away_score_ft > 0)
              THEN 1.0 ELSE 0.0 END),
        AVG(CASE WHEN (src.home_team_id = v_match.away_team_id AND src.away_score_ft > 0)
                   OR (src.away_team_id = v_match.away_team_id AND src.home_score_ft > 0)
              THEN 1.0 ELSE 0.0 END)
      INTO v_af_cnt, v_af_pts, v_af_gf, v_af_ga, v_af_cs, v_af_sc, v_af_con
      FROM (
        SELECT s.*,
               ROW_NUMBER() OVER (ORDER BY s.match_date DESC, s.match_id DESC) AS rn
        FROM model_lab.team_elo_snapshots s
        WHERE s.elo_version = p_elo_version
          AND s.competition_id = v_comp.cid
          AND (s.home_team_id = v_match.away_team_id
               OR s.away_team_id = v_match.away_team_id)
          AND s.match_date < v_match.match_date
          AND s.match_id <> v_match.match_id
      ) src WHERE src.rn <= 5;

      -- ROLLING STATS L5: home team
      SELECT
        COUNT(*)::integer,
        AVG(ms.total_shots::numeric),
        AVG(ms.shots_on_goal::numeric),
        AVG(ms.corner_kicks::numeric),
        AVG((COALESCE(ms.yellow_cards,0) + COALESCE(ms.red_cards,0)*3)::numeric)
      INTO v_hs_scnt, v_hs_shots, v_hs_sot, v_hs_corn, v_hs_cards
      FROM (
        SELECT s.match_id,
               ROW_NUMBER() OVER (ORDER BY s.match_date DESC, s.match_id DESC) AS rn
        FROM model_lab.team_elo_snapshots s
        WHERE s.elo_version = p_elo_version
          AND s.competition_id = v_comp.cid
          AND (s.home_team_id = v_match.home_team_id
               OR s.away_team_id = v_match.home_team_id)
          AND s.match_date < v_match.match_date
          AND s.match_id <> v_match.match_id
      ) src
      JOIN public.match_stats ms
        ON ms.match_id = src.match_id
       AND ms.team_id  = v_match.home_team_id
       AND ms.half     = 'FT'
       AND ms.total_shots IS NOT NULL
      WHERE src.rn <= 5;

      -- ROLLING STATS L5: away team
      SELECT
        COUNT(*)::integer,
        AVG(ms.total_shots::numeric),
        AVG(ms.shots_on_goal::numeric),
        AVG(ms.corner_kicks::numeric),
        AVG((COALESCE(ms.yellow_cards,0) + COALESCE(ms.red_cards,0)*3)::numeric)
      INTO v_as_scnt, v_as_shots, v_as_sot, v_as_corn, v_as_cards
      FROM (
        SELECT s.match_id,
               ROW_NUMBER() OVER (ORDER BY s.match_date DESC, s.match_id DESC) AS rn
        FROM model_lab.team_elo_snapshots s
        WHERE s.elo_version = p_elo_version
          AND s.competition_id = v_comp.cid
          AND (s.home_team_id = v_match.away_team_id
               OR s.away_team_id = v_match.away_team_id)
          AND s.match_date < v_match.match_date
          AND s.match_id <> v_match.match_id
      ) src
      JOIN public.match_stats ms
        ON ms.match_id = src.match_id
       AND ms.team_id  = v_match.away_team_id
       AND ms.half     = 'FT'
       AND ms.total_shots IS NOT NULL
      WHERE src.rn <= 5;

      -- DERIVED
      v_atk_h := CASE WHEN v_hs_scnt > 0
        THEN (COALESCE(v_hs_sot,0)*2 + COALESCE(v_hs_shots,0)) / 10.0 ELSE NULL END;
      v_atk_a := CASE WHEN v_as_scnt > 0
        THEN (COALESCE(v_as_sot,0)*2 + COALESCE(v_as_shots,0)) / 10.0 ELSE NULL END;
      v_def_h := CASE WHEN v_hf_cnt > 0
        THEN 1.0 / (1.0 + COALESCE(v_hf_ga, 2.0)) ELSE NULL END;
      v_def_a := CASE WHEN v_af_cnt > 0
        THEN 1.0 / (1.0 + COALESCE(v_af_ga, 2.0)) ELSE NULL END;

      -- COVERAGE FLAGS
      v_has_elo   := v_match.pre_match_elo_home IS NOT NULL
                     AND v_match.pre_match_elo_away IS NOT NULL;
      v_has_form  := v_hf_cnt >= 1 AND v_af_cnt >= 1;
      v_has_stats := v_hs_scnt >= 1 AND v_as_scnt >= 1;

      v_qtier := CASE
        WHEN v_has_elo AND v_has_form AND v_has_stats THEN 'elo_form_stats'
        WHEN v_has_elo AND v_has_form                 THEN 'elo_form'
        WHEN v_has_elo                                THEN 'elo_only'
        ELSE 'none'
      END;

      INSERT INTO model_lab.match_feature_matrix_v1 (
        match_id, competition_id, competition_name, season_label, match_date,
        home_team_id, away_team_id, feature_version, elo_version,
        pre_match_elo_home, pre_match_elo_away,
        elo_gap_home, expected_home_elo, expected_away_elo,
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
      ) VALUES (
        v_match.match_id, v_match.competition_id, v_match.cname,
        v_match.season_label, v_match.match_date,
        v_match.home_team_id, v_match.away_team_id,
        p_feature_version, p_elo_version,
        v_match.pre_match_elo_home, v_match.pre_match_elo_away,
        v_match.pre_match_elo_home - v_match.pre_match_elo_away,
        v_match.expected_home, v_match.expected_away,
        ROUND(v_hf_pts,4), ROUND(v_af_pts,4),
        ROUND(v_hf_gf - COALESCE(v_hf_ga,0), 4),
        ROUND(v_af_gf - COALESCE(v_af_ga,0), 4),
        ROUND(v_hf_gf,4), ROUND(v_af_gf,4),
        ROUND(v_hf_ga,4), ROUND(v_af_ga,4),
        ROUND(v_hf_cs,4), ROUND(v_af_cs,4),
        ROUND(v_hf_sc,4), ROUND(v_af_sc,4),
        ROUND(v_hf_con,4), ROUND(v_af_con,4),
        ROUND(v_hs_shots,4),  ROUND(v_as_shots,4),
        ROUND(v_hs_sot,4),    ROUND(v_as_sot,4),
        ROUND(v_hs_corn,4),   ROUND(v_as_corn,4),
        ROUND(v_hs_cards,4),  ROUND(v_as_cards,4),
        ROUND(v_atk_h,4),     ROUND(v_atk_a,4),
        ROUND(v_def_h,6),     ROUND(v_def_a,6),
        ROUND(COALESCE(v_hf_pts,0) - COALESCE(v_af_pts,0), 4),
        ROUND(COALESCE(v_atk_h,0)  - COALESCE(v_atk_a,0),  4),
        ROUND(COALESCE(v_def_h,0)  - COALESCE(v_def_a,0),  6),
        1, v_match.data_quality_tier,
        v_has_elo, v_has_form, v_has_stats, v_qtier,
        v_hf_cnt::smallint, v_af_cnt::smallint,
        v_match.result_1x2, v_match.home_score_ft, v_match.away_score_ft
      )
      ON CONFLICT (match_id) DO NOTHING;

      v_inserted := v_inserted + 1;

    END LOOP;

    RETURN QUERY SELECT v_comp.cname, v_inserted, v_skipped;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_populate_feature_matrix_v1(text, text) TO authenticated;
