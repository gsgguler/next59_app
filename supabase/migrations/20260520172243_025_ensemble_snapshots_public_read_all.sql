/*
  # Fix ensemble_prediction_snapshots public read policy

  ## Problem
  Current RLS only allows anon/authenticated to SELECT rows where is_locked = true.
  The Liverpool vs Brentford snapshot (84901103) has is_locked = false, so the
  public /mac/:id/tahmin page returns no data for unlocked snapshots.

  ## Fix
  Add a separate policy that allows anon + authenticated to read ALL snapshots
  (locked or unlocked). The existing insert/update policies are untouched.

  ## Security rationale
  Prediction data is intentionally public — this is the core product feature.
  Sensitive personal data is not stored in this table.
*/

-- Drop the restrictive public read policy
DROP POLICY IF EXISTS "Public read locked predictions" ON public.ensemble_prediction_snapshots;

-- Replace with open public read (all rows, no is_locked filter)
CREATE POLICY "Public read all predictions"
  ON public.ensemble_prediction_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);
