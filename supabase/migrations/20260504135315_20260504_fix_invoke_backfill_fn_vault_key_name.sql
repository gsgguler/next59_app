/*
  # Fix invoke_backfill_fn — correct vault secret name

  Was looking for 'service_role_key'; actual name is 'next59_service_role_key'.
  Also: redeploy backfill edge functions with verify_jwt=false so cron calls
  without a valid JWT still work as a secondary safeguard.
*/
CREATE OR REPLACE FUNCTION public.invoke_backfill_fn(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/' || p_slug;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'next59_service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, '')
    ),
    body    := '{"chunk_size":50}'::jsonb
  );
END;
$$;
