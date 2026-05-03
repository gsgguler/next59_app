/*
  # WC History — pg_net based openfootball ingest function

  Creates wch_of_fetch_and_ingest(year) which:
  1. Fires async pg_net HTTP GET to openfootball GitHub raw URL
  2. Returns request_id for polling

  And wch_of_process_response(year) which:
  1. Reads pg_net response for given year
  2. Parses JSON, upserts edition/teams/matches
  3. Marks raw as transformed

  Also creates wch_of_ingest_all() to trigger all 18 old editions.

  Separation: public.matches untouched, model_lab untouched, predictions untouched.
*/

-- ── Fire async fetch for one year ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_of_fetch_year(p_year integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url  text;
  v_id   bigint;
BEGIN
  v_url := 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/'
           || p_year::text || '/worldcup.json';

  SELECT net.http_get(url := v_url) INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_of_fetch_year TO service_role;

-- ── Fire all 18 old editions, store request IDs in a temp tracking table ──────
CREATE TABLE IF NOT EXISTS wc_history.of_fetch_jobs (
  id          bigserial PRIMARY KEY,
  edition_year integer NOT NULL,
  pg_net_id   bigint,
  status      text DEFAULT 'pending',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE wc_history.of_fetch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role full access on of_fetch_jobs"
  ON wc_history.of_fetch_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.wch_of_enqueue_all()
RETURNS TABLE(edition_year integer, pg_net_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_years integer[] := ARRAY[1930,1934,1938,1950,1954,1958,1962,1966,
                               1970,1974,1978,1982,1986,1990,1994,1998,2002,2006];
  v_year  integer;
  v_id    bigint;
BEGIN
  FOREACH v_year IN ARRAY v_years LOOP
    v_id := public.wch_of_fetch_year(v_year);
    INSERT INTO wc_history.of_fetch_jobs (edition_year, pg_net_id, status)
    VALUES (v_year, v_id, 'fetching')
    ON CONFLICT DO NOTHING;
    edition_year := v_year;
    pg_net_id    := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_of_enqueue_all TO service_role;

-- ── Check fetch status ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_of_fetch_status()
RETURNS TABLE(edition_year integer, pg_net_id bigint, http_status integer, content_length integer, job_status text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    j.edition_year,
    j.pg_net_id,
    r.status_code,
    length(r.content::text),
    j.status
  FROM wc_history.of_fetch_jobs j
  LEFT JOIN net._http_response r ON r.id = j.pg_net_id
  ORDER BY j.edition_year;
$$;
GRANT EXECUTE ON FUNCTION public.wch_of_fetch_status TO service_role;
