/*
  # v4.3-W1-D1 Step 4: Data Providers Registry

  Creates audit.data_providers table and seeds all known/planned
  data sources for the 14-brain architecture.

  Requires uuid-ossp extension (already enabled via prior migrations).
*/

CREATE TABLE IF NOT EXISTS audit.data_providers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN
               ('csv_bulk','rest_api','webhook','scraper','manual')),
  base_url   TEXT,
  status     TEXT NOT NULL CHECK (status IN
               ('active','archived','deprecated','planned')),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit.data_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read data_providers"
  ON audit.data_providers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

INSERT INTO audit.data_providers (code, name, type, base_url, status, notes) VALUES
('football_data_uk', 'football-data.co.uk', 'csv_bulk',
 'https://www.football-data.co.uk', 'archived',
 '1.73M historical rows ingested 2026-04-28, retained for backfill'),
('api_football_v3', 'API-Football v3', 'rest_api',
 'https://v3.football.api-sports.io', 'active',
 'Primary modern data source, 12+ endpoints to be activated'),
('openfootball', 'OpenFootball GitHub', 'csv_bulk',
 'https://github.com/openfootball/football.json', 'archived',
 '961 historical records 1930-2006, editorial archive only'),
('sportmonks', 'Sportmonks v3', 'rest_api',
 'https://api.sportmonks.com', 'deprecated',
 'Edge function existed but produced 0 rows. Removed 2026-05-04'),
('understat', 'Understat scraper', 'scraper',
 'https://understat.com', 'planned',
 'For xG data, top 5 European leagues + Süper Lig. Activate W1-D6'),
('fbref', 'FBref scraper', 'scraper',
 'https://fbref.com', 'planned',
 'For xG, PPDA, advanced stats. Activate W1-D6'),
('statsbomb_open', 'StatsBomb Open Data', 'csv_bulk',
 'https://github.com/statsbomb/open-data', 'planned',
 'World Cup tournaments only, free. Activate W1-D7'),
('openweather', 'OpenWeather One Call API', 'rest_api',
 'https://openweathermap.org', 'planned',
 'For B6 Context brain. Activate W3'),
('serpapi', 'SerpAPI', 'rest_api',
 'https://serpapi.com', 'planned',
 'For B2 News brain. Already credentialed'),
('the_odds_api', 'The Odds API', 'rest_api',
 'https://the-odds-api.com', 'planned',
 'Multi-bookmaker odds aggregator for B7 expansion')
ON CONFLICT (code) DO NOTHING;
