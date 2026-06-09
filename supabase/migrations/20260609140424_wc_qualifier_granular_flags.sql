
-- Phase 2: Add granular endpoint flag columns to wc_qualifier_fixtures
-- has_stats stays for backward compatibility; new columns distinguish "checked" vs "available"

ALTER TABLE public.wc_qualifier_fixtures
  ADD COLUMN IF NOT EXISTS stats_checked     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stats_available   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stats_empty       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stats_provider    text,
  ADD COLUMN IF NOT EXISTS stats_checked_at  timestamptz,

  ADD COLUMN IF NOT EXISTS events_checked    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS events_available  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS events_empty      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS events_provider   text,
  ADD COLUMN IF NOT EXISTS events_checked_at timestamptz,

  ADD COLUMN IF NOT EXISTS lineups_checked    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineups_available  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineups_empty      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineups_provider   text,
  ADD COLUMN IF NOT EXISTS lineups_checked_at timestamptz,

  ADD COLUMN IF NOT EXISTS players_checked    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_available  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_empty      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_provider   text,
  ADD COLUMN IF NOT EXISTS players_checked_at timestamptz;

-- Backfill from actual row presence in sub-tables
-- stats_available = real rows exist in wc_qualifier_team_match_stats
UPDATE public.wc_qualifier_fixtures f
SET
  stats_checked   = (f.has_stats = true),
  stats_available = EXISTS (
    SELECT 1 FROM public.wc_qualifier_team_match_stats s
    WHERE s.provider = f.provider AND s.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  stats_empty     = (f.has_stats = true) AND NOT EXISTS (
    SELECT 1 FROM public.wc_qualifier_team_match_stats s
    WHERE s.provider = f.provider AND s.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  stats_provider  = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.wc_qualifier_team_match_stats s
      WHERE s.provider = f.provider AND s.provider_fixture_id = f.provider_fixture_id
      LIMIT 1
    ) THEN f.provider
    ELSE NULL
  END,

  events_checked   = (f.has_events = true),
  events_available = EXISTS (
    SELECT 1 FROM public.wc_qualifier_events e
    WHERE e.provider = f.provider AND e.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  events_empty     = (f.has_events = true) AND NOT EXISTS (
    SELECT 1 FROM public.wc_qualifier_events e
    WHERE e.provider = f.provider AND e.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  events_provider  = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.wc_qualifier_events e
      WHERE e.provider = f.provider AND e.provider_fixture_id = f.provider_fixture_id
      LIMIT 1
    ) THEN f.provider
    ELSE NULL
  END,

  lineups_checked   = (f.has_lineups = true),
  lineups_available = EXISTS (
    SELECT 1 FROM public.wc_qualifier_lineup_players lp
    WHERE lp.provider = f.provider AND lp.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  lineups_empty     = (f.has_lineups = true) AND NOT EXISTS (
    SELECT 1 FROM public.wc_qualifier_lineup_players lp
    WHERE lp.provider = f.provider AND lp.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  lineups_provider  = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.wc_qualifier_lineup_players lp
      WHERE lp.provider = f.provider AND lp.provider_fixture_id = f.provider_fixture_id
      LIMIT 1
    ) THEN f.provider
    ELSE NULL
  END,

  players_checked   = (f.has_players = true),
  players_available = EXISTS (
    SELECT 1 FROM public.wc_qualifier_player_match_stats ps
    WHERE ps.provider = f.provider AND ps.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  players_empty     = (f.has_players = true) AND NOT EXISTS (
    SELECT 1 FROM public.wc_qualifier_player_match_stats ps
    WHERE ps.provider = f.provider AND ps.provider_fixture_id = f.provider_fixture_id
    LIMIT 1
  ),
  players_provider  = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.wc_qualifier_player_match_stats ps
      WHERE ps.provider = f.provider AND ps.provider_fixture_id = f.provider_fixture_id
      LIMIT 1
    ) THEN f.provider
    ELSE NULL
  END
WHERE f.has_stats = true
   OR f.has_events = true
   OR f.has_lineups = true
   OR f.has_players = true;
