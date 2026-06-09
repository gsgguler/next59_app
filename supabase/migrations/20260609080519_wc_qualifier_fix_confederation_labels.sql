
-- Fix confederation labels derived from league name
UPDATE wc_qualifier_competitions SET confederation = 'UEFA'           WHERE competition_name ILIKE '%europe%';
UPDATE wc_qualifier_competitions SET confederation = 'CONMEBOL'       WHERE competition_name ILIKE '%south america%';
UPDATE wc_qualifier_competitions SET confederation = 'CONCACAF'       WHERE competition_name ILIKE '%concacaf%';
UPDATE wc_qualifier_competitions SET confederation = 'CAF'            WHERE competition_name ILIKE '%africa%';
UPDATE wc_qualifier_competitions SET confederation = 'AFC'            WHERE competition_name ILIKE '%asia%';
UPDATE wc_qualifier_competitions SET confederation = 'OFC'            WHERE competition_name ILIKE '%oceania%';
UPDATE wc_qualifier_competitions SET confederation = 'Intercontinental' WHERE competition_name ILIKE '%intercontinental%';

-- Remove 2022 WC qualifier rows (those are WC 2022, not WC 2026)
DELETE FROM wc_qualifier_competitions WHERE season_label = '2022';
