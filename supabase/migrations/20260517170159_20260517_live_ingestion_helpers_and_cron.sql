/*
  # Live Ingestion Helpers and Cron Schedules

  ## Purpose
  Supports the three new live API ingestion edge functions:
  - af-upcoming-fixtures: fetches NS fixtures for the next 14 days
  - af-live-result-sync: syncs scores/status for in-progress and recently finished matches
  - af-pre-kickoff-lineups: fetches lineups for matches kicking off within 2h

  ## New Objects

  1. **`public.resolve_team_by_normalized_name(p_norm text)`** — RPC helper
     - Looks up a team by applying `normalize_team_name()` to stored team names
     - Returns `{id uuid}` or null row if no match
     - Used by af-upcoming-fixtures to resolve AF API team names to DB team UUIDs

  2. **`public.ml_assess_upcoming_match_readiness(p_match_id uuid)`** — thin public wrapper
     - Calls `model_lab.assess_upcoming_match_readiness` from the service role context
     - Needed because edge functions call public schema RPCs

  3. **pg_cron schedules**
     - `af-upcoming-fixtures`: every 6 hours
     - `af-live-result-sync recent`: every 15 minutes (during day window)
     - `af-pre-kickoff-lineups`: every 30 minutes

  ## Notes
  - All cron jobs use pg_net to invoke the edge functions via HTTP
  - The SUPABASE_URL and service role key are read from vault
  - Jobs are upserted (unschedule + reschedule) so this migration is idempotent
*/

-- ──────────────────────────────────────────────
-- 1. resolve_team_by_normalized_name RPC helper
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_team_by_normalized_name(p_norm text)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM teams t
  WHERE normalize_team_name(t.name) = normalize_team_name(p_norm)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_team_by_normalized_name(text) TO service_role;

-- ──────────────────────────────────────────────
-- 2. Public wrapper for model_lab readiness assess
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_assess_upcoming_match_readiness(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  PERFORM model_lab.assess_upcoming_match_readiness(p_match_id);
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: swallow errors so callers don't fail
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_assess_upcoming_match_readiness(uuid) TO service_role;

-- ──────────────────────────────────────────────
-- 3. pg_cron schedules (idempotent upsert)
-- ──────────────────────────────────────────────
DO $$
DECLARE
  v_supabase_url text;
  v_anon_key     text;
BEGIN
  -- Read connection details from vault (set during project provisioning)
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_supabase_url := NULL; END;

  BEGIN
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  -- Only schedule if we have the URL (skip in local dev without vault)
  IF v_supabase_url IS NULL THEN
    RAISE NOTICE 'vault.supabase_url not found — skipping cron schedule setup';
    RETURN;
  END IF;

  -- Unschedule existing jobs (idempotent)
  PERFORM cron.unschedule('af-upcoming-fixtures-6h')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'af-upcoming-fixtures-6h');
  PERFORM cron.unschedule('af-live-result-sync-15m')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'af-live-result-sync-15m');
  PERFORM cron.unschedule('af-pre-kickoff-lineups-30m') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'af-pre-kickoff-lineups-30m');

  -- af-upcoming-fixtures: every 6 hours
  PERFORM cron.schedule(
    'af-upcoming-fixtures-6h',
    '0 */6 * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L || '/functions/v1/af-upcoming-fixtures',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"next_days":14}'::jsonb
      );
      $sql$,
      v_supabase_url, v_anon_key
    )
  );

  -- af-live-result-sync: every 15 minutes
  PERFORM cron.schedule(
    'af-live-result-sync-15m',
    '*/15 * * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L || '/functions/v1/af-live-result-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"mode":"recent","recent_hours":3}'::jsonb
      );
      $sql$,
      v_supabase_url, v_anon_key
    )
  );

  -- af-pre-kickoff-lineups: every 30 minutes
  PERFORM cron.schedule(
    'af-pre-kickoff-lineups-30m',
    '*/30 * * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L || '/functions/v1/af-pre-kickoff-lineups',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"window_hours":2}'::jsonb
      );
      $sql$,
      v_supabase_url, v_anon_key
    )
  );

  RAISE NOTICE 'Cron schedules registered: af-upcoming-fixtures-6h, af-live-result-sync-15m, af-pre-kickoff-lineups-30m';
END;
$$;
