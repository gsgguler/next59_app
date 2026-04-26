/*
  # Align subscription_tiers to tier system spec

  1. Modified Tables
    - `subscription_tiers`
      - Add `tier_code` (text, unique) -- canonical tier identifier
      - Add `tier_name` (text) -- human-friendly name
      - Add `analysis_depth` (text) -- 'none', 'first_30min', 'full'
      - Add `can_view_predictions` (boolean)
      - Add `can_view_elo` (boolean)
      - Add `can_view_full_analysis` (boolean)

  2. Data Changes
    - Update CHECK constraint to allow 'anon' code
    - Backfill existing rows (free, pro) with new column values
    - Insert new `anon` tier row (2 daily views, no analysis)

  3. Security
    - Add anon and authenticated read policies (is_active = true)
*/

-- 1. Update CHECK constraint to allow 'anon'
ALTER TABLE subscription_tiers DROP CONSTRAINT IF EXISTS chk_st_code;
ALTER TABLE subscription_tiers ADD CONSTRAINT chk_st_code
  CHECK (code = ANY (ARRAY['anon'::text, 'free'::text, 'pro'::text]));

-- 2. Add new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'tier_code'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN tier_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'tier_name'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN tier_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'analysis_depth'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN analysis_depth text NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'can_view_predictions'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN can_view_predictions boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'can_view_elo'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN can_view_elo boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_tiers' AND column_name = 'can_view_full_analysis'
  ) THEN
    ALTER TABLE subscription_tiers ADD COLUMN can_view_full_analysis boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 3. Backfill tier_code and tier_name from existing columns
UPDATE subscription_tiers SET tier_code = code WHERE tier_code IS NULL;
UPDATE subscription_tiers SET tier_name = display_name WHERE tier_name IS NULL;

-- Make NOT NULL
ALTER TABLE subscription_tiers ALTER COLUMN tier_code SET NOT NULL;
ALTER TABLE subscription_tiers ALTER COLUMN tier_name SET NOT NULL;

-- Add UNIQUE constraint on tier_code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_tiers_tier_code_key'
  ) THEN
    ALTER TABLE subscription_tiers ADD CONSTRAINT subscription_tiers_tier_code_key UNIQUE (tier_code);
  END IF;
END $$;

-- Add CHECK on analysis_depth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_analysis_depth'
  ) THEN
    ALTER TABLE subscription_tiers ADD CONSTRAINT chk_analysis_depth
      CHECK (analysis_depth IN ('none', 'first_30min', 'full'));
  END IF;
END $$;

-- 4. Backfill values for free tier
UPDATE subscription_tiers
SET analysis_depth = 'first_30min',
    can_view_predictions = true,
    can_view_elo = false,
    can_view_full_analysis = false
WHERE code = 'free';

-- Backfill values for pro tier
UPDATE subscription_tiers
SET analysis_depth = 'full',
    can_view_predictions = true,
    can_view_elo = true,
    can_view_full_analysis = true
WHERE code = 'pro';

-- 5. Insert anon tier
INSERT INTO subscription_tiers (
  code, display_name, tier_code, tier_name,
  daily_match_views, analysis_depth,
  can_view_predictions, can_view_elo, can_view_full_analysis,
  has_full_analysis, has_featured_match,
  price_monthly_usd, price_yearly_usd,
  is_active, sort_order
)
SELECT
  'anon', 'Anonymous', 'anon', 'Anonymous',
  2, 'none',
  false, false, false,
  false, false,
  0.00, 0.00,
  true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_tiers WHERE code = 'anon'
);

-- 6. RLS policies for anon and authenticated read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_tiers' AND policyname = 'subscription_tiers_anon_read'
  ) THEN
    CREATE POLICY "subscription_tiers_anon_read"
      ON subscription_tiers FOR SELECT TO anon
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_tiers' AND policyname = 'subscription_tiers_auth_read'
  ) THEN
    CREATE POLICY "subscription_tiers_auth_read"
      ON subscription_tiers FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;
