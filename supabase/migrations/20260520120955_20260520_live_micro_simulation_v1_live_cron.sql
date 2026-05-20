/*
  Phase 6: Live Cron + Invoke Wrapper for Live Micro-Simulation
  Creates invoke_live_micro_simulation() and schedules every 5 minutes.
  Finds live fixtures from shared.af_fixtures_raw status field and calls build_live_micro_windows.
  Per-fixture isolation, max 20 live fixtures, does not publish to public.
*/

CREATE OR REPLACE FUNCTION public.invoke_live_micro_simulation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
DECLARE
  v_fixture_id    bigint;
  v_processed     integer := 0;
  v_windows_total integer := 0;
  v_errors        jsonb := '[]'::jsonb;
  v_result        jsonb;
  v_err_msg       text;
  r               record;
  v_live_statuses text[] := ARRAY['1H','HT','2H','ET','BT','P','SUSP','INT'];
BEGIN
  FOR r IN
    SELECT DISTINCT
      (raw_response -> 'fixture' ->> 'id')::bigint AS fixture_id
    FROM shared.af_fixtures_raw
    WHERE
      raw_response -> 'fixture' -> 'status' ->> 'short' = ANY(v_live_statuses)
      AND fetched_at > now() - interval '3 hours'
    ORDER BY 1
    LIMIT 20
  LOOP
    v_fixture_id := r.fixture_id;
    IF v_fixture_id IS NULL THEN CONTINUE; END IF;

    BEGIN
      v_result := model_lab.build_live_micro_windows(v_fixture_id);
      v_windows_total := v_windows_total
        + COALESCE((v_result->>'windows_inserted')::integer, 0)
        + COALESCE((v_result->>'windows_updated')::integer, 0);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      v_errors := v_errors || jsonb_build_object(
        'fixture_id', v_fixture_id,
        'error', LEFT(v_err_msg, 200)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'live_fixtures_processed', v_processed,
    'windows_touched',         v_windows_total,
    'errors',                  v_errors,
    'invoked_at',              now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoke_live_micro_simulation() TO authenticated;

SELECT cron.schedule(
  'live-micro-sim-5min',
  '*/5 * * * *',
  'SELECT public.invoke_live_micro_simulation()'
);
