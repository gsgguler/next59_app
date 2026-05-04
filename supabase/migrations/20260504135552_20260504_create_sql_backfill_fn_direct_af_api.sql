/*
  # SQL-native AF backfill functions using pg_net directly

  Problem: pg_net cannot reach the project's own edge functions (DNS timeout).
  Solution: bypass edge functions — call the AF API directly from PL/pgSQL
  via pg_net async HTTP, one request per unfetched fixture.

  Pattern:
  1. Pull a chunk of unfetched fixture IDs via get_unfetched_*_fixtures()
  2. Fire pg_net.http_get for each → stored async in net.http_queue
  3. A second pass (process_af_*_responses) reads resolved responses and
     inserts rows into the *_raw tables

  This separates concern: cron fires queue_af_*_batch() every minute,
  and process_af_*_responses() every minute (offset by 30s) to harvest.

  AF API key is read from vault: 'api_football_key'
*/

-- ── Helper: get AF API key from vault ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_af_api_key()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'api_football_key' LIMIT 1;
$$;

-- ── Queue lineups batch ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_af_lineups_batch(p_chunk_size integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key  text := public.get_af_api_key();
  v_row  RECORD;
  v_queued integer := 0;
BEGIN
  IF v_key IS NULL THEN
    RAISE WARNING 'queue_af_lineups_batch: AF API key not found in vault';
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT match_id, api_football_fixture_id
    FROM public.get_unfetched_lineup_fixtures(p_limit := p_chunk_size)
  LOOP
    PERFORM net.http_get(
      url     := 'https://v3.football.api-sports.io/fixtures/lineups?fixture=' || v_row.api_football_fixture_id,
      headers := jsonb_build_object('x-apisports-key', v_key)
    );
    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$;

-- ── Queue statistics batch ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_af_statistics_batch(p_chunk_size integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key  text := public.get_af_api_key();
  v_row  RECORD;
  v_queued integer := 0;
BEGIN
  IF v_key IS NULL THEN RAISE WARNING 'AF API key not found'; RETURN 0; END IF;

  FOR v_row IN
    SELECT match_id, api_football_fixture_id
    FROM public.get_unfetched_statistics_fixtures(p_limit := p_chunk_size)
  LOOP
    PERFORM net.http_get(
      url     := 'https://v3.football.api-sports.io/fixtures/statistics?fixture=' || v_row.api_football_fixture_id,
      headers := jsonb_build_object('x-apisports-key', v_key)
    );
    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$;

-- ── Queue events batch ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_af_events_batch(p_chunk_size integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key  text := public.get_af_api_key();
  v_row  RECORD;
  v_queued integer := 0;
BEGIN
  IF v_key IS NULL THEN RAISE WARNING 'AF API key not found'; RETURN 0; END IF;

  FOR v_row IN
    SELECT match_id, api_football_fixture_id
    FROM public.get_unfetched_events_fixtures(p_limit := p_chunk_size)
  LOOP
    PERFORM net.http_get(
      url     := 'https://v3.football.api-sports.io/fixtures/events?fixture=' || v_row.api_football_fixture_id,
      headers := jsonb_build_object('x-apisports-key', v_key)
    );
    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$;

-- ── Queue player stats batch ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_af_playerstats_batch(p_chunk_size integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key  text := public.get_af_api_key();
  v_row  RECORD;
  v_queued integer := 0;
BEGIN
  IF v_key IS NULL THEN RAISE WARNING 'AF API key not found'; RETURN 0; END IF;

  FOR v_row IN
    SELECT match_id, api_football_fixture_id
    FROM public.get_unfetched_playerstats_fixtures(p_limit := p_chunk_size)
  LOOP
    PERFORM net.http_get(
      url     := 'https://v3.football.api-sports.io/fixtures/players?fixture=' || v_row.api_football_fixture_id,
      headers := jsonb_build_object('x-apisports-key', v_key)
    );
    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
END;
$$;
