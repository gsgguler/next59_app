-- Schedule wc2026-knockout-fixture-binder every 6 hours
SELECT cron.schedule(
  'wc2026-knockout-fixture-binder-6h',
  '0 */6 * * *',
  $$ SELECT public.invoke_wc2026_fn('wc2026-knockout-fixture-binder') $$
);
