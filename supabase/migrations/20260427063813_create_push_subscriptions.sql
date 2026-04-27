/*
  # Create push_subscriptions table

  1. New Tables
    - `push_subscriptions`
      - `id` (uuid, primary key) - unique subscription identifier
      - `user_id` (uuid, nullable, FK to auth.users) - owning user, null for anonymous
      - `endpoint` (text, unique) - push service endpoint URL
      - `p256dh` (text) - client public key for encryption
      - `auth_key` (text) - shared authentication secret
      - `active` (boolean, default true) - whether subscription is still valid
      - `created_at` (timestamptz) - when subscription was created
      - `updated_at` (timestamptz) - last update timestamp

  2. Security
    - Enable RLS on `push_subscriptions` table
    - INSERT policy: authenticated or anonymous users can insert their own subscriptions
    - SELECT policy: users can read their own subscriptions
    - UPDATE policy: users can update their own subscriptions
    - DELETE policy: users can delete their own subscriptions

  3. Indexes
    - Unique index on `endpoint` for upsert operations
    - Index on `user_id` for per-user lookups
    - Index on `active` for filtering active subscriptions
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(active) WHERE active = true;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own push subscriptions"
  ON push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
