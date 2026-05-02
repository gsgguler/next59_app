/*
  # WC2026 Venue & Stage Metadata Seed

  ## Purpose
  Seed authoritative venue/stadium and stage/group metadata for FIFA World Cup 2026
  into the database. This feeds the UI and provides a single source of truth for
  all WC2026 pages, fixture cards, and location filters.

  ## New Tables

  ### wc2026_venues
  - 16 official host venues with capacity, city, country
  - Capacity sourced from FIFA official venue pages
  - city_display: metro-level human readable label (may differ from raw city)
  - country_code_host: US / CA / MX

  ### wc2026_stages
  - 7 tournament stages with bilingual labels (EN + TR)
  - sort_order for display ordering
  - stage_code matches FixtureStage TypeScript enum

  ## Notes
  - No foreign keys to league tables, model_lab, or prediction tables
  - RLS: public SELECT allowed (venue/stage data is non-sensitive public info)
  - No personal data, no model output, no odds
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_venues
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_venues (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name            text        NOT NULL UNIQUE,
  city                  text        NOT NULL,            -- raw city (e.g. "East Rutherford")
  city_display          text        NOT NULL,            -- metro label (e.g. "New York / New Jersey")
  country_code_host     text        NOT NULL,            -- "US" | "CA" | "MX"
  country_name_tr       text        NOT NULL,            -- "ABD" | "Kanada" | "Meksika"
  capacity              integer,                         -- null if not confirmed
  capacity_source       text,
  fifa_venue_url        text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wc2026_venues ENABLE ROW LEVEL SECURITY;

-- Public can read venue data (non-sensitive)
CREATE POLICY "Public can read wc2026_venues"
  ON public.wc2026_venues FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin insert wc2026_venues"
  ON public.wc2026_venues FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admin update wc2026_venues"
  ON public.wc2026_venues FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_stages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_stages (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_code      text    NOT NULL UNIQUE,   -- matches FixtureStage TS enum
  stage_name_en   text    NOT NULL,
  stage_name_tr   text    NOT NULL,
  sort_order      integer NOT NULL,
  match_count     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wc2026_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read wc2026_stages"
  ON public.wc2026_stages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin insert wc2026_stages"
  ON public.wc2026_stages FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: wc2026_venues (16 official host venues)
-- Sources: FIFA official venue pages + stadium operators
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.wc2026_venues
  (venue_name, city, city_display, country_code_host, country_name_tr, capacity, capacity_source, fifa_venue_url)
VALUES
  -- Mexico (3 venues)
  ('Estadio Azteca',           'Mexico City',    'Mexico City',            'MX', 'Meksika', 87523,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/mexico-city'),
  ('Estadio Akron',            'Guadalajara',    'Guadalajara',            'MX', 'Meksika', 49850,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/guadalajara'),
  ('Estadio BBVA',             'Monterrey',      'Monterrey',              'MX', 'Meksika', 53500,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/monterrey'),
  -- Canada (2 venues)
  ('BMO Field',                'Toronto',        'Toronto',                'CA', 'Kanada',  45000,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/toronto'),
  ('BC Place',                 'Vancouver',      'Vancouver',              'CA', 'Kanada',  54500,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/vancouver'),
  -- USA (11 venues)
  ('MetLife Stadium',          'East Rutherford','New York / New Jersey',  'US', 'ABD',     82500,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/new-york-new-jersey'),
  ('SoFi Stadium',             'Inglewood',      'Los Angeles',            'US', 'ABD',     70240,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/los-angeles'),
  ('AT&T Stadium',             'Arlington',      'Dallas',                 'US', 'ABD',     80000,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/dallas'),
  ('Mercedes-Benz Stadium',    'Atlanta',        'Atlanta',                'US', 'ABD',     71000,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/atlanta'),
  ('NRG Stadium',              'Houston',        'Houston',                'US', 'ABD',     72220,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/houston'),
  ('Hard Rock Stadium',        'Miami',          'Miami',                  'US', 'ABD',     65326,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/miami'),
  ('Gillette Stadium',         'Foxborough',     'Boston',                 'US', 'ABD',     65878,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/boston'),
  ('Lincoln Financial Field',  'Philadelphia',   'Philadelphia',           'US', 'ABD',     69796,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/philadelphia'),
  ('Levi''s Stadium',          'Santa Clara',    'San Francisco Bay Area', 'US', 'ABD',     68500,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/san-francisco-bay-area'),
  ('Lumen Field',              'Seattle',        'Seattle',                'US', 'ABD',     69000,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/seattle'),
  ('Arrowhead Stadium',        'Kansas City',    'Kansas City',            'US', 'ABD',     76416,  'FIFA official venue page', 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/venue/kansas-city')
ON CONFLICT (venue_name) DO UPDATE SET
  capacity         = EXCLUDED.capacity,
  capacity_source  = EXCLUDED.capacity_source,
  city_display     = EXCLUDED.city_display,
  fifa_venue_url   = EXCLUDED.fifa_venue_url;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: wc2026_stages (7 tournament stages)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.wc2026_stages
  (stage_code, stage_name_en, stage_name_tr, sort_order, match_count)
VALUES
  ('Group Stage',   'Group Stage',    'Grup Maçları',  1, 72),
  ('Round of 32',   'Round of 32',    'Son 32',         2, 16),
  ('Round of 16',   'Round of 16',    'Son 16',         3,  8),
  ('Quarter-final', 'Quarter-finals', 'Çeyrek Final',   4,  4),
  ('Semi-final',    'Semi-finals',    'Yarı Final',     5,  2),
  ('Third Place',   'Third Place',    '3. Yer Maçı',    6,  1),
  ('Final',         'Final',          'Final',          7,  1)
ON CONFLICT (stage_code) DO UPDATE SET
  stage_name_en = EXCLUDED.stage_name_en,
  stage_name_tr = EXCLUDED.stage_name_tr,
  sort_order    = EXCLUDED.sort_order,
  match_count   = EXCLUDED.match_count;
