/*
  # Expose model_lab schema to PostgREST db-schemas list

  ## Problem
  The prior migration (20260430173709) granted USAGE and table privileges but never
  added model_lab to PostgREST's exposed schema list. Without this, PostgREST rejects
  any request with Accept-Profile: model_lab header with HTTP 406.

  ## Changes
  1. Sets pgrst.db_schemas to 'public, model_lab' on the authenticator role so
     PostgREST picks it up on reload.
  2. Sends NOTIFY pgrst, 'reload config' to apply immediately without restart.
  3. Grants SELECT on the three tables that were missing authenticated grants
     (league_calibration_state, replay_match_evaluations — these only had
     postgres/service_role grants before).

  ## Safety
  - Does NOT drop anything
  - Does NOT change RLS policies
  - Does NOT change existing grants
  - Idempotent: ALTER ROLE ... SET is safe to re-run
  - Existing public schema exposure is preserved by including it in the list
*/

-- Set the exposed schemas list on the PostgREST authenticator role
-- Must include public to preserve existing behavior
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, model_lab';

-- Signal PostgREST to reload its config immediately
NOTIFY pgrst, 'reload config';

-- Ensure authenticated role has SELECT on the tables that were missing grants
GRANT SELECT ON model_lab.league_calibration_state TO authenticated;
GRANT SELECT ON model_lab.replay_match_evaluations TO authenticated;
GRANT SELECT ON model_lab.upcoming_match_readiness TO authenticated;

-- Also ensure service_role has SELECT on these (it should from prior migration
-- but being explicit for the tables added after that migration ran)
GRANT SELECT ON model_lab.league_calibration_state TO service_role;
GRANT SELECT ON model_lab.replay_match_evaluations TO service_role;
GRANT SELECT ON model_lab.upcoming_match_readiness TO service_role;

-- Grant SELECT on all other model_lab tables added since the prior exposure migration
GRANT SELECT ON model_lab.upcoming_match_readiness TO authenticated;
GRANT SELECT ON model_lab.prematch_prediction_drafts TO authenticated;
GRANT SELECT ON model_lab.prematch_brain_runs TO authenticated;
GRANT SELECT ON model_lab.prematch_brain_outputs TO authenticated;
GRANT SELECT ON model_lab.prematch_master_brain_outputs TO authenticated;
GRANT SELECT ON model_lab.team_elo_ratings TO authenticated;
GRANT SELECT ON model_lab.team_elo_snapshots TO authenticated;
GRANT SELECT ON model_lab.match_feature_matrix_v2 TO authenticated;
