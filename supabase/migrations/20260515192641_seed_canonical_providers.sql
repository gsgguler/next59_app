/*
  # Seed Canonical Data Providers Registry

  ## Purpose
  Populate the `providers` table with the 5 canonical data sources used across
  the football identity layer. These records serve as the authoritative registry
  for all provider-scoped alias and mapping tables.

  ## Providers

  1. football-data-uk
     - Source: football-data.co.uk
     - Type: historical (CSV files, 2000–present)
     - Coverage: 22 domestic leagues, 179K+ match records

  2. api-football
     - Source: API-Football (api-sports.io)
     - Type: live (REST API, real-time fixtures, stats, lineups, odds)
     - Coverage: 14,589 verified fixture mappings, 22,698 player identity mappings

  3. fbref
     - Source: FBref (Sports Reference)
     - Type: historical (xG, advanced stats)
     - Coverage: xG data via fbref-xg-ingest edge function

  4. understat
     - Source: Understat.com
     - Type: historical (xG, shot maps)
     - Coverage: xG data via understat-xg-ingest edge function

  5. wc2026-static
     - Source: Internal static dataset + wc2026_fixtures DB table
     - Type: static (curated fixture/team data for FIFA World Cup 2026)
     - Coverage: WC2026 group fixtures, knockout skeletons, squad data

  ## Notes
  - INSERT is guarded by ON CONFLICT (slug) DO NOTHING — fully idempotent.
  - config_json is intentionally minimal at seed time; API keys/URLs are in Vault.
  - is_active = true for all live/historical providers; false would mean decommissioned.
*/

INSERT INTO providers (id, name, slug, type, config_json, is_active, created_at)
VALUES
  (
    gen_random_uuid(),
    'football-data.co.uk',
    'football-data-uk',
    'historical',
    '{"base_url": "https://www.football-data.co.uk", "format": "csv", "coverage_from": "2000-07-28"}'::jsonb,
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'API-Football',
    'api-football',
    'live',
    '{"base_url": "https://v3.football.api-sports.io", "format": "json", "rate_limit_per_day": 100}'::jsonb,
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'FBref',
    'fbref',
    'historical',
    '{"base_url": "https://fbref.com", "format": "html_scrape", "data_type": "xg_advanced_stats"}'::jsonb,
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'Understat',
    'understat',
    'historical',
    '{"base_url": "https://understat.com", "format": "json_embedded", "data_type": "xg_shot_maps"}'::jsonb,
    true,
    now()
  ),
  (
    gen_random_uuid(),
    'WC2026 Static',
    'wc2026-static',
    'static',
    '{"format": "internal_db", "tables": ["wc2026_fixtures", "wc2026_team_squads", "wc2026_groups"]}'::jsonb,
    true,
    now()
  )
ON CONFLICT (slug) DO NOTHING;
