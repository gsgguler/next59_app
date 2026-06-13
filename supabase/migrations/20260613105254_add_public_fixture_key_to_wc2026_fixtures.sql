-- Add public_fixture_key column to wc2026_fixtures
ALTER TABLE wc2026_fixtures
  ADD COLUMN IF NOT EXISTS public_fixture_key TEXT;

-- Create unique index (partial: only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS wc2026_fixtures_public_fixture_key_uidx
  ON wc2026_fixtures (public_fixture_key)
  WHERE public_fixture_key IS NOT NULL;

-- Name normalization helper: static → DB
-- Static uses: Czechia, Bosnia and Herzegovina, Cape Verde, Türkiye, Ivory Coast, Congo DR, Curaçao
-- DB uses:     Czech Republic, Bosnia & Herzegovina, Cape Verde Islands, Turkey (or Türkiye), Côte d'Ivoire, DR Congo, Curaçao
-- We match by what is stored in wc2026_fixtures.home_team_name / away_team_name

-- Backfill all 72 group-stage fixtures using team-pair match
-- Key priority: match by home_team_name + away_team_name (normalized)
UPDATE wc2026_fixtures SET public_fixture_key = k.key
FROM (VALUES
  ('Mexico',             'South Africa',         'wc2026-001'),
  ('South Korea',        'Czech Republic',        'wc2026-002'),
  ('Czech Republic',     'South Africa',          'wc2026-003'),
  ('Mexico',             'South Korea',           'wc2026-004'),
  ('Czech Republic',     'Mexico',                'wc2026-005'),
  ('South Africa',       'South Korea',           'wc2026-006'),
  ('Canada',             'Bosnia & Herzegovina',  'wc2026-007'),
  ('Qatar',              'Switzerland',           'wc2026-008'),
  ('Switzerland',        'Bosnia & Herzegovina',  'wc2026-009'),
  ('Canada',             'Qatar',                 'wc2026-010'),
  ('Switzerland',        'Canada',                'wc2026-011'),
  ('Bosnia & Herzegovina','Qatar',                'wc2026-012'),
  ('Brazil',             'Morocco',               'wc2026-013'),
  ('Haiti',              'Scotland',              'wc2026-014'),
  ('Scotland',           'Morocco',               'wc2026-015'),
  ('Brazil',             'Haiti',                 'wc2026-016'),
  ('Scotland',           'Brazil',                'wc2026-017'),
  ('Morocco',            'Haiti',                 'wc2026-018'),
  ('USA',                'Paraguay',              'wc2026-019'),
  ('Australia',          'Turkey',                'wc2026-020'),
  ('USA',                'Australia',             'wc2026-021'),
  ('Turkey',             'Paraguay',              'wc2026-022'),
  ('Turkey',             'USA',                   'wc2026-023'),
  ('Paraguay',           'Australia',             'wc2026-024'),
  ('Germany',            'Curacao',               'wc2026-025'),
  ('Ivory Coast',        'Ecuador',               'wc2026-026'),
  ('Germany',            'Ivory Coast',           'wc2026-027'),
  ('Ecuador',            'Curacao',               'wc2026-028'),
  ('Ecuador',            'Germany',               'wc2026-029'),
  ('Curacao',            'Ivory Coast',           'wc2026-030'),
  ('Netherlands',        'Japan',                 'wc2026-031'),
  ('Sweden',             'Tunisia',               'wc2026-032'),
  ('Netherlands',        'Sweden',                'wc2026-033'),
  ('Tunisia',            'Japan',                 'wc2026-034'),
  ('Tunisia',            'Netherlands',           'wc2026-035'),
  ('Japan',              'Sweden',                'wc2026-036'),
  ('Belgium',            'Egypt',                 'wc2026-037'),
  ('Iran',               'New Zealand',           'wc2026-038'),
  ('Belgium',            'Iran',                  'wc2026-039'),
  ('New Zealand',        'Egypt',                 'wc2026-040'),
  ('New Zealand',        'Belgium',               'wc2026-041'),
  ('Egypt',              'Iran',                  'wc2026-042'),
  ('Spain',              'Cape Verde Islands',    'wc2026-043'),
  ('Saudi Arabia',       'Uruguay',               'wc2026-044'),
  ('Spain',              'Saudi Arabia',          'wc2026-045'),
  ('Uruguay',            'Cape Verde Islands',    'wc2026-046'),
  ('Uruguay',            'Spain',                 'wc2026-047'),
  ('Cape Verde Islands', 'Saudi Arabia',          'wc2026-048'),
  ('France',             'Senegal',               'wc2026-049'),
  ('Iraq',               'Norway',                'wc2026-050'),
  ('France',             'Iraq',                  'wc2026-051'),
  ('Norway',             'Senegal',               'wc2026-052'),
  ('Norway',             'France',                'wc2026-053'),
  ('Senegal',            'Iraq',                  'wc2026-054'),
  ('Argentina',          'Algeria',               'wc2026-055'),
  ('Austria',            'Jordan',                'wc2026-056'),
  ('Argentina',          'Austria',               'wc2026-057'),
  ('Jordan',             'Algeria',               'wc2026-058'),
  ('Jordan',             'Argentina',             'wc2026-059'),
  ('Algeria',            'Austria',               'wc2026-060'),
  ('Portugal',           'DR Congo',              'wc2026-061'),
  ('Uzbekistan',         'Colombia',              'wc2026-062'),
  ('Portugal',           'Uzbekistan',            'wc2026-063'),
  ('Colombia',           'DR Congo',              'wc2026-064'),
  ('Colombia',           'Portugal',              'wc2026-065'),
  ('DR Congo',           'Uzbekistan',            'wc2026-066'),
  ('England',            'Croatia',               'wc2026-067'),
  ('Ghana',              'Panama',                'wc2026-068'),
  ('England',            'Ghana',                 'wc2026-069'),
  ('Panama',             'Croatia',               'wc2026-070'),
  ('Panama',             'England',               'wc2026-071'),
  ('Croatia',            'Ghana',                 'wc2026-072')
) AS k(home, away, key)
WHERE wc2026_fixtures.home_team_name = k.home
  AND wc2026_fixtures.away_team_name = k.away;

-- Also try alternate DB name variants for teams that may differ
-- Türkiye variants
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-020'
WHERE home_team_name = 'Australia' AND away_team_name IN ('Turkey', 'Türkiye')
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-022'
WHERE home_team_name IN ('Turkey', 'Türkiye') AND away_team_name = 'Paraguay'
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-023'
WHERE home_team_name IN ('Turkey', 'Türkiye') AND away_team_name = 'USA'
  AND public_fixture_key IS NULL;

-- Ivory Coast / Côte d'Ivoire
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-026'
WHERE home_team_name IN ('Ivory Coast', 'Côte d''Ivoire') AND away_team_name = 'Ecuador'
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-027'
WHERE home_team_name = 'Germany' AND away_team_name IN ('Ivory Coast', 'Côte d''Ivoire')
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-030'
WHERE home_team_name IN ('Curacao', 'Curaçao') AND away_team_name IN ('Ivory Coast', 'Côte d''Ivoire')
  AND public_fixture_key IS NULL;

-- Curacao variants
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-025'
WHERE home_team_name = 'Germany' AND away_team_name IN ('Curacao', 'Curaçao')
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-028'
WHERE home_team_name = 'Ecuador' AND away_team_name IN ('Curacao', 'Curaçao')
  AND public_fixture_key IS NULL;

-- Congo DR variants
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-061'
WHERE home_team_name = 'Portugal' AND away_team_name IN ('DR Congo', 'Congo DR', 'Democratic Republic of Congo')
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-064'
WHERE home_team_name = 'Colombia' AND away_team_name IN ('DR Congo', 'Congo DR', 'Democratic Republic of Congo')
  AND public_fixture_key IS NULL;
UPDATE wc2026_fixtures SET public_fixture_key = 'wc2026-066'
WHERE home_team_name IN ('DR Congo', 'Congo DR', 'Democratic Republic of Congo') AND away_team_name = 'Uzbekistan'
  AND public_fixture_key IS NULL;
