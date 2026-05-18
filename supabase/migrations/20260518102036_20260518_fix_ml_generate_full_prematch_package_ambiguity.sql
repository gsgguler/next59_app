/*
  # Fix ml_generate_full_prematch_package Overload Ambiguity

  ## Summary
  model_lab.generate_full_prematch_package has two overloads:
  - (uuid) — old version calling brain package
  - (uuid, uuid) — newer version with triggered_by

  The public wrapper called the 1-arg form which is now ambiguous.
  Fix: call the 2-arg form explicitly with NULL triggered_by.
*/
CREATE OR REPLACE FUNCTION public.ml_generate_full_prematch_package(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab'
AS $$
BEGIN
  RETURN model_lab.generate_full_prematch_package(p_match_id, NULL::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_generate_full_prematch_package(uuid) TO authenticated;
