/*
  # WC History — Grant schema usage + table select to anon/authenticated

  PostgREST requires both USAGE on schema and SELECT on tables.
  wc_history schema was already exposed to PostgREST via search_path,
  but anon/authenticated roles lacked SELECT grants.
*/

GRANT USAGE ON SCHEMA wc_history TO anon, authenticated;

GRANT SELECT ON wc_history.editions TO anon, authenticated;
GRANT SELECT ON wc_history.matches  TO anon, authenticated;
GRANT SELECT ON wc_history.teams    TO anon, authenticated;
