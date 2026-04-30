/*
  # Add RPC bridge functions for backtest_run_chunks

  1. New Functions
    - `ml_insert_backtest_run_chunks(p_run_id, p_chunks jsonb)` — bulk inserts chunk rows
    - `ml_update_backtest_run_chunk(p_run_id, p_chunk_index, p_updates jsonb)` — updates a single chunk
    - `ml_get_backtest_run_chunks(p_run_id)` — fetches all chunks for a run
    - `ml_reset_failed_chunks(p_run_id)` — resets failed→pending for retry

  2. Security
    - All SECURITY DEFINER, SET search_path = model_lab, public
    - Callable by authenticated + service_role
*/

-- ── ml_insert_backtest_run_chunks ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_insert_backtest_run_chunks(
  p_run_id uuid,
  p_chunks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_chunk jsonb;
  v_inserted int := 0;
BEGIN
  FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_chunks) LOOP
    INSERT INTO model_lab.backtest_run_chunks (
      backtest_run_id, chunk_index, offset_start, offset_end, limit_size, status
    ) VALUES (
      p_run_id,
      (v_chunk->>'chunk_index')::int,
      (v_chunk->>'offset_start')::int,
      (v_chunk->>'offset_end')::int,
      (v_chunk->>'limit_size')::int,
      'pending'
    );
    v_inserted := v_inserted + 1;
  END LOOP;
  RETURN jsonb_build_object('chunks_created', v_inserted, 'run_id', p_run_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_insert_backtest_run_chunks(uuid, jsonb) TO authenticated, service_role;

-- ── ml_update_backtest_run_chunk ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_update_backtest_run_chunk(
  p_run_id uuid,
  p_chunk_index int,
  p_status text DEFAULT NULL,
  p_processed_matches int DEFAULT NULL,
  p_failed_matches int DEFAULT NULL,
  p_average_brier_1x2 double precision DEFAULT NULL,
  p_average_log_loss_1x2 double precision DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_started_at timestamptz DEFAULT NULL,
  p_completed_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  UPDATE model_lab.backtest_run_chunks SET
    status               = COALESCE(p_status, status),
    processed_matches    = COALESCE(p_processed_matches, processed_matches),
    failed_matches       = COALESCE(p_failed_matches, failed_matches),
    average_brier_1x2    = COALESCE(p_average_brier_1x2, average_brier_1x2),
    average_log_loss_1x2 = COALESCE(p_average_log_loss_1x2, average_log_loss_1x2),
    error_message        = COALESCE(p_error_message, error_message),
    started_at           = COALESCE(p_started_at, started_at),
    completed_at         = COALESCE(p_completed_at, completed_at)
  WHERE backtest_run_id = p_run_id AND chunk_index = p_chunk_index;
  RETURN jsonb_build_object('updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_update_backtest_run_chunk(uuid, int, text, int, int, double precision, double precision, text, timestamptz, timestamptz) TO authenticated, service_role;

-- ── ml_get_backtest_run_chunks ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_get_backtest_run_chunks(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(c) ORDER BY c.chunk_index)
  INTO v_result
  FROM model_lab.backtest_run_chunks c
  WHERE c.backtest_run_id = p_run_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_backtest_run_chunks(uuid) TO authenticated, service_role;

-- ── ml_reset_failed_chunks ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_reset_failed_chunks(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE model_lab.backtest_run_chunks
  SET status = 'pending', error_message = NULL
  WHERE backtest_run_id = p_run_id AND status = 'failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('reset_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_reset_failed_chunks(uuid) TO authenticated, service_role;
