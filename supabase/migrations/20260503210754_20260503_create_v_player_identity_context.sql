
/*
  # Create v_player_identity_context

  Read-only view — one row per api_football_player_id.

  Sources:
    - af_player_profiles

  Quality scoring (0-100):
    - base 40 (id + name always present)
    - +15 nationality
    - +15 birth_date
    - +10 height
    - +10 weight
    - +10 photo_url

  Notes:
    - raw_payload is NOT exposed
    - No name-based merging; api_football_player_id is sole identity key
    - Missing fields are NULL, never inferred
*/

CREATE OR REPLACE VIEW v_player_identity_context AS
SELECT
  api_football_player_id,
  player_name,
  firstname,
  lastname,
  nationality,
  birth_date,
  birth_country,
  birth_place,
  height,
  weight,
  photo_url,

  -- presence flags
  (birth_date IS NOT NULL)                  AS has_birth_date,
  (height IS NOT NULL)                      AS has_height,
  (weight IS NOT NULL)                      AS has_weight,

  -- quality score
  LEAST(100,
    40
    + CASE WHEN nationality IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN birth_date  IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN height      IS NOT NULL THEN 10 ELSE 0 END
    + CASE WHEN weight      IS NOT NULL THEN 10 ELSE 0 END
    + CASE WHEN photo_url   IS NOT NULL THEN 10 ELSE 0 END
  )::numeric AS profile_quality_score

FROM af_player_profiles;
