
/*
  # Make match_story_drafts.generated_by nullable

  The generate_prematch_scenario function inserts into match_story_drafts
  with generated_by = p_triggered_by which can be NULL when called from the
  automated pipeline. The column currently has a NOT NULL constraint that
  blocks this. Making it nullable matches the pattern already applied to
  prematch_prediction_drafts.generated_by.
*/

ALTER TABLE model_lab.match_story_drafts
  ALTER COLUMN generated_by DROP NOT NULL;
