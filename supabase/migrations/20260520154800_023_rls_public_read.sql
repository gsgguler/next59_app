/*
  # Public Read RLS Policies — Tahmin Motoru Layer

  ## Summary
  Adds or replaces public-facing SELECT policies for prediction engine tables.

  ## Changes

  ### ensemble_prediction_snapshots
  - Replaces the existing open SELECT policy with one restricted to `is_locked = true`
    so anonymous users only see finalized, immutable predictions.

  ### brain_configs
  - Existing public read policy already covers this; adding explicit anon role grant
    scoped to `is_active = true` (replaces the blanket `true` policy).

  ### brain_weight_profiles
  - Existing public read policy already covers this (no change needed for anon).

  ### model_lab.live_match_states
  - New policy allowing anon + authenticated to read live state rows.

  ## Security Notes
  - No authenticated user data is exposed.
  - Locked snapshots are final/immutable — safe to expose publicly.
  - live_match_states contains only scores/status — no PII.
*/

-- ── ensemble_prediction_snapshots ──────────────────────────────────────────
-- Drop the open policy and replace with is_locked filter
DROP POLICY IF EXISTS "ensemble_snapshots public select" ON public.ensemble_prediction_snapshots;

CREATE POLICY "Public read locked predictions"
  ON public.ensemble_prediction_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (is_locked = true);

-- ── brain_configs ───────────────────────────────────────────────────────────
-- Replace open public read with is_active filter
DROP POLICY IF EXISTS "brain_configs public read" ON public.brain_configs;

CREATE POLICY "Public read brain configs"
  ON public.brain_configs
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ── brain_weight_profiles ───────────────────────────────────────────────────
-- Keep existing open read; ensure anon is included explicitly
DROP POLICY IF EXISTS "brain_weight_profiles public read" ON public.brain_weight_profiles;

CREATE POLICY "Public read weight profiles"
  ON public.brain_weight_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── model_lab.live_match_states ─────────────────────────────────────────────
-- Live match state is score+status data, safe for public read
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'model_lab' AND table_name = 'live_match_states'
  ) THEN
    EXECUTE $p$
      ALTER TABLE model_lab.live_match_states ENABLE ROW LEVEL SECURITY
    $p$;

    -- Drop if exists first to avoid conflicts
    EXECUTE $p$
      DROP POLICY IF EXISTS "Public read live states" ON model_lab.live_match_states
    $p$;

    EXECUTE $p$
      CREATE POLICY "Public read live states"
        ON model_lab.live_match_states
        FOR SELECT
        TO anon, authenticated
        USING (true)
    $p$;
  END IF;
END $$;
