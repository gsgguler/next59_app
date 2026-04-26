/*
  # Create user_subscriptions table

  1. New Tables
    - `user_subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK -> auth.users.id)
      - `tier_id` (uuid, FK -> subscription_tiers.id)
      - `is_active` (boolean) — only one active subscription per user
      - `started_at` (timestamptz) — when the subscription began
      - `expires_at` (timestamptz, nullable) — null = never expires (free tier)
      - `cancelled_at` (timestamptz, nullable) — when user cancelled
      - `cancellation_reason` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - Unique partial index: one active subscription per user
    - Index on user_id for fast lookups
    - Index on expires_at for expiration checks

  3. Security
    - RLS enabled
    - Authenticated users can read their own subscriptions
    - Service role manages inserts/updates (via edge functions)

  4. Important Notes
    - Only ONE active subscription per user at a time (enforced by unique partial index)
    - Free tier subscriptions have expires_at = NULL (never expire)
    - When upgrading/downgrading, old subscription is deactivated and new one created
*/

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  tier_id uuid NOT NULL REFERENCES subscription_tiers(id),
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique partial index: only one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_one_active
  ON user_subscriptions (user_id)
  WHERE is_active = true;

-- Index on user_id for general lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON user_subscriptions (user_id);

-- Index on expires_at for expiration batch jobs
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at
  ON user_subscriptions (expires_at)
  WHERE is_active = true AND expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can read own subscriptions"
  ON user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can see their own cancelled subscriptions too (history)
-- No INSERT/UPDATE/DELETE for authenticated users — managed by service_role via edge functions