-- Internal calibration audit table — service role only
CREATE TABLE IF NOT EXISTS public.wc2026_calibrated_result_probabilities (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                  UUID NOT NULL,
  api_football_fixture_id     BIGINT,
  scenario_version            INTEGER,
  quality_bucket              TEXT NOT NULL,
  base_model_home_pct         NUMERIC(7,4) NOT NULL,
  base_model_draw_pct         NUMERIC(7,4) NOT NULL,
  base_model_away_pct         NUMERIC(7,4) NOT NULL,
  internal_signal_home_pct    NUMERIC(7,4) NOT NULL,
  internal_signal_draw_pct    NUMERIC(7,4) NOT NULL,
  internal_signal_away_pct    NUMERIC(7,4) NOT NULL,
  base_model_weight           NUMERIC(5,4) NOT NULL,
  internal_signal_weight      NUMERIC(5,4) NOT NULL,
  calibrated_home_pct         NUMERIC(7,4) NOT NULL,
  calibrated_draw_pct         NUMERIC(7,4) NOT NULL,
  calibrated_away_pct         NUMERIC(7,4) NOT NULL,
  calibration_reason_internal TEXT,
  internal_source_type        TEXT NOT NULL DEFAULT 'manual_internal_signal',
  internal_only               BOOLEAN NOT NULL DEFAULT TRUE,
  public_visible              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wc2026_calibrated_result_probabilities ENABLE ROW LEVEL SECURITY;
-- No SELECT policies — service role only access

-- Public display table: exposes only safe probability values to the frontend
CREATE TABLE IF NOT EXISTS public.wc2026_fixture_display_probabilities (
  fixture_id     UUID PRIMARY KEY,
  home_pct       NUMERIC(7,4) NOT NULL,
  draw_pct       NUMERIC(7,4) NOT NULL,
  away_pct       NUMERIC(7,4) NOT NULL,
  display_label  TEXT NOT NULL DEFAULT 'Next59 Kalibre Model Tahmini',
  refreshed_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wc2026_fixture_display_probabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_display_probabilities"
  ON public.wc2026_fixture_display_probabilities
  FOR SELECT TO anon, authenticated
  USING (TRUE);
