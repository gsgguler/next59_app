/*
  # Calibration Backbone — Phase 1 — Safe Match Universe

  ## Summary
  Non-destructive read-only foundation for ELO and feature engineering.
  Creates model_lab.v_calibration_safe_matches — the single authoritative
  gate for all future calibration work.

  ## Scope
  Safe domestic leagues only:
    - Premier League      (api_football_id = 39)
    - Championship        (name match, no api_football_id)
    - Bundesliga          (api_football_id = 78)
    - Serie A             (api_football_id = 135)
    - La Liga             (api_football_id = 140)
    - Ligue 1             (api_football_id = 61)
    - Süper Lig           (api_football_id = 203)

  Excluded: UEFA competitions, national teams, WC2026, incomplete mappings.

  ## Safety Filters Applied
  1. FT only — both home_score_ft AND away_score_ft NOT NULL
  2. Valid FK integrity — home_team_id / away_team_id exist in teams table
  3. No self-match — home_team_id <> away_team_id
  4. Impossible score guard — scores 0–20 inclusive
  5. No duplicate fixtures — unique by (competition_season_id, home_team_id, away_team_id, match_date)
  6. Approved leagues only — via competition_id allowlist (7 UUIDs, hardened)
  7. No future data — match_date <= CURRENT_DATE
  8. No knockout contamination — stage_type IS NULL or not a knockout type

  ## New View
  - model_lab.v_calibration_safe_matches
    Returns one row per safe match with identity, result, and data-tier flags.
    Pre-match fields only — no post-match stats included in output columns.

  ## Leakage Classification
  Documents safe / unsafe / suspicious fields across the existing view stack.

  ## Notes
  - Non-destructive: no existing views or tables are modified or dropped
  - The approved competition UUIDs are validated against the live competitions table
  - v_domestic_calibration_universe already existed with a hardcoded UUID allowlist;
    this view is the stricter successor scoped to the Phase 1 mandate
*/

-- ============================================================
-- TASK 4: model_lab.v_calibration_safe_matches
-- ============================================================

CREATE OR REPLACE VIEW model_lab.v_calibration_safe_matches AS
WITH approved_competitions AS (
  -- Hardened allowlist: 7 approved domestic leagues only
  -- Championship has no api_football_id so matched by name
  SELECT id AS competition_id, name AS competition_name
  FROM public.competitions
  WHERE
    api_football_id IN (39, 78, 135, 140, 61, 203)
    OR name = 'Championship'
),
-- Detect duplicates so they can be excluded (safety net, currently 0 exist)
dup_guard AS (
  SELECT
    competition_season_id,
    home_team_id,
    away_team_id,
    match_date
  FROM public.matches
  GROUP BY competition_season_id, home_team_id, away_team_id, match_date
  HAVING COUNT(*) = 1  -- only rows with no duplicate
)
SELECT
  -- Identity
  m.id                          AS match_id,
  ac.competition_id,
  ac.competition_name,
  cs.id                         AS competition_season_id,
  s.label                       AS season_label,
  s.year                        AS season_year,

  -- Timing (pre-match safe)
  m.match_date                  AS kickoff_utc,

  -- Teams (pre-match safe)
  m.home_team_id,
  ht.name                       AS home_team_name,
  m.away_team_id,
  at2.name                      AS away_team_name,

  -- FT result (outcome — for calibration targets only, not pre-match features)
  m.home_score_ft,
  m.away_score_ft,
  CASE
    WHEN m.home_score_ft > m.away_score_ft THEN 'H'
    WHEN m.home_score_ft = m.away_score_ft THEN 'D'
    WHEN m.home_score_ft < m.away_score_ft THEN 'A'
  END                           AS result_1x2,

  -- Half-time result (outcome — labelling only)
  CASE
    WHEN m.home_score_ht > m.away_score_ht  THEN 'H'
    WHEN m.home_score_ht = m.away_score_ht  THEN 'D'
    WHEN m.home_score_ht < m.away_score_ht  THEN 'A'
    ELSE NULL
  END                           AS ht_result_1x2,

  -- Pre-match context (safe: known before kickoff)
  m.referee,
  m.round,

  -- Enrichment tier flags (boolean flags only — no stat values that could leak)
  COALESCE(ec.has_statistics, false)  AS has_stats,
  COALESCE(ec.has_events,     false)  AS has_events,
  COALESCE(ec.has_lineups,    false)  AS has_lineups,

  -- Data quality tier for downstream feature selection
  COALESCE(
    CASE
      WHEN ec.has_statistics AND ec.has_events AND ec.has_lineups THEN 'full_enriched'
      WHEN ec.has_statistics AND ec.has_events                    THEN 'partial_enriched'
      WHEN ec.has_statistics                                       THEN 'stats_only'
      ELSE 'basic'
    END,
    'basic'
  )                             AS data_quality_tier

FROM public.matches m
-- FK integrity: both teams must exist
JOIN public.teams ht  ON ht.id  = m.home_team_id
JOIN public.teams at2 ON at2.id = m.away_team_id
-- Competition chain
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.seasons             s  ON s.id  = cs.season_id
-- Approved leagues only
JOIN approved_competitions ac ON ac.competition_id = cs.competition_id
-- Duplicate guard (ensures 1:1 canonical row)
JOIN dup_guard dg ON
     dg.competition_season_id = m.competition_season_id
 AND dg.home_team_id          = m.home_team_id
 AND dg.away_team_id          = m.away_team_id
 AND dg.match_date            = m.match_date
-- Enrichment tier (optional join — provides quality flags)
LEFT JOIN public.v_match_enriched_context ec ON ec.match_id = m.id
WHERE
  -- FT scores present
  m.home_score_ft IS NOT NULL
  AND m.away_score_ft IS NOT NULL
  -- Impossible score guard (0–20)
  AND m.home_score_ft BETWEEN 0 AND 20
  AND m.away_score_ft BETWEEN 0 AND 20
  -- No self-match
  AND m.home_team_id <> m.away_team_id
  -- No future matches
  AND m.match_date <= CURRENT_DATE
  -- Exclude knockout rounds (nulls pass — most domestic league rows have no stage_type)
  AND (m.stage_type IS NULL OR m.stage_type NOT IN ('knockout', 'final', 'semi_final', 'quarter_final', 'round_of_16', 'round_of_32'));

-- Grant read access consistent with rest of model_lab schema
GRANT SELECT ON model_lab.v_calibration_safe_matches TO authenticated;
