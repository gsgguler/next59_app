
-- Remove 3 reverse aliases that create canonical ambiguity.
-- Canonical direction: variant name → canonical; never canonical name → lesser team.
-- AEK (f171b2ff, 572 matches) is canonical; AEK Athens (48e3a5a3, 12 matches) is the variant.
-- Betis (f22f874e, 967 matches) is canonical; Real Betis (1ab78a81, 22 matches) is the variant.
-- Sparta Rotterdam (b8ba7b85, 264 matches) is canonical; Sparta (e4f83b1f, 238 matches) is the variant.
DELETE FROM public.team_aliases
WHERE source = 'global_identity_audit_20260608'
  AND (
    -- "AEK" pointing to AEK Athens canonical — wrong direction
    (alias_name = 'AEK'             AND canonical_team_id = '48e3a5a3-4af6-4b74-95da-16af9d866ce1')
    -- "Betis" pointing to Real Betis canonical — wrong direction
 OR (alias_name = 'Betis'           AND canonical_team_id = '1ab78a81-53a1-497f-9f2e-3fd86f51b6aa')
    -- "Sparta Rotterdam" pointing to Sparta canonical — wrong direction
 OR (alias_name = 'Sparta Rotterdam' AND canonical_team_id = 'e4f83b1f-0776-458d-bea6-a528ab0b0169')
  );
