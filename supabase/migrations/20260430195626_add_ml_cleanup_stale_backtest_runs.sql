/*
  # Add ml_cleanup_stale_backtest_runs RPC

  ## Purpose
  Marks any backtest_runs row that has been stuck in 'running' status for more
  than 30 minutes as 'failed'. This handles crashed Edge Function invocations
  that never wrote a final status update.

  ## Rules
  - Only affects rows where run_status = 'running'
  - Only affects rows where created_at < now() - interval '30 minutes'
  - Sets run_status = 'failed', completed_at = now()
  - Sets error_message = 'Marked failed after stale run cleanup.'
  - Never touches predictions or evaluations
  - Never deletes any rows

  ## Security
  - SECURITY DEFINER + admin check via _ml_assert_admin()
  - Returns count of rows updated + their ids for audit log display
*/

CREATE OR REPLACE FUNCTION public.ml_cleanup_stale_backtest_runs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_updated_ids uuid[];
  v_count       int;
BEGIN
  PERFORM public._ml_assert_admin();

  UPDATE model_lab.backtest_runs
  SET
    run_status    = 'failed',
    completed_at  = now(),
    error_message = 'Marked failed after stale run cleanup.'
  WHERE run_status = 'running'
    AND created_at < now() - interval '30 minutes'
  RETURNING id INTO v_updated_ids;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cleaned_up', v_count,
    'ids', COALESCE(to_jsonb(v_updated_ids), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_cleanup_stale_backtest_runs() TO authenticated;
