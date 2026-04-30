/*
  # Fix ml_insert_backtest_run: cast text[] params to jsonb

  The backtest_runs table stores competition_scope and era_scope as jsonb,
  but the bridge function was declared with text[] parameters causing a type error.
  Replace the function to cast the arrays to jsonb on insert.
*/

CREATE OR REPLACE FUNCTION public.ml_insert_backtest_run(
  p_model_version_id uuid,
  p_run_key text,
  p_run_scope text,
  p_competition_scope text[],
  p_era_scope text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result json;
BEGIN
  INSERT INTO model_lab.backtest_runs (
    model_version_id, run_key, run_status, run_scope,
    train_start_date, train_end_date,
    validation_start_date, validation_end_date,
    competition_scope, era_scope, started_at
  ) VALUES (
    p_model_version_id, p_run_key, 'running', p_run_scope,
    '2000-07-28', '2018-06-30',
    '2018-07-01', '2019-06-30',
    to_jsonb(p_competition_scope), to_jsonb(p_era_scope), now()
  )
  RETURNING row_to_json(backtest_runs.*) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_insert_backtest_run(uuid, text, text, text[], text[]) TO service_role, authenticated;
