
-- Store the WC2026 AI writer internal secret in Vault so pg_cron can read it.
-- This secret is used as X-Internal-Secret by the scheduler invoke function.
-- Value must match ADMIN_JOB_SECRET set in edge function environment.
-- If ADMIN_JOB_SECRET rotates, update this Vault entry to match.

DO $$
BEGIN
  -- Only insert if not already present
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'wc2026_ai_writer_internal_secret'
  ) THEN
    PERFORM vault.create_secret(
      'wc2026_ai_cron_placeholder_replace_with_real_value',
      'wc2026_ai_writer_internal_secret',
      'Internal secret for wc2026-ai-narrative-writer edge function (matches ADMIN_JOB_SECRET)'
    );
  END IF;
END $$;
