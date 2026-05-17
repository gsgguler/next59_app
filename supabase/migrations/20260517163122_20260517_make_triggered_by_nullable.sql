
/*
  # Make admin_generation_jobs.triggered_by nullable

  Allows prediction generation to be triggered from SQL console, cron jobs,
  or internal functions without a user context.
*/

ALTER TABLE model_lab.admin_generation_jobs
  ALTER COLUMN triggered_by DROP NOT NULL;
