/*
  # Public wrapper RPCs for kalibrasyon functions

  1. Problem
    - model_lab.kalibrasyon_baslat and model_lab.kalibrasyon_sifirla are not
      accessible via PostgREST (rest/v1/rpc/) because they live in model_lab schema
    - Supabase JS client calls rest/v1/rpc/{name} which only resolves public schema functions

  2. Solution
    - Create public schema wrapper functions that delegate to model_lab counterparts
    - Both wrappers are SECURITY DEFINER so they can call the model_lab functions
    - Admin-only access enforced via profiles role check

  3. Functions
    - public.kalibrasyon_baslat(p_competition_name, p_season_label) → void
    - public.kalibrasyon_sifirla(p_competition_name, p_season_label) → void
*/

CREATE OR REPLACE FUNCTION public.kalibrasyon_baslat(
  p_competition_name text,
  p_season_label     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  -- Admin-only guard
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  PERFORM model_lab.kalibrasyon_baslat(p_competition_name, p_season_label);
END;
$$;

CREATE OR REPLACE FUNCTION public.kalibrasyon_sifirla(
  p_competition_name text,
  p_season_label     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  -- Admin-only guard
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  PERFORM model_lab.kalibrasyon_sifirla(p_competition_name, p_season_label);
END;
$$;

-- Grant execute to authenticated users (function itself enforces admin check)
GRANT EXECUTE ON FUNCTION public.kalibrasyon_baslat(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kalibrasyon_sifirla(text, text) TO authenticated;
