/*
  # Live Micro-Simulation V1 — Phase 5: Historical Replay Batch

  ## Purpose
  Creates `model_lab.run_micro_simulation_replay_batch(p_limit integer default 50)` which:
  - Finds completed matches that have event data but are not yet fully windowed
  - Calls build_live_micro_windows per fixture with per-fixture error isolation
  - Returns: processed, windows_created, windows_updated, errors, remaining_candidates

  ## Candidate Selection Criteria
  - Fixture has rows in api_football_fixture_events (at least 1 event)
  - Fixture is NOT already fully windowed (no live_micro_windows row with engine_version='micro_v1'
    covering window_start_minute=85, i.e., the last window — proxy for "complete run")
  - Limit capped at p_limit (default 50, hard cap 200)

  ## Safety
  - Per-fixture try/catch via nested exception block
  - Idempotent: build_live_micro_windows uses INSERT ... ON CONFLICT UPDATE
  - Does NOT touch any public-facing tables
  - Does NOT publish predictions
*/

CREATE OR REPLACE FUNCTION model_lab.run_micro_simulation_replay_batch(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_limit         integer := LEAST(GREATEST(p_limit, 1), 200);
  v_processed     integer := 0;
  v_windows_created integer := 0;
  v_windows_updated integer := 0;
  v_errors        jsonb := '[]'::jsonb;
  v_remaining     integer := 0;
  v_fixture_id    bigint;
  v_result        jsonb;
  v_err_msg       text;
  r               record;
BEGIN
  -- Count remaining candidates (for reporting)
  SELECT COUNT(DISTINCT e.api_football_fixture_id)
  INTO v_remaining
  FROM public.api_football_fixture_events e
  WHERE NOT EXISTS (
    SELECT 1 FROM model_lab.live_micro_windows w
    WHERE w.fixture_id = e.api_football_fixture_id
      AND w.window_start_minute = 85
      AND w.engine_version = 'micro_v1'
  );

  -- Process up to v_limit candidates
  FOR r IN
    SELECT DISTINCT e.api_football_fixture_id AS fixture_id
    FROM public.api_football_fixture_events e
    WHERE NOT EXISTS (
      SELECT 1 FROM model_lab.live_micro_windows w
      WHERE w.fixture_id = e.api_football_fixture_id
        AND w.window_start_minute = 85
        AND w.engine_version = 'micro_v1'
    )
    ORDER BY e.api_football_fixture_id
    LIMIT v_limit
  LOOP
    v_fixture_id := r.fixture_id;

    BEGIN
      -- Call the window builder
      v_result := model_lab.build_live_micro_windows(v_fixture_id);

      -- Accumulate counts
      v_windows_created := v_windows_created + COALESCE((v_result->>'windows_inserted')::integer, 0);
      v_windows_updated := v_windows_updated + COALESCE((v_result->>'windows_updated')::integer, 0);
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      v_errors := v_errors || jsonb_build_object(
        'fixture_id', v_fixture_id,
        'error', LEFT(v_err_msg, 200)
      );
    END;
  END LOOP;

  -- Remaining after this batch
  v_remaining := GREATEST(v_remaining - v_processed, 0);

  RETURN jsonb_build_object(
    'processed',        v_processed,
    'windows_created',  v_windows_created,
    'windows_updated',  v_windows_updated,
    'errors',           v_errors,
    'remaining_candidates', v_remaining,
    'engine_version',   'micro_v1'
  );
END;
$$;

-- Public admin wrapper (respects profiles.role = 'admin')
CREATE OR REPLACE FUNCTION public.admin_run_micro_replay_batch(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN model_lab.run_micro_simulation_replay_batch(p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.run_micro_simulation_replay_batch(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_micro_replay_batch(integer) TO authenticated;
