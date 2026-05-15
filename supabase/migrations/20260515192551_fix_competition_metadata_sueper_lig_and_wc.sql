/*
  # Fix Competition Metadata — Süper Lig and FIFA World Cup

  ## Changes

  ### 1. Rename "Sueper Lig" → "Süper Lig"
  - The Turkish top-flight league was stored with an ASCII transliteration ("Sueper Lig")
    instead of the correct UTF-8 name ("Süper Lig").
  - Affects: 1 row, id = 0681b3f6-6963-4fd9-8435-d1e40e23410f
  - Impact: 7,950 matches are linked to this competition via competition_seasons.
    No FK references use the name column — only the UUID id — so this rename is safe.

  ### 2. Fix FIFA World Cup competition_type
  - Was: 'domestic_league' (clearly incorrect for an international tournament)
  - Now: 'international_cup'
  - Affects: 1 row, id = 56271286-3231-417c-8e71-5f7086ab1233

  ### 3. Fix FIFA World Cup country_id
  - Was: 7c079c52-6c6b-4cc5-ba3d-fffff95d11c4 (United States — incorrect)
  - Now: NULL (FIFA World Cup is an international competition, not owned by any single country)
  - Affects: 1 row, same as above

  ## Safety
  - Both columns updated are metadata-only.
  - No cascade effects: competition_seasons and matches join on UUID id, not on name or country_id.
  - Non-destructive: name, type, competition_type, country_id are display/classification fields.
  - No data is deleted or restructured.
*/

-- 1. Rename Sueper Lig → Süper Lig
UPDATE competitions
SET name = 'Süper Lig'
WHERE id = '0681b3f6-6963-4fd9-8435-d1e40e23410f'
  AND name = 'Sueper Lig';

-- 2 & 3. Fix FIFA World Cup metadata
UPDATE competitions
SET
  competition_type = 'international_cup',
  country_id       = NULL
WHERE id = '56271286-3231-417c-8e71-5f7086ab1233'
  AND name = 'FIFA World Cup';
