/*
  # Replace wch_get_match_ids_by_year with offset-capable version

  ## Summary
  Drops old single-arg signature, replaces with offset+limit version.
*/

DROP FUNCTION IF EXISTS public.wch_get_match_ids_by_year(integer);

CREATE OR REPLACE FUNCTION public.wch_get_match_ids_by_year(
  p_year   integer,
  p_offset integer DEFAULT 0,
  p_limit  integer DEFAULT 100
)
RETURNS TABLE(id uuid, provider_fixture_id integer)
LANGUAGE sql SECURITY DEFINER SET search_path = wc_history, public
AS $$
  SELECT id, provider_fixture_id
  FROM wc_history.matches
  WHERE edition_year = p_year AND provider_fixture_id IS NOT NULL
  ORDER BY kickoff_utc ASC NULLS LAST
  OFFSET p_offset LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.wch_get_match_ids_by_year(integer, integer, integer) TO service_role;
