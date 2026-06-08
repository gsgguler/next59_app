
-- Predictions Publish Contract
-- Adds is_published + published_at fields, a partial index for public archive queries,
-- and an anon SELECT policy scoped to published, non-elite, non-superseded rows only.
-- All changes are idempotent.

-- STEP 2: Add missing publish-gate columns
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at  timestamptz;

-- STEP 3: Partial index for public archive (published, non-elite, active rows only)
CREATE INDEX IF NOT EXISTS idx_predictions_public_published
  ON public.predictions (published_at DESC)
  WHERE is_published = true
    AND is_elite_only = false
    AND superseded_by IS NULL;

-- STEP 4: Anon SELECT policy — only published, non-elite, non-superseded rows
-- Does not weaken the existing authenticated policy.
DROP POLICY IF EXISTS "anon_read_published_predictions" ON public.predictions;
CREATE POLICY "anon_read_published_predictions"
  ON public.predictions
  FOR SELECT
  TO anon
  USING (
    is_published = true
    AND (is_elite_only = false OR is_elite_only IS NULL)
    AND superseded_by IS NULL
  );
