
-- ============================================================
-- Phase 6: Lineup recheck schedule SQL function + cron jobs
-- ============================================================

-- Unique constraint for lineup checks (needed for ON CONFLICT)
ALTER TABLE wc2026_lineup_checks
  DROP CONSTRAINT IF EXISTS uq_lineup_checks_fixture_type;

ALTER TABLE wc2026_lineup_checks
  ADD CONSTRAINT uq_lineup_checks_fixture_type
  UNIQUE (fixture_id, check_type);

-- Function: schedule lineup checks for all upcoming WC2026 fixtures
CREATE OR REPLACE FUNCTION public.wc2026_schedule_lineup_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixture   record;
  v_kickoff   timestamptz;
  v_inserted  integer := 0;
  v_total     integer := 0;
BEGIN
  FOR v_fixture IN
    SELECT id, match_date, match_number
    FROM wc2026_fixtures
    WHERE match_date >= now()
    ORDER BY match_date
  LOOP
    v_kickoff := v_fixture.match_date;
    v_total   := v_total + 1;

    INSERT INTO wc2026_lineup_checks
      (fixture_id, check_type, scheduled_for, status, provider)
    VALUES
      (v_fixture.id, 'six_hours',        v_kickoff - interval '6 hours',   'pending', 'api_football'),
      (v_fixture.id, 'three_hours',       v_kickoff - interval '3 hours',   'pending', 'api_football'),
      (v_fixture.id, 'fortyfive_minutes', v_kickoff - interval '45 minutes','pending', 'api_football'),
      (v_fixture.id, 'fifteen_minutes',   v_kickoff - interval '15 minutes','pending', 'api_football')
    ON CONFLICT (fixture_id, check_type) DO NOTHING;

    v_inserted := v_inserted + 4;
  END LOOP;

  RETURN jsonb_build_object(
    'status',           'ok',
    'fixtures_scanned', v_total,
    'checks_inserted',  v_inserted
  );
END;
$$;

-- Function: execute due lineup checks (called by cron every 15 min)
CREATE OR REPLACE FUNCTION public.wc2026_run_due_lineup_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check     record;
  v_processed integer := 0;
  v_failed    integer := 0;
  v_fn_url    text;
BEGIN
  v_fn_url := current_setting('app.supabase_url', true)
    || '/functions/v1/sync-wc2026-squads-lineups';

  FOR v_check IN
    SELECT id, fixture_id, check_type
    FROM wc2026_lineup_checks
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT 5
  LOOP
    UPDATE wc2026_lineup_checks
    SET status = 'running', executed_at = now()
    WHERE id = v_check.id;

    BEGIN
      IF v_fn_url != '/functions/v1/sync-wc2026-squads-lineups' THEN
        PERFORM net.http_post(
          url     := v_fn_url,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
          ),
          body    := jsonb_build_object(
            'mode',       'sync_fixture_lineup',
            'fixture_id', v_check.fixture_id::text
          )
        );
      END IF;

      UPDATE wc2026_lineup_checks
      SET status           = 'done',
          raw_summary_json = jsonb_build_object(
            'check_type',  v_check.check_type,
            'completed_at', now()::text
          )
      WHERE id = v_check.id;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE wc2026_lineup_checks
      SET status           = 'failed',
          raw_summary_json = jsonb_build_object('error', SQLERRM)
      WHERE id = v_check.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'run_at',    now()::text
  );
END;
$$;

-- Public RPC wrapper
CREATE OR REPLACE FUNCTION public.rpc_schedule_wc2026_lineup_checks()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.wc2026_schedule_lineup_checks();
$$;

GRANT EXECUTE ON FUNCTION public.rpc_schedule_wc2026_lineup_checks() TO authenticated;

-- Schedule: run due checks every 15 minutes
SELECT cron.schedule(
  'wc2026-run-due-lineup-checks',
  '*/15 * * * *',
  $$SELECT public.wc2026_run_due_lineup_checks();$$
);

-- Bootstrap: schedule checks for all already-upcoming fixtures
SELECT public.wc2026_schedule_lineup_checks();
