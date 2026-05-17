
/*
  # Make prematch_prediction_drafts.generated_by nullable

  Allows prediction generation from SQL console / automated functions
  without a user context.
*/

ALTER TABLE model_lab.prematch_prediction_drafts
  ALTER COLUMN generated_by DROP NOT NULL;
