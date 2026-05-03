/*
  # WC History — openfootball RPC bridges for 1930–2006 ingest + view grant fix

  ## Summary
  - Adds RPC bridge functions for openfootball 1930–2006 ingestion
  - Fixes v_world_cup_matches GRANT (lost on DROP+CREATE in score semantics migration)
  - Adds unique constraint for match idempotency
  - Ensures editions columns exist

  ## New Functions
  - wch_upsert_edition_full: upsert edition with host/dates/champion/counts
  - wch_upsert_teams_bulk: bulk upsert teams (idempotent on edition_year+name_en)
  - wch_insert_of_matches: bulk insert openfootball matches with score semantics
  - wch_store_of_raw: store raw openfootball JSON (idempotent on hash)
  - wch_mark_of_raw_transformed: mark raw row as transformed
  - wch_get_of_raw_editions: list stored openfootball editions
  - wch_get_edition_match_counts: per-edition completeness summary

  ## Separation
  - public.matches: NOT TOUCHED
  - model_lab: NOT TOUCHED
  - predictions: NOT TOUCHED
*/

-- ── Fix view GRANT (lost on DROP+CREATE) ──────────────────────────────────────
GRANT SELECT ON public.v_world_cup_matches TO anon, authenticated;

-- ── Ensure editions columns exist ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='editions' AND column_name='champion') THEN
    ALTER TABLE wc_history.editions ADD COLUMN champion text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='editions' AND column_name='total_teams') THEN
    ALTER TABLE wc_history.editions ADD COLUMN total_teams integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='editions' AND column_name='total_matches') THEN
    ALTER TABLE wc_history.editions ADD COLUMN total_matches integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='editions' AND column_name='end_date') THEN
    ALTER TABLE wc_history.editions ADD COLUMN end_date date;
  END IF;
END $$;

-- ── Add unique constraint for match idempotency ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wc_history_matches_of_uq'
      AND conrelid = 'wc_history.matches'::regclass
  ) THEN
    ALTER TABLE wc_history.matches
      ADD CONSTRAINT wc_history_matches_of_uq
      UNIQUE (edition_year, match_date, home_team_name, away_team_name);
  END IF;
END $$;

-- ── wch_upsert_edition_full ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_upsert_edition_full(
  p_year          integer,
  p_host          text    DEFAULT NULL,
  p_start_date    date    DEFAULT NULL,
  p_end_date      date    DEFAULT NULL,
  p_total_teams   integer DEFAULT NULL,
  p_total_matches integer DEFAULT NULL,
  p_champion      text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wc_history.editions (
    edition_year, host_country, start_date, end_date,
    total_teams, total_matches, champion, data_quality_status
  ) VALUES (
    p_year, p_host, p_start_date, p_end_date,
    p_total_teams, p_total_matches, p_champion, 'ok'
  )
  ON CONFLICT (edition_year) DO UPDATE SET
    host_country  = COALESCE(EXCLUDED.host_country,  editions.host_country),
    start_date    = COALESCE(EXCLUDED.start_date,    editions.start_date),
    end_date      = COALESCE(EXCLUDED.end_date,      editions.end_date),
    total_teams   = COALESCE(EXCLUDED.total_teams,   editions.total_teams),
    total_matches = COALESCE(EXCLUDED.total_matches, editions.total_matches),
    champion      = COALESCE(EXCLUDED.champion,      editions.champion);
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_upsert_edition_full TO service_role;

-- ── wch_upsert_teams_bulk ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_upsert_teams_bulk(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row jsonb;
  v_cnt int := 0;
BEGIN
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO wc_history.teams (edition_year, name_en)
    VALUES ((v_row->>'edition_year')::int, v_row->>'name_en')
    ON CONFLICT (edition_year, name_en) DO NOTHING;
    v_cnt := v_cnt + 1;
  END LOOP;
  RETURN v_cnt;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_upsert_teams_bulk TO service_role;

-- ── wch_insert_of_matches ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_of_matches(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row     jsonb;
  v_cnt     int := 0;
  v_home_id uuid;
  v_away_id uuid;
  v_ft_h    int;
  v_ft_a    int;
BEGIN
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    SELECT id INTO v_home_id FROM wc_history.teams
      WHERE edition_year = (v_row->>'edition_year')::int
        AND name_en = v_row->>'home_team_name' LIMIT 1;
    SELECT id INTO v_away_id FROM wc_history.teams
      WHERE edition_year = (v_row->>'edition_year')::int
        AND name_en = v_row->>'away_team_name' LIMIT 1;

    v_ft_h := COALESCE(
      NULLIF(v_row->>'home_score_aet', '')::int,
      NULLIF(v_row->>'home_score_90',  '')::int
    );
    v_ft_a := COALESCE(
      NULLIF(v_row->>'away_score_aet', '')::int,
      NULLIF(v_row->>'away_score_90',  '')::int
    );

    INSERT INTO wc_history.matches (
      edition_year, match_no, stage_code, stage_name_en, group_name,
      match_date, kickoff_utc,
      home_team_id, away_team_id, home_team_name, away_team_name,
      home_score_ft, away_score_ft, result,
      venue_name, city, attendance,
      home_score_90, away_score_90, result_90,
      home_score_aet, away_score_aet, result_aet,
      home_penalties, away_penalties, result_penalties,
      final_winner_name, decided_by, score_semantics_status,
      source_provider, source_url, data_quality_status, fixture_status
    ) VALUES (
      (v_row->>'edition_year')::int,
      NULLIF(v_row->>'match_no', '')::int,
      v_row->>'stage_code',
      v_row->>'stage_name_en',
      NULLIF(v_row->>'group_name', ''),
      (v_row->>'match_date')::date,
      ((v_row->>'match_date') || 'T12:00:00Z')::timestamptz,
      v_home_id, v_away_id,
      v_row->>'home_team_name', v_row->>'away_team_name',
      v_ft_h, v_ft_a,
      v_row->>'result',
      NULLIF(v_row->>'venue_name', ''),
      NULLIF(v_row->>'city', ''),
      NULLIF(v_row->>'attendance', '')::int,
      NULLIF(v_row->>'home_score_90',  '')::int,
      NULLIF(v_row->>'away_score_90',  '')::int,
      NULLIF(v_row->>'result_90', ''),
      NULLIF(v_row->>'home_score_aet', '')::int,
      NULLIF(v_row->>'away_score_aet', '')::int,
      NULLIF(v_row->>'result_aet', ''),
      NULLIF(v_row->>'home_penalties', '')::int,
      NULLIF(v_row->>'away_penalties', '')::int,
      NULLIF(v_row->>'result_penalties', ''),
      NULLIF(v_row->>'final_winner_name', ''),
      v_row->>'decided_by',
      COALESCE(NULLIF(v_row->>'score_semantics_status', ''), 'verified'),
      'openfootball',
      'https://github.com/openfootball/worldcup.json',
      'verified_from_openfootball',
      'verified_official'
    )
    ON CONFLICT (edition_year, match_date, home_team_name, away_team_name)
    DO NOTHING;
    v_cnt := v_cnt + 1;
  END LOOP;
  RETURN v_cnt;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_insert_of_matches TO service_role;

-- ── wch_store_of_raw ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_store_of_raw(
  p_year       integer,
  p_source_url text,
  p_hash       text,
  p_json       jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wc_history.raw_openfootball_responses
    (source, source_url, edition_year, response_hash, response_json, transform_status)
  VALUES
    ('openfootball_worldcup_json', p_source_url, p_year, p_hash, p_json, 'raw')
  ON CONFLICT (response_hash) DO NOTHING;
  RETURN p_hash;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_store_of_raw TO service_role;

-- ── wch_mark_of_raw_transformed ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_mark_of_raw_transformed(p_year integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE wc_history.raw_openfootball_responses
  SET transform_status = 'transformed'
  WHERE edition_year = p_year;
$$;
GRANT EXECUTE ON FUNCTION public.wch_mark_of_raw_transformed TO service_role;

-- ── wch_get_of_raw_editions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_get_of_raw_editions()
RETURNS TABLE(edition_year integer, transform_status text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT edition_year, transform_status
  FROM wc_history.raw_openfootball_responses
  ORDER BY edition_year;
$$;
GRANT EXECUTE ON FUNCTION public.wch_get_of_raw_editions TO service_role;

-- ── wch_get_edition_match_counts ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_get_edition_match_counts()
RETURNS TABLE(
  edition_year        integer,
  match_count         bigint,
  missing_result      bigint,
  missing_venue       bigint,
  missing_city        bigint,
  missing_score       bigint,
  missing_stage       bigint,
  missing_group_in_gs bigint,
  verified            bigint,
  inferred            bigint,
  needs_review        bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.edition_year,
    COUNT(*)                                                                    AS match_count,
    COUNT(*) FILTER (WHERE m.result IS NULL)                                    AS missing_result,
    COUNT(*) FILTER (WHERE m.venue_name IS NULL)                                AS missing_venue,
    COUNT(*) FILTER (WHERE m.city IS NULL)                                      AS missing_city,
    COUNT(*) FILTER (WHERE m.home_score_ft IS NULL OR m.away_score_ft IS NULL)  AS missing_score,
    COUNT(*) FILTER (WHERE m.stage_code IS NULL)                                AS missing_stage,
    COUNT(*) FILTER (WHERE m.group_name IS NULL AND m.stage_code ILIKE '%group%') AS missing_group_in_gs,
    COUNT(*) FILTER (WHERE m.score_semantics_status = 'verified')               AS verified,
    COUNT(*) FILTER (WHERE m.score_semantics_status = 'inferred_from_sources')  AS inferred,
    COUNT(*) FILTER (WHERE m.score_semantics_status IN ('needs_review','conflict_unresolved')) AS needs_review
  FROM wc_history.matches m
  GROUP BY m.edition_year
  ORDER BY m.edition_year;
$$;
GRANT EXECUTE ON FUNCTION public.wch_get_edition_match_counts TO service_role, authenticated;
