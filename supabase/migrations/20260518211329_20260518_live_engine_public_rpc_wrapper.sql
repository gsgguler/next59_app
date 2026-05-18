/*
  # Live Engine — public RPC wrapper callable from edge functions

  Edge functions use the anon/service_role key and call public schema RPCs.
  This thin wrapper allows af-live-result-sync to trigger the live engine
  without needing direct model_lab schema access.
*/

CREATE OR REPLACE FUNCTION public.run_live_match_engine_public()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  RETURN model_lab.run_live_match_engine();
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_live_match_engine_public() TO service_role;
