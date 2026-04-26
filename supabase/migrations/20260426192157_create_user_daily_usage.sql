/*
  # Create user_daily_usage table

  1. New Tables
    - `user_daily_usage`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK -> auth.users.id)
      - `usage_date` (date) — computed in Europe/Istanbul timezone
      - `matches_viewed` (integer) — count of distinct matches viewed today
      - `match_ids_viewed` (uuid[]) — array of match IDs viewed today (ordered)
      - `featured_match_id` (uuid, nullable, FK -> matches.id) — first match viewed today (free tier gets full access)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - Unique: one row per user per day
    - Index on usage_date for daily cleanup/reporting
    - Index on user_id for fast lookups

  3. Security
    - RLS enabled
    - Authenticated users can read their own usage
    - Service role manages inserts/updates (via edge functions)

  4. Important Notes
    - usage_date is computed as: (now() AT TIME ZONE 'Europe/Istanbul')::date
    - featured_match_id is the FIRST match a free user views each day — they get full analysis for it
    - match_ids_viewed is an array to avoid separate junction table overhead
    - Daily reset happens naturally: new day = new row
*/

-- Create user_daily_usage table
CREATE TABLE IF NOT EXISTS user_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  usage_date date NOT NULL,
  matches_viewed integer NOT NULL DEFAULT 0,
  match_ids_viewed uuid[] NOT NULL DEFAULT '{}',
  featured_match_id uuid REFERENCES matches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_udu_matches_viewed CHECK (matches_viewed >= 0)
);

-- Unique: one row per user per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_daily_usage_user_date
  ON user_daily_usage (user_id, usage_date);

-- Index on usage_date for reporting/cleanup
CREATE INDEX IF NOT EXISTS idx_user_daily_usage_date
  ON user_daily_usage (usage_date);

-- Index on user_id
CREATE INDEX IF NOT EXISTS idx_user_daily_usage_user_id
  ON user_daily_usage (user_id);

-- Enable RLS
ALTER TABLE user_daily_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own daily usage"
  ON user_daily_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Helper function: get today's date in Europe/Istanbul timezone
CREATE OR REPLACE FUNCTION get_istanbul_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date;
$$;