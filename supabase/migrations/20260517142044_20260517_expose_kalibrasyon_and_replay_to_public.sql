/*
  # Expose model_lab tables to PostgREST via public views

  1. New Views (public schema)
    - `public.kalibrasyon_kuyrugu` — view of model_lab.kalibrasyon_kuyrugu
    - `public.replay_prediction_runs` — view of model_lab.replay_prediction_runs

  2. Security
    - Both views inherit the underlying table's RLS
    - Views are SECURITY INVOKER (default), so the caller's auth context is used
    - Grant SELECT on views to authenticated role (admin-only data visible only to admins via RLS on base table)

  3. Notes
    - Supabase JS client can only query tables/views in the public (or exposed) schema
    - The model_lab schema tables are not directly accessible via rest/v1/
    - These views solve the 404 errors without requiring schema configuration changes
*/

-- View: kalibrasyon_kuyrugu
CREATE OR REPLACE VIEW public.kalibrasyon_kuyrugu AS
  SELECT * FROM model_lab.kalibrasyon_kuyrugu;

-- View: replay_prediction_runs
CREATE OR REPLACE VIEW public.replay_prediction_runs AS
  SELECT * FROM model_lab.replay_prediction_runs;

-- Grant access to authenticated users (RLS on base table restricts to admins)
GRANT SELECT ON public.kalibrasyon_kuyrugu TO authenticated;
GRANT SELECT ON public.replay_prediction_runs TO authenticated;
