/*
  # Security Lockdown — Revoke Unsafe Public/Anon Grants

  ## Summary
  Closes CRITICAL and HIGH severity security findings from 2026-05-18 audit.

  ## Changes

  1. exec_sql — revoke from PUBLIC, anon, authenticated (arbitrary SQL; not SECURITY DEFINER)
  2. get_af_api_key — revoke from PUBLIC and anon (SECURITY DEFINER reads Vault API key)
  3. model_lab.calibration_predictions_v1 — replace USING(true) policies with admin-only
  4. model_lab.prematch_prediction_drafts — add INSERT, UPDATE grant for authenticated
  5. system_mode — seed 'normal' initial row if table is empty
*/

-- ============================================================
-- 1. REVOKE exec_sql from PUBLIC, anon, authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- ============================================================
-- 2. REVOKE get_af_api_key from PUBLIC and anon
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_af_api_key() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_af_api_key() FROM anon;

-- ============================================================
-- 3. Fix model_lab.calibration_predictions_v1 open RLS policies
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read calibration predictions"   ON model_lab.calibration_predictions_v1;
DROP POLICY IF EXISTS "Authenticated users can insert calibration predictions"  ON model_lab.calibration_predictions_v1;
DROP POLICY IF EXISTS "Authenticated users can delete calibration predictions"  ON model_lab.calibration_predictions_v1;

CREATE POLICY "Admin can read calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can insert calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 4. Grant INSERT, UPDATE on prematch_prediction_drafts
-- ============================================================
GRANT INSERT, UPDATE ON model_lab.prematch_prediction_drafts TO authenticated;

-- ============================================================
-- 5. Seed system_mode with 'normal' if table is empty
-- Valid modes: normal | maintenance | read_only | emergency
-- ============================================================
INSERT INTO public.system_mode (id, mode, message, updated_at)
SELECT
  gen_random_uuid(),
  'normal',
  'System operational',
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.system_mode LIMIT 1);
