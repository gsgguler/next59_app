/*
  # Fix invoke sync functions — correct net.http_post call signature

  ## Problem
  Previous fix used wrong net.http_post signature:
  - Passed body as text (should be jsonb)
  - net.http_post signature: (url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
  - Working functions pass body as jsonb, using named params

  ## Fix
  Use body := v_body (jsonb, not ::text) matching the working invoke_live_result_sync pattern.

  ## Functions updated (4) — body only, signatures unchanged
*/

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
    body    := v_body
  );
END;
$$;

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
    body    := v_body
  );
END;
$$;

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
    body    := v_body
  );
END;
$$;

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
    body    := v_body
  );
END;
$$;
