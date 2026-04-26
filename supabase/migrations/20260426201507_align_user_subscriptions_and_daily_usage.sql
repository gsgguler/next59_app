/*
  # Align user_subscriptions and user_daily_usage to tier system spec

  1. Modified Tables
    - `user_subscriptions`
      - Add `metadata` (jsonb, default '{}') -- extensible metadata for payment info etc.

    - `user_daily_usage`
      - Add `tier_at_time` (text) -- snapshot of tier code when usage row was created
      - Add `reset_at` (timestamptz) -- when this day's quota resets (next day midnight Istanbul)

  2. Notes
    - Existing data preserved, new columns have safe defaults
    - user_daily_usage.tier_at_time defaults to 'free' for existing rows
    - reset_at computed from usage_date + 1 day
*/

-- 1. user_subscriptions: add metadata column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_subscriptions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE user_subscriptions ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- 2. user_daily_usage: add tier_at_time column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_daily_usage' AND column_name = 'tier_at_time'
  ) THEN
    ALTER TABLE user_daily_usage ADD COLUMN tier_at_time text NOT NULL DEFAULT 'free';
  END IF;
END $$;

-- 3. user_daily_usage: add reset_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_daily_usage' AND column_name = 'reset_at'
  ) THEN
    ALTER TABLE user_daily_usage ADD COLUMN reset_at timestamptz NOT NULL DEFAULT ((current_date + interval '1 day')::timestamptz);
  END IF;
END $$;

-- 4. Backfill reset_at for any existing rows
UPDATE user_daily_usage
SET reset_at = (usage_date + interval '1 day')::timestamptz
WHERE reset_at = (current_date + interval '1 day')::timestamptz
  AND usage_date < current_date;

-- 5. Add index on user_daily_usage(view_date) equivalent -- usage_date already has unique index
-- Add standalone index on usage_date for Prompt 1 Step 3 requirement
CREATE INDEX IF NOT EXISTS idx_user_daily_usage_date ON user_daily_usage(usage_date);
