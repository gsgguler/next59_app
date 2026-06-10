
-- ============================================================
-- WC2026 AI Narrative Queue: retry columns + atomic claim RPC
-- Drops old claim RPC (wrong return type) and recreates it.
-- ============================================================

-- 1. Add retry / tracking columns (idempotent)
ALTER TABLE public.wc2026_ai_narrative_queue
  ADD COLUMN IF NOT EXISTS attempts     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error   text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- 2. Drop old RPC (return type mismatch from prior session) and recreate
DROP FUNCTION IF EXISTS public.claim_next_wc2026_ai_narrative_job(text);

CREATE FUNCTION public.claim_next_wc2026_ai_narrative_job(p_worker_id text)
RETURNS SETOF public.wc2026_ai_narrative_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH candidate AS (
    SELECT id
    FROM public.wc2026_ai_narrative_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY queued_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.wc2026_ai_narrative_queue q
  SET status     = 'claimed',
      claimed_at = now(),
      claimed_by = p_worker_id,
      attempts   = q.attempts + 1
  FROM candidate
  WHERE q.id = candidate.id
  RETURNING q.*;
$$;

-- Service role only; no public/anon access
REVOKE ALL ON FUNCTION public.claim_next_wc2026_ai_narrative_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_wc2026_ai_narrative_job(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_next_wc2026_ai_narrative_job(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_wc2026_ai_narrative_job(text) TO service_role;
