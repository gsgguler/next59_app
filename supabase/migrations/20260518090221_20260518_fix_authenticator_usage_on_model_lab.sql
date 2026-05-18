/*
  # Fix: Grant USAGE on model_lab to authenticator role

  ## Root Cause
  PostgREST connects to the database AS the `authenticator` role. Schema introspection
  (the cache PostgREST builds at startup) runs as authenticator. Without USAGE on
  model_lab granted directly to the authenticator role, PostgREST cannot see any
  model_lab objects during introspection — so they never enter the schema cache.

  All prior migrations granted USAGE to `anon`, `authenticated`, `service_role` —
  but NOT to `authenticator`. This is the sole reason for the 404
  "table not found in schema cache" error despite pgrst.db_schemas being correctly set.

  Additionally: migration 20260504_expose_shared_schema_to_postgrest overwrote
  pgrst.db_schemas to 'public,shared', losing model_lab. This migration re-sets the
  full correct list: public, shared, model_lab.

  ## Changes
  1. GRANT USAGE ON SCHEMA model_lab TO authenticator  ← the actual fix
  2. Re-set pgrst.db_schemas to include public, shared, model_lab (all three)
  3. NOTIFY pgrst to reload immediately

  ## Safety
  - No tables dropped
  - No RLS changed
  - No policies changed
  - Idempotent
*/

-- THE FIX: grant schema visibility to authenticator so PostgREST can introspect it
GRANT USAGE ON SCHEMA model_lab TO authenticator;

-- Also re-confirm shared and public are included (shared was set by a prior migration)
GRANT USAGE ON SCHEMA shared TO authenticator;

-- Set the complete correct schema list (public + shared + model_lab)
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, shared, model_lab';

-- Reload PostgREST config so the new introspection takes effect immediately
NOTIFY pgrst, 'reload config';
