
/*
  # Fix brain tables RLS — use profiles.role instead of app_metadata

  The admin user has role stored in public.profiles.role = 'admin', NOT in
  auth.jwt() app_metadata. The three brain tables were using app_metadata check
  which always returns false for this user, causing the DailyMonitor page to
  show empty brain/run/master data.

  Replace all three policies with profiles-based admin check, matching the
  pattern used on prematch_prediction_drafts and match_story_drafts.
*/

-- prematch_brain_runs
DROP POLICY IF EXISTS "Admin can read brain runs" ON model_lab.prematch_brain_runs;
CREATE POLICY "Admins can read brain runs"
  ON model_lab.prematch_brain_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- prematch_brain_outputs
DROP POLICY IF EXISTS "Admin can read brain outputs" ON model_lab.prematch_brain_outputs;
CREATE POLICY "Admins can read brain outputs"
  ON model_lab.prematch_brain_outputs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- prematch_master_brain_outputs
DROP POLICY IF EXISTS "Admin can read master brain outputs" ON model_lab.prematch_master_brain_outputs;
CREATE POLICY "Admins can read master brain outputs"
  ON model_lab.prematch_master_brain_outputs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
