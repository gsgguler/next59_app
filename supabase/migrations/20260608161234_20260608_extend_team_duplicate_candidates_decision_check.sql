
-- Extend decision check constraint to include rebrand_or_historical_alias and needs_manual_review
ALTER TABLE public.team_duplicate_candidates
  DROP CONSTRAINT team_duplicate_candidates_decision_check;

ALTER TABLE public.team_duplicate_candidates
  ADD CONSTRAINT team_duplicate_candidates_decision_check
  CHECK (decision = ANY (ARRAY[
    'pending'::text,
    'same_team'::text,
    'different_team'::text,
    'alias_only'::text,
    'parent_child'::text,
    'rebrand_or_historical_alias'::text,
    'needs_manual_review'::text
  ]));
