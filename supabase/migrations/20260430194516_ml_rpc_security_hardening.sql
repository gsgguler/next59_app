/*
  # Model Lab RPC Security Hardening

  ## Problem
  Three read functions (ml_get_backtest_run, ml_get_backtest_run_chunks,
  ml_get_model_version) are SECURITY DEFINER but have no admin check —
  any authenticated or anonymous user could call them and read model_lab data.

  All write/compute functions (ml_bulk_*, ml_insert_*, ml_update_*,
  ml_compute_*, ml_generate_*, ml_reset_*, ml_upsert_*) are intended only
  for Edge Function / service_role use but have execute granted to anon and
  authenticated, which is unnecessarily broad.

  ## Changes

  1. Add _ml_assert_admin() to the three unguarded read functions.
  2. Revoke EXECUTE from anon and authenticated on all write/compute functions
     that are Edge Function / service_role only. service_role keeps access.

  ## Security posture after this migration

  Read functions (browser-callable):
    - ml_get_backtest_run           -> admin-guarded
    - ml_get_backtest_run_chunks    -> admin-guarded
    - ml_get_model_version          -> admin-guarded
    - ml_get_backtest_run_chunks_admin -> admin-guarded (already was)
    - ml_get_backtest_runs          -> admin-guarded (already was)
    - ml_get_calibration_adjustments -> admin-guarded (already was)
    - ml_get_calibration_summary    -> admin-guarded (already was)
    - ml_get_error_analysis_rows    -> admin-guarded (already was)
    - ml_get_match_prediction       -> admin-guarded (already was)
    - ml_get_model_lab_dashboard    -> admin-guarded (already was)

  Write/compute functions (Edge Function / service_role only):
    - ml_bulk_insert_evaluations    -> service_role only
    - ml_bulk_insert_predictions    -> service_role only
    - ml_bulk_upsert_snapshots      -> service_role only
    - ml_compute_calibration_summary -> service_role only
    - ml_generate_candidate_adjustments -> service_role only
    - ml_insert_backtest_run        -> service_role only
    - ml_insert_backtest_run_chunks -> service_role only
    - ml_insert_evaluation          -> service_role only
    - ml_insert_prediction          -> service_role only
    - ml_reset_failed_chunks        -> service_role only
    - ml_update_backtest_run        -> service_role only
    - ml_update_backtest_run_chunk  -> service_role only
    - ml_upsert_feature_snapshot    -> service_role only
*/

-- ── 1. Fix ml_get_backtest_run ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_backtest_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT row_to_json(r) INTO v_result
  FROM model_lab.backtest_runs r
  WHERE r.id = p_run_id;

  RETURN v_result;
END;
$$;

-- ── 2. Fix ml_get_backtest_run_chunks ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_backtest_run_chunks(p_run_id uuid)
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

-- ── 3. Fix ml_get_model_version ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_model_version(p_version_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result json;
BEGIN
  PERFORM public._ml_assert_admin();

  SELECT row_to_json(mv) INTO v_result
  FROM model_lab.model_versions mv
  WHERE mv.version_key = p_version_key
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- ── 4. Revoke anon+authenticated from write/compute functions ────────────────
-- These are called only by Edge Functions using service_role JWT.

REVOKE EXECUTE ON FUNCTION public.ml_bulk_insert_evaluations         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_bulk_insert_predictions          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_bulk_upsert_snapshots            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_compute_calibration_summary      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_generate_candidate_adjustments   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_insert_backtest_run              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_insert_backtest_run_chunks       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_insert_evaluation                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_insert_prediction                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_reset_failed_chunks              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_update_backtest_run              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_update_backtest_run_chunk        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ml_upsert_feature_snapshot          FROM anon, authenticated;
