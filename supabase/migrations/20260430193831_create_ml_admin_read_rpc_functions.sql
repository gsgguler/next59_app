/*
  # Admin-only RPC read functions for model_lab schema

  These functions expose model_lab data to authenticated admin users only.
  Each function verifies admin role before returning data.

  1. ml_get_model_lab_dashboard() — dashboard summary
  2. ml_get_backtest_runs(p_limit int) — list of runs
  3. ml_get_calibration_summary(p_run_id uuid, p_group_type text) — calibration rows
  4. ml_get_calibration_adjustments(p_run_id uuid) — adjustment candidates
  5. ml_get_match_prediction(p_match_id text) — prediction + evaluation for one match
  6. ml_get_error_analysis_rows(p_run_id uuid, p_error_category text, p_grade text, p_offset int, p_limit int) — paginated error rows
  7. ml_get_backtest_run_chunks_admin(p_run_id uuid) — chunks for a run

  Security: SECURITY DEFINER + admin check inside each function.
  Non-admin callers get an error jsonb.
*/

-- ── Helper: check admin ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ml_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._ml_assert_admin() TO authenticated;

-- ── 1. ml_get_model_lab_dashboard ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_model_lab_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_active_model jsonb;
  v_run_counts   jsonb;
  v_latest_runs  jsonb;
  v_archive_count bigint;
BEGIN
  PERFORM public._ml_assert_admin();

  -- Active model version
  SELECT row_to_json(mv) INTO v_active_model
  FROM model_lab.model_versions mv
  WHERE mv.is_active = true
  LIMIT 1;

  -- Run counts by status
  SELECT jsonb_object_agg(run_status, cnt)
  INTO v_run_counts
  FROM (
    SELECT run_status, COUNT(*) as cnt
    FROM model_lab.backtest_runs
    GROUP BY run_status
  ) sub;

  -- Latest 8 runs
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
  INTO v_latest_runs
  FROM (
    SELECT * FROM model_lab.backtest_runs
    ORDER BY created_at DESC
    LIMIT 8
  ) r;

  -- Archive count
  SELECT COUNT(*) INTO v_archive_count FROM public.v_historical_match_archive;

  RETURN jsonb_build_object(
    'active_model', v_active_model,
    'run_counts', COALESCE(v_run_counts, '{}'::jsonb),
    'latest_runs', COALESCE(v_latest_runs, '[]'::jsonb),
    'archive_count', v_archive_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_model_lab_dashboard() TO authenticated;

-- ── 2. ml_get_backtest_runs ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_backtest_runs(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
  INTO v_result
  FROM (
    SELECT * FROM model_lab.backtest_runs
    ORDER BY created_at DESC
    LIMIT p_limit
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_backtest_runs(int) TO authenticated;

-- ── 3. ml_get_calibration_summary ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_calibration_summary(
  p_run_id uuid DEFAULT NULL,
  p_group_type text DEFAULT 'overall'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT jsonb_agg(row_to_json(cs) ORDER BY cs.sample_size DESC)
  INTO v_result
  FROM model_lab.calibration_summary cs
  WHERE (p_run_id IS NULL OR cs.backtest_run_id = p_run_id)
    AND cs.group_type = p_group_type;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_calibration_summary(uuid, text) TO authenticated;

-- ── 4. ml_get_calibration_adjustments ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_calibration_adjustments(
  p_run_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT jsonb_agg(row_to_json(ca) ORDER BY ca.confidence DESC NULLS LAST)
  INTO v_result
  FROM model_lab.calibration_adjustments ca
  WHERE (p_run_id IS NULL OR ca.source_backtest_run_id = p_run_id);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_calibration_adjustments(uuid) TO authenticated;

-- ── 5. ml_get_match_prediction ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_match_prediction(p_match_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_pred jsonb;
  v_eval jsonb;
  v_pred_id uuid;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT row_to_json(p), p.id
  INTO v_pred, v_pred_id
  FROM model_lab.match_model_predictions p
  WHERE p.match_id = p_match_id
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pred_id IS NOT NULL THEN
    SELECT row_to_json(e)
    INTO v_eval
    FROM model_lab.match_model_evaluations e
    WHERE e.prediction_id = v_pred_id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'prediction', v_pred,
    'evaluation', v_eval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_match_prediction(text) TO authenticated;

-- ── 6. ml_get_error_analysis_rows ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_error_analysis_rows(
  p_run_id        uuid DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_grade         text DEFAULT NULL,
  p_offset        int  DEFAULT 0,
  p_limit         int  DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_rows  jsonb;
  v_total bigint;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT COUNT(*)
  INTO v_total
  FROM model_lab.match_model_evaluations e
  JOIN model_lab.match_model_predictions p ON p.id = e.prediction_id
  WHERE e.is_result_correct = false
    AND (p_run_id IS NULL OR p.backtest_run_id = p_run_id)
    AND (p_error_category IS NULL OR e.error_category = p_error_category)
    AND (p_grade IS NULL OR p.confidence_grade = p_grade);

  SELECT jsonb_agg(row_to_json(sub) ORDER BY sub.brier_1x2 DESC)
  INTO v_rows
  FROM (
    SELECT
      e.id, e.match_id, e.actual_result, e.is_result_correct,
      e.brier_1x2, e.log_loss_1x2,
      e.over_2_5_correct, e.btts_correct,
      e.error_category, e.error_notes,
      p.match_date, p.competition_name, p.season_label,
      p.home_team_name, p.away_team_name,
      p.predicted_result, p.confidence_score, p.confidence_grade
    FROM model_lab.match_model_evaluations e
    JOIN model_lab.match_model_predictions p ON p.id = e.prediction_id
    WHERE e.is_result_correct = false
      AND (p_run_id IS NULL OR p.backtest_run_id = p_run_id)
      AND (p_error_category IS NULL OR e.error_category = p_error_category)
      AND (p_grade IS NULL OR p.confidence_grade = p_grade)
    ORDER BY e.brier_1x2 DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_error_analysis_rows(uuid, text, text, int, int) TO authenticated;

-- ── 7. ml_get_backtest_run_chunks_admin ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_backtest_run_chunks_admin(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT jsonb_agg(row_to_json(c) ORDER BY c.chunk_index)
  INTO v_result
  FROM model_lab.backtest_run_chunks c
  WHERE c.backtest_run_id = p_run_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_backtest_run_chunks_admin(uuid) TO authenticated;
