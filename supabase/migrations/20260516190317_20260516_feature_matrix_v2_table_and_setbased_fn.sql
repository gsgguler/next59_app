
/*
  # Feature Matrix V2 — Table + Set-Based Population Function

  ## Summary
  Creates match_feature_matrix_v2 with a composite primary key (match_id, elo_version),
  allowing multiple ELO versions to coexist. Populates using a fully set-based
  INSERT...SELECT — no row-by-row PL/pgSQL cursor loop. Executes per-competition
  to stay within statement timeouts.

  ## Key Design Differences from V1
  - PK: (match_id, elo_version) composite — supports multiple ELO versions
  - Population: set-based LATERAL joins for rolling L5 form + stats
  - Reads ELO features from team_elo_snapshots directly
  - Rolling form derived from team_elo_snapshots (same source as V1)
  - Rolling stats from public.match_stats (same as V1)

  ## Rolling Window Implementation
  Uses LATERAL subqueries with ORDER BY match_date DESC LIMIT 5
  to compute L5 rolling averages. Strictly pre-match (match_date < target date).

  ## Safety
  - No post-match data
  - No imputation — NULLs preserved where unavailable
  - ON CONFLICT DO NOTHING — idempotent
  - Reads only from team_elo_snapshots + v_calibration_safe_matches + match_stats

  ## New Objects
  - model_lab.match_feature_matrix_v2 (table)
  - model_lab.ml_populate_feature_matrix_v2_competition() (function)
*/

-- ============================================================
-- TABLE: match_feature_matrix_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.match_feature_matrix_v2 (
  match_id                          uuid          NOT NULL,
  elo_version                       text          NOT NULL,
  feature_version                   text          NOT NULL DEFAULT 'features_v2_domestic_2026_05',

  competition_id                    uuid          NOT NULL,
  competition_name                  text          NOT NULL,
  season_label                      text          NOT NULL,
  match_date                        date          NOT NULL,
  home_team_id                      uuid          NOT NULL,
  away_team_id                      uuid          NOT NULL,

  -- GROUP A: ELO (from V2 snapshots — HA=0)
  pre_match_elo_home                numeric(10,4),
  pre_match_elo_away                numeric(10,4),
  elo_gap_home                      numeric(10,4),
  expected_home_elo                 numeric(10,6),
  expected_away_elo                 numeric(10,6),

  -- GROUP B: ROLLING FORM L5
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

  -- GROUP C: ROLLING STATS L5
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

  -- GROUP D: DIFFERENTIALS
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

  -- OUTCOME LABELS
  result_1x2                        text          NOT NULL CHECK (result_1x2 IN ('H','D','A')),
  home_score_ft                     integer       NOT NULL,
  away_score_ft                     integer       NOT NULL,

  populated_at                      timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (match_id, elo_version)
);

CREATE INDEX IF NOT EXISTS idx_mfm2_match_date    ON model_lab.match_feature_matrix_v2 (match_date);
CREATE INDEX IF NOT EXISTS idx_mfm2_competition   ON model_lab.match_feature_matrix_v2 (competition_id, match_date);
CREATE INDEX IF NOT EXISTS idx_mfm2_quality_tier  ON model_lab.match_feature_matrix_v2 (feature_quality_tier);
CREATE INDEX IF NOT EXISTS idx_mfm2_elo_version   ON model_lab.match_feature_matrix_v2 (elo_version, match_date);
CREATE INDEX IF NOT EXISTS idx_mfm2_home_team     ON model_lab.match_feature_matrix_v2 (home_team_id, match_date);
CREATE INDEX IF NOT EXISTS idx_mfm2_away_team     ON model_lab.match_feature_matrix_v2 (away_team_id, match_date);

ALTER TABLE model_lab.match_feature_matrix_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read feature matrix v2"
  ON model_lab.match_feature_matrix_v2
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON model_lab.match_feature_matrix_v2 TO authenticated;

-- ============================================================
-- SET-BASED POPULATION FUNCTION (per competition)
-- ============================================================
DROP FUNCTION IF EXISTS model_lab.ml_populate_feature_matrix_v2_competition(text, text, text);

CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_matrix_v2_competition(
  p_competition_name  text    DEFAULT 'Premier League',
  p_feature_version   text    DEFAULT 'features_v2_domestic_2026_05',
  p_elo_version       text    DEFAULT 'elo_v2_ha0_k20_global'
)
RETURNS TABLE (
  out_competition   text,
  out_inserted      integer,
  out_skipped       integer,
  out_elo_only      integer,
  out_elo_form      integer,
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
  -- Base: all matches for this competition from ELO V2 snapshots
  base AS (
    SELECT
      tes.match_id,
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
      tes.expected_home   AS expected_home_elo,
      tes.expected_away   AS expected_away_elo,
      csm.data_quality_tier
    FROM model_lab.team_elo_snapshots tes
    JOIN model_lab.v_calibration_safe_matches csm ON csm.match_id = tes.match_id
    WHERE tes.elo_version       = p_elo_version
      AND tes.competition_name  = p_competition_name
  ),

  -- Rolling form L5: home team — LATERAL over same competition
  home_form AS (
    SELECT
      b.match_id,
      lf.cnt                                                AS hf_cnt,
      lf.pts                                                AS hf_pts,
      lf.gf                                                 AS hf_gf,
      lf.ga                                                 AS hf_ga,
      lf.cs                                                 AS hf_cs,
      lf.sc                                                 AS hf_sc,
      lf.con                                                AS hf_con
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                   AS cnt,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN CASE s.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE s.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric)                                   AS pts,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN s.home_score_ft ELSE s.away_score_ft END::numeric) AS gf,
        AVG(CASE WHEN s.home_team_id = b.home_team_id
              THEN s.away_score_ft ELSE s.home_score_ft END::numeric) AS ga,
        AVG(CASE
              WHEN s.home_team_id = b.home_team_id AND s.away_score_ft = 0 THEN 1.0
              WHEN s.away_team_id = b.home_team_id AND s.home_score_ft = 0 THEN 1.0
              ELSE 0.0 END)                                 AS cs,
        AVG(CASE
              WHEN s.home_team_id = b.home_team_id AND s.home_score_ft > 0 THEN 1.0
              WHEN s.away_team_id = b.home_team_id AND s.away_score_ft > 0 THEN 1.0
              ELSE 0.0 END)                                 AS sc,
        AVG(CASE
              WHEN s.home_team_id = b.home_team_id AND s.away_score_ft > 0 THEN 1.0
              WHEN s.away_team_id = b.home_team_id AND s.home_score_ft > 0 THEN 1.0
              ELSE 0.0 END)                                 AS con
      FROM (
        SELECT * FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version     = p_elo_version
          AND src.competition_id  = b.competition_id
          AND (src.home_team_id   = b.home_team_id OR src.away_team_id = b.home_team_id)
          AND src.match_date      < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) s
    ) lf
  ),

  -- Rolling form L5: away team
  away_form AS (
    SELECT
      b.match_id,
      lf.cnt                                                AS af_cnt,
      lf.pts                                                AS af_pts,
      lf.gf                                                 AS af_gf,
      lf.ga                                                 AS af_ga,
      lf.cs                                                 AS af_cs,
      lf.sc                                                 AS af_sc,
      lf.con                                                AS af_con
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                   AS cnt,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN CASE s.result_1x2 WHEN 'H' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
              ELSE CASE s.result_1x2 WHEN 'A' THEN 3 WHEN 'D' THEN 1 ELSE 0 END
            END::numeric)                                   AS pts,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN s.home_score_ft ELSE s.away_score_ft END::numeric) AS gf,
        AVG(CASE WHEN s.home_team_id = b.away_team_id
              THEN s.away_score_ft ELSE s.home_score_ft END::numeric) AS ga,
        AVG(CASE
              WHEN s.home_team_id = b.away_team_id AND s.away_score_ft = 0 THEN 1.0
              WHEN s.away_team_id = b.away_team_id AND s.home_score_ft = 0 THEN 1.0
              ELSE 0.0 END)                                 AS cs,
        AVG(CASE
              WHEN s.home_team_id = b.away_team_id AND s.home_score_ft > 0 THEN 1.0
              WHEN s.away_team_id = b.away_team_id AND s.away_score_ft > 0 THEN 1.0
              ELSE 0.0 END)                                 AS sc,
        AVG(CASE
              WHEN s.home_team_id = b.away_team_id AND s.away_score_ft > 0 THEN 1.0
              WHEN s.away_team_id = b.away_team_id AND s.home_score_ft > 0 THEN 1.0
              ELSE 0.0 END)                                 AS con
      FROM (
        SELECT * FROM model_lab.team_elo_snapshots src
        WHERE src.elo_version     = p_elo_version
          AND src.competition_id  = b.competition_id
          AND (src.home_team_id   = b.away_team_id OR src.away_team_id = b.away_team_id)
          AND src.match_date      < b.match_date
        ORDER BY src.match_date DESC, src.match_id DESC
        LIMIT 5
      ) s
    ) lf
  ),

  -- Rolling stats L5: home team
  home_stats AS (
    SELECT
      b.match_id,
      ls.cnt                                                AS hs_cnt,
      ls.shots                                              AS hs_shots,
      ls.sot                                                AS hs_sot,
      ls.corn                                               AS hs_corn,
      ls.cards                                              AS hs_cards
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                   AS cnt,
        AVG(ms.total_shots::numeric)                        AS shots,
        AVG(ms.shots_on_goal::numeric)                      AS sot,
        AVG(ms.corner_kicks::numeric)                       AS corn,
        AVG((COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0)*3)::numeric) AS cards
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
        ON ms.match_id  = ranked.mid
       AND ms.team_id   = b.home_team_id
       AND ms.half      = 'FT'
       AND ms.total_shots IS NOT NULL
    ) ls
  ),

  -- Rolling stats L5: away team
  away_stats AS (
    SELECT
      b.match_id,
      ls.cnt                                                AS as_cnt,
      ls.shots                                              AS as_shots,
      ls.sot                                                AS as_sot,
      ls.corn                                               AS as_corn,
      ls.cards                                              AS as_cards
    FROM base b
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)::integer                                   AS cnt,
        AVG(ms.total_shots::numeric)                        AS shots,
        AVG(ms.shots_on_goal::numeric)                      AS sot,
        AVG(ms.corner_kicks::numeric)                       AS corn,
        AVG((COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0)*3)::numeric) AS cards
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
        ON ms.match_id  = ranked.mid
       AND ms.team_id   = b.away_team_id
       AND ms.half      = 'FT'
       AND ms.total_shots IS NOT NULL
    ) ls
  ),

  -- Assemble all features
  assembled AS (
    SELECT
      b.match_id,
      b.elo_version,
      p_feature_version                                     AS feature_version,
      b.competition_id,
      b.competition_name,
      b.season_label,
      b.match_date,
      b.home_team_id,
      b.away_team_id,
      b.home_score_ft,
      b.away_score_ft,
      b.result_1x2,
      b.pre_match_elo_home,
      b.pre_match_elo_away,
      b.pre_match_elo_home - b.pre_match_elo_away          AS elo_gap_home,
      b.expected_home_elo,
      b.expected_away_elo,
      b.data_quality_tier,

      -- Form
      hf.hf_cnt, hf.hf_pts, hf.hf_gf, hf.hf_ga,
      hf.hf_cs, hf.hf_sc, hf.hf_con,
      af.af_cnt, af.af_pts, af.af_gf, af.af_ga,
      af.af_cs, af.af_sc, af.af_con,

      -- Stats
      hs.hs_cnt, hs.hs_shots, hs.hs_sot, hs.hs_corn, hs.hs_cards,
      as2.as_cnt, as2.as_shots, as2.as_sot, as2.as_corn, as2.as_cards,

      -- Derived indices
      CASE WHEN hs.hs_cnt > 0
        THEN (COALESCE(hs.hs_sot,0)*2 + COALESCE(hs.hs_shots,0)) / 10.0
        ELSE NULL END                                       AS atk_h,
      CASE WHEN as2.as_cnt > 0
        THEN (COALESCE(as2.as_sot,0)*2 + COALESCE(as2.as_shots,0)) / 10.0
        ELSE NULL END                                       AS atk_a,
      CASE WHEN hf.hf_cnt > 0
        THEN 1.0 / (1.0 + COALESCE(hf.hf_ga, 2.0))
        ELSE NULL END                                       AS def_h,
      CASE WHEN af.af_cnt > 0
        THEN 1.0 / (1.0 + COALESCE(af.af_ga, 2.0))
        ELSE NULL END                                       AS def_a,

      -- Coverage flags
      (b.pre_match_elo_home IS NOT NULL AND b.pre_match_elo_away IS NOT NULL) AS has_elo,
      (hf.hf_cnt >= 1 AND af.af_cnt >= 1)                  AS has_form,
      (hs.hs_cnt >= 1 AND as2.as_cnt >= 1)                  AS has_stats
    FROM base b
    LEFT JOIN home_form  hf  ON hf.match_id  = b.match_id
    LEFT JOIN away_form  af  ON af.match_id  = b.match_id
    LEFT JOIN home_stats hs  ON hs.match_id  = b.match_id
    LEFT JOIN away_stats as2 ON as2.match_id = b.match_id
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
    a.match_id, a.elo_version, a.feature_version,
    a.competition_id, a.competition_name, a.season_label, a.match_date,
    a.home_team_id, a.away_team_id,
    a.pre_match_elo_home, a.pre_match_elo_away, ROUND(a.elo_gap_home,4),
    a.expected_home_elo, a.expected_away_elo,
    ROUND(a.hf_pts,4), ROUND(a.af_pts,4),
    ROUND(COALESCE(a.hf_gf,0)-COALESCE(a.hf_ga,0),4),
    ROUND(COALESCE(a.af_gf,0)-COALESCE(a.af_ga,0),4),
    ROUND(a.hf_gf,4), ROUND(a.af_gf,4),
    ROUND(a.hf_ga,4), ROUND(a.af_ga,4),
    ROUND(a.hf_cs,4), ROUND(a.af_cs,4),
    ROUND(a.hf_sc,4), ROUND(a.af_sc,4),
    ROUND(a.hf_con,4), ROUND(a.af_con,4),
    ROUND(a.hs_shots,4), ROUND(a.as_shots,4),
    ROUND(a.hs_sot,4),   ROUND(a.as_sot,4),
    ROUND(a.hs_corn,4),  ROUND(a.as_corn,4),
    ROUND(a.hs_cards,4), ROUND(a.as_cards,4),
    ROUND(a.atk_h,4),    ROUND(a.atk_a,4),
    ROUND(a.def_h,6),    ROUND(a.def_a,6),
    ROUND(COALESCE(a.hf_pts,0)-COALESCE(a.af_pts,0),4),
    ROUND(COALESCE(a.atk_h,0)-COALESCE(a.atk_a,0),4),
    ROUND(COALESCE(a.def_h,0)-COALESCE(a.def_a,0),6),
    1, a.data_quality_tier,
    a.has_elo, a.has_form, a.has_stats,
    CASE
      WHEN a.has_elo AND a.has_form AND a.has_stats THEN 'elo_form_stats'
      WHEN a.has_elo AND a.has_form                 THEN 'elo_form'
      WHEN a.has_elo                                THEN 'elo_only'
      ELSE 'none'
    END,
    a.hf_cnt::smallint, a.af_cnt::smallint,
    a.result_1x2, a.home_score_ft, a.away_score_ft
  FROM assembled a
  ON CONFLICT (match_id, elo_version) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT
    SUM(CASE WHEN feature_quality_tier='elo_only'      THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form'      THEN 1 ELSE 0 END),
    SUM(CASE WHEN feature_quality_tier='elo_form_stats' THEN 1 ELSE 0 END)
  INTO v_elo_only, v_elo_form, v_elo_form_stats
  FROM model_lab.match_feature_matrix_v2
  WHERE elo_version     = p_elo_version
    AND feature_version = p_feature_version
    AND competition_name = p_competition_name;

  RETURN QUERY SELECT
    p_competition_name::text,
    v_inserted, v_skipped,
    v_elo_only, v_elo_form, v_elo_form_stats;

END;
$$;

GRANT SELECT ON model_lab.match_feature_matrix_v2 TO authenticated;
