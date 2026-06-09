
-- Auto-sync cron for WC qualifier details (AFC + CAF + remaining confederations)
-- Runs every 3 minutes, picks next batch of unfetched finished fixtures
-- AFC: ~225 fixtures → ~19 batches → ~57 min
-- CAF: ~256 fixtures → ~22 batches → ~66 min
-- Each call: 12 fixtures × 4 endpoints × 1.2s ≈ 58s (well under 150s timeout)

CREATE OR REPLACE FUNCTION public.invoke_wc_qualifier_details_batch(
  p_confederation text,
  p_max_fixtures integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/sync-wc-qualifiers-full-enrichment';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
  v_pending  integer;
  v_body     jsonb;
  v_req_id   bigint;
BEGIN
  -- Count pending unfetched finished fixtures for this confederation
  SELECT COUNT(*) INTO v_pending
  FROM wc_qualifier_fixtures
  WHERE provider = 'api_football'
    AND confederation = p_confederation
    AND status_short IN ('FT', 'AET', 'PEN')
    AND (NOT has_stats OR NOT has_events OR NOT has_lineups);

  IF v_pending = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'confederation', p_confederation, 'reason', 'no_pending');
  END IF;

  v_body := jsonb_build_object(
    'mode',           'sync_details',
    'confederation',  p_confederation,
    'max_fixtures',   p_max_fixtures,
    'batch_offset',   0
  );

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := v_body
  ) INTO v_req_id;

  RETURN jsonb_build_object(
    'queued',        true,
    'confederation', p_confederation,
    'pending',       v_pending,
    'req_id',        v_req_id
  );
END;
$$;

-- Orchestrator: pick the confederation with most pending fixtures and trigger one batch
CREATE OR REPLACE FUNCTION public.wc_qualifier_auto_sync_next()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conf   text;
  v_count  integer;
  v_result jsonb;
BEGIN
  -- Find confederation with most pending unfetched finished fixtures
  -- Priority order: AFC, CAF, OFC, Intercontinental (UEFA/CONMEBOL/CONCACAF already done)
  SELECT confederation, cnt INTO v_conf, v_count
  FROM (
    SELECT confederation, COUNT(*) AS cnt
    FROM wc_qualifier_fixtures
    WHERE provider = 'api_football'
      AND status_short IN ('FT', 'AET', 'PEN')
      AND (NOT has_stats OR NOT has_events OR NOT has_lineups)
      AND confederation IN ('AFC', 'CAF', 'OFC', 'Intercontinental', 'CONCACAF')
    GROUP BY confederation
    ORDER BY
      CASE confederation
        WHEN 'AFC'              THEN 1
        WHEN 'CAF'              THEN 2
        WHEN 'OFC'              THEN 3
        WHEN 'Intercontinental' THEN 4
        WHEN 'CONCACAF'         THEN 5
        ELSE 99
      END
    LIMIT 1
  ) sub;

  IF v_conf IS NULL THEN
    -- All done — rebuild summaries
    PERFORM net.http_post(
      url     := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/sync-wc-qualifiers-full-enrichment',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE'
      ),
      body := '{"mode":"build_summary"}'::jsonb
    );
    RETURN jsonb_build_object('status', 'all_done_summary_triggered');
  END IF;

  v_result := public.invoke_wc_qualifier_details_batch(v_conf, 12);
  RETURN v_result;
END;
$$;

-- Schedule: every 3 minutes
SELECT cron.schedule(
  'wc-qualifier-auto-sync',
  '*/3 * * * *',
  $$SELECT public.wc_qualifier_auto_sync_next();$$
);
