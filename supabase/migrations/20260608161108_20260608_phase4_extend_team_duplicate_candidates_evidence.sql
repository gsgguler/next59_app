
-- Phase 4: Extend team_duplicate_candidates with evidence columns
ALTER TABLE public.team_duplicate_candidates
  ADD COLUMN IF NOT EXISTS evidence_score       numeric,
  ADD COLUMN IF NOT EXISTS evidence_summary     text,
  ADD COLUMN IF NOT EXISTS same_competition_overlap boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS played_each_other    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS same_source_conflict boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_decision   text;

-- Back-fill existing rows with sensible defaults where decidable
UPDATE public.team_duplicate_candidates SET
  same_competition_overlap = false,
  played_each_other = false,
  same_source_conflict = false
WHERE evidence_score IS NULL;
