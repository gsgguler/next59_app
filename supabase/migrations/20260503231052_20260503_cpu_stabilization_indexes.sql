/*
  # CPU Stabilization — Missing Index Remediation

  ## Problem
  CPU audit identified 3 classes of missing indexes causing excessive sequential scans:

  1. staging_football_data_uk_raw: single-column is_processed index exists but no composite
     covering (is_processed, imported_at DESC). The 681-call paginated query pattern (mean 11.9s)
     uses ORDER BY imported_at/created_at DESC after filtering is_processed=false — without this
     composite, Postgres must sort after filtering. This is the primary 04 May CPU spike source.
     Note: column is imported_at (not created_at).

  2. api_football_fixture_events: match_id single-col index exists but no (match_id, team_id)
     composite. The event features view joins on both columns — single-col index does a partial
     scan then re-filters team_id in-memory. At 78k rows nested into a 65k-match universe,
     this drives estimated cost to ~437k.

  3. api_football_fixture_lineup_players: match_id and team_id exist as separate single-col
     indexes but no composite. Player features view joins on (match_id, team_id) — Postgres
     chooses one index then bitmap-AND or seq-scans the other. At 204k rows this drives cost
     to ~434k.

  ## Indexes Skipped
  - af_fixture_player_stats (match_id UUID): join goes through api_football_fixture_id (integer),
    covered by existing idx_af_fps_fixture.
  - af_fixture_player_stats (fixture_id, player_id): covered by existing unique constraint
    af_fps_unique (api_football_fixture_id, api_football_team_id, api_football_player_id).

  ## Notes
  - CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    Supabase apply_migration wraps statements in a transaction, so CONCURRENTLY is omitted.
    These are additive-only (no table rewrites). Lock impact: ShareLock only — no blocking
    of concurrent reads or DML.
  - All use IF NOT EXISTS to be idempotent.
*/

-- Primary fix: composite covering index for is_processed + imported_at paginated queries
CREATE INDEX IF NOT EXISTS idx_staging_fd_raw_processed_imported_at
  ON public.staging_football_data_uk_raw (is_processed, imported_at DESC);

-- Calibration fix: composite for event features view join (match_id + team_id)
CREATE INDEX IF NOT EXISTS idx_af_events_match_team
  ON public.api_football_fixture_events (match_id, team_id);

-- Calibration fix: composite for player features view join (match_id + team_id)
CREATE INDEX IF NOT EXISTS idx_af_lineup_players_match_team
  ON public.api_football_fixture_lineup_players (match_id, team_id);
