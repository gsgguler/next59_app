-- Brain Ensemble Cron Jobs — P4
--
-- Registers cron schedules for the 5 new brain ensemble edge functions.
-- Uses SQL helper functions that invoke each function via pg_net HTTP call,
-- consistent with the existing invoke_* pattern in this project.
--
-- Schedules:
--   brain-prematch-scheduler-hourly  : 0 * * * *   (every hour)
--   brain-live-5min-revision         : every 5 min
--   brain-result-validator-15min     : every 15 min
--   brain-meta-learner-check-6h      : 0 every 6h
--   brain-perf-report-daily-2am      : 0 2 * * *   (nightly full retrain)

-- ─── Invoke helper functions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_prematch_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/prematch-scheduler',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"triggered_by":"cron"}'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_live_5min_revision()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/live-5min-revision',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_match_result_validator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/match-result-validator',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_meta_learner_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/meta-learner-trainer',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"mode":"check"}'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_meta_learner_retrain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url', true) || '/functions/v1/meta-learner-trainer',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"mode":"full_retrain"}'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ─── Cron schedules ───────────────────────────────────────────────────────────

SELECT cron.schedule(
  'brain-prematch-scheduler-hourly',
  '0 * * * *',
  'SELECT public.invoke_prematch_scheduler()'
);

SELECT cron.schedule(
  'brain-live-5min-revision',
  '*/5 * * * *',
  'SELECT public.invoke_live_5min_revision()'
);

SELECT cron.schedule(
  'brain-result-validator-15min',
  '*/15 * * * *',
  'SELECT public.invoke_match_result_validator()'
);

SELECT cron.schedule(
  'brain-meta-learner-check-6h',
  '0 */6 * * *',
  'SELECT public.invoke_meta_learner_check()'
);

SELECT cron.schedule(
  'brain-perf-report-daily-2am',
  '0 2 * * *',
  'SELECT public.invoke_meta_learner_retrain()'
);
