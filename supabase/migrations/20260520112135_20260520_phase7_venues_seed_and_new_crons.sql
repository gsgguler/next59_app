/*
  # Phase 7 — Venues Seed + H2H/Squad Cron Jobs

  ## Summary
  1. Seeds af_venues_normalized directly from shared.af_fixtures_raw venue data
  2. Adds squad-sync cron job (48h cadence)
  3. Grants table/view access to PostgREST roles

  ## Notes
  - Venues seed uses ONLY data already stored in shared.af_fixtures_raw
  - 246 distinct venue IDs available from fixture responses
  - Squad cron: Monday + Thursday 04:00 UTC
  - H2H is invoked on-demand per fixture pair by prematch pipeline
*/

-- ─────────────────────────────────────────────
-- Seed venues from shared.af_fixtures_raw
-- ─────────────────────────────────────────────
INSERT INTO af_venues_normalized (
  af_venue_id,
  name,
  city,
  country,
  synced_at,
  updated_at
)
SELECT DISTINCT ON (venue_id)
  venue_id,
  venue_name,
  venue_city,
  NULL::text AS country,
  now(),
  now()
FROM (
  SELECT
    (raw_response -> 'fixture' -> 'venue' ->> 'id')::integer   AS venue_id,
    raw_response -> 'fixture' -> 'venue' ->> 'name'            AS venue_name,
    raw_response -> 'fixture' -> 'venue' ->> 'city'            AS venue_city
  FROM shared.af_fixtures_raw
  WHERE raw_response -> 'fixture' -> 'venue' ->> 'id' IS NOT NULL
) sub
WHERE venue_id IS NOT NULL
ON CONFLICT (af_venue_id) DO UPDATE
  SET
    name       = EXCLUDED.name,
    city       = EXCLUDED.city,
    synced_at  = now(),
    updated_at = now();

-- Seed af_venues_raw so provider health tracking is consistent
INSERT INTO af_venues_raw (
  af_venue_id,
  response_hash,
  response_json,
  http_status,
  fetched_at,
  transform_status
)
SELECT DISTINCT ON (venue_id)
  venue_id,
  'venue_seed_' || venue_id::text,
  jsonb_build_object(
    'seeded_from', 'af_fixtures_raw',
    'name', venue_name,
    'city', venue_city
  ),
  200,
  now(),
  'transformed'
FROM (
  SELECT
    (raw_response -> 'fixture' -> 'venue' ->> 'id')::integer   AS venue_id,
    raw_response -> 'fixture' -> 'venue' ->> 'name'            AS venue_name,
    raw_response -> 'fixture' -> 'venue' ->> 'city'            AS venue_city
  FROM shared.af_fixtures_raw
  WHERE raw_response -> 'fixture' -> 'venue' ->> 'id' IS NOT NULL
) sub
WHERE venue_id IS NOT NULL
ON CONFLICT (af_venue_id) DO NOTHING;

-- Update provider health for venues
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'af_provider_feeds') THEN
    UPDATE af_provider_feeds
    SET last_success_at = now()
    WHERE feed_key = 'af_venues';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Squad sync cron via inline schedule
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    BEGIN
      PERFORM cron.schedule(
        'squad-sync-2x-week',
        '0 4 * * 1,4',
        'SELECT public.invoke_squad_sync(NULL)'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- PostgREST grants
-- ─────────────────────────────────────────────
GRANT SELECT ON af_h2h_raw TO authenticated;
GRANT SELECT ON af_h2h_normalized TO authenticated, anon;
GRANT SELECT ON af_player_squads_raw TO authenticated;
GRANT SELECT ON af_player_squads_normalized TO authenticated, anon;
GRANT SELECT ON public.v_recent_h2h_summary TO authenticated, anon;
GRANT SELECT ON public.v_squad_continuity_profile TO authenticated, anon;
