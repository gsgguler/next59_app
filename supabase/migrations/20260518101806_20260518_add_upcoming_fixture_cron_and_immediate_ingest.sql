/*
  # Add Upcoming Fixture Ingest Cron + Immediate Trigger

  ## Summary
  The af-upcoming-fixtures edge function was never scheduled to run automatically.
  This migration:
  1. Creates invoke_upcoming_fixtures_fn() helper (mirrors invoke_backfill_fn pattern)
  2. Adds a daily cron at 06:00 UTC to fetch next 28 days of fixtures for all 7 leagues
  3. Adds a second cron at 18:00 UTC for same-day updates
  4. Immediately triggers a one-time fetch via pg_net to populate data right now

  ## Important
  - Uses service-role approach: body carries {next_days: 28}
  - function uses anon key (af-upcoming-fixtures has verify_jwt=false)
  - Cron uses pg_cron which is already enabled on this project
*/

-- ============================================================
-- 1. Create helper to invoke af-upcoming-fixtures
-- ============================================================
CREATE OR REPLACE FUNCTION public.invoke_upcoming_fixtures_fn(
  p_next_days int DEFAULT 28
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-upcoming-fixtures';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := jsonb_build_object('next_days', p_next_days)
  );
END;
$$;

-- ============================================================
-- 2. Schedule daily cron jobs for upcoming fixture ingestion
-- ============================================================

-- Morning sweep: fetch next 28 days at 06:00 UTC
SELECT cron.schedule(
  'ingest-upcoming-fixtures-morning',
  '0 6 * * *',
  'SELECT public.invoke_upcoming_fixtures_fn(28)'
);

-- Evening sweep: fetch next 7 days at 18:00 UTC (catches late schedule additions)
SELECT cron.schedule(
  'ingest-upcoming-fixtures-evening',
  '0 18 * * *',
  'SELECT public.invoke_upcoming_fixtures_fn(7)'
);

-- ============================================================
-- 3. Fire an immediate ingest right now (non-blocking via pg_net)
-- Fetches next 28 days across all 7 leagues
-- ============================================================
SELECT public.invoke_upcoming_fixtures_fn(28);
