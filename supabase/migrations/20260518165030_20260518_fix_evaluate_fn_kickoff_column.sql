/*
  # Fix evaluate_finished_prematch_predictions — kickoff column

  The matches table uses `timestamp` (bigint Unix epoch), not `kickoff_utc`.
  Replace all references to m.kickoff_utc with to_timestamp(m.timestamp).
  All other logic is unchanged.
*/

CREATE OR REPLACE FUNCTION model_lab.evaluate_finished_prematch_predictions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_row        RECORD;
  v_result     text;
  v_p_correct  numeric;
  v_brier      numeric;
  v_logloss    numeric;
  v_correct    boolean;
  v_false_conf boolean;
  v_processed  int := 0;
  v_skipped    int := 0;
  v_errors     int := 0;
BEGIN
  FOR v_row IN (
    SELECT DISTINCT ON (ppd.match_id)
      ppd.id              AS draft_id,
      ppd.match_id,
      ppd.model_version,
      ppd.prediction_formula,
      ppd.feature_quality_tier,
      ppd.p_home,
      ppd.p_draw,
      ppd.p_away,
      ppd.confidence_score,
      ppd.generated_at,
      ppd.competition_name,
      m.match_date,
      m.home_score_ft,
      m.away_score_ft,
      to_timestamp(m.timestamp) AS kickoff_ts
    FROM model_lab.prematch_prediction_drafts ppd
    JOIN public.matches m ON m.id = ppd.match_id
    WHERE m.status_short IN ('FT', 'AET', 'PEN')
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND ppd.feature_quality_tier IS DISTINCT FROM 'elo_only'
      AND ppd.status NOT IN ('hidden', 'rejected')
      -- Only predictions generated before kickoff (no post-match leakage)
      AND ppd.generated_at < COALESCE(
            to_timestamp(m.timestamp),
            m.match_date::timestamptz + interval '12h'
          )
    ORDER BY ppd.match_id, ppd.generated_at DESC
  ) LOOP
    BEGIN
      -- Determine actual result
      IF v_row.home_score_ft > v_row.away_score_ft THEN
        v_result    := 'home';
        v_p_correct := v_row.p_home;
      ELSIF v_row.home_score_ft = v_row.away_score_ft THEN
        v_result    := 'draw';
        v_p_correct := v_row.p_draw;
      ELSE
        v_result    := 'away';
        v_p_correct := v_row.p_away;
      END IF;

      -- Brier score: sum((p_i - o_i)^2) for 3-outcome
      v_brier := ROUND((
        power(v_row.p_home - CASE WHEN v_result = 'home' THEN 1.0 ELSE 0.0 END, 2) +
        power(v_row.p_draw - CASE WHEN v_result = 'draw' THEN 1.0 ELSE 0.0 END, 2) +
        power(v_row.p_away - CASE WHEN v_result = 'away' THEN 1.0 ELSE 0.0 END, 2)
      )::numeric, 5);

      -- Log-loss: -log(p_correct), clipped to prevent -inf
      v_logloss := ROUND(-LN(GREATEST(v_p_correct, 0.001))::numeric, 5);

      -- Was the top predicted outcome correct?
      v_correct := (
        (v_result = 'home' AND v_row.p_home >= v_row.p_draw AND v_row.p_home >= v_row.p_away) OR
        (v_result = 'draw' AND v_row.p_draw > v_row.p_home  AND v_row.p_draw >= v_row.p_away) OR
        (v_result = 'away' AND v_row.p_away > v_row.p_home  AND v_row.p_away > v_row.p_draw)
      );

      -- False confidence: high confidence (>= 0.70) but wrong
      v_false_conf := NOT v_correct AND COALESCE(v_row.confidence_score, 0) >= 0.70;

      INSERT INTO model_lab.prediction_evaluations (
        match_id, prediction_draft_id, model_version, feature_quality_tier,
        prediction_formula, p_home_predicted, p_draw_predicted, p_away_predicted,
        confidence_score, actual_result, home_score_ft, away_score_ft,
        brier_score, log_loss, was_correct, false_confidence,
        match_date, competition_name, evaluated_at
      ) VALUES (
        v_row.match_id, v_row.draft_id, v_row.model_version, v_row.feature_quality_tier,
        v_row.prediction_formula, v_row.p_home, v_row.p_draw, v_row.p_away,
        v_row.confidence_score, v_result, v_row.home_score_ft, v_row.away_score_ft,
        v_brier, v_logloss, v_correct, v_false_conf,
        v_row.match_date, v_row.competition_name, now()
      )
      ON CONFLICT (match_id, model_version, prediction_formula) DO UPDATE SET
        actual_result    = EXCLUDED.actual_result,
        home_score_ft    = EXCLUDED.home_score_ft,
        away_score_ft    = EXCLUDED.away_score_ft,
        brier_score      = EXCLUDED.brier_score,
        log_loss         = EXCLUDED.log_loss,
        was_correct      = EXCLUDED.was_correct,
        false_confidence = EXCLUDED.false_confidence,
        evaluated_at     = now();

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated', v_processed,
    'skipped',   v_skipped,
    'errors',    v_errors,
    'run_at',    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION model_lab.evaluate_finished_prematch_predictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.evaluate_finished_prematch_predictions() TO service_role;
