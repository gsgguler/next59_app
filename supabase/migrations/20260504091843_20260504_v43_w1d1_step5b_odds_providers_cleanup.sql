/*
  # v4.3-W1-D1.5: odds_providers Cleanup

  match_odds is already in long format (market/selection/odds/provider_name).
  Each row belongs to one bookmaker. provider_id FK is meaningful at row level.

  Fix order:
  1. NULL out the wrong football_data_uk provider_id references
  2. Delete the football_data_uk row from odds_providers
  3. Insert 13 real bookmaker/aggregate rows
  4. Backfill provider_id by matching provider_name
*/

-- 1. Clear the wrong provider_id (was bulk-set to football_data_uk in W1-D1 step 5)
UPDATE public.match_odds
SET provider_id = NULL
WHERE provider_id = (SELECT id FROM public.odds_providers WHERE code = 'football_data_uk');

-- 2. Remove the wrong row
DELETE FROM public.odds_providers WHERE code = 'football_data_uk';

-- 3. Insert real bookmakers and market-aggregate entries
INSERT INTO public.odds_providers (id, name, code, api_football_bookmaker_id) VALUES
  (uuid_generate_v4(), 'William Hill',   'william_hill',    NULL),
  (uuid_generate_v4(), 'Bet365',         'bet365',          NULL),
  (uuid_generate_v4(), 'Interwetten',    'interwetten',     NULL),
  (uuid_generate_v4(), 'Betway',         'betway',          NULL),
  (uuid_generate_v4(), 'VC Bet',         'vc_bet',          NULL),
  (uuid_generate_v4(), 'Ladbrokes',      'ladbrokes',       NULL),
  (uuid_generate_v4(), 'Pinnacle',       'pinnacle',        NULL),
  (uuid_generate_v4(), 'BetBrain Max',   'betbrain_max',    NULL),
  (uuid_generate_v4(), 'BetBrain Avg',   'betbrain_avg',    NULL),
  (uuid_generate_v4(), 'Market Max',     'market_max',      NULL),
  (uuid_generate_v4(), 'Market Avg',     'market_avg',      NULL),
  (uuid_generate_v4(), 'Betfair',        'betfair',         NULL),
  (uuid_generate_v4(), '1XBet',          '1xbet',           NULL);

-- 4. Backfill provider_id by provider_name match
UPDATE public.match_odds mo
SET provider_id = op.id
FROM public.odds_providers op
WHERE op.name = mo.provider_name;
