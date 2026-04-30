/*
  # Create model_lab.calibration_adjustments

  ## Purpose
  Stores active correction rules derived from calibration_summary analysis.
  While calibration_summary reports what the model learned (read-only aggregate),
  calibration_adjustments holds actionable rules that future model runs can apply
  to correct systematic biases (e.g., home-bias correction for a specific league).

  ## New Table
  - model_lab.calibration_adjustments
    - id: uuid primary key
    - model_version_id: uuid FK → model_lab.model_versions(id)
    - source_backtest_run_id: uuid FK → model_lab.backtest_runs(id)
    - group_type: text — matches calibration_summary grouping (e.g., 'competition', 'era_bucket')
    - group_key: text — the specific group value (e.g., 'Premier League')
    - adjustment_type: text — what is being corrected (e.g., 'home_bias', 'draw_underestimate')
    - adjustment_value: numeric(10,6) — signed correction magnitude
    - sample_size: integer — number of matches this rule is derived from
    - confidence: numeric(8,6) — statistical confidence of the adjustment (0–1)
    - reason: text — human-readable explanation
    - is_active: boolean — whether this rule is applied in current runs
    - created_at: timestamptz

  ## Security
  - RLS enabled
  - anon: NO ACCESS
  - authenticated (non-admin): NO ACCESS
  - admin only (profiles.role = 'admin' OR jwt app_metadata.role = 'admin'): SELECT, INSERT, UPDATE
  - service_role: full access (bypasses RLS — needed for edge function runners)

  ## Notes
  - No existing tables modified
  - Not exposed on any public page or public schema view
*/

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.calibration_adjustments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id       uuid REFERENCES model_lab.model_versions(id),
  source_backtest_run_id uuid REFERENCES model_lab.backtest_runs(id),
  group_type             text NOT NULL,
  group_key              text NOT NULL,
  adjustment_type        text NOT NULL,
  adjustment_value       numeric(10,6) NOT NULL,
  sample_size            integer NOT NULL DEFAULT 0,
  confidence             numeric(8,6),
  reason                 text,
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE model_lab.calibration_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_calibration_adjustments"
  ON model_lab.calibration_adjustments
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

CREATE POLICY "admin_insert_calibration_adjustments"
  ON model_lab.calibration_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

CREATE POLICY "admin_update_calibration_adjustments"
  ON model_lab.calibration_adjustments
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON model_lab.calibration_adjustments TO service_role;
