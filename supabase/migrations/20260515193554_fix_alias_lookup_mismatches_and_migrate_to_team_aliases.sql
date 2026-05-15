/*
  # Fix Alias Lookup Mismatches + Migrate to Canonical team_aliases Table

  ## Part A — Fix 4 Known Alias Lookup Mismatches

  The audit identified 4 alias entries whose lookup keys don't match actual teams.name values.
  These are corrected in-place (UPDATE, no DELETE) before migration.

  ### af_team_name_aliases fixes (1 row)
  - canonical_name "Athletic" → "Ath Bilbao"
    Reason: teams.name stores this club as "Ath Bilbao", not "Athletic"

  ### af_team_aliases fixes (3 rows)
  - db_norm "nott m forest" → "Nott'm Forest"   (actual teams.name)
  - db_norm "m gladbach"    → "M'gladbach"       (actual teams.name)
  - db_norm "ad demirspor"  → "Ad. Demirspor"    (actual teams.name)

  These db_norm values are the lookup keys used by the transform pipeline to
  resolve FD staging names → canonical team IDs. Correcting them improves
  resolution accuracy without losing the source intent (af_norm is preserved).

  ## Part B — Migrate to canonical team_aliases table

  Migrates all resolvable rows from:
    - af_team_name_aliases  (85 rows, primary source: api-football, UEFA context)
    - af_team_aliases       (63 rows, primary source: api-football, domestic leagues)

  Into: team_aliases (canonical alias registry)

  Fields populated:
    - id                 : gen_random_uuid()
    - canonical_team_id  : resolved via teams.name lookup
    - source_id          : api-football data_source id (d8580550-e6bd-4379-bdbc-c8e721e017a9)
    - alias_name         : the provider-side name (af_name or af_norm)
    - alias_code         : NULL (no short code in source tables)
    - source_specific_id : league_id cast to text (for af_team_aliases) / NULL (for af_team_name_aliases)
    - confidence_score   : 0.97 for league-scoped aliases, 0.98 for name-level aliases
    - created_at         : now()

  Idempotency: ON CONFLICT (source_id, alias_name, alias_code) DO NOTHING
  The unique constraint treats alias_code NULL as equal for conflict detection
  per PostgreSQL NULLS NOT DISTINCT semantics — confirmed via index definition.

  ## Safety
  - No rows deleted in source tables.
  - No teams.name values modified.
  - ON CONFLICT guard makes this fully re-runnable.
  - Only inserts where canonical team can be resolved (INNER JOIN on teams.name).
*/

-- ============================================================
-- PART A: Fix alias lookup mismatches
-- ============================================================

-- Fix 1: af_team_name_aliases — "Athletic" → "Ath Bilbao"
UPDATE af_team_name_aliases
SET canonical_name = 'Ath Bilbao'
WHERE canonical_name = 'Athletic'
  AND af_name = 'Athletic Club';

-- Fix 2: af_team_aliases — "nott m forest" → "Nott'm Forest"
UPDATE af_team_aliases
SET db_norm = 'Nott''m Forest'
WHERE db_norm = 'nott m forest'
  AND league_id = 39;

-- Fix 3: af_team_aliases — "m gladbach" → "M'gladbach"
UPDATE af_team_aliases
SET db_norm = 'M''gladbach'
WHERE db_norm = 'm gladbach'
  AND league_id = 78;

-- Fix 4: af_team_aliases — "ad demirspor" → "Ad. Demirspor"
UPDATE af_team_aliases
SET db_norm = 'Ad. Demirspor'
WHERE db_norm = 'ad demirspor'
  AND league_id = 203;

-- ============================================================
-- PART B: Migrate af_team_name_aliases → team_aliases
-- These map provider full names (af_name) to canonical DB names.
-- Source: api-football, confidence 0.98 (name-level mapping, high reliability)
-- ============================================================

INSERT INTO team_aliases (
  id,
  canonical_team_id,
  source_id,
  alias_name,
  alias_code,
  source_specific_id,
  confidence_score,
  created_at
)
SELECT
  gen_random_uuid(),
  t.id                                          AS canonical_team_id,
  'd8580550-e6bd-4379-bdbc-c8e721e017a9'::uuid  AS source_id,  -- api-football
  ana.af_name                                   AS alias_name,
  NULL                                          AS alias_code,
  NULL                                          AS source_specific_id,
  0.98                                          AS confidence_score,
  now()                                         AS created_at
FROM af_team_name_aliases ana
INNER JOIN teams t ON lower(t.name) = lower(ana.canonical_name)
ON CONFLICT (source_id, alias_name, alias_code) DO NOTHING;

-- ============================================================
-- PART C: Migrate af_team_aliases → team_aliases
-- These map FD short names (db_norm) to API-Football full names (af_norm).
-- The canonical lookup goes via db_norm → teams.name.
-- Source: api-football, confidence 0.97 (league-scoped, slightly lower as
-- db_norm is an abbreviated form that required manual alignment)
-- source_specific_id stores the league_id for traceability.
-- ============================================================

INSERT INTO team_aliases (
  id,
  canonical_team_id,
  source_id,
  alias_name,
  alias_code,
  source_specific_id,
  confidence_score,
  created_at
)
SELECT
  gen_random_uuid(),
  t.id                                          AS canonical_team_id,
  'd8580550-e6bd-4379-bdbc-c8e721e017a9'::uuid  AS source_id,  -- api-football
  aa.af_norm                                    AS alias_name,
  NULL                                          AS alias_code,
  aa.league_id::text                            AS source_specific_id,
  0.97                                          AS confidence_score,
  now()                                         AS created_at
FROM af_team_aliases aa
INNER JOIN teams t ON lower(t.name) = lower(aa.db_norm)
ON CONFLICT (source_id, alias_name, alias_code) DO NOTHING;
