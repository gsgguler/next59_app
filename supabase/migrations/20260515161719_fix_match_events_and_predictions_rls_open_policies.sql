/*
  # Security Fix: Close public USING(true) policies on match_events and predictions

  ## Problem
  Both match_events and predictions tables have a policy for the `public` role
  (includes anon) with USING(true) — allowing unauthenticated users to read all
  rows including elite-only predictions.

  ## Changes
  1. match_events: Drop open public-role policy. Add authenticated-only SELECT policy.
  2. predictions: Drop open public-role policy. Add authenticated SELECT policy that
     gates is_elite_only=true rows behind an active elite/pro subscription.

  ## Not changed
  - matches, competitions, teams public read policies are untouched.
  - No data is modified.
*/

-- ── match_events: remove public open read, restrict to authenticated ──────────

DROP POLICY IF EXISTS "public_match_events_read" ON match_events;
DROP POLICY IF EXISTS "match_events_authenticated_read" ON match_events;

CREATE POLICY "match_events_authenticated_read"
  ON match_events FOR SELECT
  TO authenticated
  USING (true);

-- ── predictions: remove public open read, gate elite rows by subscription ─────

DROP POLICY IF EXISTS "public_predictions_read" ON predictions;
DROP POLICY IF EXISTS "predictions_authenticated_read" ON predictions;
DROP POLICY IF EXISTS "predictions_anon_read" ON predictions;

CREATE POLICY "predictions_authenticated_read"
  ON predictions FOR SELECT
  TO authenticated
  USING (
    superseded_by IS NULL
    AND (
      (is_elite_only = false OR is_elite_only IS NULL)
      OR
      (
        is_elite_only = true
        AND EXISTS (
          SELECT 1 FROM user_subscriptions us
          JOIN subscription_tiers st ON st.id = us.tier_id
          WHERE us.user_id = auth.uid()
            AND us.status = 'active'
            AND st.slug IN ('elite', 'pro')
        )
      )
    )
  );
