/*
  # Drop and recreate ml_populate_calibration_drawfix_candidates_v1
  Return type changed (prefixed output column names). Must drop first.
*/

DROP FUNCTION IF EXISTS model_lab.ml_populate_calibration_drawfix_candidates_v1();

CREATE FUNCTION model_lab.ml_populate_calibration_drawfix_candidates_v1()
RETURNS TABLE (
  o_run_key       text,
  o_rows_deleted  integer,
  o_rows_inserted integer,
  o_cold_start    integer,
  o_bad_probs     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_keys        text[] := ARRAY[
    'heuristic_drawfix_v2a','heuristic_drawfix_v2b',
    'heuristic_drawfix_v2c','heuristic_drawfix_v2d'
  ];
  v_key         text;
  v_deleted     integer;
  v_inserted    integer;
  v_cold        integer;
  v_bad         integer;
  v_home_adv    numeric;
  v_draw_boost  numeric;
  v_diff_pen    numeric;
  v_close_bonus numeric;
  v_temp        numeric;
BEGIN
  FOREACH v_key IN ARRAY v_keys LOOP

    CASE v_key
      WHEN 'heuristic_drawfix_v2a' THEN
        v_home_adv:=0.08; v_draw_boost:=0.30; v_diff_pen:=0.12; v_close_bonus:=0.10; v_temp:=1.40;
      WHEN 'heuristic_drawfix_v2b' THEN
        v_home_adv:=0.10; v_draw_boost:=0.38; v_diff_pen:=0.10; v_close_bonus:=0.12; v_temp:=1.60;
      WHEN 'heuristic_drawfix_v2c' THEN
        v_home_adv:=0.05; v_draw_boost:=0.34; v_diff_pen:=0.08; v_close_bonus:=0.15; v_temp:=1.70;
      WHEN 'heuristic_drawfix_v2d' THEN
        v_home_adv:=0.12; v_draw_boost:=0.32; v_diff_pen:=0.15; v_close_bonus:=0.08; v_temp:=1.50;
      ELSE CONTINUE;
    END CASE;

    DELETE FROM model_lab.calibration_predictions_v1 cp WHERE cp.run_key = v_key;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO model_lab.calibration_predictions_v1 (
      run_key, match_id, split_label, match_date, competition_id, competition_name,
      season_label, actual_result_1x2, p_home, p_draw, p_away,
      predicted_result_1x2, confidence, leakage_check_passed,
      feature_quality_score, model_notes
    )
    WITH base AS (
      SELECT
        snap.match_id, snap.split_label, snap.match_date,
        snap.competition_id, snap.competition_name, snap.season_label,
        snap.actual_result_1x2, snap.leakage_check_passed, snap.data_quality_tier,
        CASE
          WHEN NOT COALESCE(snap.leakage_check_passed, false)
            OR COALESCE(snap.home_matches_played_l5, 0) = 0
            OR COALESCE(snap.away_matches_played_l5, 0) = 0
          THEN true ELSE false
        END AS is_cold_start,
        COALESCE(snap.home_form_l5,0)*0.35
          + COALESCE(snap.home_goal_diff_avg_l5,0)*0.25
          + COALESCE(snap.home_attack_index_l5,0)*0.20
          - COALESCE(snap.away_attack_index_l5,0)*0.10
          - COALESCE(snap.home_discipline_risk_l5,0)*0.10
          + v_home_adv AS home_raw,
        COALESCE(snap.away_form_l5,0)*0.35
          + COALESCE(snap.away_goal_diff_avg_l5,0)*0.25
          + COALESCE(snap.away_attack_index_l5,0)*0.20
          - COALESCE(snap.home_attack_index_l5,0)*0.10
          - COALESCE(snap.away_discipline_risk_l5,0)*0.10 AS away_raw
      FROM model_lab.prematch_feature_matrix_snapshot_v1 snap
    ),
    with_draw AS (
      SELECT *,
        ABS(home_raw - away_raw) AS strength_diff,
        ((home_raw + away_raw) / 2.0)
          + v_draw_boost
          - (ABS(home_raw - away_raw) * v_diff_pen)
          + (GREATEST(0.0, 1.0 - LEAST(ABS(home_raw - away_raw), 1.0)) * v_close_bonus)
        AS draw_raw
      FROM base
    ),
    with_exp AS (
      SELECT *,
        EXP(GREATEST(-5.0, LEAST(5.0, home_raw / v_temp))) AS e_home,
        EXP(GREATEST(-5.0, LEAST(5.0, draw_raw / v_temp))) AS e_draw,
        EXP(GREATEST(-5.0, LEAST(5.0, away_raw / v_temp))) AS e_away
      FROM with_draw
    ),
    final AS (
      SELECT *,
        e_home/(e_home+e_draw+e_away) AS rph,
        e_draw/(e_home+e_draw+e_away) AS rpd,
        e_away/(e_home+e_draw+e_away) AS rpa
      FROM with_exp
    )
    SELECT
      v_key, match_id, split_label, match_date, competition_id, competition_name,
      season_label, actual_result_1x2,
      CASE WHEN is_cold_start THEN 0.4476 ELSE ROUND(rph::numeric,6) END,
      CASE WHEN is_cold_start THEN 0.2663 ELSE ROUND(rpd::numeric,6) END,
      CASE WHEN is_cold_start THEN 0.2861 ELSE ROUND(rpa::numeric,6) END,
      CASE
        WHEN is_cold_start             THEN 'H'
        WHEN rph >= rpd AND rph >= rpa THEN 'H'
        WHEN rpd >= rph AND rpd >= rpa THEN 'D'
        ELSE 'A'
      END,
      CASE WHEN is_cold_start THEN 0.4476
           ELSE ROUND(GREATEST(rph,rpd,rpa)::numeric,6) END,
      leakage_check_passed,
      CASE data_quality_tier
        WHEN 'full_enriched'    THEN 1.0
        WHEN 'partial_enriched' THEN 0.5
        ELSE 0.1 END,
      CASE WHEN is_cold_start THEN 'cold_start_prior' ELSE v_key END
    FROM final;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT COUNT(*) INTO v_cold FROM model_lab.calibration_predictions_v1 cp
    WHERE cp.run_key = v_key AND cp.model_notes = 'cold_start_prior';

    SELECT COUNT(*) INTO v_bad FROM model_lab.calibration_predictions_v1 cp
    WHERE cp.run_key = v_key
      AND (cp.p_home IS NULL OR cp.p_draw IS NULL OR cp.p_away IS NULL
        OR cp.p_home<0 OR cp.p_home>1 OR cp.p_draw<0 OR cp.p_draw>1
        OR cp.p_away<0 OR cp.p_away>1
        OR ABS((cp.p_home+cp.p_draw+cp.p_away)-1) > 0.0001);

    o_run_key       := v_key;
    o_rows_deleted  := v_deleted;
    o_rows_inserted := v_inserted;
    o_cold_start    := v_cold;
    o_bad_probs     := v_bad;
    RETURN NEXT;

  END LOOP;
END;
$$;
