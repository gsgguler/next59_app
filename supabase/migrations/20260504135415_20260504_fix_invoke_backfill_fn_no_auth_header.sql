/*
  # Fix invoke_backfill_fn — send anon key, not empty service role key

  With verifyJWT=false, the edge functions accept any valid JWT or even
  the anon key. Sending an empty Bearer token causes a 401 at the gateway
  even when verifyJWT=false. Use the anon key (public, safe for this use
  case since the edge functions themselves authenticate to Supabase via
  SUPABASE_SERVICE_ROLE_KEY internally).
*/
CREATE OR REPLACE FUNCTION public.invoke_backfill_fn(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/' || p_slug;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := '{"chunk_size":50}'::jsonb
  );
END;
$$;
