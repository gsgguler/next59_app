/*
  # Backfill teams.country_id via Competition Linkage

  ## Summary
  687 teams have null country_id. 684 of these can be deterministically assigned
  by tracing each team's matches → competition_seasons → competitions → countries.
  The audit confirmed zero ambiguous teams (no team appears in competitions from
  more than one country).

  ## Excluded teams (intentionally left NULL for manual review)
  - Cukaricki      (id: eed06749-59bf-497d-847e-11c122a23b40) — no competition country linkage
  - FC Lugano      (id: b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c) — no competition country linkage
  - Union St. Gilloise (id: 0e2e2bfd-7efb-410b-aa62-11b2eec72b2a) — no competition country linkage

  ## Countries updated (11 countries, 684 teams total)
  | Country     | Teams |
  |-------------|-------|
  | England     |  115  |
  | Spain       |   89  |
  | Italy       |   83  |
  | France      |   70  |
  | Germany     |   70  |
  | Turkey      |   55  |
  | Scotland    |   52  |
  | Portugal    |   42  |
  | Greece      |   38  |
  | Belgium     |   38  |
  | Netherlands |   32  |

  ## Safety
  - Only updates rows WHERE country_id IS NULL — never overwrites existing assignments.
  - Only assigns a country when the competition's country_id is NOT NULL.
  - Excludes the 3 manually-reviewed teams by explicit id.
  - Each UPDATE uses a subquery that is deterministic (audit confirmed no team
    appears in multiple countries).
  - No rows are deleted or restructured.
  - Fully idempotent: re-running after country_id is set is a no-op (WHERE IS NULL).
*/

-- Helper: team IDs to exclude from all updates
-- Cukaricki: eed06749-59bf-497d-847e-11c122a23b40
-- FC Lugano: b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c
-- Union St. Gilloise: 0e2e2bfd-7efb-410b-aa62-11b2eec72b2a

-- England
UPDATE teams
SET country_id = '61005b75-bd9e-4a7d-81bf-2c3b6d3f200a'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '61005b75-bd9e-4a7d-81bf-2c3b6d3f200a'
  );

-- Spain
UPDATE teams
SET country_id = 'df535e76-4846-4b1d-8e7a-da139508d91d'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = 'df535e76-4846-4b1d-8e7a-da139508d91d'
  );

-- Italy
UPDATE teams
SET country_id = '095d50d3-0cbd-4826-8419-3546e1b3b933'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '095d50d3-0cbd-4826-8419-3546e1b3b933'
  );

-- France
UPDATE teams
SET country_id = '629f6de9-11ef-4a09-a660-1d760a3d7cab'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '629f6de9-11ef-4a09-a660-1d760a3d7cab'
  );

-- Germany
UPDATE teams
SET country_id = '81abfbca-b852-4a00-aea5-63b40f942533'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '81abfbca-b852-4a00-aea5-63b40f942533'
  );

-- Turkey
UPDATE teams
SET country_id = '8caa47dd-0fa2-4460-ab48-722ef7687c2a'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '8caa47dd-0fa2-4460-ab48-722ef7687c2a'
  );

-- Scotland
UPDATE teams
SET country_id = '35a96a63-a169-42a6-9a11-001dc57866dc'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '35a96a63-a169-42a6-9a11-001dc57866dc'
  );

-- Portugal
UPDATE teams
SET country_id = 'aa127fb1-93c8-42ca-b266-2e6fd067aa29'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = 'aa127fb1-93c8-42ca-b266-2e6fd067aa29'
  );

-- Greece
UPDATE teams
SET country_id = '0a469a32-6120-4a5e-907b-f64338606caa'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '0a469a32-6120-4a5e-907b-f64338606caa'
  );

-- Belgium
UPDATE teams
SET country_id = '84ffdc7c-bfdb-4f57-9f9b-137745552b1c'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '84ffdc7c-bfdb-4f57-9f9b-137745552b1c'
  );

-- Netherlands
UPDATE teams
SET country_id = '5c385e0a-c9a5-40dc-8642-222ec70046e2'
WHERE country_id IS NULL
  AND id NOT IN (
    'eed06749-59bf-497d-847e-11c122a23b40',
    'b3c1c5f7-13ad-45f9-9d72-eff1c4bfe82c',
    '0e2e2bfd-7efb-410b-aa62-11b2eec72b2a'
  )
  AND id IN (
    SELECT DISTINCT t2.id
    FROM teams t2
    JOIN matches m ON (m.home_team_id = t2.id OR m.away_team_id = t2.id)
    JOIN competition_seasons cs ON cs.id = m.competition_season_id
    JOIN competitions c ON c.id = cs.competition_id
    WHERE c.country_id = '5c385e0a-c9a5-40dc-8642-222ec70046e2'
  );
