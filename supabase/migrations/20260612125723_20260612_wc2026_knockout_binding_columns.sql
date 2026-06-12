-- Add knockout binding tracking columns to wc2026_fixtures
-- admin_review_required already exists, skip it

ALTER TABLE wc2026_fixtures
  ADD COLUMN IF NOT EXISTS knockout_binding_status   text         NOT NULL DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS knockout_binding_confidence numeric,
  ADD COLUMN IF NOT EXISTS knockout_binding_reason    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS knockout_bound_at          timestamptz,
  ADD COLUMN IF NOT EXISTS api_binding_source         text,
  ADD COLUMN IF NOT EXISTS api_binding_candidates     jsonb        NOT NULL DEFAULT '[]'::jsonb;

-- Seed: 32 knockout placeholders (api_football_fixture_id IS NULL) → pending
UPDATE wc2026_fixtures
SET knockout_binding_status = 'pending'
WHERE api_football_fixture_id IS NULL;

-- Seed: 72 group stage fixtures (api_football_fixture_id IS NOT NULL) → not_needed
UPDATE wc2026_fixtures
SET knockout_binding_status = 'not_needed'
WHERE api_football_fixture_id IS NOT NULL;
