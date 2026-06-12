
-- ============================================================
-- WC 2026 Automation: Cron jobs for Part 2 + Part 3 edge functions
-- None of these 9 API-Football automation functions had cron entries.
-- ============================================================

-- Shared helper: fire a WC2026 automation edge function
CREATE OR REPLACE FUNCTION public.invoke_wc2026_fn(p_fn_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/' || p_fn_name;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ─── Part 2: Pre-match data enrichment ───────────────────────────────────────

-- Player enrichment: process pending wc_player_enrichment_profiles every 2 hours
SELECT cron.schedule(
  'wc2026-player-enrichment-2h',
  '0 */2 * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-player-enrichment')$$
);

-- Prelineup sync: check for lineup announcements every 5 minutes
SELECT cron.schedule(
  'wc2026-prelineup-sync-5min',
  '*/5 * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-prelineup-sync')$$
);

-- Prediction input builder: rebuild match inputs every 10 minutes
SELECT cron.schedule(
  'wc2026-prediction-input-builder-10min',
  '*/10 * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-prediction-input-builder')$$
);

-- Referee enrichment: enrich referee profiles every 6 hours
SELECT cron.schedule(
  'wc2026-referee-enrichment-6h',
  '0 */6 * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-referee-enrichment')$$
);

-- ─── Part 3: Live match data automation ──────────────────────────────────────

-- Fixture daily sync: full status + score sync twice daily (6am, 6pm)
SELECT cron.schedule(
  'wc2026-fixture-daily-sync-2xday',
  '0 6,18 * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-fixture-daily-sync')$$
);

-- Live discovery: detect newly-live WC2026 fixtures every minute
SELECT cron.schedule(
  'wc2026-live-discovery-1min',
  '* * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-live-discovery')$$
);

-- Live poller: poll all active live fixtures every minute
SELECT cron.schedule(
  'wc2026-live-poller-1min',
  '* * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-live-poller')$$
);

-- Match finalizer: process finalization queue every 2 minutes
SELECT cron.schedule(
  'wc2026-match-finalizer-2min',
  '*/2 * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-match-finalizer')$$
);

-- Delayed result reconciler: catch missed closures every 30 minutes
SELECT cron.schedule(
  'wc2026-delayed-result-reconciler-30min',
  '*/30 * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-delayed-result-reconciler')$$
);

-- API status / quota monitor: snapshot quota usage every hour at :55
SELECT cron.schedule(
  'wc2026-api-status-hourly',
  '55 * * * *',
  $$SELECT public.invoke_wc2026_fn('wc2026-api-status')$$
);
