
-- Extend existing v_team_alias_safety_violations to cover all three violation classes
-- while preserving the column contract that dependent views rely on:
--   alias_id, canonical_team_id, canonical_team_name, alias_name,
--   source_name, created_at, violation_reason

CREATE OR REPLACE VIEW public.v_team_alias_safety_violations AS

-- CATEGORY 1 (original): canonical team name or alias name looks like a B/reserve/youth team
SELECT
  ta.id                    AS alias_id,
  t.id                     AS canonical_team_id,
  t.name                   AS canonical_team_name,
  ta.alias_name,
  ds.name                  AS source_name,
  ta.created_at,
  CASE
    WHEN t.name ~* '(^| )(B|II|U19|U20|U21|U23|Reserve|Reserves|Academy|Youth)($| )'
      THEN 'canonical_is_reserve_or_youth_team'
    WHEN ta.alias_name ~* '(^| )(B|II|U19|U20|U21|U23|Reserve|Reserves|Academy|Youth)($| )'
      THEN 'alias_is_reserve_or_youth_team'
    ELSE 'unknown'
  END                      AS violation_reason
FROM public.team_aliases ta
JOIN public.teams       t  ON t.id  = ta.canonical_team_id
JOIN public.data_sources ds ON ds.id = ta.source_id
WHERE
  t.name      ~* '(^| )(B|II|U19|U20|U21|U23|Reserve|Reserves|Academy|Youth)($| )'
  OR ta.alias_name ~* '(^| )(B|II|U19|U20|U21|U23|Reserve|Reserves|Academy|Youth)($| )'

UNION ALL

-- CATEGORY 2: cross-team alias collision — same alias resolves to 2+ canonical teams
SELECT
  ta.id                                                                           AS alias_id,
  ta.canonical_team_id,
  t.name                                                                          AS canonical_team_name,
  ta.alias_name,
  ds.name                                                                         AS source_name,
  ta.created_at,
  'cross_team_collision:conflicts_with=' || other_t.name                          AS violation_reason
FROM public.team_aliases  ta
JOIN public.teams          t        ON t.id        = ta.canonical_team_id
JOIN public.data_sources   ds       ON ds.id       = ta.source_id
JOIN public.team_aliases   other_ta
  ON  LOWER(TRIM(other_ta.alias_name)) = LOWER(TRIM(ta.alias_name))
  AND other_ta.canonical_team_id      <> ta.canonical_team_id
  AND other_ta.id                      > ta.id   -- emit each pair once
JOIN public.teams          other_t   ON other_t.id = other_ta.canonical_team_id

UNION ALL

-- CATEGORY 3: parent-child alias leak — child team has an alias matching the parent's name
SELECT
  ta.id                                                                        AS alias_id,
  ta.canonical_team_id,
  child_t.name                                                                 AS canonical_team_name,
  ta.alias_name,
  ds.name                                                                      AS source_name,
  ta.created_at,
  'parent_child_alias_leak:parent=' || parent_t.name                           AS violation_reason
FROM public.team_relationships tr
JOIN public.teams       parent_t ON parent_t.id = tr.parent_team_id
JOIN public.teams       child_t  ON child_t.id  = tr.child_team_id
JOIN public.team_aliases ta
  ON  ta.canonical_team_id = tr.child_team_id
  AND (
        LOWER(TRIM(ta.alias_name)) = LOWER(TRIM(parent_t.name))
        OR (
              parent_t.short_name IS NOT NULL
          AND LOWER(TRIM(ta.alias_name)) = LOWER(TRIM(parent_t.short_name))
        )
      )
JOIN public.data_sources ds ON ds.id = ta.source_id;

COMMENT ON VIEW public.v_team_alias_safety_violations IS
  'Read-only audit view. violation_reason prefixes: canonical_is_reserve_or_youth_team | alias_is_reserve_or_youth_team | cross_team_collision:* | parent_child_alias_leak:*. Query before any ETL ingestion, match linking, or model retraining run.';
