/*
  # Result Sync + Auto Evaluation Crons

  Summary:
  Closes the autonomous pre-match loop with two recurring cron jobs.

  1. af-live-result-sync every 15 minutes — fetches finished match results
     from API-Football and writes into public.matches.
  2. evaluate-finished-predictions every 30 minutes — runs
     model_lab.evaluate_finished_prematch_predictions() (idempotent, pre-kickoff only).

  New Functions:
  - public.invoke_live_result_sync() — pg_net POST wrapper, mode=recent, 3h window.
  - public.invoke_eval_finished_predictions() — thin SQL wrapper for model_lab eval fn.

  New Cron Jobs:
  - result-sync-15min (every 15 min)
  - eval-predictions-30min (every 30 min)

  New Table:
  - model_lab.result_sync_runs — append-only sync health log.
    RLS: admin SELECT, service_role INSERT.
*/

-- ── 1. result_sync_runs log table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.result_sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at   timestamptz NOT NULL DEFAULT now(),
  mode           text NOT NULL DEFAULT 'recent',
  matches_found  integer,
  updated        integer,
  errors_json    jsonb DEFAULT '[]',
  http_status    integer,
  raw_response   text,
  duration_ms    integer
);

ALTER TABLE model_lab.result_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read result sync runs"
  ON model_lab.result_sync_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert result sync runs"
  ON model_lab.result_sync_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_result_sync_runs_triggered_at
  ON model_lab.result_sync_runs (triggered_at DESC);

-- ── 2. invoke_live_result_sync() ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_live_result_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-live-result-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := '{"mode":"recent","recent_hours":3}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_live_result_sync() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_live_result_sync() TO service_role;

-- ── 3. invoke_eval_finished_predictions() ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_eval_finished_predictions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  PERFORM model_lab.evaluate_finished_prematch_predictions();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_eval_finished_predictions: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_eval_finished_predictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_eval_finished_predictions() TO service_role;

-- ── 4. Register cron jobs ─────────────────────────────────────────────────────

SELECT cron.schedule(
  'result-sync-15min',
  '*/15 * * * *',
  'SELECT public.invoke_live_result_sync()'
);

SELECT cron.schedule(
  'eval-predictions-30min',
  '*/30 * * * *',
  'SELECT public.invoke_eval_finished_predictions()'
);
