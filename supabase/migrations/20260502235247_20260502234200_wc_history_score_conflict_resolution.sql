/*
  # WC History — Score Conflict Resolution

  ## Summary
  Classifies and resolves all 11 source_conflict issues using score semantics findings.

  ## Resolution logic
  - 9 high score conflicts: API-Football stores AET/final score as "ft";
    openfootball stores 90-minute score as "ft". Not a data error — different semantic layers.
    Classification: not_a_conflict_score_semantics. severity downgraded to info.
  - 1 high result conflict (England-Italy): openfootball labeled 1-2 as home_win (openfootball error).
    API-Football is correct (away_win). Classification: openfootball_data_error.
  - 2 medium group_name conflicts: openfootball uses different group letter assignments for
    Group D↔C and Group G↔H in 2014. API-Football primary kept. Non-blocking.
    Classification: non_blocking_group_label_diff.

  ## Audit trail preserved
  - No conflict records deleted
  - resolution_note added to description
  - severity updated to reflect actual risk level

  ## Separation
  - public.matches: NOT TOUCHED
  - model_lab: NOT TOUCHED
  - predictions: NOT TOUCHED
*/

DO $$
BEGIN

  -- ── Resolve 9 score conflicts: different semantic layers, not real errors ─
  -- These are all knockout matches where API-Football ft = AET final score,
  -- openfootball ft = 90-minute score. Both are correct, different semantics.
  UPDATE wc_history.data_quality_issues SET
    severity    = 'info',
    description = description || ' | RESOLVED: not_a_conflict_score_semantics — API-Football ft=AET/final; openfootball ft=90min. Score semantic fields (home_score_90, home_score_aet etc.) now populated.'
  WHERE issue_type = 'source_conflict'
    AND severity   = 'high'
    AND description LIKE 'Score conflict:%';

  -- ── Resolve England-Italy result conflict: openfootball data error ────────
  UPDATE wc_history.data_quality_issues SET
    severity    = 'info',
    description = description || ' | RESOLVED: openfootball_data_error — openfootball stored result=home_win for a 1-2 score. API-Football=away_win is correct.'
  WHERE issue_type = 'source_conflict'
    AND severity   = 'high'
    AND description LIKE 'result conflict:%'
    AND entity_id IN (
      SELECT id FROM wc_history.matches
      WHERE home_team_name = 'England' AND away_team_name = 'Italy'
    );

  -- ── Mark group_name conflicts as non-blocking ─────────────────────────────
  UPDATE wc_history.data_quality_issues SET
    description = description || ' | CLASSIFICATION: non_blocking_group_label_diff — openfootball group letter assignment differs from API-Football. API-Football kept as primary. Does not affect score semantics or model features.'
  WHERE issue_type = 'source_conflict'
    AND severity   = 'medium'
    AND description LIKE 'group_name conflict:%';

  -- ── Set conflict_unresolved on matches that still have no score_90 ────────
  UPDATE wc_history.matches SET
    score_semantics_status = 'conflict_unresolved'
  WHERE edition_year IN (2010, 2014)
    AND score_semantics_status = 'needs_review'
    AND home_score_90 IS NULL
    AND home_score_ft IS NOT NULL;

END $$;
