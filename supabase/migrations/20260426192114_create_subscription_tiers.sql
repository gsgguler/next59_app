/*
  # Create subscription_tiers table

  1. New Tables
    - `subscription_tiers`
      - `id` (uuid, primary key)
      - `code` (text, unique) — 'free' or 'pro'
      - `display_name` (text) — human-readable tier name
      - `daily_match_views` (integer) — daily quota, -1 = unlimited
      - `has_full_analysis` (boolean) — whether tier gets full match analysis
      - `has_featured_match` (boolean) — whether free tier gets one featured match with full access
      - `price_monthly_usd` (numeric) — monthly price in USD
      - `price_yearly_usd` (numeric) — yearly price in USD
      - `is_active` (boolean) — whether tier is currently offered
      - `sort_order` (integer) — display ordering
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Seed Data
    - Free tier: 3 daily views, featured match, no full analysis
    - Pro tier: unlimited views (-1), full analysis, no featured match needed

  3. Security
    - RLS enabled
    - Authenticated users can read active tiers
    - Service role has full access (implicit)
*/

-- Create subscription_tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  display_name text NOT NULL,
  daily_match_views integer NOT NULL DEFAULT 0,
  has_full_analysis boolean NOT NULL DEFAULT false,
  has_featured_match boolean NOT NULL DEFAULT false,
  price_monthly_usd numeric(10, 2) DEFAULT 0.00,
  price_yearly_usd numeric(10, 2) DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_st_code CHECK (code IN ('free', 'pro')),
  CONSTRAINT chk_st_daily_views CHECK (daily_match_views >= -1)
);

-- Enable RLS
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active tiers
CREATE POLICY "Authenticated users can read active tiers"
  ON subscription_tiers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Seed exactly 2 tiers
INSERT INTO subscription_tiers (code, display_name, daily_match_views, has_full_analysis, has_featured_match, price_monthly_usd, price_yearly_usd, is_active, sort_order)
VALUES
  ('free', 'Free', 3, false, true, 0.00, 0.00, true, 10),
  ('pro', 'Pro', -1, true, false, 9.99, 99.99, true, 20)
ON CONFLICT (code) DO NOTHING;