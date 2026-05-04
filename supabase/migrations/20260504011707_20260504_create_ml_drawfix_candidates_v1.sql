/*
  # Create ml_populate_calibration_drawfix_candidates_v1

  ## Purpose
  Tests 4 draw-calibrated candidate parameter sets against the collapsed-draw
  baseline (heuristic_softmax_v1). Fixes two root causes:
    1. draw_diff_penalty was 0.40 — far too aggressive, collapsed draw to ~0%
    2. home_advantage was +0.25 — too high, inflated predicted_home_rate to ~66%

  ## Candidates
  - heuristic_drawfix_v2a: home_adv=0.08, draw_boost=0.30, diff_pen=0.12, close_bonus=0.10, temp=1.40
  - heuristic_drawfix_v2b: home_adv=0.10, draw_boost=0.38, diff_pen=0.10, close_bonus=0.12, temp=1.60
  - heuristic_drawfix_v2c: home_adv=0.05, draw_boost=0.34, diff_pen=0.08, close_bonus=0.15, temp=1.70
  - heuristic_drawfix_v2d: home_adv=0.12, draw_boost=0.32, diff_pen=0.15, close_bonus=0.08, temp=1.50

  ## Rules
  - Reads ONLY from model_lab.prematch_feature_matrix_snapshot_v1
  - Does NOT touch heuristic_softmax_v1
  - Does NOT touch public schema
  - Cold-start prior: H=0.4476, D=0.2663, A=0.2861
*/

CREATE OR REPLACE FUNCTION model_lab.ml_populate_calibration_drawfix_candidates_v1()
RETURNS TABLE (
  run_key       text,
  rows_deleted  integer,
  rows_inserted integer,
  cold_start    integer,
  bad_probs     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_keys text[] := ARRAY[
    'heuristic_drawfix_v2a',
    'heuristic_drawfix_v2b',
    'heuristic_drawfix_v2c',
    'heuristic_drawfix_v2d'
  ];
  v_key         text;
  v_deleted     integer;
  v_inserted    integer;
  v_cold        integer;
  v_bad         integer;
  -- candidate params
  v_home_adv    numeric;
  v_draw_boost  numeric;
  v_diff_pen    numeric;
  v_close_bonus numeric;
  v_temp        numeric;
BEGIN
  FOREACH v_key IN ARRAY v_keys LOOP

    -- assign per-candidate parameters
    CASE v_key
      WHEN 'heuristic_drawfix_v2a' THEN
        v_home_adv := 0.08; v_draw_boost := 0.30;
        v_diff_pen := 0.12; v_close_bonus := 0.10; v_temp := 1.40;
      WHEN 'heuristic_drawfix_v2b' THEN
        v_home_adv := 0.10; v_draw_boost := 0.38;
        v_diff_pen := 0.10; v_close_bonus := 0.12; v_temp := 1.60;
      WHEN 'heuristic_drawfix_v2c' THEN
        v_home_adv := 0.05; v_draw_boost := 0.34;
        v_diff_pen := 0.08; v_close_bonus := 0.15; v_temp := 1.70;
      WHEN 'heuristic_drawfix_v2d' THEN
        v_home_adv := 0.12; v_draw_boost := 0.32;
        v_diff_pen := 0.15; v_close_bonus := 0.08; v_temp := 1.50;
      ELSE CONTINUE;
    END CASE;

    -- delete existing run
    DELETE FROM model_lab.calibration_predictions_v1
    WHERE calibration_predictions_v1.run_key = v_key;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- insert candidate predictions
    INSERT INTO model_lab.calibration_predictions_v1 (
      run_key, match_id, split_label, match_date, competition_id, competition_name,
      season_label, actual_result_1x2, p_home, p_draw, p_away,
      predicted_result_1x2, confidence, leakage_check_passed,
      feature_quality_score, model_notes
    )
    WITH base AS (
      SELECT
        snap.match_id,
        snap.split_label,
        snap.match_date,
        snap.competition_id,
        snap.competition_name,
        snap.season_label,
        snap.actual_result_1x2,
        snap.leakage_check_passed,
        snap.data_quality_tier,
        -- cold-start flag
        CASE
          WHEN NOT COALESCE(snap.leakage_check_passed, false)
            OR COALESCE(snap.home_matches_played_l5, 0) = 0
            OR COALESCE(snap.away_matches_played_l5, 0) = 0
          THEN true ELSE false
        END AS is_cold_start,
        -- home raw score
        COALESCE(snap.home_form_l5, 0)         * 0.35
        + COALESCE(snap.home_goal_diff_avg_l5, 0) * 0.25
        + COALESCE(snap.home_attack_index_l5, 0)  * 0.20
        - COALESCE(snap.away_attack_index_l5, 0)  * 0.10
        - COALESCE(snap.home_discipline_risk_l5, 0) * 0.10
        + v_home_adv AS home_raw,
        -- away raw score
        COALESCE(snap.away_form_l5, 0)         * 0.35
        + COALESCE(snap.away_goal_diff_avg_l5, 0) * 0.25
        + COALESCE(snap.away_attack_index_l5, 0)  * 0.20
        - COALESCE(snap.home_attack_index_l5, 0)  * 0.10
        - COALESCE(snap.away_discipline_risk_l5, 0) * 0.10 AS away_raw
      FROM model_lab.prematch_feature_matrix_snapshot_v1 snap
    ),
    with_draw AS (
      SELECT
        *,
        ABS(home_raw - away_raw) AS strength_diff,
        -- draw raw: boosted prior, reduced penalty, closeness bonus
        ((home_raw + away_raw) / 2.0)
          + v_draw_boost
          - (ABS(home_raw - away_raw) * v_diff_pen)
          + (GREATEST(0.0, 1.0 - LEAST(ABS(home_raw - away_raw), 1.0)) * v_close_bonus
        ) AS draw_raw
      FROM base
    ),
    with_softmax AS (
      SELECT
        *,
        -- apply temperature scaling, cap at [-5, +5] before exp
        EXP(GREATEST(-5.0, LEAST(5.0, home_raw / v_temp))) AS e_home,
        EXP(GREATEST(-5.0, LEAST(5.0, draw_raw / v_temp))) AS e_draw,
        EXP(GREATEST(-5.0, LEAST(5.0, away_raw / v_temp))) AS e_away
      FROM with_draw
    ),
    with_probs AS (
      SELECT
        *,
        e_home / (e_home + e_draw + e_away) AS raw_p_home,
        e_draw / (e_home + e_draw + e_away) AS raw_p_draw,
        e_away / (e_home + e_draw + e_away) AS raw_p_away
      FROM with_softmax
    )
    SELECT
      v_key,
      match_id, split_label, match_date, competition_id, competition_name,
      season_label, actual_result_1x2,
      -- cold-start uses fixed prior; otherwise use computed softmax
      CASE WHEN is_cold_start THEN 0.4476 ELSE ROUND(raw_p_home::numeric, 6) END,
      CASE WHEN is_cold_start THEN 0.2663 ELSE ROUND(raw_p_draw::numeric, 6) END,
      CASE WHEN is_cold_start THEN 0.2861 ELSE ROUND(raw_p_away::numeric, 6) END,
      CASE
        WHEN is_cold_start THEN 'H'
        WHEN raw_p_home >= raw_p_draw AND raw_p_home >= raw_p_away THEN 'H'
        WHEN raw_p_draw >= raw_p_home AND raw_p_draw >= raw_p_away THEN 'D'
        ELSE 'A'
      END,
      CASE
        WHEN is_cold_start THEN 0.4476
        ELSE ROUND(GREATEST(raw_p_home, raw_p_draw, raw_p_away)::numeric, 6)
      END,
      leakage_check_passed,
      CASE data_quality_tier
        WHEN 'full_enriched'    THEN 1.0
        WHEN 'partial_enriched' THEN 0.5
        ELSE 0.1
      END,
      CASE WHEN is_cold_start THEN 'cold_start_prior' ELSE v_key END
    FROM with_probs;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- count cold-start rows
    SELECT COUNT(*) INTO v_cold
    FROM model_lab.calibration_predictions_v1 cp
    WHERE cp.run_key = v_key AND cp.model_notes = 'cold_start_prior';

    -- count bad probability rows
    SELECT COUNT(*) INTO v_bad
    FROM model_lab.calibration_predictions_v1 cp
    WHERE cp.run_key = v_key
      AND (
        cp.p_home IS NULL OR cp.p_draw IS NULL OR cp.p_away IS NULL
        OR cp.p_home < 0 OR cp.p_home > 1
        OR cp.p_draw < 0 OR cp.p_draw > 1
        OR cp.p_away < 0 OR cp.p_away > 1
        OR ABS((cp.p_home + cp.p_draw + cp.p_away) - 1) > 0.0001
      );

    RETURN NEXT;
    -- assign output row fields
    run_key      := v_key;
    rows_deleted := v_deleted;
    rows_inserted := v_inserted;
    cold_start   := v_cold;
    bad_probs    := v_bad;

  END LOOP;
END;
$$;
