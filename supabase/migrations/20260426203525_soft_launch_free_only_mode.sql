/*
  # Soft Launch: Free-Only Mode (30-day period)

  1. Modified Tables
    - `subscription_tiers`: All 3 rows (anon, free, pro) set to unlimited access
      - daily_match_views = -1 (unlimited)
      - analysis_depth = 'full'
      - can_view_predictions = true
      - can_view_elo = true
      - can_view_full_analysis = true

  2. Notes
    - No tables dropped -- all preserved for future pro tier re-activation
    - user_subscriptions and user_daily_usage remain intact
    - Edge function enforcement disabled separately (code change)
    - This migration is reversible by restoring original tier values
*/

UPDATE subscription_tiers
SET daily_match_views = -1,
    analysis_depth = 'full',
    can_view_predictions = true,
    can_view_elo = true,
    can_view_full_analysis = true,
    updated_at = now()
WHERE code IN ('anon', 'free', 'pro');
