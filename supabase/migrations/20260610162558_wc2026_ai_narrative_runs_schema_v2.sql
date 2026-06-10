-- Add generation_mode, match_number, started_at, completed_at to wc2026_ai_narrative_runs
-- These columns support two-pass architecture (PRE_MATCH_INITIAL / PRE_MATCH_FINAL)
-- and duplicate-guard logic (unique per fixture + mode)

ALTER TABLE wc2026_ai_narrative_runs
  ADD COLUMN IF NOT EXISTS generation_mode text NOT NULL DEFAULT 'PRE_MATCH_INITIAL',
  ADD COLUMN IF NOT EXISTS match_number integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Add check constraint for valid modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_narrative_runs_generation_mode'
  ) THEN
    ALTER TABLE wc2026_ai_narrative_runs
      ADD CONSTRAINT chk_ai_narrative_runs_generation_mode
      CHECK (generation_mode IN ('PRE_MATCH_INITIAL', 'PRE_MATCH_FINAL'));
  END IF;
END $$;

-- Index for duplicate guard query: fixture_id + generation_mode + status
CREATE INDEX IF NOT EXISTS idx_ai_narrative_runs_fixture_mode_status
  ON wc2026_ai_narrative_runs (fixture_id, generation_mode, status);

-- Remove the overly permissive anon read policy added by the prototype
DROP POLICY IF EXISTS "anon_read_ai_narrative_runs" ON wc2026_ai_narrative_runs;

-- Ensure no anon access — only service_role (used by the internal edge function)
-- Authenticated users also have no direct access; all writes go through service_role key
ALTER TABLE wc2026_ai_narrative_runs ENABLE ROW LEVEL SECURITY;

-- Drop any wildcard policies that might have been added
DROP POLICY IF EXISTS "allow_all_ai_narrative_runs" ON wc2026_ai_narrative_runs;

-- wc2026_model_market_divergence — same cleanup: remove anon read
DROP POLICY IF EXISTS "anon_read_market_divergence" ON wc2026_model_market_divergence;
