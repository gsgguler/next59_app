/*
  # Operational Hardening — Phase 2: Pipeline Run Logging

  ## Summary
  Creates model_lab.prematch_pipeline_runs to record every execution of the
  daily pre-match pipeline. Append-only. Admin-readable only via RLS.

  ## New table: model_lab.prematch_pipeline_runs
  - id, started_at, completed_at, status, horizon_days
  - fixtures_seen, readiness_processed, features_generated
  - predictions_generated, brain_packages_generated, scenarios_generated
  - story_drafts_generated, skipped_existing, blocked_count, error_count
  - errors_json (array of error objects)

  ## Security
  RLS: authenticated SELECT only for profiles.role = 'admin'
  No public exposure.
*/

CREATE TABLE IF NOT EXISTS model_lab.prematch_pipeline_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  status                 text NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running','completed','failed')),
  horizon_days           int NOT NULL DEFAULT 14,
  fixtures_seen          int NOT NULL DEFAULT 0,
  readiness_processed    int NOT NULL DEFAULT 0,
  features_generated     int NOT NULL DEFAULT 0,
  predictions_generated  int NOT NULL DEFAULT 0,
  brain_packages_generated int NOT NULL DEFAULT 0,
  scenarios_generated    int NOT NULL DEFAULT 0,
  story_drafts_generated int NOT NULL DEFAULT 0,
  skipped_existing       int NOT NULL DEFAULT 0,
  blocked_count          int NOT NULL DEFAULT 0,
  error_count            int NOT NULL DEFAULT 0,
  errors_json            jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE model_lab.prematch_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read pipeline runs"
  ON model_lab.prematch_pipeline_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Service role can insert pipeline runs"
  ON model_lab.prematch_pipeline_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update pipeline runs"
  ON model_lab.prematch_pipeline_runs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast latest-run lookup
CREATE INDEX IF NOT EXISTS prematch_pipeline_runs_started_idx
  ON model_lab.prematch_pipeline_runs (started_at DESC);

GRANT SELECT ON model_lab.prematch_pipeline_runs TO authenticated;
GRANT ALL ON model_lab.prematch_pipeline_runs TO service_role;
