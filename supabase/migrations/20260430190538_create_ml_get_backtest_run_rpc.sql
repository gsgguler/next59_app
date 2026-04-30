/*
  # Add ml_get_backtest_run RPC bridge

  1. New Functions
    - `ml_get_backtest_run(p_run_id uuid)` — returns a single backtest_run row as jsonb
  2. Security
    - SECURITY DEFINER, SET search_path = model_lab, public
*/

CREATE OR REPLACE FUNCTION public.ml_get_backtest_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT row_to_json(r) INTO v_result
  FROM model_lab.backtest_runs r
  WHERE r.id = p_run_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_backtest_run(uuid) TO authenticated, service_role;
