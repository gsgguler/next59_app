/*
  # pg_cron: Parallel backfill jobs + auto-stop guard

  4 backfill jobs run every minute in parallel via pg_net HTTP calls to
  the deployed edge functions. Each processes up to 50 unfetched fixtures
  per invocation, with built-in response_hash deduplication.

  1 guard job runs every 5 minutes:
    - Reads get_backfill_remaining_counts()
    - When ALL 4 endpoints return 0, unschedules all 5 jobs

  Rate budget at 200ms/fixture: 4 × 50 × 5 req/s = 200 req/min max.
  Ultra plan limit: 450 req/min — 44% utilization, safe buffer.

  Note: Authorization header uses the service role key stored in vault.
  If vault key is not set, cron jobs will get 401s but won't error out —
  manually invoke the functions to bootstrap until vault is configured.
*/

-- ── Helper function: invoke one backfill edge function ───────────────────────
CREATE OR REPLACE FUNCTION public.invoke_backfill_fn(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url     text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/' || p_slug;
  v_key     text;
BEGIN
  -- Retrieve service role key from vault (key name: 'service_role_key')
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, '')
    ),
    body    := '{"chunk_size":50}'::jsonb
  );
END;
$$;

-- ── Helper function: auto-stop guard ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_auto_stop_guard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_row   RECORD;
BEGIN
  FOR v_row IN SELECT endpoint, remaining FROM public.get_backfill_remaining_counts() LOOP
    v_total := v_total + v_row.remaining;
  END LOOP;

  IF v_total = 0 THEN
    -- All done — unschedule all backfill jobs + this guard
    PERFORM cron.unschedule(j.jobname)
    FROM cron.job j
    WHERE j.jobname IN (
      'backfill-lineups', 'backfill-statistics',
      'backfill-events',  'backfill-playerstats',
      'backfill-auto-stop'
    );

    INSERT INTO public.ingestion_log (event_type, event_payload)
    VALUES ('backfill_complete', jsonb_build_object(
      'completed_at', now(),
      'message', 'All 4 endpoints at 100% coverage for 7 leagues × 5 seasons'
    ))
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ── Schedule the 4 backfill jobs ─────────────────────────────────────────────
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('backfill-lineups','backfill-statistics','backfill-events','backfill-playerstats','backfill-auto-stop');

SELECT cron.schedule('backfill-lineups',     '* * * * *', 'SELECT public.invoke_backfill_fn(''af-lineup-backfill'')');
SELECT cron.schedule('backfill-statistics',  '* * * * *', 'SELECT public.invoke_backfill_fn(''af-statistics-backfill'')');
SELECT cron.schedule('backfill-events',      '* * * * *', 'SELECT public.invoke_backfill_fn(''af-events-backfill'')');
SELECT cron.schedule('backfill-playerstats', '* * * * *', 'SELECT public.invoke_backfill_fn(''af-playerstats-backfill'')');

-- ── Schedule the auto-stop guard (every 5 min) ───────────────────────────────
SELECT cron.schedule('backfill-auto-stop', '*/5 * * * *', 'SELECT public.backfill_auto_stop_guard()');
