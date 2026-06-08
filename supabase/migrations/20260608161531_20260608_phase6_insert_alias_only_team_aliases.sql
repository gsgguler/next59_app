
-- Phase 6: Insert team_aliases for alias_only candidates
-- source_id = internal_team_alias_review (cce3cf70-ee4f-4010-8e7a-38cb796d4d26)
INSERT INTO public.team_aliases
  (canonical_team_id, source_id, alias_name, alias_code, source, confidence)
VALUES

-- AEK (canonical, 572 Super League matches) ↔ AEK Athens (12 UEFA matches)
-- Add "AEK Athens" pointing to AEK canonical
('f171b2ff-9343-4499-aa90-8640bed73a4b',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'AEK Athens', NULL, 'global_identity_audit_20260608', 0.95),

-- Add "AEK" pointing to AEK Athens canonical (for reverse lookup)
('48e3a5a3-4af6-4b74-95da-16af9d866ce1',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'AEK', NULL, 'global_identity_audit_20260608', 0.95),

-- Betis (canonical, 967 La Liga matches) ← Real Betis (22 UEFA matches)
-- Add "Real Betis" pointing to Betis canonical
('f22f874e-8db6-4cb2-ab89-d0e741a2625c',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'Real Betis', NULL, 'global_identity_audit_20260608', 0.95),

-- Add "Betis" pointing to Real Betis canonical (reverse lookup)
('1ab78a81-53a1-497f-9f2e-3fd86f51b6aa',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'Betis', NULL, 'global_identity_audit_20260608', 0.95),

-- Mouscron (canonical, 457 Pro League matches) ← Mouscron-Peruwelz (60 matches, historical name)
('9a45992b-33cc-420e-8d2a-ea6690e12a07',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'Mouscron-Peruwelz', NULL, 'global_identity_audit_20260608', 0.90),

-- Sparta Rotterdam (canonical, 264 Eredivisie matches) ← Sparta (238 matches, abbreviated name)
('b8ba7b85-703c-448e-bdd7-994175294eeb',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'Sparta', NULL, 'global_identity_audit_20260608', 0.92),

-- Add "Sparta Rotterdam" pointing to Sparta canonical row (reverse lookup)
('e4f83b1f-0776-458d-bea6-a528ab0b0169',
 'cce3cf70-ee4f-4010-8e7a-38cb796d4d26',
 'Sparta Rotterdam', NULL, 'global_identity_audit_20260608', 0.92);
