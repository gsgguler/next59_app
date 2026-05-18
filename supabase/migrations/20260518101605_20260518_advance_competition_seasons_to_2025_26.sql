/*
  # Advance Competition Seasons to 2025/26

  ## Summary
  The system was stuck on the 2024/25 season (af_season=2024, ended May/June 2025).
  It is now May 2026. The 2025/26 season (af_season=2025) started August 2025.
  
  This migration:
  1. Marks all 7 active 2024/25 competition_seasons as is_current = false
  2. Inserts new competition_seasons rows for the 2025/26 season for all 7 leagues
  3. Marks the new 2025/26 rows as is_current = true

  ## Season Reference
  - season_id for 2025/26 = 9204a7ee-fbf3-48bc-85e0-eb89120a7fb9 (year=2025, label="2025-2026")
  - season_id for 2024/25 = 76fa9e81-c310-449b-9ac2-72764f9ee15c (year=2024)

  ## Leagues
  | AF ID | Competition       | Competition ID                               |
  |-------|-------------------|----------------------------------------------|
  | 39    | Premier League    | 857175f5-386b-455c-bc68-79abc9f03414         |
  | 61    | Ligue 1           | 387d5521-5fcc-4279-be93-e45e2d45d6c5         |
  | 78    | Bundesliga        | db59f47e-b1eb-4af6-bb57-1de47baa9814         |
  | 88    | Eredivisie        | 08a9c47e-4e12-4160-b131-1c5c362d7e0e         |
  | 135   | Serie A           | e9a473df-4d3c-4937-9d80-a1f394c6f5ae         |
  | 140   | La Liga           | 5e514448-2646-4f33-aac6-b2b4eef6474f         |
  | 203   | Süper Lig         | 0681b3f6-6963-4fd9-8435-d1e40e23410f         |
*/

-- Step 1: Mark 2024/25 season rows as no longer current
UPDATE public.competition_seasons
SET is_current = false
WHERE season_id = '76fa9e81-c310-449b-9ac2-72764f9ee15c'
  AND id IN (
    'fd68b1e3-0d03-4c9b-b6ec-669dabf3ef52', -- Premier League 2024/25
    'b72036b8-dcc8-4f58-9fbb-cf33a72bfaf4', -- Ligue 1 2024/25
    '24e1dc20-6483-4d0c-a8dd-12e71013db6f', -- Bundesliga 2024/25
    '4d8e5440-c7f9-4aa6-9e0b-409e7efa765c', -- Eredivisie 2024/25
    '5e6c9ea5-ae04-4b12-8d16-ccd628592179', -- Serie A 2024/25
    'b966b8dc-8f63-407f-bb67-4b6a014fe29e', -- La Liga 2024/25
    'e6ab7df6-9e47-47ed-9e04-a414f8bebc8d'  -- Süper Lig 2024/25
  );

-- Step 2: Insert 2025/26 competition_seasons (idempotent)
INSERT INTO public.competition_seasons (id, competition_id, season_id, is_current)
VALUES
  -- Premier League 2025/26 (AF league 39)
  (gen_random_uuid(), '857175f5-386b-455c-bc68-79abc9f03414', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- Ligue 1 2025/26 (AF league 61)
  (gen_random_uuid(), '387d5521-5fcc-4279-be93-e45e2d45d6c5', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- Bundesliga 2025/26 (AF league 78)
  (gen_random_uuid(), 'db59f47e-b1eb-4af6-bb57-1de47baa9814', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- Eredivisie 2025/26 (AF league 88)
  (gen_random_uuid(), '08a9c47e-4e12-4160-b131-1c5c362d7e0e', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- Serie A 2025/26 (AF league 135)
  (gen_random_uuid(), 'e9a473df-4d3c-4937-9d80-a1f394c6f5ae', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- La Liga 2025/26 (AF league 140)
  (gen_random_uuid(), '5e514448-2646-4f33-aac6-b2b4eef6474f', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true),
  -- Süper Lig 2025/26 (AF league 203)
  (gen_random_uuid(), '0681b3f6-6963-4fd9-8435-d1e40e23410f', '9204a7ee-fbf3-48bc-85e0-eb89120a7fb9', true)
ON CONFLICT DO NOTHING;
