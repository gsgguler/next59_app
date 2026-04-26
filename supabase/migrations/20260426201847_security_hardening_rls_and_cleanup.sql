/*
  # Security Hardening: RLS tightening + table/view/index cleanup

  1. Security Changes
    - Tighten anon read on sensitive tables (predictions/stats/outcomes/events/context)
      - actual_outcomes: {anon,authenticated} -> {authenticated} only
      - match_statistics: {anon,authenticated} -> {authenticated} only
      - match_context: {anon,authenticated} -> {authenticated} only
      - match_events: {anon,authenticated} -> {authenticated} only
    - predictions uses can_access_global_tier() which already blocks anon

  2. Cleanup: backup tables (~19 MB)
    - DROP backup_fd_actual_outcomes_20260426
    - DROP backup_fd_match_context_20260426
    - DROP backup_fd_match_statistics_20260426
    - DROP backup_fd_matches_20260426

  3. Cleanup: old prediction views (redundant with main predictions table)
    - DROP VIEW elite_predictions
    - DROP VIEW pro_predictions
    - DROP VIEW public_predictions

  4. Index cleanup: unused GIN indexes (0 scans each)
    - DROP idx_match_context_extra (4.2 MB)
    - DROP idx_afr_response_json (1 MB)
    - DROP idx_pm_metadata (160 kB)
    - DROP idx_afr_request_params (48 kB)
    - DROP idx_ir_metadata (32 kB)
    - Keeping idx_teams_name_trgm (56 kB, trigram index for future fuzzy search)
*/

-- ══════════════════════════════════════════════
-- STEP 1: Tighten RLS on sensitive tables
-- ══════════════════════════════════════════════

-- actual_outcomes
DROP POLICY IF EXISTS "actual_outcomes_public_read" ON actual_outcomes;
CREATE POLICY "actual_outcomes_authenticated_read"
  ON actual_outcomes FOR SELECT TO authenticated
  USING (is_current = true);

-- match_statistics
DROP POLICY IF EXISTS "match_statistics_public_read" ON match_statistics;
CREATE POLICY "match_statistics_authenticated_read"
  ON match_statistics FOR SELECT TO authenticated
  USING (is_current = true);

-- match_context
DROP POLICY IF EXISTS "match_context_public_read" ON match_context;
CREATE POLICY "match_context_authenticated_read"
  ON match_context FOR SELECT TO authenticated
  USING (is_current = true);

-- match_events
DROP POLICY IF EXISTS "match_events_public_read" ON match_events;
CREATE POLICY "match_events_authenticated_read"
  ON match_events FOR SELECT TO authenticated
  USING (true);

-- ══════════════════════════════════════════════
-- STEP 2: Drop backup tables
-- ══════════════════════════════════════════════

DROP TABLE IF EXISTS backup_fd_actual_outcomes_20260426;
DROP TABLE IF EXISTS backup_fd_match_context_20260426;
DROP TABLE IF EXISTS backup_fd_match_statistics_20260426;
DROP TABLE IF EXISTS backup_fd_matches_20260426;

-- ══════════════════════════════════════════════
-- STEP 3: Drop old prediction views
-- ══════════════════════════════════════════════

DROP VIEW IF EXISTS elite_predictions;
DROP VIEW IF EXISTS pro_predictions;
DROP VIEW IF EXISTS public_predictions;

-- ══════════════════════════════════════════════
-- STEP 4: Drop unused GIN indexes
-- ══════════════════════════════════════════════

DROP INDEX IF EXISTS idx_match_context_extra;
DROP INDEX IF EXISTS idx_afr_response_json;
DROP INDEX IF EXISTS idx_pm_metadata;
DROP INDEX IF EXISTS idx_afr_request_params;
DROP INDEX IF EXISTS idx_ir_metadata;
