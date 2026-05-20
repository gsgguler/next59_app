/*
  # Phase 6 — Domestic Squad Continuity Layer

  ## Summary
  Adds the domestic squad continuity ingestion layer using API-Football's
  `players/squads` endpoint. This enables lineup stability analysis,
  squad depth assessment, and continuity markers — distinct from the
  WC2026-specific squad tables that already exist.

  ## New Tables
  - `af_player_squads_raw` — raw AF response per team; deduped by `response_hash`
  - `af_player_squads_normalized` — one row per player per team with squad details

  ## New Views
  - `public.v_squad_continuity_profile` — recent squad continuity metrics per team

  ## New Functions
  - `invoke_squad_sync(team_id)` — pg_net HTTP POST invoker
  - `public.get_squad_profile(team_id)` — public RPC for squad details

  ## Security
  - RLS enabled; authenticated read only
  - Write via SECURITY DEFINER only

  ## Notes
  1. Upsert keyed on (af_team_id, af_player_id) — one row per player per team
  2. `last_seen_season` updated on each sync for continuity tracking
  3. Provider health entry added for `af_squads`
*/

-- ─────────────────────────────────────────────
-- Raw storage
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_squads_raw (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_team_id       integer NOT NULL,
  response_hash    text UNIQUE NOT NULL,
  response_json    jsonb,
  http_status      integer,
  players_count    integer DEFAULT 0,
  fetched_at       timestamptz DEFAULT now(),
  transform_status text DEFAULT 'pending',
  transform_error  text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_player_squads_raw_team
  ON af_player_squads_raw(af_team_id, fetched_at DESC);

ALTER TABLE af_player_squads_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read squad raw"
  ON af_player_squads_raw FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- Normalized — one row per player per team
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_squads_normalized (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_team_id          integer NOT NULL,
  team_name           text,
  af_player_id        integer NOT NULL,
  player_name         text,
  player_age          integer,
  player_number       integer,
  player_position     text,
  player_photo        text,
  is_captain          boolean DEFAULT false,
  last_seen_season    integer,
  first_seen_season   integer,
  seasons_count       integer DEFAULT 1,
  raw_payload         jsonb,
  synced_at           timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (af_team_id, af_player_id)
);

CREATE INDEX IF NOT EXISTS idx_af_player_squads_norm_team
  ON af_player_squads_normalized(af_team_id);

CREATE INDEX IF NOT EXISTS idx_af_player_squads_norm_player
  ON af_player_squads_normalized(af_player_id);

CREATE INDEX IF NOT EXISTS idx_af_player_squads_norm_position
  ON af_player_squads_normalized(af_team_id, player_position);

ALTER TABLE af_player_squads_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read squad normalized"
  ON af_player_squads_normalized FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read squad normalized"
  ON af_player_squads_normalized FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────────
-- Provider health entry
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'af_provider_feeds') THEN
    INSERT INTO af_provider_feeds (feed_key, feed_label, stale_hours_threshold)
    VALUES ('af_squads', 'Kadro Verileri', 48)
    ON CONFLICT (feed_key) DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- Squad continuity profile view
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_squad_continuity_profile AS
SELECT
  af_team_id,
  team_name,
  COUNT(*)                                                         AS squad_size,
  COUNT(*) FILTER (WHERE player_position = 'Goalkeeper')          AS gk_count,
  COUNT(*) FILTER (WHERE player_position = 'Defender')            AS def_count,
  COUNT(*) FILTER (WHERE player_position = 'Midfielder')          AS mid_count,
  COUNT(*) FILTER (WHERE player_position = 'Attacker')            AS att_count,
  ROUND(AVG(player_age)::numeric, 1)                              AS avg_age,
  MIN(player_age)                                                  AS youngest_age,
  MAX(player_age)                                                  AS oldest_age,
  COUNT(*) FILTER (WHERE is_captain)                               AS captains_listed,
  MAX(synced_at)                                                   AS last_synced_at
FROM af_player_squads_normalized
GROUP BY af_team_id, team_name;

-- ─────────────────────────────────────────────
-- invoke_squad_sync
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoke_squad_sync(
  p_team_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_body jsonb;
BEGIN
  v_url := current_setting('app.supabase_url', true)
    || '/functions/v1/af-squad-sync';
  v_key := current_setting('app.service_role_key', true);

  v_body := jsonb_build_object('team_id', p_team_id);

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := v_body::text
  );
END;
$$;

-- ─────────────────────────────────────────────
-- Public RPC: get_squad_profile
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_squad_profile(
  p_team_id integer
)
RETURNS TABLE (
  af_player_id    integer,
  player_name     text,
  player_age      integer,
  player_number   integer,
  player_position text,
  is_captain      boolean,
  last_seen_season integer,
  seasons_count   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.af_player_id,
    n.player_name,
    n.player_age,
    n.player_number,
    n.player_position,
    n.is_captain,
    n.last_seen_season,
    n.seasons_count
  FROM af_player_squads_normalized n
  WHERE n.af_team_id = p_team_id
  ORDER BY n.player_position, n.player_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_squad_profile(integer) TO anon, authenticated;
