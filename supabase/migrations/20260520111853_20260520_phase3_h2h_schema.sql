/*
  # Phase 3 — Head-to-Head (H2H) Context Layer

  ## Summary
  Implements the full H2H data ingestion layer for API-Football's
  `fixtures/headtohead` endpoint. Enables historical H2H match analysis,
  home/away asymmetry signals, goal trends, and last meeting dates — all
  used downstream by `compute_h2h_features` (which previously had no tables).

  ## New Tables
  - `af_h2h_raw` — stores raw AF API response per team pair; deduped by `response_hash`
  - `af_h2h_normalized` — one row per historical H2H fixture with full result details

  ## New Functions
  - `invoke_h2h_sync(team1_id, team2_id)` — pg_net HTTP POST invoker
  - `public.get_h2h_summary(home_team_id, away_team_id)` — public RPC returning recent H2H summary

  ## New Views
  - `public.v_recent_h2h_summary` — materialized-style view of H2H win/draw/loss counts per pair

  ## Security
  - RLS enabled on both tables; read-only for authenticated users
  - Write via SECURITY DEFINER functions only
  - Public get_h2h_summary RPC accessible to anon via SECURITY DEFINER

  ## Notes
  1. Team pair stored as canonical (smaller_id, larger_id) to prevent duplicate pairs
  2. response_hash = `h2h_{min(t1,t2)}_{max(t1,t2)}_{response_length}` prevents repeated fetches
  3. Provider health entry added for `af_h2h`
*/

-- ─────────────────────────────────────────────
-- Raw storage
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_h2h_raw (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_team1_id    integer NOT NULL,
  af_team2_id    integer NOT NULL,
  response_hash  text UNIQUE NOT NULL,
  response_json  jsonb,
  http_status    integer,
  matches_count  integer DEFAULT 0,
  fetched_at     timestamptz DEFAULT now(),
  transform_status text DEFAULT 'pending',
  transform_error  text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_h2h_raw_team_pair
  ON af_h2h_raw(LEAST(af_team1_id, af_team2_id), GREATEST(af_team1_id, af_team2_id));

CREATE INDEX IF NOT EXISTS idx_af_h2h_raw_fetched_at
  ON af_h2h_raw(fetched_at DESC);

ALTER TABLE af_h2h_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read h2h raw"
  ON af_h2h_raw FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────
-- Normalized — one row per historical fixture
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_h2h_normalized (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_fixture_id    integer NOT NULL,
  af_team1_id      integer NOT NULL,  -- canonical smaller ID (the pair key)
  af_team2_id      integer NOT NULL,  -- canonical larger ID (the pair key)
  home_team_id     integer,
  away_team_id     integer,
  home_team_name   text,
  away_team_name   text,
  home_goals       integer,
  away_goals       integer,
  winner_team_id   integer,           -- NULL = draw
  venue_id         integer,
  venue_name       text,
  venue_city       text,
  af_league_id     integer,
  league_name      text,
  af_season        integer,
  match_date       date,
  match_status     text,
  match_elapsed    integer,
  ht_home_goals    integer,
  ht_away_goals    integer,
  et_home_goals    integer,
  et_away_goals    integer,
  pen_home_goals   integer,
  pen_away_goals   integer,
  raw_payload      jsonb,
  synced_at        timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (af_fixture_id, af_team1_id, af_team2_id)
);

CREATE INDEX IF NOT EXISTS idx_af_h2h_norm_pair
  ON af_h2h_normalized(af_team1_id, af_team2_id, match_date DESC);

CREATE INDEX IF NOT EXISTS idx_af_h2h_norm_fixture
  ON af_h2h_normalized(af_fixture_id);

CREATE INDEX IF NOT EXISTS idx_af_h2h_norm_date
  ON af_h2h_normalized(match_date DESC);

ALTER TABLE af_h2h_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read h2h normalized"
  ON af_h2h_normalized FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read h2h normalized"
  ON af_h2h_normalized FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────────
-- Provider health entry
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'af_provider_feeds') THEN
    INSERT INTO af_provider_feeds (feed_key, feed_label, stale_hours_threshold)
    VALUES ('af_h2h', 'H2H Geçmişi', 168)
    ON CONFLICT (feed_key) DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- invoke_h2h_sync — pg_net HTTP POST wrapper
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoke_h2h_sync(
  p_team1_id integer DEFAULT NULL,
  p_team2_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url      text;
  v_key      text;
  v_body     jsonb;
BEGIN
  v_url := current_setting('app.supabase_url', true)
    || '/functions/v1/af-headtohead';
  v_key := current_setting('app.service_role_key', true);

  v_body := jsonb_build_object(
    'team1_id', p_team1_id,
    'team2_id', p_team2_id
  );

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
-- Recent H2H summary view (public, no auth required)
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_recent_h2h_summary AS
SELECT
  af_team1_id,
  af_team2_id,
  COUNT(*)                                                              AS total_matches,
  COUNT(*) FILTER (WHERE winner_team_id = af_team1_id)                 AS team1_wins,
  COUNT(*) FILTER (WHERE winner_team_id = af_team2_id)                 AS team2_wins,
  COUNT(*) FILTER (WHERE winner_team_id IS NULL)                       AS draws,
  ROUND(AVG(home_goals + away_goals)::numeric, 2)                      AS avg_total_goals,
  ROUND(AVG(home_goals)::numeric, 2)                                   AS avg_home_goals,
  ROUND(AVG(away_goals)::numeric, 2)                                   AS avg_away_goals,
  MAX(match_date)                                                       AS last_meeting_date,
  MIN(match_date)                                                       AS first_meeting_date,
  COUNT(*) FILTER (WHERE match_date >= CURRENT_DATE - INTERVAL '3 years') AS recent_3y_count,
  COUNT(*) FILTER (WHERE winner_team_id IS NULL
                     AND match_date >= CURRENT_DATE - INTERVAL '3 years') AS recent_3y_draws
FROM af_h2h_normalized
WHERE match_status IN ('FT', 'AET', 'PEN', 'Match Finished')
GROUP BY af_team1_id, af_team2_id;

-- ─────────────────────────────────────────────
-- Public RPC: get_h2h_summary
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_h2h_summary(
  p_home_team_id integer,
  p_away_team_id integer,
  p_limit        integer DEFAULT 10
)
RETURNS TABLE (
  af_fixture_id    integer,
  match_date       date,
  home_team_name   text,
  away_team_name   text,
  home_goals       integer,
  away_goals       integer,
  winner_team_id   integer,
  league_name      text,
  af_season        integer,
  venue_name       text,
  ht_home_goals    integer,
  ht_away_goals    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t1 integer := LEAST(p_home_team_id, p_away_team_id);
  v_t2 integer := GREATEST(p_home_team_id, p_away_team_id);
BEGIN
  RETURN QUERY
  SELECT
    n.af_fixture_id,
    n.match_date,
    n.home_team_name,
    n.away_team_name,
    n.home_goals,
    n.away_goals,
    n.winner_team_id,
    n.league_name,
    n.af_season,
    n.venue_name,
    n.ht_home_goals,
    n.ht_away_goals
  FROM af_h2h_normalized n
  WHERE n.af_team1_id = v_t1
    AND n.af_team2_id = v_t2
    AND n.match_status IN ('FT', 'AET', 'PEN', 'Match Finished')
  ORDER BY n.match_date DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_h2h_summary(integer, integer, integer) TO anon, authenticated;
