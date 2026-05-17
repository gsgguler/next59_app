
/*
  # Extend admin_generation_jobs check constraints

  Adds 'prematch_prediction' and 'prematch_scenario' to job_type.
  Adds 'queued' and 'completed' to status (alongside existing values).
  Keeps all existing values intact.
*/

ALTER TABLE model_lab.admin_generation_jobs
  DROP CONSTRAINT IF EXISTS admin_generation_jobs_job_type_check;

ALTER TABLE model_lab.admin_generation_jobs
  ADD CONSTRAINT admin_generation_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY[
    'prediction_draft', 'story_draft', 'calibration_metrics',
    'walk_forward', 'feature_matrix', 'elo_rerun',
    'prematch_prediction', 'prematch_scenario'
  ]));

ALTER TABLE model_lab.admin_generation_jobs
  DROP CONSTRAINT IF EXISTS admin_generation_jobs_status_check;

ALTER TABLE model_lab.admin_generation_jobs
  ADD CONSTRAINT admin_generation_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'running', 'done', 'failed', 'cancelled',
    'queued', 'completed'
  ]));
