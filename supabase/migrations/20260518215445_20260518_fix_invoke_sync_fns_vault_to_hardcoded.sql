/*
  # Fix invoke_standings_sync, invoke_injuries_sync, invoke_team_statistics_sync, invoke_venues_sync

  ## Root Cause
  All four functions attempt to read from vault.decrypted_secrets using secret names
  'SUPABASE_URL' and 'SUPABASE_SERVICE_ROLE_KEY' — neither of which exist in vault.
  Only 'next59_service_role_key' is present in vault.

  Additionally, invoke_standings_sync has `Deno.env.get('SUPABASE_URL')` as a
  PL/pgSQL variable initializer — this is JavaScript syntax that PostgreSQL rejects
  at parse time with "cross-database references are not implemented".

  ## Fix
  Replace vault lookups with the same hardcoded URL + anon key pattern used by all
  other working invoke_* functions (invoke_backfill_fn, invoke_live_result_sync, etc.).

  ## What is NOT changed
  - Function signatures (arguments, return types)
  - Edge function slugs called
  - Cron schedules
  - Any other logic

  ## Functions fixed (4)
  1. public.invoke_standings_sync(integer)
  2. public.invoke_injuries_sync(integer)
  3. public.invoke_team_statistics_sync(integer)
  4. public.invoke_venues_sync(integer)
*/

-- Shared constants (same values used by all working invoke_* functions)
-- URL: https://jsordrrshzivxayryryi.supabase.co
-- Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE

-- ── 1. invoke_standings_sync ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_standings_sync(
  p_league_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-standings-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
  v_body     jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := v_body::text
  );
END;
$$;

-- ── 2. invoke_injuries_sync ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_injuries_sync(
  p_league_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-injuries-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
  v_body     jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := v_body::text
  );
END;
$$;

-- ── 3. invoke_team_statistics_sync ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_team_statistics_sync(
  p_league_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-team-statistics-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
  v_body     jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := v_body::text
  );
END;
$$;

-- ── 4. invoke_venues_sync ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_venues_sync(
  p_league_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-venues-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
  v_body     jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := v_body::text
  );
END;
$$;
