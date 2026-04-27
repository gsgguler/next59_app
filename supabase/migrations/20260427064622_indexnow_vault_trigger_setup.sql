/*
  # IndexNow Vault, Security Definer Function, and Publish Trigger

  1. Extensions
    - Enable `pg_net` for async HTTP from triggers

  2. Vault
    - Store service role key as 'next59_service_role_key' in supabase_vault

  3. Functions
    - `private_get_service_role_key()` - SECURITY DEFINER function to retrieve key from vault
    - `trigger_indexnow_on_publish()` - Trigger function that calls indexnow-submit edge function via pg_net

  4. Triggers
    - `on_prediction_publish` on predictions table - fires on INSERT or UPDATE when is_current = true

  5. Important Notes
    - The vault secret is accessible only through the security definer function
    - pg_net makes async HTTP calls so the trigger does not block the transaction
    - The edge function has verify_jwt=false so the anon key is sufficient for invocation
*/

-- Enable pg_net extension for async HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store the API key in supabase_vault
-- Using the anon key since the edge function does not require JWT verification
SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE',
  'next59_service_role_key',
  'API key for calling edge functions from database triggers'
);

-- Security definer function to retrieve the key from vault
CREATE OR REPLACE FUNCTION private_get_service_role_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'next59_service_role_key'
  LIMIT 1;
$$;

-- Revoke public access, only callable by postgres and service_role
REVOKE ALL ON FUNCTION private_get_service_role_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION private_get_service_role_key() FROM anon;
REVOKE ALL ON FUNCTION private_get_service_role_key() FROM authenticated;

-- Trigger function that invokes the indexnow-submit edge function
CREATE OR REPLACE FUNCTION trigger_indexnow_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _match_id uuid;
  _home_team text;
  _away_team text;
  _url text;
  _api_key text;
  _supabase_url text := 'https://jsordrrshzivxayryryi.supabase.co';
BEGIN
  _match_id := NEW.match_id;

  -- Look up team names for the URL
  SELECT
    ht.name, at.name
  INTO _home_team, _away_team
  FROM public.matches m
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = _match_id;

  _url := 'https://www.next59.com/mac/' || _match_id::text;

  -- Get API key from vault
  _api_key := private_get_service_role_key();

  -- Call the edge function via pg_net (async, non-blocking)
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/indexnow-submit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _api_key,
      'apikey', _api_key
    ),
    body := jsonb_build_object(
      'urls', jsonb_build_array(_url)
    )
  );

  RETURN NEW;
END;
$$;

-- Revoke public access
REVOKE ALL ON FUNCTION trigger_indexnow_on_publish() FROM PUBLIC;
REVOKE ALL ON FUNCTION trigger_indexnow_on_publish() FROM anon;
REVOKE ALL ON FUNCTION trigger_indexnow_on_publish() FROM authenticated;

-- Create trigger on predictions table: fires when a prediction is published (is_current = true)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_prediction_publish'
  ) THEN
    CREATE TRIGGER on_prediction_publish
      AFTER INSERT OR UPDATE ON public.predictions
      FOR EACH ROW
      WHEN (NEW.is_current = true)
      EXECUTE FUNCTION trigger_indexnow_on_publish();
  END IF;
END $$;
