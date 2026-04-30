/*
  # Expose model_lab schema to PostgREST

  ## Purpose
  Allow the supabase-js client (used in edge functions and frontend) to access
  model_lab tables via the PostgREST REST API using .schema('model_lab').

  ## Changes
  - Grant USAGE on model_lab schema to authenticator, anon, authenticated, and service_role
  - Grant table-level SELECT/INSERT/UPDATE to service_role (for edge function runs)
  - Grant table-level SELECT/INSERT/UPDATE to authenticated (admin users, controlled by RLS)
  - RLS policies already restrict access to admin users only — this grant does NOT open
    public access; the existing RLS policies remain the final gate.

  ## Notes
  - anon gets no table-level grants, only schema usage (still blocked by RLS/no policies)
  - service_role bypasses RLS entirely — correct for edge function runner
*/

-- Schema visibility
GRANT USAGE ON SCHEMA model_lab TO anon, authenticated, service_role;

-- service_role: full table access (bypasses RLS, needed for edge function runner)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA model_lab TO service_role;

-- authenticated: table-level access (RLS policies restrict to admin only)
GRANT SELECT, INSERT, UPDATE ON model_lab.model_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.backtest_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.match_feature_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.match_model_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.match_model_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_summary TO authenticated;
