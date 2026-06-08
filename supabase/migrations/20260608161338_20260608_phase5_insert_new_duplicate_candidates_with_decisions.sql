
-- Phase 5: Insert all new duplicate/alias candidates with context-validated decisions
INSERT INTO public.team_duplicate_candidates
  (team_id_1, team_name_1, team_id_2, team_name_2,
   similarity_score, candidate_reason, risk_level, decision,
   evidence_score, evidence_summary,
   same_competition_overlap, played_each_other, same_source_conflict,
   suggested_decision, reviewed_by, reviewed_at)
VALUES

-- === ALIAS_ONLY: Same club, different name variants ===

('f171b2ff-9343-4499-aa90-8640bed73a4b', 'AEK',
 '48e3a5a3-4af6-4b74-95da-16af9d866ce1', 'AEK Athens',
 similarity('AEK', 'AEK Athens'), 'contains_name', 'medium', 'alias_only',
 0.95, 'AEK=domestic Super League name (572 matches); AEK Athens=UEFA name (12 matches); same club, never opposed',
 false, false, false, 'alias_only', 'global_identity_audit_20260608', now()),

('f22f874e-8db6-4cb2-ab89-d0e741a2625c', 'Betis',
 '1ab78a81-53a1-497f-9f2e-3fd86f51b6aa', 'Real Betis',
 similarity('Betis', 'Real Betis'), 'contains_name', 'low', 'alias_only',
 0.95, 'Betis=domestic name (La Liga 967 matches); Real Betis=UEFA name (22 matches); same club, never opposed',
 false, false, false, 'alias_only', 'global_identity_audit_20260608', now()),

('9a45992b-33cc-420e-8d2a-ea6690e12a07', 'Mouscron',
 'd84ba274-111a-4dec-8272-698863405418', 'Mouscron-Peruwelz',
 similarity('Mouscron', 'Mouscron-Peruwelz'), 'contains_name', 'low', 'alias_only',
 0.90, 'Mouscron-Peruwelz was historical full name of Royal Excel Mouscron; both Belgian Pro League, never opposed',
 true, false, false, 'alias_only', 'global_identity_audit_20260608', now()),

('e4f83b1f-0776-458d-bea6-a528ab0b0169', 'Sparta',
 'b8ba7b85-703c-448e-bdd7-994175294eeb', 'Sparta Rotterdam',
 similarity('Sparta', 'Sparta Rotterdam'), 'contains_name', 'medium', 'alias_only',
 0.92, 'Sparta=abbreviated Eredivisie name (238 matches); Sparta Rotterdam=full name (264 matches); same competition, never opposed',
 true, false, false, 'alias_only', 'global_identity_audit_20260608', now()),

-- === REBRAND_OR_HISTORICAL_ALIAS ===

('ae170225-95e3-4b39-b879-262675bdca7d', 'Beveren',
 '598b17cb-d40a-473c-b63d-7a0d57c32335', 'Waasland-Beveren',
 similarity('Beveren', 'Waasland-Beveren'), 'contains_name', 'medium', 'rebrand_or_historical_alias',
 0.70, 'SK Beveren (236 Pro League) merged into Waasland-Beveren (273 Pro League) in 2009, later dissolved; different eras, same competition, never opposed',
 true, false, false, 'rebrand_or_historical_alias', 'global_identity_audit_20260608', now()),

('b9ee8bff-f27d-4feb-bfc6-08299889cdd5', 'Rouen',
 '4935b96e-a08f-4893-9b92-5dcfdfe6b4d1', 'Quevilly Rouen',
 similarity('Rouen', 'Quevilly Rouen'), 'contains_name', 'low', 'rebrand_or_historical_alias',
 0.65, 'FC Rouen (38 Ligue 2) folded; Quevilly merged with Rouen heritage forming Quevilly Rouen (152 Ligue 2); historical succession',
 true, false, false, 'rebrand_or_historical_alias', 'global_identity_audit_20260608', now()),

-- === DIFFERENT_TEAM: Confirmed by match history or country/league context ===

('db117e5b-9abe-4670-858d-9f284da37ef5', 'Dundee',
 '9e828b8b-da7e-433f-9122-74f853a02a7f', 'Dundee United',
 similarity('Dundee', 'Dundee United'), 'contains_name', 'low', 'different_team',
 1.00, 'Dundee derby: 37 head-to-head matches confirmed; two separate clubs sharing city name',
 true, true, false, 'different_team', 'global_identity_audit_20260608', now()),

('98c5029f-d978-4322-ba58-a65931118085', 'Chester',
 '1eebf743-b8a2-4973-9774-9bbfe619e5d0', 'Chesterfield',
 similarity('Chester', 'Chesterfield'), 'contains_name', 'low', 'different_team',
 1.00, '4 head-to-head matches; Chester City (Wales/England border) vs Chesterfield FC (Derbyshire); distinct clubs',
 false, true, false, 'different_team', 'global_identity_audit_20260608', now()),

('1e1a09f9-4ae3-4aee-af0f-036785ae5cef', 'Hearts',
 '2217a2f3-e547-44bf-87e4-b46f352a8b93', 'Kelty Hearts',
 similarity('Hearts', 'Kelty Hearts'), 'contains_name', 'low', 'different_team',
 0.98, 'Hearts=Heart of Midlothian (Scottish Premiership); Kelty Hearts=small Fife club (L1/L2); different leagues, distinct clubs',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('7d2a4e98-9860-411c-9415-ebebbd81d637', 'Clyde',
 '92c29f2b-e492-4194-a88c-dbcf36509612', 'Clydebank',
 similarity('Clyde', 'Clydebank'), 'contains_name', 'low', 'different_team',
 0.97, 'Clyde FC and Clydebank FC are distinct Scottish clubs; false positive contains-name match',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('e4f83b1f-0776-458d-bea6-a528ab0b0169', 'Sparta',
 '57e28345-3b6d-4bfc-97d3-0b3c8d9f4a3f', 'Sparta Praha',
 similarity('Sparta', 'Sparta Praha'), 'contains_name', 'low', 'different_team',
 0.99, 'Sparta=Sparta Rotterdam (Dutch Eredivisie); Sparta Praha=Czech club (UEFA CL/EL); different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('e4f83b1f-0776-458d-bea6-a528ab0b0169', 'Sparta',
 '3638c8ff-eca8-4818-b863-1386404d17b3', 'Hamrun Spartans',
 similarity('Sparta', 'Hamrun Spartans'), 'contains_name', 'low', 'different_team',
 0.99, 'Sparta=Dutch club; Hamrun Spartans=Maltese club; false positive contains-name; different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('d1cc0baf-66a0-409e-8c09-251c244f2971', 'Murcia',
 '8a245152-7dd2-4cde-bb47-99aa8d27ecde', 'Ciudad de Murcia',
 similarity('Murcia', 'Ciudad de Murcia'), 'contains_name', 'low', 'different_team',
 0.97, 'Murcia=Real Murcia; Ciudad de Murcia=distinct club; both Spanish, share city name only',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('6e4de960-b6f4-4b0d-ac33-51573d21e302', 'Lincoln',
 '262c6aeb-81c5-42ca-9a9f-00f87e194d35', 'Lincoln Red Imps FC',
 similarity('Lincoln', 'Lincoln Red Imps FC'), 'contains_name', 'low', 'different_team',
 0.99, 'Lincoln=Lincoln City FC (English League); Lincoln Red Imps FC=Gibraltar club; different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('470b2c42-981b-476e-ac23-19cb20da6f64', 'Porto',
 'd390f5dd-c59a-40c9-94c2-2761767010f3', 'Portogruaro',
 similarity('Porto', 'Portogruaro'), 'contains_name', 'low', 'different_team',
 0.99, 'FC Porto (Portugal) vs Portogruaro (Italian minor); false positive; different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('8c84514f-0674-42ad-8bec-887d83e8ffec', 'Lorca',
 'a9d31ae8-75a6-4a8e-9742-1b687a969370', 'Mallorca',
 similarity('Lorca', 'Mallorca'), 'contains_name', 'low', 'different_team',
 0.99, 'Lorca FC (Murcia) vs RCD Mallorca (Balearic Islands); false positive contains-name; distinct clubs',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('a97d254c-fb98-4e87-9a25-1154383e9e40', 'Angers',
 '55c1b9e3-d5d5-43a9-81f3-9070924db6da', 'Rangers',
 similarity('Angers', 'Rangers'), 'contains_name', 'low', 'different_team',
 1.00, 'Angers SCO (French Ligue 1) vs Rangers FC (Scottish); false positive contains-name; different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now()),

('a97d254c-fb98-4e87-9a25-1154383e9e40', 'Angers',
 'd9a6dfc4-5b73-442d-9310-5fe2e48f72de', 'Cove Rangers',
 similarity('Angers', 'Cove Rangers'), 'contains_name', 'low', 'different_team',
 1.00, 'Angers SCO (France) vs Cove Rangers (Scotland); false positive; different countries',
 false, false, false, 'different_team', 'global_identity_audit_20260608', now());
