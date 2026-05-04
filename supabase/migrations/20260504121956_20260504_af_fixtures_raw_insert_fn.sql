/*
  # RPC bridge: af_upsert_fixtures_raw

  Inserts a batch of AF fixture rows into shared.af_fixtures_raw
  from an edge function, bypassing PostgREST schema exposure limits.
  Called via supabase.rpc("af_upsert_fixtures_raw", { rows: [...] }).

  Input: JSON array of objects with keys:
    fixture_id  INTEGER
    league_id   INTEGER
    season      INTEGER
    raw_response JSONB

  Returns: count of rows inserted (conflicts silently skipped).
*/

CREATE OR REPLACE FUNCTION public.af_upsert_fixtures_raw(rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
DECLARE
  inserted INTEGER := 0;
  r JSONB;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO shared.af_fixtures_raw(fixture_id, league_id, season, raw_response)
    VALUES (
      (r->>'fixture_id')::INTEGER,
      (r->>'league_id')::INTEGER,
      (r->>'season')::INTEGER,
      r->'raw_response'
    )
    ON CONFLICT (fixture_id) DO NOTHING;

    IF FOUND THEN inserted := inserted + 1; END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.af_upsert_fixtures_raw(JSONB) TO service_role;
