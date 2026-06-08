
-- Stamp the Atletico/Ath Madrid duplicate candidate with system review metadata
-- All FK refs already migrated; this closes the audit trail.
UPDATE public.team_duplicate_candidates
SET
  reviewed_by  = 'system_rule_canonical_resolution_atletico_ath_madrid',
  reviewed_at  = now()
WHERE id = 'b28a3ab9-67a4-4970-8a62-458b7994f11e';
