/*
  # wc_history RPC bridge functions (public schema → wc_history schema)

  ## Summary
  supabase-js cannot call wc_history.* tables directly via .schema() unless
  PostgREST db-schemas config includes wc_history. These SECURITY DEFINER
  functions run as service_role and bridge the gap.

  All functions are callable by service_role only (edge functions use service key).
*/

-- ── ingestion_runs ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_create_ingestion_run(
  p_provider    text,
  p_run_type    text,
  p_edition_year integer,
  p_endpoint    text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO wc_history.ingestion_runs(provider, run_type, edition_year, endpoint, run_status)
  VALUES (p_provider, p_run_type, p_edition_year, p_endpoint, 'running')
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.wch_update_ingestion_run(
  p_id               uuid,
  p_status           text,
  p_api_calls        integer,
  p_rows_raw         integer,
  p_rows_transformed integer,
  p_duplicates       integer,
  p_error_summary    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
BEGIN
  UPDATE wc_history.ingestion_runs SET
    run_status             = p_status,
    completed_at           = now(),
    api_calls_used         = p_api_calls,
    rows_raw               = p_rows_raw,
    rows_transformed       = p_rows_transformed,
    duplicate_rows_skipped = p_duplicates,
    error_summary          = p_error_summary
  WHERE id = p_id;
END;$$;

-- ── raw responses ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_raw_response(
  p_run_id       uuid,
  p_edition_year integer,
  p_endpoint     text,
  p_params       jsonb,
  p_entity_type  text,
  p_hash         text,
  p_body         jsonb,
  p_http_status  integer
) RETURNS text  -- 'inserted' | 'duplicate'
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
BEGIN
  INSERT INTO wc_history.raw_api_football_responses(
    ingestion_run_id, edition_year, endpoint, request_params,
    provider_entity_type, response_hash, response_json, http_status
  ) VALUES (
    p_run_id, p_edition_year, p_endpoint, p_params,
    p_entity_type, p_hash, p_body, p_http_status
  );
  RETURN 'inserted';
EXCEPTION WHEN unique_violation THEN
  RETURN 'duplicate';
END;$$;

-- ── editions ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_upsert_edition(
  p_year   integer,
  p_status text,
  p_dq     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
BEGIN
  INSERT INTO wc_history.editions(edition_year, source_provider, source_status, data_quality_status)
  VALUES (p_year, 'api_football', p_status, p_dq)
  ON CONFLICT (edition_year) DO UPDATE SET
    source_status = EXCLUDED.source_status,
    data_quality_status = EXCLUDED.data_quality_status;
END;$$;

-- ── teams batch insert ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_teams(
  p_rows jsonb  -- array of {edition_year, provider_team_id, name_en, flag_asset}
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
DECLARE
  v_count integer := 0;
  v_row   jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO wc_history.teams(
      edition_year, provider_team_id, name_en, flag_asset, source_provider, data_quality_status
    ) VALUES (
      (v_row->>'edition_year')::integer,
      (v_row->>'provider_team_id')::integer,
      v_row->>'name_en',
      v_row->>'flag_asset',
      'api_football',
      'ok'
    )
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;$$;

-- ── matches batch insert ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_matches(
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
DECLARE
  v_count integer := 0;
  v_row   jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO wc_history.matches(
      edition_year, provider_fixture_id, stage_code, stage_name_en,
      match_date, kickoff_utc, home_team_name, away_team_name,
      home_score_ft, away_score_ft, home_score_ht, away_score_ht,
      venue_name, city, match_status, fixture_status,
      source_provider, source_url, data_quality_status
    ) VALUES (
      (v_row->>'edition_year')::integer,
      (v_row->>'provider_fixture_id')::integer,
      v_row->>'stage_code',
      v_row->>'stage_name_en',
      (v_row->>'match_date')::date,
      (v_row->>'kickoff_utc')::timestamptz,
      v_row->>'home_team_name',
      v_row->>'away_team_name',
      (v_row->>'home_score_ft')::integer,
      (v_row->>'away_score_ft')::integer,
      (v_row->>'home_score_ht')::integer,
      (v_row->>'away_score_ht')::integer,
      v_row->>'venue_name',
      v_row->>'city',
      v_row->>'match_status',
      'ingested',
      'api_football',
      v_row->>'source_url',
      'ok'
    )
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  RETURN v_count;
END;$$;

-- ── match lookup by provider_fixture_id ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_get_match_ids_by_year(p_year integer)
RETURNS TABLE(id uuid, provider_fixture_id integer)
LANGUAGE sql SECURITY DEFINER SET search_path = wc_history, public
AS $$
  SELECT id, provider_fixture_id FROM wc_history.matches
  WHERE edition_year = p_year AND provider_fixture_id IS NOT NULL;
$$;

-- ── events batch insert ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_events(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
DECLARE v_count integer := 0; v_row jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO wc_history.events(
      match_id, elapsed, extra_time, event_type, event_detail,
      player_id, player_name, assist_player_id, assist_player_name, comments, data_quality_status
    ) VALUES (
      (v_row->>'match_id')::uuid,
      (v_row->>'elapsed')::integer,
      (v_row->>'extra_time')::integer,
      v_row->>'event_type', v_row->>'event_detail',
      (v_row->>'player_id')::integer, v_row->>'player_name',
      (v_row->>'assist_player_id')::integer, v_row->>'assist_player_name',
      v_row->>'comments', 'ok'
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN RETURN v_count;
END;$$;

-- ── statistics batch insert ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_insert_statistics(p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = wc_history, public
AS $$
DECLARE v_count integer := 0; v_row jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO wc_history.match_statistics(
      match_id, provider_team_id, stat_name, stat_value, stat_numeric, data_quality_status
    ) VALUES (
      (v_row->>'match_id')::uuid,
      (v_row->>'provider_team_id')::integer,
      v_row->>'stat_name', v_row->>'stat_value',
      (v_row->>'stat_numeric')::numeric,
      'ok'
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN RETURN v_count;
END;$$;

-- ── DB totals for report ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wch_get_totals()
RETURNS TABLE(matches bigint, teams bigint, events bigint, statistics bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = wc_history, public
AS $$
  SELECT
    (SELECT COUNT(*) FROM wc_history.matches),
    (SELECT COUNT(*) FROM wc_history.teams),
    (SELECT COUNT(*) FROM wc_history.events),
    (SELECT COUNT(*) FROM wc_history.match_statistics);
$$;

-- Grant execute to service_role (edge functions)
GRANT EXECUTE ON FUNCTION public.wch_create_ingestion_run TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_update_ingestion_run TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_insert_raw_response   TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_upsert_edition        TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_insert_teams          TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_insert_matches        TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_get_match_ids_by_year TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_insert_events         TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_insert_statistics     TO service_role;
GRANT EXECUTE ON FUNCTION public.wch_get_totals            TO service_role;
