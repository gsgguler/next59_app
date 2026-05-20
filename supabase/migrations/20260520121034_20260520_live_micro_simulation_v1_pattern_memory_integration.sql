/*
  Phase 7: Pattern Memory Integration for Live Micro Windows

  Adds historical reliability columns to live_micro_windows:
  - historical_state_reliability: calibration_score from live_state_pattern_memory for this (state, minute_bucket)
  - historically_false_signal: true when false_confidence_rate > 0.4
  - pattern_sample_size: raw sample_size from pattern memory
  - reliability_warning: text warning when sample_size < 10 or false signal detected

  Creates annotate_windows_with_pattern_memory(p_fixture_id) which:
  - Joins live_micro_windows to live_state_pattern_memory on (micro_state, minute_bucket)
  - Updates the 4 new columns
  - Returns count of windows annotated
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab'
      AND table_name = 'live_micro_windows'
      AND column_name = 'historical_state_reliability'
  ) THEN
    ALTER TABLE model_lab.live_micro_windows
      ADD COLUMN historical_state_reliability numeric(4,3),
      ADD COLUMN historically_false_signal boolean DEFAULT false,
      ADD COLUMN pattern_sample_size integer,
      ADD COLUMN reliability_warning text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION model_lab.annotate_windows_with_pattern_memory(
  p_fixture_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_annotated integer := 0;
  r record;
  v_minute_bucket text;
  v_pm record;
  v_warning text;
BEGIN
  FOR r IN
    SELECT id, micro_state, window_start_minute
    FROM model_lab.live_micro_windows
    WHERE fixture_id = p_fixture_id
      AND engine_version = 'micro_v1'
  LOOP
    -- Map window_start_minute to minute_bucket label
    v_minute_bucket := CASE
      WHEN r.window_start_minute < 15 THEN '0-15'
      WHEN r.window_start_minute < 30 THEN '15-30'
      WHEN r.window_start_minute < 45 THEN '30-45'
      WHEN r.window_start_minute < 60 THEN '45-60'
      WHEN r.window_start_minute < 75 THEN '60-75'
      ELSE '75-90'
    END;

    -- Look up pattern memory for this state + bucket
    SELECT
      sample_size,
      low_sample_warning,
      false_confidence_rate,
      calibration_score,
      chaos_reliability_score
    INTO v_pm
    FROM model_lab.live_state_pattern_memory
    WHERE current_live_state = r.micro_state
      AND minute_bucket = v_minute_bucket
    LIMIT 1;

    -- Build reliability warning
    v_warning := NULL;
    IF v_pm IS NULL THEN
      v_warning := 'Durum hafızasında kayıt yok — geçmiş örüntü mevcut değil';
    ELSIF v_pm.sample_size < 10 THEN
      v_warning := format('Düşük örnek sayısı (%s) — güvenilirlik sınırlı', v_pm.sample_size);
    ELSIF v_pm.false_confidence_rate > 0.4 THEN
      v_warning := format('Yüksek yanlış güven oranı (%.0f%%) — tarihsel olarak yanıltıcı sinyal', v_pm.false_confidence_rate * 100);
    END IF;

    UPDATE model_lab.live_micro_windows
    SET
      historical_state_reliability = CASE WHEN v_pm IS NOT NULL THEN v_pm.calibration_score ELSE NULL END,
      historically_false_signal    = CASE WHEN v_pm IS NOT NULL AND v_pm.false_confidence_rate > 0.4 THEN true ELSE false END,
      pattern_sample_size          = CASE WHEN v_pm IS NOT NULL THEN v_pm.sample_size ELSE NULL END,
      reliability_warning          = v_warning
    WHERE id = r.id;

    v_annotated := v_annotated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'fixture_id',  p_fixture_id,
    'annotated',   v_annotated
  );
END;
$$;

-- Extend build_live_micro_windows to auto-annotate after building
-- We wrap in a separate lightweight post-build call rather than embedding inside the builder
-- to keep the builder function focused and testable independently.

-- Public admin wrapper
CREATE OR REPLACE FUNCTION public.admin_annotate_micro_windows(p_fixture_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN model_lab.annotate_windows_with_pattern_memory(p_fixture_id);
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.annotate_windows_with_pattern_memory(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_annotate_micro_windows(bigint) TO authenticated;
