/*
  # Seed wc2026_team_pool — All 48 WC2026 Teams

  ## Summary
  Populates `wc2026_team_pool` with all 48 qualified nations for the 2026 World Cup,
  using api_football team IDs sourced directly from `wc2026_fixtures` (home_api_team_id /
  away_api_team_id), which were set during the fixture import run.

  ## Changes
  ### Seeded Table: wc2026_team_pool
  - 48 rows inserted (one per qualified nation)
  - `api_football_team_id`: real IDs from wc2026_fixtures
  - `fifa_code` + `iso2`: from static country reference (worldCup2026Countries.ts)
  - `confederation`: CONCACAF / CONMEBOL / UEFA / CAF / AFC / OFC mapped per team
  - `squad_status`: 'pending' — awaiting live squad fetch
  - `overall_status`: 'missing_mapping' for Curaçao (CPV/CUW) — no WC history ELO baseline;
     'pending' for all others
  - `notes`: flags any teams needing extra review

  ## Notes
  - Uses INSERT ... ON CONFLICT DO NOTHING to be fully re-runnable
  - No fake data: all IDs verified against wc2026_fixtures rows
  - Cape Verde Islands stored as fifa_code='CPV', Curaçao as 'CUW'
*/

INSERT INTO wc2026_team_pool
  (api_football_team_id, team_name, fifa_code, iso2, confederation,
   squad_status, lineup_status, perf_snapshot_status,
   overall_status, stale_warning, missing_warning, notes)
VALUES
  -- Group A
  (16,   'Mexico',               'MEX', 'mx',     'CONCACAF',  'pending','pending','pending','pending',     false,false, NULL),
  (1531, 'South Africa',         'RSA', 'za',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (17,   'South Korea',          'KOR', 'kr',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  (770,  'Czechia',              'CZE', 'cz',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  -- Group B
  (5529, 'Canada',               'CAN', 'ca',     'CONCACAF',  'pending','pending','pending','pending',     false,false, NULL),
  (15,   'Switzerland',          'SUI', 'ch',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (1569, 'Qatar',                'QAT', 'qa',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  (1113, 'Bosnia & Herzegovina', 'BIH', 'ba',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  -- Group C
  (6,    'Brazil',               'BRA', 'br',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (31,   'Morocco',              'MAR', 'ma',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (1108, 'Scotland',             'SCO', 'gb-sct', 'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (2386, 'Haiti',                'HAI', 'ht',     'CONCACAF',  'pending','pending','pending','pending',     false,true,  'First WC appearance — limited history data'),
  -- Group D
  (2384, 'USA',                  'USA', 'us',     'CONCACAF',  'pending','pending','pending','pending',     false,false, NULL),
  (20,   'Australia',            'AUS', 'au',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  (2380, 'Paraguay',             'PAR', 'py',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (777,  'Türkiye',              'TUR', 'tr',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  -- Group E
  (25,   'Germany',              'GER', 'de',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (1501, 'Ivory Coast',          'CIV', 'ci',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (2382, 'Ecuador',              'ECU', 'ec',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (5530, 'Curaçao',              'CUW', 'cw',     'CONCACAF',  'pending','pending','pending','missing_mapping',false,true,'No WC history baseline — manual calibration review required'),
  -- Group F
  (1118, 'Netherlands',          'NED', 'nl',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (12,   'Japan',                'JPN', 'jp',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  (5,    'Sweden',               'SWE', 'se',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (28,   'Tunisia',              'TUN', 'tn',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  -- Group G
  (1,    'Belgium',              'BEL', 'be',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (32,   'Egypt',                'EGY', 'eg',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (4673, 'New Zealand',          'NZL', 'nz',     'OFC',       'pending','pending','pending','pending',     false,false, NULL),
  (22,   'Iran',                 'IRN', 'ir',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  -- Group H
  (9,    'Spain',                'ESP', 'es',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (23,   'Saudi Arabia',         'KSA', 'sa',     'AFC',       'pending','pending','pending','pending',     false,false, NULL),
  (7,    'Uruguay',              'URU', 'uy',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (1533, 'Cape Verde Islands',   'CPV', 'cv',     'CAF',       'pending','pending','pending','pending',     false,true,  'First WC appearance — limited history data'),
  -- Group I
  (2,    'France',               'FRA', 'fr',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (13,   'Senegal',              'SEN', 'sn',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (1090, 'Norway',               'NOR', 'no',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (1567, 'Iraq',                 'IRQ', 'iq',     'AFC',       'pending','pending','pending','pending',     false,true,  'Limited WC history — review calibration confidence'),
  -- Group J
  (26,   'Argentina',            'ARG', 'ar',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (1532, 'Algeria',              'ALG', 'dz',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (775,  'Austria',              'AUT', 'at',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (1548, 'Jordan',               'JOR', 'jo',     'AFC',       'pending','pending','pending','pending',     false,true,  'First WC appearance — limited history data'),
  -- Group K
  (27,   'Portugal',             'POR', 'pt',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (8,    'Colombia',             'COL', 'co',     'CONMEBOL',  'pending','pending','pending','pending',     false,false, NULL),
  (1568, 'Uzbekistan',           'UZB', 'uz',     'AFC',       'pending','pending','pending','pending',     false,true,  'First WC appearance — limited history data'),
  (1508, 'DR Congo',             'COD', 'cd',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  -- Group L
  (10,   'England',              'ENG', 'gb-eng', 'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (3,    'Croatia',              'CRO', 'hr',     'UEFA',      'pending','pending','pending','pending',     false,false, NULL),
  (1504, 'Ghana',                'GHA', 'gh',     'CAF',       'pending','pending','pending','pending',     false,false, NULL),
  (11,   'Panama',               'PAN', 'pa',     'CONCACAF',  'pending','pending','pending','pending',     false,false, NULL)
ON CONFLICT (api_football_team_id) DO NOTHING;
