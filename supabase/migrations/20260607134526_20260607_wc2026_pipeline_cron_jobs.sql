
-- ============================================================
-- WC 2026 Prematch Pipeline: Add missing cron jobs
-- The domestic pipeline queries public.matches (0 WC rows).
-- WC 2026 has its own prediction stack via wc2026_run_batch_scenarios
-- and wc2026_run_full_calibration. Neither had a cron driving them.
-- ============================================================

-- 1. WC calibration: refresh team strength ratings daily at 5am
--    wc2026_run_full_calibration recomputes ELO/strength for all WC teams
SELECT cron.schedule(
  'wc2026-full-calibration-daily',
  '0 5 * * *',
  $$SELECT public.wc2026_run_full_calibration('cron')$$
);

-- 2. WC scenario batch: run every 4 hours, process 10 fixtures per run
--    wc2026_run_batch_scenarios picks the next N fixtures needing scenarios
SELECT cron.schedule(
  'wc2026-batch-scenarios-4h',
  '0 */4 * * *',
  $$SELECT public.wc2026_run_batch_scenarios(10, 'cron')$$
);

-- 3. WC scenario batch: also run at 7am and 7pm for match-day coverage
SELECT cron.schedule(
  'wc2026-batch-scenarios-matchday',
  '0 7,19 * * *',
  $$SELECT public.wc2026_run_batch_scenarios(20, 'cron_matchday')$$
);
