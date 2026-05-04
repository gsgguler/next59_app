/*
  # Expose shared schema to PostgREST

  Adds 'shared' to the PostgREST exposed schemas so that
  supabase-js .schema("shared") calls work from edge functions.

  Also grants anon/authenticated read access is NOT added —
  only service_role policies exist on shared.af_fixtures_raw.
*/

DO $$
BEGIN
  -- Expose shared schema to PostgREST
  ALTER ROLE authenticator SET pgrst.db_schemas = 'public,shared';
EXCEPTION WHEN OTHERS THEN
  -- If authenticator role doesn't exist, try anon approach
  RAISE NOTICE 'Could not set pgrst.db_schemas on authenticator: %', SQLERRM;
END $$;

-- Notify PostgREST to reload config
SELECT pg_notify('pgrst', 'reload config');
