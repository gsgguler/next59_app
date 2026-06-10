
-- ============================================================
-- WC2026 AI Narrative — Queue table
-- pg_cron writes requests here; the edge function drains it
-- when called externally (Supabase cron via HTTP trigger or
-- app-side trigger). This decouples the DB from direct
-- edge-function invocation (pg_net cannot reach edge functions
-- in this Supabase environment due to internal DNS restrictions).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wc2026_ai_narrative_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id    uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  generation_mode text NOT NULL CHECK (generation_mode IN ('PRE_MATCH_INITIAL', 'PRE_MATCH_FINAL')),
  queued_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  claimed_by    text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'failed')),
  UNIQUE (fixture_id, generation_mode)
);

ALTER TABLE public.wc2026_ai_narrative_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write this queue
CREATE POLICY "service_role_all_queue"
  ON public.wc2026_ai_narrative_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Update schedulers to write to queue instead of invoking directly ──────────

CREATE OR REPLACE FUNCTION public.schedule_wc2026_ai_initial_pass()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.wc2026_ai_narrative_queue (fixture_id, generation_mode)
  SELECT f.id, 'PRE_MATCH_INITIAL'
  FROM wc2026_fixtures f
  WHERE f.match_number = 1
    AND f.match_date BETWEEN now() + interval '1 hour'
                         AND now() + interval '25 hours'
    AND NOT EXISTS (
      SELECT 1 FROM wc2026_ai_narrative_runs nr
      WHERE nr.fixture_id    = f.id
        AND nr.generation_mode = 'PRE_MATCH_INITIAL'
        AND nr.status          = 'completed'
    )
  ON CONFLICT (fixture_id, generation_mode) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_wc2026_ai_final_pass()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.wc2026_ai_narrative_queue (fixture_id, generation_mode)
  SELECT f.id, 'PRE_MATCH_FINAL'
  FROM wc2026_fixtures f
  WHERE f.match_number = 1
    AND f.match_date BETWEEN now() + interval '5 minutes'
                         AND now() + interval '40 minutes'
    AND EXISTS (
      SELECT 1 FROM wc2026_ai_narrative_runs nr
      WHERE nr.fixture_id    = f.id
        AND nr.generation_mode = 'PRE_MATCH_INITIAL'
        AND nr.status          = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM wc2026_ai_narrative_runs nr
      WHERE nr.fixture_id    = f.id
        AND nr.generation_mode = 'PRE_MATCH_FINAL'
        AND nr.status          = 'completed'
    )
  ON CONFLICT (fixture_id, generation_mode) DO NOTHING;
END;
$$;

-- Seed the initial pass for match_number=1 immediately
-- (kickoff 2026-06-11 19:00 UTC — currently ~24h away)
INSERT INTO public.wc2026_ai_narrative_queue (fixture_id, generation_mode)
SELECT id, 'PRE_MATCH_INITIAL'
FROM wc2026_fixtures
WHERE match_number = 1
ON CONFLICT (fixture_id, generation_mode) DO NOTHING;
