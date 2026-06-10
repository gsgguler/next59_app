
-- ============================================================
-- WC2026 AI Narrative Writer — Two-Pass Pre-Match Scheduler
-- PRE_MATCH_INITIAL: T-24h → T-kickoff, once per fixture
-- PRE_MATCH_FINAL:   T-35min → T-5min before kickoff
-- Scoped to match_number = 1 for initial rollout.
-- Expand scope by adjusting the WHERE clause in each function.
-- ============================================================

-- ── Invoke function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_wc2026_ai_narrative_writer(
  p_mode       text,
  p_fixture_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/wc2026-ai-narrative-writer';
  v_anon_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'next59_service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'fixture_id',       p_fixture_id,
      'generation_mode',  p_mode,
      'triggered_by',     'pg_cron'
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- cron must not crash on transient errors
END;
$$;

-- ── PRE_MATCH_INITIAL scheduler ───────────────────────────────
-- Runs every 30 minutes. Finds fixtures where:
--   - kickoff is between now+1h and now+25h  (inside T-24h window)
--   - no completed PRE_MATCH_INITIAL run exists yet
-- Calls the writer for each qualifying fixture.

CREATE OR REPLACE FUNCTION public.schedule_wc2026_ai_initial_pass()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT f.id AS fixture_id
    FROM wc2026_fixtures f
    WHERE f.match_number = 1   -- scope: expand when ready for bulk
      AND f.match_date BETWEEN now() + interval '1 hour'
                           AND now() + interval '25 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM wc2026_ai_narrative_runs nr
        WHERE nr.fixture_id    = f.id
          AND nr.generation_mode = 'PRE_MATCH_INITIAL'
          AND nr.status          = 'completed'
      )
  LOOP
    PERFORM public.invoke_wc2026_ai_narrative_writer('PRE_MATCH_INITIAL', r.fixture_id);
  END LOOP;
END;
$$;

-- ── PRE_MATCH_FINAL scheduler ─────────────────────────────────
-- Runs every 5 minutes. Finds fixtures where:
--   - kickoff is between now+5min and now+40min  (T-35min window)
--   - no completed PRE_MATCH_FINAL run exists yet
--   - a completed PRE_MATCH_INITIAL run exists (prerequisite)

CREATE OR REPLACE FUNCTION public.schedule_wc2026_ai_final_pass()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT f.id AS fixture_id
    FROM wc2026_fixtures f
    WHERE f.match_number = 1   -- scope: expand when ready for bulk
      AND f.match_date BETWEEN now() + interval '5 minutes'
                           AND now() + interval '40 minutes'
      AND EXISTS (
        SELECT 1
        FROM wc2026_ai_narrative_runs nr
        WHERE nr.fixture_id    = f.id
          AND nr.generation_mode = 'PRE_MATCH_INITIAL'
          AND nr.status          = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM wc2026_ai_narrative_runs nr
        WHERE nr.fixture_id    = f.id
          AND nr.generation_mode = 'PRE_MATCH_FINAL'
          AND nr.status          = 'completed'
      )
  LOOP
    PERFORM public.invoke_wc2026_ai_narrative_writer('PRE_MATCH_FINAL', r.fixture_id);
  END LOOP;
END;
$$;

-- ── Cron jobs ─────────────────────────────────────────────────

SELECT cron.schedule(
  'wc2026-ai-initial-pass-30min',
  '*/30 * * * *',
  $$SELECT public.schedule_wc2026_ai_initial_pass()$$
);

SELECT cron.schedule(
  'wc2026-ai-final-pass-5min',
  '*/5 * * * *',
  $$SELECT public.schedule_wc2026_ai_final_pass()$$
);
