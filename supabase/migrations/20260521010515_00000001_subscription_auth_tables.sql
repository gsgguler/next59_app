/*
  # Subscription & Auth Support Tables

  1. New Tables
    - `subscription_tiers` - defines Free/Pro/Enterprise tiers with limits
    - `user_subscriptions` - links users to tiers with validity periods
    - `user_daily_usage` - tracks per-user daily API/prediction usage
    - `push_subscriptions` - stores web push endpoint+keys per user
    - `early_access_leads` - pre-launch email capture

  2. Security
    - RLS enabled on all tables
    - Users can only read/manage their own subscription + usage data
    - subscription_tiers is publicly readable (reference data)
    - push_subscriptions: user-owned CRUD
    - early_access_leads: insert-only for anon, admin read

  3. Notes
    - subscription_tiers seeded with free_tier as default
    - user_subscriptions defaults to free tier on user creation
    - daily_usage resets automatically (application logic, not DB)
*/

-- ─── subscription_tiers ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key            text UNIQUE NOT NULL,
  label               text NOT NULL,
  monthly_price_usd   numeric(8,2) NOT NULL DEFAULT 0,
  predictions_per_day int NOT NULL DEFAULT 3,
  api_calls_per_day   int NOT NULL DEFAULT 100,
  features            jsonb NOT NULL DEFAULT '[]',
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_tiers public read"
  ON subscription_tiers FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed tiers
INSERT INTO subscription_tiers (tier_key, label, monthly_price_usd, predictions_per_day, api_calls_per_day, features)
VALUES
  ('free',       'Free',       0,     3,   100,  '["basic_predictions","match_history"]'),
  ('pro',        'Pro',        9.99,  50,  1000, '["basic_predictions","match_history","advanced_analytics","export"]'),
  ('enterprise', 'Enterprise', 49.99, 500, 10000,'["basic_predictions","match_history","advanced_analytics","export","api_access","white_label"]')
ON CONFLICT (tier_key) DO NOTHING;

-- ─── user_subscriptions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id      uuid NOT NULL REFERENCES subscription_tiers(id),
  starts_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  is_active    boolean NOT NULL DEFAULT true,
  payment_ref  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_active_user_idx
  ON user_subscriptions(user_id) WHERE is_active = true;

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_subscriptions user select"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_subscriptions admin select"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ─── user_daily_usage ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_daily_usage (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date           date NOT NULL DEFAULT CURRENT_DATE,
  predictions_used     int NOT NULL DEFAULT 0,
  api_calls_used       int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, usage_date)
);

ALTER TABLE user_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_daily_usage user select"
  ON user_daily_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_daily_usage user insert"
  ON user_daily_usage FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_daily_usage user update"
  ON user_daily_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── push_subscriptions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions user select"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions user insert"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions user delete"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can read all (for send-push function)
CREATE POLICY "push_subscriptions service select"
  ON push_subscriptions FOR SELECT
  TO service_role
  USING (true);

-- ─── early_access_leads ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS early_access_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  source       text NOT NULL DEFAULT 'landing',
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE early_access_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "early_access_leads anon insert"
  ON early_access_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "early_access_leads admin select"
  ON early_access_leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
