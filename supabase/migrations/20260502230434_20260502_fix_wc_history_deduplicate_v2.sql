/*
  # Deduplicate wc_history tables and add unique constraints (v2)

  ## Summary
  Uses created_at (oldest) to keep one row per logical key.
  Cascade deletes on matches propagate to events and match_statistics.
*/

-- ── 1. Deduplicate wc_history.matches ────────────────────────────────────────
DELETE FROM wc_history.matches a
USING wc_history.matches b
WHERE a.provider_fixture_id IS NOT NULL
  AND a.edition_year = b.edition_year
  AND a.provider_fixture_id = b.provider_fixture_id
  AND a.created_at > b.created_at;

-- ── 2. Deduplicate wc_history.teams ──────────────────────────────────────────
DELETE FROM wc_history.teams a
USING wc_history.teams b
WHERE a.provider_team_id IS NOT NULL
  AND a.edition_year = b.edition_year
  AND a.provider_team_id = b.provider_team_id
  AND a.created_at > b.created_at;

-- ── 3. Deduplicate wc_history.events (surviving matches only) ────────────────
DELETE FROM wc_history.events a
USING wc_history.events b
WHERE a.match_id = b.match_id
  AND a.elapsed IS NOT DISTINCT FROM b.elapsed
  AND a.event_type IS NOT DISTINCT FROM b.event_type
  AND a.event_detail IS NOT DISTINCT FROM b.event_detail
  AND a.player_name IS NOT DISTINCT FROM b.player_name
  AND a.created_at > b.created_at;

-- ── 4. Deduplicate wc_history.match_statistics ───────────────────────────────
DELETE FROM wc_history.match_statistics a
USING wc_history.match_statistics b
WHERE a.match_id = b.match_id
  AND a.provider_team_id IS NOT DISTINCT FROM b.provider_team_id
  AND a.stat_name IS NOT DISTINCT FROM b.stat_name
  AND a.created_at > b.created_at;

-- ── 5. Unique constraints ────────────────────────────────────────────────────
ALTER TABLE wc_history.matches
  DROP CONSTRAINT IF EXISTS wc_history_matches_edition_fixture_uq;
ALTER TABLE wc_history.matches
  ADD CONSTRAINT wc_history_matches_edition_fixture_uq
  UNIQUE (edition_year, provider_fixture_id);

ALTER TABLE wc_history.teams
  DROP CONSTRAINT IF EXISTS wc_history_teams_edition_provider_uq;
ALTER TABLE wc_history.teams
  ADD CONSTRAINT wc_history_teams_edition_provider_uq
  UNIQUE (edition_year, provider_team_id);

ALTER TABLE wc_history.match_statistics
  DROP CONSTRAINT IF EXISTS wc_history_match_stats_uq;
ALTER TABLE wc_history.match_statistics
  ADD CONSTRAINT wc_history_match_stats_uq
  UNIQUE (match_id, provider_team_id, stat_name);
