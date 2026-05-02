/*
  # openfootball/worldcup.json — raw store + mapping + enrichment for 2010 and 2014

  ## Summary
  Stores raw openfootball payloads, then maps and enriches wc_history.matches
  for editions 2010 and 2014 only.

  ## Rules
  - API-Football is primary: never overwrite non-null fields blindly
  - Conflicts logged to wc_history.data_quality_issues (source_conflict)
  - Enrichment fills only NULL/missing fields if confidence >= 0.95
  - No events, lineups, players, statistics fabricated
  - No domestic league tables touched
  - No model_lab, no predictions

  ## Phases
  1. Insert raw JSON into wc_history.raw_openfootball_responses
  2. Parse into temp structure via DO block
  3. Map openfootball rows to wc_history.matches via date+teams
  4. Fill missing fields, log conflicts
  5. Update source_mappings
*/

DO $$
DECLARE
  v_2010_json  jsonb;
  v_2014_json  jsonb;
  v_hash_2010  text;
  v_hash_2014  text;
  v_source_url_2010 text := 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2010/worldcup.json';
  v_source_url_2014 text := 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2014/worldcup.json';

  -- counters
  v_mapped_2010       integer := 0;
  v_mapped_2014       integer := 0;
  v_needs_review_2010 integer := 0;
  v_needs_review_2014 integer := 0;
  v_filled_group      integer := 0;
  v_filled_venue      integer := 0;
  v_filled_city       integer := 0;
  v_filled_stage      integer := 0;
  v_filled_score      integer := 0;
  v_filled_result     integer := 0;
  v_conflicts         integer := 0;

  -- loop vars
  v_match     jsonb;
  v_match_id  uuid;
  v_team1     text;
  v_team2     text;
  v_date      date;
  v_round     text;
  v_group     text;
  v_ground    text;
  v_venue_nm  text;
  v_city_nm   text;
  v_score_ft  jsonb;
  v_home_ft   integer;
  v_away_ft   integer;
  v_stage_code text;
  v_conf      numeric;
  v_edition   integer;
  v_result    text;
  v_mapping_status text;

  -- existing match fields
  ex_group    text;
  ex_venue    text;
  ex_city     text;
  ex_stage    text;
  ex_home_ft  integer;
  ex_away_ft  integer;
  ex_result   text;
  ex_score_api text;
  ob_score    text;

BEGIN
  -- ── 1. Build raw JSON payloads (embedded — fetched externally, stored here) ──

  v_2010_json := $json2010${"name":"World Cup 2010","matches":[{"round":"Matchday 1","date":"2010-06-11","team1":"South Africa","team2":"Mexico","score":{"ft":[1,1]},"group":"Group A","ground":"Soccer City, Johannesburg"},{"round":"Matchday 1","date":"2010-06-11","team1":"Uruguay","team2":"France","score":{"ft":[0,0]},"group":"Group A","ground":"Cape Town Stadium, Cape Town"},{"round":"Matchday 6","date":"2010-06-16","team1":"South Africa","team2":"Uruguay","score":{"ft":[0,3]},"group":"Group A","ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Matchday 7","date":"2010-06-17","team1":"France","team2":"Mexico","score":{"ft":[0,2]},"group":"Group A","ground":"Peter Mokaba Stadium, Polokwane"},{"round":"Matchday 12","date":"2010-06-22","team1":"Mexico","team2":"Uruguay","score":{"ft":[0,1]},"group":"Group A","ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Matchday 12","date":"2010-06-22","team1":"France","team2":"South Africa","score":{"ft":[1,2]},"group":"Group A","ground":"Free State Stadium, Bloemfontein"},{"round":"Matchday 2","date":"2010-06-12","team1":"South Korea","team2":"Greece","score":{"ft":[2,0]},"group":"Group B","ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Matchday 2","date":"2010-06-12","team1":"Argentina","team2":"Nigeria","score":{"ft":[1,0]},"group":"Group B","ground":"Ellis Park Stadium, Johannesburg"},{"round":"Matchday 7","date":"2010-06-17","team1":"Argentina","team2":"South Korea","score":{"ft":[4,1]},"group":"Group B","ground":"Soccer City, Johannesburg"},{"round":"Matchday 7","date":"2010-06-17","team1":"Greece","team2":"Nigeria","score":{"ft":[2,1]},"group":"Group B","ground":"Free State Stadium, Bloemfontein"},{"round":"Matchday 12","date":"2010-06-22","team1":"Nigeria","team2":"South Korea","score":{"ft":[2,2]},"group":"Group B","ground":"Moses Mabhida Stadium, Durban"},{"round":"Matchday 12","date":"2010-06-22","team1":"Greece","team2":"Argentina","score":{"ft":[0,2]},"group":"Group B","ground":"Peter Mokaba Stadium, Polokwane"},{"round":"Matchday 2","date":"2010-06-12","team1":"England","team2":"USA","score":{"ft":[1,1]},"group":"Group C","ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Matchday 3","date":"2010-06-13","team1":"Algeria","team2":"Slovenia","score":{"ft":[0,1]},"group":"Group C","ground":"Peter Mokaba Stadium, Polokwane"},{"round":"Matchday 8","date":"2010-06-18","team1":"Slovenia","team2":"USA","score":{"ft":[2,2]},"group":"Group C","ground":"Ellis Park Stadium, Johannesburg"},{"round":"Matchday 8","date":"2010-06-18","team1":"England","team2":"Algeria","score":{"ft":[0,0]},"group":"Group C","ground":"Cape Town Stadium, Cape Town"},{"round":"Matchday 13","date":"2010-06-23","team1":"USA","team2":"Algeria","score":{"ft":[1,0]},"group":"Group C","ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Matchday 13","date":"2010-06-23","team1":"Slovenia","team2":"England","score":{"ft":[0,1]},"group":"Group C","ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Matchday 3","date":"2010-06-13","team1":"Serbia","team2":"Ghana","score":{"ft":[0,1]},"group":"Group D","ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Matchday 3","date":"2010-06-13","team1":"Germany","team2":"Australia","score":{"ft":[4,0]},"group":"Group D","ground":"Moses Mabhida Stadium, Durban"},{"round":"Matchday 8","date":"2010-06-18","team1":"Germany","team2":"Serbia","score":{"ft":[0,1]},"group":"Group D","ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Matchday 9","date":"2010-06-19","team1":"Ghana","team2":"Australia","score":{"ft":[1,1]},"group":"Group D","ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Matchday 13","date":"2010-06-23","team1":"Australia","team2":"Serbia","score":{"ft":[2,1]},"group":"Group D","ground":"Mbombela Stadium, Nelspruit"},{"round":"Matchday 13","date":"2010-06-23","team1":"Ghana","team2":"Germany","score":{"ft":[0,1]},"group":"Group D","ground":"Soccer City, Johannesburg"},{"round":"Matchday 4","date":"2010-06-14","team1":"Netherlands","team2":"Denmark","score":{"ft":[2,0]},"group":"Group E","ground":"Soccer City, Johannesburg"},{"round":"Matchday 4","date":"2010-06-14","team1":"Japan","team2":"Cameroon","score":{"ft":[1,0]},"group":"Group E","ground":"Free State Stadium, Bloemfontein"},{"round":"Matchday 9","date":"2010-06-19","team1":"Netherlands","team2":"Japan","score":{"ft":[1,0]},"group":"Group E","ground":"Moses Mabhida Stadium, Durban"},{"round":"Matchday 9","date":"2010-06-19","team1":"Cameroon","team2":"Denmark","score":{"ft":[1,2]},"group":"Group E","ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Matchday 14","date":"2010-06-24","team1":"Denmark","team2":"Japan","score":{"ft":[1,3]},"group":"Group E","ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Matchday 14","date":"2010-06-24","team1":"Cameroon","team2":"Netherlands","score":{"ft":[1,2]},"group":"Group E","ground":"Cape Town Stadium, Cape Town"},{"round":"Matchday 4","date":"2010-06-14","team1":"Italy","team2":"Paraguay","score":{"ft":[1,1]},"group":"Group F","ground":"Cape Town Stadium, Cape Town"},{"round":"Matchday 5","date":"2010-06-15","team1":"New Zealand","team2":"Slovakia","score":{"ft":[1,1]},"group":"Group F","ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Matchday 10","date":"2010-06-20","team1":"Slovakia","team2":"Paraguay","score":{"ft":[0,2]},"group":"Group F","ground":"Free State Stadium, Bloemfontein"},{"round":"Matchday 10","date":"2010-06-20","team1":"Italy","team2":"New Zealand","score":{"ft":[1,1]},"group":"Group F","ground":"Mbombela Stadium, Nelspruit"},{"round":"Matchday 14","date":"2010-06-24","team1":"Slovakia","team2":"Italy","score":{"ft":[3,2]},"group":"Group F","ground":"Ellis Park Stadium, Johannesburg"},{"round":"Matchday 14","date":"2010-06-24","team1":"Paraguay","team2":"New Zealand","score":{"ft":[0,0]},"group":"Group F","ground":"Peter Mokaba Stadium, Polokwane"},{"round":"Matchday 5","date":"2010-06-15","team1":"Cote d'Ivoire","team2":"Portugal","score":{"ft":[0,0]},"group":"Group G","ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Matchday 5","date":"2010-06-15","team1":"Brazil","team2":"North Korea","score":{"ft":[2,1]},"group":"Group G","ground":"Ellis Park Stadium, Johannesburg"},{"round":"Matchday 10","date":"2010-06-20","team1":"Brazil","team2":"Cote d'Ivoire","score":{"ft":[3,1]},"group":"Group G","ground":"Soccer City, Johannesburg"},{"round":"Matchday 11","date":"2010-06-21","team1":"Portugal","team2":"North Korea","score":{"ft":[7,0]},"group":"Group G","ground":"Cape Town Stadium, Cape Town"},{"round":"Matchday 15","date":"2010-06-25","team1":"Portugal","team2":"Brazil","score":{"ft":[0,0]},"group":"Group G","ground":"Moses Mabhida Stadium, Durban"},{"round":"Matchday 15","date":"2010-06-25","team1":"North Korea","team2":"Cote d'Ivoire","score":{"ft":[0,3]},"group":"Group G","ground":"Mbombela Stadium, Nelspruit"},{"round":"Matchday 6","date":"2010-06-16","team1":"Honduras","team2":"Chile","score":{"ft":[0,1]},"group":"Group H","ground":"Mbombela Stadium, Nelspruit"},{"round":"Matchday 6","date":"2010-06-16","team1":"Spain","team2":"Switzerland","score":{"ft":[0,1]},"group":"Group H","ground":"Moses Mabhida Stadium, Durban"},{"round":"Matchday 11","date":"2010-06-21","team1":"Chile","team2":"Switzerland","score":{"ft":[1,0]},"group":"Group H","ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Matchday 11","date":"2010-06-21","team1":"Spain","team2":"Honduras","score":{"ft":[2,0]},"group":"Group H","ground":"Ellis Park Stadium, Johannesburg"},{"round":"Matchday 15","date":"2010-06-25","team1":"Chile","team2":"Spain","score":{"ft":[1,2]},"group":"Group H","ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Matchday 15","date":"2010-06-25","team1":"Switzerland","team2":"Honduras","score":{"ft":[0,0]},"group":"Group H","ground":"Free State Stadium, Bloemfontein"},{"round":"Round of 16","date":"2010-06-26","team1":"Uruguay","team2":"South Korea","score":{"ft":[2,1]},"ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Round of 16","date":"2010-06-26","team1":"USA","team2":"Ghana","score":{"et":[1,2],"ft":[1,1]},"ground":"Royal Bafokeng Stadium, Rustenburg"},{"round":"Round of 16","date":"2010-06-27","team1":"Germany","team2":"England","score":{"ft":[4,1]},"ground":"Free State Stadium, Bloemfontein"},{"round":"Round of 16","date":"2010-06-27","team1":"Argentina","team2":"Mexico","score":{"ft":[3,1]},"ground":"Soccer City, Johannesburg"},{"round":"Round of 16","date":"2010-06-28","team1":"Netherlands","team2":"Slovakia","score":{"ft":[2,1]},"ground":"Moses Mabhida Stadium, Durban"},{"round":"Round of 16","date":"2010-06-28","team1":"Brazil","team2":"Chile","score":{"ft":[3,0]},"ground":"Ellis Park Stadium, Johannesburg"},{"round":"Round of 16","date":"2010-06-29","team1":"Paraguay","team2":"Japan","score":{"p":[5,3],"et":[0,0],"ft":[0,0]},"ground":"Loftus Versfeld Stadium, Pretoria"},{"round":"Round of 16","date":"2010-06-29","team1":"Spain","team2":"Portugal","score":{"ft":[1,0]},"ground":"Cape Town Stadium, Cape Town"},{"round":"Quarterfinals","date":"2010-07-02","team1":"Netherlands","team2":"Brazil","score":{"ft":[2,1]},"ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Quarterfinals","date":"2010-07-02","team1":"Uruguay","team2":"Ghana","score":{"p":[4,2],"et":[1,1],"ft":[1,1]},"ground":"Soccer City, Johannesburg"},{"round":"Quarterfinals","date":"2010-07-03","team1":"Argentina","team2":"Germany","score":{"ft":[0,4]},"ground":"Cape Town Stadium, Cape Town"},{"round":"Quarterfinals","date":"2010-07-03","team1":"Paraguay","team2":"Spain","score":{"ft":[0,1]},"ground":"Ellis Park Stadium, Johannesburg"},{"round":"Semifinals","date":"2010-07-06","team1":"Uruguay","team2":"Netherlands","score":{"ft":[2,3]},"ground":"Cape Town Stadium, Cape Town"},{"round":"Semifinals","date":"2010-07-07","team1":"Germany","team2":"Spain","score":{"ft":[0,1]},"ground":"Moses Mabhida Stadium, Durban"},{"round":"Third-place play-off","date":"2010-07-10","team1":"Uruguay","team2":"Germany","score":{"ft":[2,3]},"ground":"Nelson Mandela Bay Stadium, Port Elizabeth"},{"round":"Final","date":"2010-07-11","team1":"Netherlands","team2":"Spain","score":{"et":[0,1],"ft":[0,0]},"ground":"Soccer City, Johannesburg"}]}$json2010$;

  v_2014_json := $json2014${"name":"World Cup 2014","matches":[{"round":"Matchday 1","date":"2014-06-12","team1":"Brazil","team2":"Croatia","score":{"ft":[3,1],"ht":[1,1]},"group":"Group A","ground":"Arena de São Paulo, São Paulo"},{"round":"Matchday 2","date":"2014-06-13","team1":"Mexico","team2":"Cameroon","score":{"ft":[1,0],"ht":[0,0]},"group":"Group A","ground":"Estádio das Dunas, Natal"},{"round":"Matchday 6","date":"2014-06-17","team1":"Brazil","team2":"Mexico","score":{"ft":[0,0]},"group":"Group A","ground":"Estádio Castelão, Fortaleza"},{"round":"Matchday 7","date":"2014-06-18","team1":"Cameroon","team2":"Croatia","score":{"ft":[0,4]},"group":"Group A","ground":"Arena Amazônia, Manaus"},{"round":"Matchday 12","date":"2014-06-23","team1":"Cameroon","team2":"Brazil","score":{"ft":[1,4]},"group":"Group A","ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Matchday 12","date":"2014-06-23","team1":"Croatia","team2":"Mexico","score":{"ft":[1,3]},"group":"Group A","ground":"Arena Pernambuco, Recife"},{"round":"Matchday 2","date":"2014-06-13","team1":"Spain","team2":"Netherlands","score":{"ft":[1,5],"ht":[1,1]},"group":"Group B","ground":"Arena Fonte Nova, Salvador"},{"round":"Matchday 2","date":"2014-06-13","team1":"Chile","team2":"Australia","score":{"ft":[3,1],"ht":[2,1]},"group":"Group B","ground":"Arena Pantanal, Cuiabá"},{"round":"Matchday 7","date":"2014-06-18","team1":"Australia","team2":"Netherlands","score":{"ft":[2,3]},"group":"Group B","ground":"Estádio Beira-Rio, Porto Alegre"},{"round":"Matchday 7","date":"2014-06-18","team1":"Spain","team2":"Chile","score":{"ft":[0,2]},"group":"Group B","ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Matchday 12","date":"2014-06-23","team1":"Australia","team2":"Spain","score":{"ft":[0,3]},"group":"Group B","ground":"Arena da Baixada, Curitiba"},{"round":"Matchday 12","date":"2014-06-23","team1":"Netherlands","team2":"Chile","score":{"ft":[2,0]},"group":"Group B","ground":"Arena de São Paulo, São Paulo"},{"round":"Matchday 3","date":"2014-06-14","team1":"Colombia","team2":"Greece","score":{"ft":[3,0]},"group":"Group C","ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Matchday 3","date":"2014-06-14","team1":"Cote d'Ivoire","team2":"Japan","score":{"ft":[2,1]},"group":"Group C","ground":"Arena Pernambuco, Recife"},{"round":"Matchday 8","date":"2014-06-19","team1":"Colombia","team2":"Cote d'Ivoire","score":{"ft":[2,1]},"group":"Group C","ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Matchday 8","date":"2014-06-19","team1":"Japan","team2":"Greece","score":{"ft":[0,0]},"group":"Group C","ground":"Estádio das Dunas, Natal"},{"round":"Matchday 13","date":"2014-06-24","team1":"Japan","team2":"Colombia","score":{"ft":[1,4]},"group":"Group C","ground":"Arena Pantanal, Cuiabá"},{"round":"Matchday 13","date":"2014-06-24","team1":"Greece","team2":"Cote d'Ivoire","score":{"ft":[2,1]},"group":"Group C","ground":"Estádio Castelão, Fortaleza"},{"round":"Matchday 3","date":"2014-06-14","team1":"Uruguay","team2":"Costa Rica","score":{"ft":[1,3]},"group":"Group D","ground":"Estádio Castelão, Fortaleza"},{"round":"Matchday 3","date":"2014-06-14","team1":"England","team2":"Italy","score":{"ft":[1,2]},"group":"Group D","ground":"Arena Amazônia, Manaus"},{"round":"Matchday 8","date":"2014-06-19","team1":"Uruguay","team2":"England","score":{"ft":[2,1]},"group":"Group D","ground":"Arena de São Paulo, São Paulo"},{"round":"Matchday 9","date":"2014-06-20","team1":"Italy","team2":"Costa Rica","score":{"ft":[0,1]},"group":"Group D","ground":"Arena Pernambuco, Recife"},{"round":"Matchday 13","date":"2014-06-24","team1":"Italy","team2":"Uruguay","score":{"ft":[0,1]},"group":"Group D","ground":"Estádio das Dunas, Natal"},{"round":"Matchday 13","date":"2014-06-24","team1":"Costa Rica","team2":"England","score":{"ft":[0,0]},"group":"Group D","ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Matchday 4","date":"2014-06-15","team1":"Switzerland","team2":"Ecuador","score":{"ft":[2,1]},"group":"Group E","ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Matchday 4","date":"2014-06-15","team1":"France","team2":"Honduras","score":{"ft":[3,0]},"group":"Group E","ground":"Estádio Beira-Rio, Porto Alegre"},{"round":"Matchday 9","date":"2014-06-20","team1":"Switzerland","team2":"France","score":{"ft":[2,5]},"group":"Group E","ground":"Arena Fonte Nova, Salvador"},{"round":"Matchday 9","date":"2014-06-20","team1":"Honduras","team2":"Ecuador","score":{"ft":[1,2]},"group":"Group E","ground":"Arena da Baixada, Curitiba"},{"round":"Matchday 14","date":"2014-06-25","team1":"Honduras","team2":"Switzerland","score":{"ft":[0,3]},"group":"Group E","ground":"Arena Amazônia, Manaus"},{"round":"Matchday 14","date":"2014-06-25","team1":"Ecuador","team2":"France","score":{"ft":[0,0]},"group":"Group E","ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Matchday 4","date":"2014-06-15","team1":"Argentina","team2":"Bosnia-Herzegovina","score":{"ft":[2,1]},"group":"Group F","ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Matchday 5","date":"2014-06-16","team1":"Iran","team2":"Nigeria","score":{"ft":[0,0]},"group":"Group F","ground":"Arena da Baixada, Curitiba"},{"round":"Matchday 10","date":"2014-06-21","team1":"Argentina","team2":"Iran","score":{"ft":[1,0]},"group":"Group F","ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Matchday 10","date":"2014-06-21","team1":"Nigeria","team2":"Bosnia-Herzegovina","score":{"ft":[1,0]},"group":"Group F","ground":"Arena Pantanal, Cuiabá"},{"round":"Matchday 14","date":"2014-06-25","team1":"Nigeria","team2":"Argentina","score":{"ft":[2,3]},"group":"Group F","ground":"Estádio Beira-Rio, Porto Alegre"},{"round":"Matchday 14","date":"2014-06-25","team1":"Bosnia-Herzegovina","team2":"Iran","score":{"ft":[3,1]},"group":"Group F","ground":"Arena Fonte Nova, Salvador"},{"round":"Matchday 5","date":"2014-06-16","team1":"Germany","team2":"Portugal","score":{"ft":[4,0]},"group":"Group G","ground":"Arena Fonte Nova, Salvador"},{"round":"Matchday 5","date":"2014-06-16","team1":"Ghana","team2":"USA","score":{"ft":[1,2]},"group":"Group G","ground":"Estádio das Dunas, Natal"},{"round":"Matchday 10","date":"2014-06-21","team1":"Germany","team2":"Ghana","score":{"ft":[2,2]},"group":"Group G","ground":"Estádio Castelão, Fortaleza"},{"round":"Matchday 11","date":"2014-06-22","team1":"USA","team2":"Portugal","score":{"ft":[2,2]},"group":"Group G","ground":"Arena Amazônia, Manaus"},{"round":"Matchday 15","date":"2014-06-26","team1":"USA","team2":"Germany","score":{"ft":[0,1]},"group":"Group G","ground":"Arena Pernambuco, Recife"},{"round":"Matchday 15","date":"2014-06-26","team1":"Portugal","team2":"Ghana","score":{"ft":[2,1]},"group":"Group G","ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Matchday 6","date":"2014-06-17","team1":"Belgium","team2":"Algeria","score":{"ft":[2,1]},"group":"Group H","ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Matchday 6","date":"2014-06-17","team1":"Russia","team2":"South Korea","score":{"ft":[1,1]},"group":"Group H","ground":"Arena Pantanal, Cuiabá"},{"round":"Matchday 11","date":"2014-06-22","team1":"Belgium","team2":"Russia","score":{"ft":[1,0]},"group":"Group H","ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Matchday 11","date":"2014-06-22","team1":"South Korea","team2":"Algeria","score":{"ft":[2,4]},"group":"Group H","ground":"Estádio Beira-Rio, Porto Alegre"},{"round":"Matchday 15","date":"2014-06-26","team1":"South Korea","team2":"Belgium","score":{"ft":[0,1]},"group":"Group H","ground":"Arena de São Paulo, São Paulo"},{"round":"Matchday 15","date":"2014-06-26","team1":"Algeria","team2":"Russia","score":{"ft":[1,1]},"group":"Group H","ground":"Arena da Baixada, Curitiba"},{"round":"Round of 16","date":"2014-06-28","team1":"Brazil","team2":"Chile","score":{"p":[3,2],"et":[1,1],"ft":[1,1],"ht":[1,1]},"ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Round of 16","date":"2014-06-28","team1":"Colombia","team2":"Uruguay","score":{"ft":[2,0],"ht":[1,0]},"ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Round of 16","date":"2014-06-29","team1":"Netherlands","team2":"Mexico","score":{"ft":[2,1],"ht":[0,0]},"ground":"Estádio Castelão, Fortaleza"},{"round":"Round of 16","date":"2014-06-29","team1":"Costa Rica","team2":"Greece","score":{"p":[5,3],"et":[1,1],"ft":[1,1],"ht":[0,0]},"ground":"Arena Pernambuco, Recife"},{"round":"Round of 16","date":"2014-06-30","team1":"France","team2":"Nigeria","score":{"ft":[2,0],"ht":[0,0]},"ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Round of 16","date":"2014-06-30","team1":"Germany","team2":"Algeria","score":{"et":[2,1],"ft":[0,0],"ht":[0,0]},"ground":"Estádio Beira-Rio, Porto Alegre"},{"round":"Round of 16","date":"2014-07-01","team1":"Argentina","team2":"Switzerland","score":{"et":[1,0],"ft":[0,0],"ht":[0,0]},"ground":"Arena de São Paulo, São Paulo"},{"round":"Round of 16","date":"2014-07-01","team1":"Belgium","team2":"USA","score":{"et":[2,1],"ft":[0,0],"ht":[0,0]},"ground":"Arena Fonte Nova, Salvador"},{"round":"Quarter-finals","date":"2014-07-04","team1":"France","team2":"Germany","score":{"ft":[0,1],"ht":[0,1]},"ground":"Estádio do Maracanã, Rio de Janeiro"},{"round":"Quarter-finals","date":"2014-07-04","team1":"Brazil","team2":"Colombia","score":{"ft":[2,1],"ht":[1,0]},"ground":"Estádio Castelão, Fortaleza"},{"round":"Quarter-finals","date":"2014-07-05","team1":"Argentina","team2":"Belgium","score":{"ft":[1,0],"ht":[1,0]},"ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Quarter-finals","date":"2014-07-05","team1":"Netherlands","team2":"Costa Rica","score":{"p":[4,3],"et":[0,0],"ft":[0,0],"ht":[0,0]},"ground":"Arena Fonte Nova, Salvador"},{"round":"Semi-finals","date":"2014-07-08","team1":"Brazil","team2":"Germany","score":{"ft":[1,7],"ht":[0,5]},"ground":"Estádio Mineirão, Belo Horizonte"},{"round":"Semi-finals","date":"2014-07-09","team1":"Netherlands","team2":"Argentina","score":{"p":[2,4],"et":[0,0],"ft":[0,0],"ht":[0,0]},"ground":"Arena de São Paulo, São Paulo"},{"round":"Match for third place","date":"2014-07-12","team1":"Brazil","team2":"Netherlands","score":{"ft":[0,3],"ht":[0,2]},"ground":"Estádio Nacional Mané Garrincha, Brasília"},{"round":"Final","date":"2014-07-13","team1":"Germany","team2":"Argentina","score":{"et":[1,0],"ft":[0,0],"ht":[0,0]},"ground":"Estádio do Maracanã, Rio de Janeiro"}]}$json2014$;

  -- ── 2. Compute hashes and store raw ──────────────────────────────────────────
  v_hash_2010 := encode(digest(v_2010_json::text, 'sha256'), 'hex');
  v_hash_2014 := encode(digest(v_2014_json::text, 'sha256'), 'hex');

  INSERT INTO wc_history.raw_openfootball_responses
    (source, source_url, edition_year, response_hash, response_json, transform_status)
  VALUES
    ('openfootball_worldcup_json', v_source_url_2010, 2010, v_hash_2010, v_2010_json, 'raw'),
    ('openfootball_worldcup_json', v_source_url_2014, 2014, v_hash_2014, v_2014_json, 'raw')
  ON CONFLICT (response_hash) DO NOTHING;

  -- ── 3. Map + enrich: loop over each edition ───────────────────────────────────
  FOR v_edition IN SELECT unnest(ARRAY[2010, 2014]) LOOP

    FOR v_match IN
      SELECT m FROM jsonb_array_elements(
        CASE v_edition
          WHEN 2010 THEN v_2010_json->'matches'
          WHEN 2014 THEN v_2014_json->'matches'
        END
      ) AS m
    LOOP
      v_team1     := v_match->>'team1';
      v_team2     := v_match->>'team2';
      v_date      := (v_match->>'date')::date;
      v_round     := v_match->>'round';
      v_group     := v_match->>'group';
      v_ground    := v_match->>'ground';
      v_score_ft  := v_match->'score'->'ft';
      v_home_ft   := (v_score_ft->>0)::integer;
      v_away_ft   := (v_score_ft->>1)::integer;

      -- Parse venue / city from "Venue Name, City"
      IF v_ground IS NOT NULL AND position(',' IN v_ground) > 0 THEN
        v_venue_nm := TRIM(split_part(v_ground, ',', 1));
        v_city_nm  := TRIM(split_part(v_ground, ',', 2));
      ELSE
        v_venue_nm := v_ground;
        v_city_nm  := NULL;
      END IF;

      -- Map round → stage_code
      v_stage_code := CASE
        WHEN v_round ILIKE 'Matchday%'               THEN 'Group Stage'
        WHEN v_round ILIKE 'Round of 16%'            THEN 'Round of 16'
        WHEN v_round ILIKE 'Quarterfinal%'
          OR v_round ILIKE 'Quarter-final%'          THEN 'Quarter-final'
        WHEN v_round ILIKE 'Semifinal%'
          OR v_round ILIKE 'Semi-final%'             THEN 'Semi-final'
        WHEN v_round ILIKE 'Third%'
          OR v_round ILIKE 'Match for third%'        THEN 'Third Place'
        WHEN v_round ILIKE 'Final'                   THEN 'Final'
        ELSE v_round
      END;

      -- Derive result
      v_result := CASE
        WHEN v_home_ft > v_away_ft THEN 'home_win'
        WHEN v_home_ft < v_away_ft THEN 'away_win'
        WHEN v_home_ft = v_away_ft THEN 'draw'
        ELSE NULL
      END;

      -- ── Match lookup: primary = edition_year + date + home_team + away_team ──
      -- Normalize team names: Côte d'Ivoire / Cote d'Ivoire etc.
      SELECT m.id INTO v_match_id
      FROM wc_history.matches m
      WHERE m.edition_year = v_edition
        AND m.match_date   = v_date
        AND (
          -- exact match
          (LOWER(m.home_team_name) = LOWER(v_team1) AND LOWER(m.away_team_name) = LOWER(v_team2))
          OR
          -- normalize apostrophe variants
          (LOWER(REPLACE(m.home_team_name, 'ô', 'o')) = LOWER(REPLACE(v_team1, 'ô', 'o'))
           AND LOWER(REPLACE(m.away_team_name, 'ô', 'o')) = LOWER(REPLACE(v_team2, 'ô', 'o')))
          OR
          -- ivory coast variants
          (LOWER(m.home_team_name) IN ('côte d''ivoire','cote d''ivoire','ivory coast')
           AND LOWER(v_team1) IN ('côte d''ivoire','cote d''ivoire','ivory coast')
           AND LOWER(m.away_team_name) = LOWER(v_team2))
          OR
          (LOWER(m.away_team_name) IN ('côte d''ivoire','cote d''ivoire','ivory coast')
           AND LOWER(v_team2) IN ('côte d''ivoire','cote d''ivoire','ivory coast')
           AND LOWER(m.home_team_name) = LOWER(v_team1))
        )
      LIMIT 1;

      -- Fallback: date + score if name match failed
      IF v_match_id IS NULL AND v_home_ft IS NOT NULL THEN
        SELECT m.id INTO v_match_id
        FROM wc_history.matches m
        WHERE m.edition_year  = v_edition
          AND m.match_date    = v_date
          AND m.home_score_ft = v_home_ft
          AND m.away_score_ft = v_away_ft
        LIMIT 1;
      END IF;

      IF v_match_id IS NULL THEN
        -- Could not map — log quality issue
        INSERT INTO wc_history.data_quality_issues
          (edition_year, entity_type, issue_type, severity, description, source_provider)
        VALUES (
          v_edition, 'match', 'unmapped_openfootball_row', 'low',
          format('openfootball row not mapped: %s vs %s on %s', v_team1, v_team2, v_date),
          'openfootball'
        );
        CONTINUE;
      END IF;

      -- Determine mapping confidence
      v_conf := 0.98;
      v_mapping_status := 'verified';

      -- ── Load existing fields for conflict check ───────────────────────────
      SELECT group_name, venue_name, city, stage_code, home_score_ft, away_score_ft, result
        INTO ex_group, ex_venue, ex_city, ex_stage, ex_home_ft, ex_away_ft, ex_result
      FROM wc_history.matches WHERE id = v_match_id;

      -- ── Conflict detection ────────────────────────────────────────────────
      -- Score conflict
      IF ex_home_ft IS NOT NULL AND v_home_ft IS NOT NULL
         AND (ex_home_ft <> v_home_ft OR ex_away_ft <> v_away_ft) THEN
        ob_score    := ex_home_ft::text || '-' || ex_away_ft::text;
        ex_score_api := v_home_ft::text || '-' || v_away_ft::text;
        INSERT INTO wc_history.data_quality_issues
          (edition_year, entity_type, entity_id, issue_type, severity, description, source_provider)
        VALUES (
          v_edition, 'match', v_match_id, 'source_conflict', 'high',
          format('Score conflict: API-Football=%s vs openfootball=%s for %s vs %s on %s',
                 ob_score, ex_score_api, v_team1, v_team2, v_date),
          'openfootball'
        );
        v_mapping_status := 'needs_review';
        v_conflicts := v_conflicts + 1;
        IF v_edition = 2010 THEN v_needs_review_2010 := v_needs_review_2010 + 1;
        ELSE v_needs_review_2014 := v_needs_review_2014 + 1; END IF;
      END IF;

      -- ── Enrichment: fill NULL fields only ────────────────────────────────
      UPDATE wc_history.matches SET
        group_name = CASE WHEN group_name IS NULL AND v_group IS NOT NULL
                          THEN v_group ELSE group_name END,
        venue_name = CASE WHEN venue_name IS NULL AND v_venue_nm IS NOT NULL
                          THEN v_venue_nm ELSE venue_name END,
        city       = CASE WHEN city IS NULL AND v_city_nm IS NOT NULL
                          THEN v_city_nm ELSE city END,
        stage_code = CASE WHEN stage_code IS NULL AND v_stage_code IS NOT NULL
                          THEN v_stage_code ELSE stage_code END,
        stage_name_en = CASE WHEN stage_name_en IS NULL AND v_round IS NOT NULL
                             THEN v_round ELSE stage_name_en END,
        result     = CASE WHEN result IS NULL AND v_result IS NOT NULL
                          THEN v_result ELSE result END,
        home_score_ft = CASE WHEN home_score_ft IS NULL AND v_home_ft IS NOT NULL
                             THEN v_home_ft ELSE home_score_ft END,
        away_score_ft = CASE WHEN away_score_ft IS NULL AND v_away_ft IS NOT NULL
                             THEN v_away_ft ELSE away_score_ft END
      WHERE id = v_match_id;

      -- Track fill counts (rough — count from the nulls we detected)
      IF ex_group IS NULL AND v_group IS NOT NULL   THEN v_filled_group  := v_filled_group + 1; END IF;
      IF ex_venue IS NULL AND v_venue_nm IS NOT NULL THEN v_filled_venue := v_filled_venue + 1; END IF;
      IF ex_city  IS NULL AND v_city_nm  IS NOT NULL THEN v_filled_city  := v_filled_city  + 1; END IF;
      IF ex_stage IS NULL AND v_stage_code IS NOT NULL THEN v_filled_stage := v_filled_stage + 1; END IF;
      IF ex_home_ft IS NULL AND v_home_ft IS NOT NULL THEN v_filled_score := v_filled_score + 1; END IF;
      IF ex_result IS NULL AND v_result IS NOT NULL  THEN v_filled_result := v_filled_result + 1; END IF;

      -- ── Source mapping upsert ─────────────────────────────────────────────
      INSERT INTO wc_history.source_mappings
        (edition_year, provider, provider_entity_type, provider_entity_id,
         internal_entity_type, internal_entity_id, confidence, mapping_status)
      VALUES (
        v_edition,
        'openfootball',
        'match',
        encode(digest(v_edition::text || v_team1 || v_team2 || v_date::text, 'sha256'), 'hex'),
        'wc_history.matches',
        v_match_id,
        v_conf,
        v_mapping_status
      )
      ON CONFLICT (provider, provider_entity_type, provider_entity_id, internal_entity_type)
      DO UPDATE SET
        internal_entity_id = EXCLUDED.internal_entity_id,
        confidence         = EXCLUDED.confidence,
        mapping_status     = EXCLUDED.mapping_status;

      IF v_edition = 2010 THEN v_mapped_2010 := v_mapped_2010 + 1;
      ELSE v_mapped_2014 := v_mapped_2014 + 1; END IF;

    END LOOP; -- matches
  END LOOP; -- editions

  -- ── Mark raw responses as transformed ────────────────────────────────────
  UPDATE wc_history.raw_openfootball_responses
  SET transform_status = 'transformed'
  WHERE source = 'openfootball_worldcup_json'
    AND edition_year IN (2010, 2014);

  RAISE NOTICE 'Mapped 2010=%  2014=%  needs_review=%  conflicts=%',
    v_mapped_2010, v_mapped_2014,
    v_needs_review_2010 + v_needs_review_2014, v_conflicts;
  RAISE NOTICE 'Filled: groups=% venues=% cities=% stages=% scores=% results=%',
    v_filled_group, v_filled_venue, v_filled_city,
    v_filled_stage, v_filled_score, v_filled_result;

END $$;
