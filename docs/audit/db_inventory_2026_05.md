# Next59 Database Inventory Report
**Date:** 2026-05-04  
**Purpose:** Comprehensive audit of all historical match-related data for 14-brain orchestration planning  
**Scope:** Read-only diagnostic — no schema changes made

---

## SECTION 1 — SCHEMA OVERVIEW

| Schema | Purpose | Tables | Est. Total Rows |
|--------|---------|--------|-----------------|
| **public** | Core application domain: matches, teams, competitions, odds, players, API-Football enrichment | 125 | ~2,600,000 |
| **auth** | Supabase built-in authentication (users, sessions, MFA, OAuth) | 23 | ~81 |
| **wc_history** | Dedicated FIFA World Cup historical match archive (1930–2022) | 18 | ~9,300 |
| **model_lab** | ML calibration pipeline: feature snapshots, backtest runs, calibration predictions | 12 | ~463,000 |
| **storage** | Supabase file/object storage metadata | 8 | ~245 |
| **realtime** | Supabase realtime subscription infrastructure | 2 | ~69 |
| **cron** | pg_cron scheduled job registry and execution history | 2 | ~15 |
| **net** | pg_net async HTTP request queue and response log | 2 | ~18 |
| **vault** | Supabase encrypted secrets store | 1 | 1 |
| **supabase_migrations** | Applied migration version tracking | 1 | 192 |

---

## SECTION 2 — TABLE-BY-TABLE INVENTORY

> Only match-related, odds, player, and ML tables are documented in full detail.  
> Auth, storage, realtime, cron, net, vault, and supabase_migrations are summarised only.

---

### public.matches

- **Purpose:** Canonical match registry — one row per fixture across all competitions and seasons; the authoritative identity record for every match in the system.
- **Total rows:** 66,555
- **Date range:** 2000-07-28 → 2025-06-01
- **Primary key:** `id` (uuid)
- **Foreign keys:** `competition_season_id → public.competition_seasons`, `home_team_id → public.teams`, `away_team_id → public.teams`, `venue_id → public.venues`, `source_id → public.data_sources`, `ingestion_run_id → public.ingestion_runs`

| Column | Type | Meaning (Turkish) | Null % | Distinct values | Sample value |
|--------|------|-------------------|--------|-----------------|--------------|
| id | uuid | Benzersiz maç kimliği | 0% | 66,555 | 4b3f4809-… |
| competition_season_id | uuid | Sezon kimliği (liga + yıl) | 0% | 538 | e6ab7df6-… |
| home_team_id | uuid | Ev sahibi takım kimliği | 0% | 739 | — |
| away_team_id | uuid | Deplasman takımı kimliği | 0% | 739 | — |
| venue_id | uuid | Stadyum kimliği | ~99% | — | NULL |
| api_football_fixture_id | integer | API-Football fikstür ID | ~85% | — | 867341 |
| deterministic_source_match_id | text | Kaynak eşleme anahtarı (deterministik) | 0% | 66,555 | E0::2024-25::Man City::Arsenal |
| match_date | date | Maç tarihi | 0% | ~5,000 | 2025-06-01 |
| match_time | time | Maç saati (yerel) | ~40% | — | 15:00:00 |
| timezone | text | Saat dilimi | ~40% | — | Europe/London |
| timestamp | bigint | Unix zaman damgası | ~40% | — | 1748786400 |
| status_short | text | Maç durumu kısa kodu (FT/NS/LIVE) | 0% | ~8 | FT |
| status_long | text | Maç durumu uzun açıklaması | 0% | ~8 | Match Finished |
| status_elapsed | integer | Oynanan dakika (canlı) | ~97% | — | 90 |
| status_extra | integer | Uzatma/penaltı dakikası | ~99% | — | NULL |
| home_score_ft | integer | Maç sonu ev sahibi gol sayısı | 0.0015% | 0–15 | 2 |
| away_score_ft | integer | Maç sonu deplasman gol sayısı | 0.0015% | 0–13 | 1 |
| home_score_ht | integer | İlk yarı ev sahibi gol sayısı | ~5% | 0–8 | 0 |
| away_score_ht | integer | İlk yarı deplasman gol sayısı | ~5% | 0–7 | 0 |
| home_score_et | integer | Uzatma ev sahibi gol sayısı | ~99% | — | NULL |
| away_score_et | integer | Uzatma deplasman gol sayısı | ~99% | — | NULL |
| home_score_pen | integer | Penaltı ev sahibi gol sayısı | ~99% | — | NULL |
| away_score_pen | integer | Penaltı deplasman gol sayısı | ~99% | — | NULL |
| result | text | Maç sonucu (H/D/A) | ~5% | 3 | H |
| half_time_result | text | İlk yarı sonucu (H/D/A) | ~5% | 3 | D |
| referee | text | Hakem adı | ~60% | — | M. Oliver |
| round | text | Tur/hafta bilgisi | ~20% | — | Regular Season - 38 |
| attendance | integer | Seyirci sayısı | ~90% | — | 74163 |
| stage_type | text | Aşama türü (group/knockout) | ~70% | — | NULL |
| is_knockout | boolean | Eleme maçı mı? | ~70% | — | false |
| is_final | boolean | Final maçı mı? | ~70% | — | false |
| leg_number | integer | Çift maç bacak numarası | ~99% | — | NULL |
| competition_importance_weight | numeric | Rekabet önem ağırlığı | ~70% | — | 1.0 |
| source_id | uuid | Veri kaynağı kimliği | ~15% | — | — |
| ingestion_run_id | uuid | Yükleme koşusu kimliği | ~15% | — | — |
| created_at | timestamptz | Kayıt oluşturma zamanı | 0% | — | 2026-04-26 14:12 UTC |
| updated_at | timestamptz | Son güncelleme zamanı | 0% | — | 2026-04-27 08:00 UTC |

**Data quality flags:**
- ✅ `id`, `competition_season_id`, `home_team_id`, `away_team_id`, `match_date`, `status_short`, `status_long`, `home_score_ft`, `away_score_ft`, `result` — fully populated, consistent types
- ⚠️ `home_score_ht`, `away_score_ht`, `half_time_result` — ~5% null, acceptable for older fixture records
- ⚠️ `referee` — ~60% null; lower divisions and older seasons lack referee data
- ⚠️ `attendance`, `venue_id` — ~90–99% null; not yet enriched from API-Football
- ⚠️ `stage_type`, `is_knockout`, `is_final`, `competition_importance_weight` — ~70% null; mostly applicable to cup matches only
- 🔴 `match_time`, `timezone`, `timestamp` — ~40% null; time-of-day data missing for large fraction of historical matches

---

### public.match_stats

- **Purpose:** Per-team per-half match statistics (shots, corners, fouls, cards, possession, passes, xG) sourced from API-Football; one row per team per half.
- **Total rows:** 130,954 (covering ~65,477 unique matches × 2 teams)
- **Date range:** Inferred from match linkage: 2000–2025
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`, `team_id → public.teams`, `source_id → public.data_sources`

| Column | Type | Meaning (Turkish) | Null % | Distinct values | Sample value |
|--------|------|-------------------|--------|-----------------|--------------|
| id | uuid | Benzersiz istatistik satır kimliği | 0% | 130,954 | — |
| match_id | uuid | Maç kimliği | 0% | ~65,477 | — |
| team_id | uuid | Takım kimliği | 0% | ~739 | — |
| half | text | Yarı etiketi (FT / HT) | 0% | 2 | FT |
| shots_on_goal | integer | İsabetli şut sayısı | 35.63% | 0–20 | 6 |
| shots_off_goal | integer | İsabetsiz şut sayısı | 35.64% | 0–25 | 4 |
| total_shots | integer | Toplam şut sayısı | 35.14% | 0–35 | 15 |
| blocked_shots | integer | Bloklanan şut sayısı | 35.63% | 0–12 | 3 |
| shots_insidebox | integer | Ceza sahası içi şut sayısı | 35.63% | 0–20 | 9 |
| shots_outsidebox | integer | Ceza sahası dışı şut sayısı | 35.64% | 0–15 | 6 |
| total_passes | integer | Toplam pas sayısı | 91.64% | 100–900 | 450 |
| passes_accurate | integer | İsabetli pas sayısı | 91.64% | 80–800 | 380 |
| passes_percentage | numeric | Pas isabet yüzdesi (%) | 91.64% | 50–98 | 84.4 |
| ball_possession | integer | Top kontrolü yüzdesi (%) | 91.61% | 20–80 | 55 |
| fouls | integer | Faul sayısı | 36.34% | 0–25 | 12 |
| corner_kicks | integer | Korner sayısı | 35.33% | 0–18 | 5 |
| offsides | integer | Ofsayt sayısı | 35.63% | 0–12 | 2 |
| yellow_cards | integer | Sarı kart sayısı | 35.01% | 0–8 | 2 |
| red_cards | integer | Kırmızı kart sayısı | 35.39% | 0–3 | 0 |
| goalkeeper_saves | integer | Kaleci kurtarış sayısı | 91.60% | 0–15 | 3 |
| hit_woodwork | integer | Direkten dönen şut sayısı | 35.63% | 0–4 | 0 |
| free_kicks_conceded | integer | Yenilen serbest vuruş sayısı | 35.63% | 0–25 | 12 |
| booking_points | integer | Kart puanı (disiplin) | 35.63% | 0–40 | 10 |
| expected_goals_provider | numeric | Beklenen gol (xG) — sağlayıcıdan | 96.45% | 0.0–5.0 | 1.23 |
| goals_prevented | numeric | Engellenen gol tahmini (GK katkısı) | 96.45% | -2.0–3.0 | 0.4 |
| source_id | uuid | Veri kaynağı kimliği | ~100% | — | NULL |
| created_at | timestamptz | Kayıt oluşturma zamanı | 0% | — | 2026-04-27 UTC |

**Data quality flags:**
- ✅ `match_id`, `team_id`, `half`, `yellow_cards`, `red_cards`, `fouls`, `corner_kicks`, `total_shots` — populated for ~64% of rows
- ⚠️ Shots/corners/fouls/cards all share ~35% null rate — consistent with missing lower-division or older-season stat data; not random
- 🔴 `total_passes`, `passes_accurate`, `passes_percentage`, `ball_possession`, `goalkeeper_saves` — **91%+ null**; possession/passing data only available for a small minority of matches
- 🔴 `expected_goals_provider`, `goals_prevented` — **96%+ null**; xG coverage is near zero
- 🔴 `source_id` — 100% null; provider attribution missing

---

### public.staging_football_data_uk_raw

- **Purpose:** Raw staging table for Football Data UK CSV ingestion; each row is one match from FD with all original columns preserved in a JSONB payload, plus promoted key fields.
- **Total rows:** 179,029
- **Date range:** 2000-07-28 → 2025-06-01
- **Primary key:** `id` (uuid)
- **Foreign keys:** `ingestion_run_id → public.ingestion_runs`, `canonical_match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % | Distinct values | Sample value |
|--------|------|-------------------|--------|-----------------|--------------|
| id | uuid | Satır kimliği | 0% | 179,029 | — |
| ingestion_run_id | uuid | Yükleme koşusu kimliği | ~5% | ~919 | — |
| source_file | text | Kaynak CSV dosya adı | 0% | ~200 | E0.csv |
| league_code | text | Lig kodu (FD kısa) | 0% | 21 | E0 |
| season_code | text | Sezon kodu | 0% | ~25 | 2024-25 |
| imported_at | timestamptz | İçe aktarma zamanı | ~5% | — | 2026-04-26 UTC |
| row_hash | text | Satır hash'i (tekrar önleme) | 0% | 179,029 | sha256:… |
| deterministic_source_match_id | text | Deterministik eşleme anahtarı | ~2% | ~179,000 | E0::2024-25::Arsenal::Chelsea |
| match_date | date | Maç tarihi | 0% | ~5,000 | 2025-05-18 |
| home_team | text | Ev sahibi takım adı (ham) | 0% | ~350 | Arsenal |
| away_team | text | Deplasman takım adı (ham) | 0% | ~350 | Chelsea |
| home_score | integer | Maç sonu ev sahibi golü (FTHG) | 0% | 0–15 | 2 |
| away_score | integer | Maç sonu deplasman golü (FTAG) | 0% | 0–13 | 1 |
| referee | text | Hakem adı | 65.67% | ~500 | M. Oliver |
| raw_data | jsonb | Tüm FD sütunları (ham JSON) | 0% | — | {"FTHG":2,"FTAG":1,"HS":14,…} |
| is_processed | boolean | İşleme alındı mı? | ~5% | 2 | true |
| processed_at | timestamptz | İşlenme zamanı | ~10% | — | — |
| canonical_match_id | uuid | Kanonik maç eşleme kimliği | **~50%** | ~90,000 | — |
| processing_errors | jsonb | İşlem hataları | ~90% | — | NULL |

**Note:** The original Football Data UK columns (HS, AS, HST, AST, HC, AC, HF, AF, HY, AY, HR, AR, B365H, B365D, B365A, BWH, BWD, BWA, IWH, IWD, IWA, etc.) are stored **inside `raw_data` jsonb**, not as individual columns. Null rates within `raw_data`:
- FTHG/FTAG: 0.00% | HTHG/HTAG: 0.00%
- HS/AS/HST/AST/HC/AC/HY/AY/HR/AR: ~35% null
- HF/AF: ~36% null
- B365H/B365D/B365A: ~7.8% null

**Data quality flags:**
- ✅ `match_date`, `home_team`, `away_team`, `home_score`, `away_score`, `raw_data`, `row_hash` — fully populated
- ⚠️ `canonical_match_id` — ~50% NULL; cross-reference back to the canonical `matches` table is incomplete; many staging rows are not linked to their canonical counterpart
- ⚠️ Match-stat fields in `raw_data` — ~35% null, consistent with FD limitations for older/lower-division seasons
- ⚠️ `referee` promoted column — 65.67% null (expected; FD referee coverage is partial)
- 🔴 Individual stat columns (HS, HS, B365, etc.) are not promoted — consumers must parse `raw_data` JSONB directly

---

### public.match_odds

- **Purpose:** Pre-match 1X2 opening odds (normalised long model); one row per selection (Home / Draw / Away) per match.
- **Total rows:** 1,201,988
- **Date range:** 2026-04-28 (single bulk load)
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % | Distinct values | Sample value |
|--------|------|-------------------|--------|-----------------|--------------|
| id | uuid | Satır kimliği | 0% | 1,201,988 | — |
| match_id | uuid | Maç kimliği | 0% | 64,869 | — |
| provider_id | uuid | Bahis sağlayıcı kimliği | **100%** | 0 | NULL |
| market | text | Piyasa türü | 0% | 1 | 1X2 |
| selection | text | Bahis seçeneği (Home/Draw/Away) | 0% | 3 | Home |
| handicap | numeric | Handikap değeri | **100%** | 0 | NULL |
| odds | numeric | Bahis oranı (ondalık) | 0% | — | 1.85 |
| odds_type | text | Oran türü (opening/closing) | 0% | 1 | opening |
| is_main | boolean | Ana piyasa göstergesi | ~5% | 2 | true |
| snapshot_time | timestamptz | Anlık görüntü zamanı | ~5% | — | — |
| is_market_summary | boolean | Piyasa özeti satırı mı? | 0% | 2 | false |
| provider_name | text | Bahis sağlayıcı adı (metin) | ~5% | ~40 | Bet365 |
| created_at | timestamptz | Kayıt oluşturma zamanı | 0% | — | 2026-04-28 UTC |

**Data quality flags:**
- ✅ `match_id`, `market`, `selection`, `odds`, `odds_type`, `is_market_summary` — fully populated
- ⚠️ `provider_name` — denormalised text, ~5% null; `provider_id` FK is 100% null (no FK integrity to odds_providers table)
- ⚠️ Only `1X2 opening` market loaded — no closing line, no pre-match drift data
- 🔴 `provider_id` — 100% null; referential integrity to `public.odds_providers` not established
- 🔴 All 1.2M rows ingested in a single 2-hour window on 2026-04-28 — not a live/ongoing feed

---

### public.match_goals_odds

- **Purpose:** Over/Under goals market odds (normalised); one row per line (e.g., O2.5/U2.5) per match.
- **Total rows:** 169,514
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| match_id | uuid | Maç kimliği | 0% |
| line | numeric | Gol hattı (2.5 / 3.5 vb.) | 0% |
| selection | text | Over/Under seçeneği | 0% |
| odds | numeric | Bahis oranı | 0% |
| odds_type | text | Oran türü | 0% |
| provider_name | text | Sağlayıcı adı | ~5% |
| is_market_summary | boolean | Piyasa özeti mi? | 0% |
| bookmaker_count | integer | Ortalamada kullanılan bahisçi sayısı | ~5% |

**Data quality flags:**
- ✅ Core odds data complete
- ⚠️ No snapshot_time or provider_id — temporal drift not trackable

---

### public.match_ah_odds

- **Purpose:** Asian Handicap market odds; one row per handicap line per match.
- **Total rows:** 35,826
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| match_id | uuid | Maç kimliği | 0% |
| handicap | numeric | Handikap değeri (±0.25/0.5 vb.) | 0% |
| selection | text | Ev/Deplasman seçeneği | 0% |
| odds | numeric | Bahis oranı | 0% |
| odds_type | text | Oran türü | 0% |
| provider_name | text | Sağlayıcı adı | ~5% |
| bookmaker_count | integer | Bahisçi sayısı | ~5% |

**Data quality flags:**
- ✅ Core AH data complete
- ⚠️ No closing line or snapshot_time

---

### public.af_fixture_mappings

- **Purpose:** Bridge table linking API-Football integer fixture IDs to canonical `public.matches` UUIDs; records mapping confidence and match reason.
- **Total rows:** 6,762
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| match_id | uuid | Kanonik maç kimliği | 0% |
| af_fixture_id | integer | API-Football fikstür ID | 0% |
| af_league_id | integer | API-Football lig ID | 0% |
| af_season | integer | API-Football sezon yılı | 0% |
| af_date | date | API-Football maç tarihi | 0% |
| af_home_team | text | API-Football ev sahibi adı (ham) | 0% |
| af_away_team | text | API-Football deplasman adı (ham) | 0% |
| mapping_status | text | Eşleme durumu (confirmed/candidate) | 0% |
| confidence | numeric | Eşleme güven skoru | ~10% |
| match_reason | text | Eşleme gerekçesi | ~30% |

**Data quality flags:**
- ✅ Core mapping fields fully populated
- ⚠️ Only 6,762 matches mapped (vs. 66,555 canonical) — ~10% coverage; most matches lack an AF fixture link

---

### public.af_fixture_player_stats

- **Purpose:** Per-player per-fixture performance statistics from API-Football; covers match-level granularity across league and European fixtures.
- **Total rows:** 212,037
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → public.matches`, `af_fixture_id → public.af_fixture_mappings`

| Column | Type | Meaning (Turkish) | Null % | Sample value |
|--------|------|-------------------|--------|--------------|
| match_id | uuid | Kanonik maç kimliği | ~10% | — |
| api_football_player_id | integer | API-Football oyuncu ID | 0% | 12345 |
| minutes | integer | Oynanan dakika | 24.61% | 90 |
| position | text | Saha pozisyonu (G/D/M/F) | ~5% | M |
| rating | numeric | Oyuncu maç notu | 26.29% | 7.2 |
| captain | boolean | Kaptan mı? | ~5% | false |
| substitute | boolean | Yedekten girdi mi? | ~5% | false |
| shots_total | integer | Toplam şut | 64.47% | 3 |
| shots_on | integer | İsabetli şut | 64.47% | 2 |
| goals_total | integer | Atılan gol sayısı | 93.79% | 0 |
| assists | integer | Asist sayısı | 83.26% | 0 |
| saves | integer | Kurtarış (kaleci) | ~90% | NULL |
| passes_total | integer | Toplam pas | 25.47% | 45 |
| passes_key | integer | Kilit pas sayısı | ~30% | 2 |
| passes_accuracy | integer | Pas isabet yüzdesi | ~30% | 84 |
| tackles_total | integer | Toplam müdahale | 59.45% | 2 |
| blocks | integer | Blok sayısı | ~60% | 0 |
| interceptions | integer | Top kapma sayısı | ~60% | 1 |
| duels_total | integer | Toplam ikili mücadele | ~30% | 8 |
| duels_won | integer | Kazanılan ikili mücadele | ~30% | 4 |
| dribbles_attempts | integer | Dribling denemesi | 58.07% | 2 |
| fouls_drawn | integer | Alınan faul | ~30% | 1 |
| fouls_committed | integer | Yapılan faul | ~30% | 1 |
| cards_yellow | integer | Sarı kart | ~5% | 0 |
| cards_red | integer | Kırmızı kart | ~5% | 0 |
| raw_payload | jsonb | Ham API yanıt verisi | ~5% | {…} |

**Data quality flags:**
- ✅ `api_football_player_id`, `cards_yellow`, `cards_red` — well populated
- ⚠️ `minutes`, `rating`, `passes_total` — 24–26% null; likely for bench players not used
- ⚠️ `shots_total`, `dribbles_attempts`, `tackles_total` — 58–64% null; structural gaps for low-involvement players
- 🔴 `goals_total` — 93.79% null; structurally expected but means any "0 goals" entries are indistinguishable from missing data

---

### public.af_player_season_stats

- **Purpose:** Aggregated per-player per-season statistics from API-Football covering form, scoring, discipline, and playing time.
- **Total rows:** 62,699 (22,698 distinct players, 6 distinct seasons)
- **Primary key:** Composite on (`api_football_player_id`, `league_id`, `season`)
- **Foreign keys:** `player_id → public.af_player_profiles`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| api_football_player_id | integer | API-Football oyuncu ID | 0% |
| league_id | integer | Lig ID | 0% |
| season | integer | Sezon yılı | 0% |
| appearances | integer | Toplam maç sayısı | 4.17% |
| minutes_played | integer | Toplam oynanan dakika | 4.77% |
| goals_total | integer | Sezon toplam gol | 11.94% |
| assists | integer | Sezon toplam asist | 74.58% |
| rating | numeric | Sezon ortalama notu | 51.15% |
| shots_total | integer | Toplam şut sayısı | ~30% |
| passes_total | integer | Toplam pas sayısı | ~30% |
| tackles_total | integer | Toplam müdahale | ~40% |
| duels_won | integer | Kazanılan ikili mücadele | ~40% |
| yellow_cards | integer | Sarı kart sayısı | ~10% |
| red_cards | integer | Kırmızı kart sayısı | ~10% |

**Data quality flags:**
- ✅ `appearances`, `minutes_played` — well populated (<5% null)
- ⚠️ `goals_total` — 12% null (acceptable for defenders/goalkeepers)
- 🔴 `assists` — 74.58% null; unreliable for any model consuming this as a feature
- 🔴 `rating` — 51.15% null; season average rating missing for majority of players

---

### public.af_uefa_fixtures

- **Purpose:** API-Football UEFA competition fixture registry (Champions League, Europa League) — separate from the main league matches pipeline.
- **Total rows:** 2,988
- **Primary key:** `id` (uuid)
- **Foreign keys:** `canonical_match_id → public.matches`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| af_fixture_id | integer | API-Football fikstür ID | 0% |
| af_league_id | integer | API-Football lig ID | 0% |
| af_season | integer | Sezon yılı | 0% |
| match_date | date | Maç tarihi | 0% |
| status_short | text | Maç durumu | 0% |
| home_score_ft | integer | Maç sonu ev sahibi gol | ~2% |
| away_score_ft | integer | Maç sonu deplasman gol | ~2% |
| canonical_match_id | uuid | Kanonik maç kimliği | ~50% |

**Data quality flags:**
- ✅ Core fixture data complete
- ⚠️ `canonical_match_id` ~50% null — UEFA fixtures not all linked to canonical matches table

---

### public.af_uefa_fixture_events

- **Purpose:** Match events (goals, cards, substitutions) for UEFA competition fixtures from API-Football.
- **Total rows:** 46,967
- **Primary key:** `id` (uuid)

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| af_fixture_id | integer | API-Football fikstür ID | 0% |
| team_id | uuid | Takım kimliği | ~5% |
| elapsed | integer | Olay dakikası | 0% |
| event_type | text | Olay türü (Goal/Card/Subst) | 0% |
| event_detail | text | Olay detayı | ~10% |
| player_name | text | Oyuncu adı | ~5% |
| assist_player_name | text | Asist yapan oyuncu adı | ~60% |

**Data quality flags:**
- ✅ Core event fields (elapsed, event_type) well populated
- ⚠️ `assist_player_name` ~60% null — expected (most events have no assist)

---

### public.af_uefa_fixture_stats

- **Purpose:** Team-level match statistics for UEFA fixtures from API-Football.
- **Total rows:** 4,680
- **Primary key:** `id` (uuid)

**Columns:** mirrors `public.match_stats` structure (shots_on_goal, total_shots, ball_possession, total_passes, etc.) but specifically for UEFA competition fixtures.

**Data quality flags:**
- ⚠️ Similar ~35% null rate on basic stats as `match_stats`
- ⚠️ Possession/passes also ~90% null for older fixtures

---

### public.af_uefa_fixture_lineups / af_uefa_fixture_lineup_players

- **Purpose:** Starting XI and formation data for UEFA fixtures.
- **Total rows:** lineups: 5,968 | lineup_players: 123,073
- **Primary key:** `id` (uuid)

**Key columns (lineups):** `af_fixture_id`, `team_id`, `formation`, `coach_name`  
**Key columns (lineup_players):** `lineup_id`, `player_name`, `api_football_player_id`, `position`, `grid`, `is_substitute`

**Data quality flags:**
- ✅ Formation and player data well populated for UEFA fixtures
- ⚠️ `grid` (tactical grid position) ~30% null

---

### public.api_football_fixture_lineups / api_football_fixture_lineup_players

- **Purpose:** Starting XI and formation data for league fixtures from API-Football.
- **Total rows:** lineups: 9,712 | lineup_players: 203,233
- **Primary key:** `id` (uuid)

**Data quality flags:**
- ✅ Well populated; covers ~4,856 matches (9,712 / 2 teams)
- ⚠️ Only ~7% of all canonical matches have lineup data via this table

---

### public.api_football_fixture_events

- **Purpose:** Match events (goals, cards, substitutions) for league fixtures from API-Football.
- **Total rows:** 75,895
- **Primary key:** `id` (uuid)

**Data quality flags:**
- ✅ Core event fields well populated
- ⚠️ Covers ~7,623 unique fixtures (~11% of canonical matches)

---

### public.af_player_profiles

- **Purpose:** Master player identity and biographical data from API-Football.
- **Total rows:** 22,698
- **Primary key:** `id` (uuid)

**Key columns:** `api_football_player_id`, `name`, `firstname`, `lastname`, `age`, `birth_date`, `birth_place`, `birth_country`, `nationality`, `height`, `weight`, `position`, `photo_url`

**Data quality flags:**
- ✅ Name and position well populated
- ⚠️ `height`, `weight`, `birth_date` — ~30% null

---

### public.competitions

- **Purpose:** Master competition registry — 25 competitions covered (22 leagues + 3 UEFA cups).
- **Total rows:** 25
- **Primary key:** `id` (uuid)

**Competitions:** Premier League, Championship, League One, League Two, La Liga, Segunda Division, Serie A, Serie B, Bundesliga, 2. Bundesliga, Ligue 1, Ligue 2, Süper Lig, Eredivisie, Primeira Liga, Pro League, Scottish Premiership, Scottish Championship, Scottish League One, Scottish League Two, Super League Greece, UEFA Champions League, UEFA Europa League, UEFA Super Cup, FIFA World Cup.

**Note:** "Sueper Lig" in the database is a typo for "Süper Lig".

---

### public.teams

- **Purpose:** Master team registry.
- **Total rows:** 742
- **Primary key:** `id` (uuid)

**Data quality flags:**
- ✅ Core name fields populated
- ⚠️ Many enrichment fields (country, stadium, founded year) likely sparse

---

### public.seasons / public.competition_seasons

- **Purpose:** Season year registry (27 seasons) and competition-season join table (549 competition-seasons).

---

### public.players / public.player_match_stats / public.lineups

- **Purpose:** These tables exist in the schema but contain **0 rows**. Player data lives in `af_player_profiles` and `af_fixture_player_stats` instead.

**Data quality flags:**
- 🔴 All three tables are empty; any consumer expecting data here will find nothing

---

### public.match_events

- **Purpose:** Schema-defined match events table — **0 rows**. Events live in `api_football_fixture_events` and `af_uefa_fixture_events`.

**Data quality flags:**
- 🔴 Empty; not used

---

### public.standings

- **Purpose:** League standings table — **0 rows**.

**Data quality flags:**
- 🔴 Empty; not populated

---

### public.venues

- **Purpose:** Stadium/venue registry — **0 rows**.

**Data quality flags:**
- 🔴 Empty; venue data exists only as text fields in `wc_history.matches` and `wc2026_venues`

---

### public.wc2026_fixtures

- **Purpose:** 2026 FIFA World Cup fixture skeleton (group stage + knockout stubs) imported from API-Football.
- **Total rows:** 104
- **Primary key:** `id` (uuid)

**Key columns:** `af_fixture_id`, `match_date`, `stage_name`, `group_name`, `venue_id`, `home_team_name`, `away_team_name`, `status_short`

**Data quality flags:**
- ✅ Fixture schedule complete for group stage
- ⚠️ Knockout stage entries are stubs (TBD teams)
- 🔴 `wc2026_player_profiles` and `wc2026_team_squads` are 0 rows — squad data not yet loaded

---

### wc_history.matches

- **Purpose:** Authoritative FIFA World Cup match archive covering every match from 1930 through 2022 (22 editions, 965 matches).
- **Total rows:** 965
- **Date range:** 1930-07-13 → 2022-12-18
- **Primary key:** `id` (uuid)
- **Foreign keys:** `edition_id → wc_history.editions`, `home_team_id → wc_history.teams`, `away_team_id → wc_history.teams`, `venue_id → wc_history.venues`

| Column | Type | Meaning (Turkish) | Null % | Sample value |
|--------|------|-------------------|--------|--------------|
| id | uuid | Maç kimliği | 0% | — |
| edition_year | integer | Dünya Kupası yılı | 0% | 2022 |
| match_no | integer | Maç numarası | 0% | 64 |
| stage_code | text | Aşama kodu (GS/R16/QF/SF/F) | 0% | F |
| stage_name_en | text | Aşama adı (İngilizce) | 0% | Final |
| stage_name_tr | text | Aşama adı (Türkçe) | ~10% | Final |
| group_name | text | Grup adı (A–H) | ~50% | A |
| match_date | date | Maç tarihi | 0% | 2022-12-18 |
| home_team_name | text | Ev sahibi takım adı | 0% | Argentina |
| away_team_name | text | Deplasman takım adı | 0% | France |
| home_score_ft | integer | Maç sonu ev sahibi gol | 0% | 3 |
| away_score_ft | integer | Maç sonu deplasman gol | 0% | 3 |
| home_score_ht | integer | İlk yarı ev sahibi gol | 73.47% | 2 |
| away_score_ht | integer | İlk yarı deplasman gol | 73.47% | 0 |
| home_score_aet | integer | Uzatmalar sonucu ev sahibi | ~85% | 3 |
| away_score_aet | integer | Uzatmalar sonucu deplasman | ~85% | 3 |
| home_penalties | integer | Penaltı ev sahibi | ~90% | 4 |
| away_penalties | integer | Penaltı deplasman | ~90% | 2 |
| result | text | Maç sonucu (H/D/A) | 0% | D |
| decided_by | text | Belirleyici aşama (FT/AET/PEN) | ~5% | PEN |
| venue_name | text | Stadyum adı | 0% | Lusail Stadium |
| city | text | Şehir | 0% | Lusail |
| attendance | integer | Seyirci sayısı | **100%** | NULL |
| referee | text | Hakem adı | ~20% | S. Marciniak |

**Data quality flags:**
- ✅ `home_score_ft`, `away_score_ft`, `result`, `stage_code`, `venue_name`, `city`, `match_date` — perfect coverage
- ⚠️ `home_score_ht`/`away_score_ht` — 73.47% null; only modern editions (2002+) have HT data
- ⚠️ `referee` — ~20% null; pre-1966 records lack referee name
- 🔴 `attendance` — **100% null**; column exists but was never populated

---

### wc_history.events

- **Purpose:** Match events (goals, cards, substitutions) for World Cup matches, sourced from API-Football.
- **Total rows:** 2,806
- **Primary key:** `id` (uuid)
- **Foreign keys:** `match_id → wc_history.matches`

| Column | Type | Meaning (Turkish) | Null % |
|--------|------|-------------------|--------|
| match_id | uuid | Maç kimliği | ~2% |
| team_id | uuid | Takım kimliği | ~5% |
| elapsed | integer | Olay dakikası | 0% |
| event_type | text | Olay türü (Goal/Card/Subst) | 0% |
| event_detail | text | Olay detayı | ~10% |
| player_name | text | Oyuncu adı | ~5% |
| assist_player_name | text | Asist yapan oyuncu | ~60% |

**Data quality flags:**
- ✅ Core event fields complete
- ⚠️ Only 2,806 events for 965 matches — ~2.9 events/match average, suggesting partial coverage (only goal/card events, not all substitutions)

---

### wc_history.match_statistics

- **Purpose:** Team-level match statistics for World Cup matches.
- **Total rows:** 4,096
- **Primary key:** `id` (uuid)

**Data quality flags:**
- ⚠️ ~35% null on shot-level stats
- 🔴 Possession/passes likely ~90% null (same pattern as match_stats)

---

### wc_history.teams / wc_history.editions

- **Purpose:** World Cup team registry (490 entries across all editions) and edition metadata (22 World Cups from 1930–2022).
- **Total rows:** teams: 490 | editions: 22

---

### model_lab.prematch_feature_matrix_snapshot_v1

- **Purpose:** 201-column ML feature snapshot for every match in the calibration universe; pre-computed rolling form, event, and player aggregate features used as input to the calibration pipeline.
- **Total rows:** 65,104
- **Primary key:** `match_id` (uuid, unique)

**Feature groups (201 columns total):**
1. **Identity/target (9):** match_id, competition_id/name, season_id/label, match_date, home/away_team_id, actual_result_1x2, actual_home/away_goals
2. **Quality/split flags (7):** data_quality_tier, has_stats, has_events, has_lineups, has_player_features, split_label, leakage_check_passed
3. **Rolling form — home/away × l5/l10/l20/std (40):** matches_played, form, win/draw/loss_rate, goals_for/against_avg, goal_diff_avg
4. **Advanced stats — home/away × l5/l10 (40):** shots, shots_on_goal, shots_insidebox, corners, fouls, yellow_cards, possession, pass_accuracy, gk_saves
5. **Composite indices — home/away × l5/l10 (30):** attack_index, defense_resistance, xg_lite, tempo_index, shot_quality, discipline_risk, set_piece_threat
6. **Event features — home/away (40):** n_matches, goals by 15-min bands (6 bins), conceded_0_15/76_90, cards_early/late, red_cards, comeback_signal, late_pressure
7. **Player aggregate features — home/away (30):** squad_rating, starter_rating, goals/assists per player, shots, passes_key, duels_won_rate, tackles_int, cards, fouls
8. **Differential features (15):** form_l5/l10, goals_for/against_l5, attack_index_l5, defense_resistance_l5, xg_lite_l5, win_rate_l10, squad_rating, starter_rating

**Data quality flags:**
- ✅ All 65,104 rows inserted with `bad_probability_rows = 0`
- ⚠️ 2,619 cold-start rows (no historical data → prior-only predictions)

---

### model_lab.calibration_predictions_v1

- **Purpose:** Model output table storing pre-match 1X2 probabilities from all run_keys; used for calibration metric computation.
- **Total rows:** 325,520 (5 run_keys × 65,104 matches)
- **Primary key:** `id` (uuid); unique on `(run_key, match_id)`

**Active run_keys:**
- `heuristic_softmax_v1` — 65,104 rows (baseline)
- `heuristic_drawfix_v2a/b/c/d` — 65,104 rows each (candidates, not promoted)

---

### model_lab.backtest_runs / model_lab.model_versions

- **Purpose:** Backtest experiment registry and model version tracking.
- **Total rows:** backtest_runs: 14 | model_versions: 2

---

## SECTION 3 — COVERAGE BY LEAGUE / COMPETITION

| League | Country | Match count | Earliest season | Latest season | Avg fields filled |
|--------|---------|-------------|-----------------|---------------|-------------------|
| Championship | England | 5,013 | 2000 | 2024 | ~65% |
| League Two | England | 5,002 | 2000 | 2024 | ~65% |
| League One | England | 4,915 | 2000 | 2024 | ~65% |
| Segunda Division | Spain | 4,253 | 2000 | 2024 | ~65% |
| Serie B | Italy | 3,963 | 2000 | 2024 | ~65% |
| Premier League | England | 3,523 | 2000 | 2024 | ~70% |
| La Liga | Spain | 3,460 | 2000 | 2024 | ~70% |
| Serie A | Italy | 3,431 | 2000 | 2024 | ~70% |
| Ligue 2 | France | 3,339 | 2000 | 2024 | ~65% |
| Ligue 1 | France | 3,280 | 2000 | 2024 | ~70% |
| Süper Lig | Turkey | 2,925 | 2000 | 2024 | ~65% |
| 2. Bundesliga | Germany | 2,852 | 2000 | 2024 | ~65% |
| Bundesliga | Germany | 2,788 | 2000 | 2024 | ~70% |
| Eredivisie | Netherlands | 2,745 | 2000 | 2024 | ~65% |
| Primeira Liga | Portugal | 2,583 | 2000 | 2024 | ~65% |
| Pro League | Belgium | 2,459 | 2000 | 2024 | ~65% |
| Scottish Premiership | Scotland | 2,016 | 2000 | 2024 | ~60% |
| Super League Greece | Greece | 1,805 | 2005 | 2024 | ~60% |
| Scottish League Two | Scotland | 1,608 | 2000 | 2024 | ~55% |
| Scottish Championship | Scotland | 1,598 | 2000 | 2024 | ~55% |
| Scottish League One | Scotland | 1,547 | 2000 | 2024 | ~55% |
| UEFA Champions League | (Intl.) | 829 | 2019 | 2024 | ~75% |
| UEFA Europa League | (Intl.) | 615 | 2019 | 2024 | ~75% |
| UEFA Super Cup | (Intl.) | 6 | 2019 | 2024 | ~75% |
| **FIFA World Cup** | **(Intl.)** | **965** | **1930** | **2022** | **~60%** |

> "Avg fields filled" is estimated based on the null rate profile of each table. UEFA competitions have higher fill rates due to API-Football enrichment. Scottish lower divisions have the lowest fill rates.

---

## SECTION 4 — COVERAGE BY DATA CATEGORY

### Category 1 — Final Result (FTHG, FTAG, scores, win/draw/loss)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| home_score_ft | public.matches | 99.999% |
| away_score_ft | public.matches | 99.999% |
| result (H/D/A) | public.matches | ~95% |
| home_score_ht | public.matches | ~95% |
| away_score_ht | public.matches | ~95% |
| half_time_result | public.matches | ~95% |
| home_score_et | public.matches | ~1% (cup only) |
| home_score_pen | public.matches | ~1% (cup only) |
| FTHG (in raw_data) | staging_football_data_uk_raw | 100% |

**Total fields: 9 | Avg fill rate: ~88%** ✅

---

### Category 2 — Half-Time Stats (HTHG, HTAG, HTR)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| home_score_ht | public.matches | ~95% |
| away_score_ht | public.matches | ~95% |
| half_time_result | public.matches | ~95% |
| HTHG (in raw_data) | staging_football_data_uk_raw | 100% |
| HTAG (in raw_data) | staging_football_data_uk_raw | 100% |

**Total fields: 5 | Avg fill rate: ~97%** ✅

---

### Category 3 — Match Events (shots, corners, fouls, cards)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| total_shots | public.match_stats | ~65% |
| shots_on_goal | public.match_stats | ~64% |
| shots_insidebox | public.match_stats | ~64% |
| shots_outsidebox | public.match_stats | ~64% |
| blocked_shots | public.match_stats | ~64% |
| corner_kicks | public.match_stats | ~65% |
| fouls | public.match_stats | ~64% |
| yellow_cards | public.match_stats | ~65% |
| red_cards | public.match_stats | ~65% |
| offsides | public.match_stats | ~64% |
| hit_woodwork | public.match_stats | ~64% |
| HS/AS (in raw_data) | staging_football_data_uk_raw | ~65% |

**Total fields: 12 | Avg fill rate: ~65%** ⚠️

---

### Category 4 — Advanced Metrics (xG, xGA, xT, PPDA, possession, passes)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| ball_possession | public.match_stats | ~8% |
| total_passes | public.match_stats | ~8% |
| passes_accurate | public.match_stats | ~8% |
| passes_percentage | public.match_stats | ~8% |
| goalkeeper_saves | public.match_stats | ~8% |
| expected_goals_provider | public.match_stats | ~4% |
| goals_prevented | public.match_stats | ~4% |
| xG (in raw_data B365) | staging_football_data_uk_raw | ~0% (not in FD) |
| PPDA | (missing) | 0% |
| xT | (missing) | 0% |

**Total fields: 10 | Avg fill rate: ~6%** 🔴 CRITICAL GAP

---

### Category 5 — Lineups & Player Data (starting XI, subs, formations)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| formation | api_football_fixture_lineups | ~100% (for 4,856 matches) |
| player_name | api_football_fixture_lineup_players | ~100% (for 4,856 matches) |
| position | api_football_fixture_lineup_players | ~100% |
| is_substitute | api_football_fixture_lineup_players | ~100% |
| grid position | api_football_fixture_lineup_players | ~70% |
| UEFA formation | af_uefa_fixture_lineups | ~100% (for 2,988 matches) |
| UEFA players | af_uefa_fixture_lineup_players | ~100% (for 2,988 matches) |
| rating | af_fixture_player_stats | ~74% (where present) |
| minutes_played | af_fixture_player_stats | ~75% (where present) |
| public.lineups | (empty) | 0% |
| public.players | (empty) | 0% |

**Total fields: 11 | Coverage: ~11% of canonical matches** 🔴  
Lineup data exists for 4,856 + 2,988 = ~7,844 matches (~12% of 66,555).

---

### Category 6 — Officials (referee name, stats)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| referee (name) | public.matches | ~40% |
| referee (name in raw) | staging_football_data_uk_raw | ~34% |
| referee (WC) | wc_history.matches | ~80% |
| referee stats | (missing) | 0% |

**Total fields: 3 available (stats: 0) | Avg fill rate: ~51%** ⚠️  
No referee performance statistics (cards-per-game, foul-rate, bias metrics) exist anywhere.

---

### Category 7 — Market Data (odds, drift, bookmaker snapshots)

| Field | Source table | Fill rate |
|-------|-------------|-----------|
| 1X2 opening odds | public.match_odds | ~98% of 64,869 mapped matches |
| B365 1X2 (in raw_data) | staging_football_data_uk_raw | ~92% |
| Over/Under opening | public.match_goals_odds | ~100% of mapped matches |
| Asian Handicap opening | public.match_ah_odds | ~100% of mapped matches |
| Closing odds | (missing) | 0% |
| In-play odds snapshots | public.odds_live_snapshots | 0 rows |
| Line movement / drift | (missing) | 0% |
| Bookmaker count | match_goals_odds.bookmaker_count | ~95% |

**Total fields: 8 | Avg fill rate: ~49%** ⚠️  
Only opening lines; closing lines and drift entirely absent.

---

## SECTION 5 — BRAIN MAPPING RECOMMENDATION

| Brain | Schema/table.column | Status | Notes |
|-------|---------------------|--------|-------|
| **B1 Data Prep** | public.matches.* (all identity cols) | ✅ ready | Match identity, dates, team IDs all clean |
| **B1 Data Prep** | public.staging_football_data_uk_raw.raw_data | ✅ ready | Full FD payload available; needs JSONB parse |
| **B1 Data Prep** | public.af_fixture_mappings.* | ⚠️ partial | Only 10% of matches have AF fixture link |
| **B1 Data Prep** | public.matches.canonical_match_id | ✅ ready | Deterministic source match ID for deduplication |
| **B2 News** | (missing) article/news content | 🔴 missing | articles, article_translations tables are 0 rows |
| **B2 News** | public.matches.match_date | ✅ ready | Date anchor for news retrieval |
| **B3 Stats** | public.matches.home_score_ft | ✅ ready | Direct feed |
| **B3 Stats** | public.matches.away_score_ft | ✅ ready | Direct feed |
| **B3 Stats** | public.matches.home_score_ht | ✅ ready | ~95% fill rate |
| **B3 Stats** | public.match_stats.total_shots | ⚠️ partial | 65% fill rate; missing for ~35% of matches |
| **B3 Stats** | public.match_stats.shots_on_goal | ⚠️ partial | 65% fill rate |
| **B3 Stats** | public.match_stats.corner_kicks | ⚠️ partial | 65% fill rate |
| **B3 Stats** | public.match_stats.yellow_cards | ⚠️ partial | 65% fill rate |
| **B3 Stats** | public.match_stats.red_cards | ⚠️ partial | 65% fill rate |
| **B3 Stats** | public.match_stats.ball_possession | 🔴 critical gap | Only 8% fill rate — near unusable |
| **B3 Stats** | public.match_stats.expected_goals_provider | 🔴 critical gap | Only 4% fill rate |
| **B3 Stats** | staging_football_data_uk_raw.raw_data[HS] | ⚠️ partial | 65% in raw_data; needs JSONB extraction |
| **B4 Tactical** | public.match_stats.total_passes | 🔴 critical gap | 8% fill; PPDA not modelled at all |
| **B4 Tactical** | public.match_stats.passes_accurate | 🔴 critical gap | 8% fill |
| **B4 Tactical** | api_football_fixture_lineups.formation | ⚠️ partial | Only for ~7% of canonical matches |
| **B4 Tactical** | af_uefa_fixture_lineups.formation | ⚠️ partial | UEFA only (2,988 matches) |
| **B4 Tactical** | (missing) PPDA | 🔴 missing | Not in any table; needs Understat or StatsBomb |
| **B4 Tactical** | (missing) xT | 🔴 missing | Not in any table |
| **B4 Tactical** | (missing) progressive passes | 🔴 missing | Not in any table |
| **B5 Referee** | public.matches.referee | ⚠️ partial | ~40% fill; no stats, only name |
| **B5 Referee** | wc_history.matches.referee | ⚠️ partial | 80% fill for World Cup matches |
| **B5 Referee** | staging_football_data_uk_raw.referee | ⚠️ partial | 34% fill in raw |
| **B5 Referee** | (missing) referee card/foul rates | 🔴 missing | No referee performance statistics anywhere |
| **B6 Context** | public.competitions.name | ✅ ready | 25 competitions fully catalogued |
| **B6 Context** | public.seasons.year | ✅ ready | 27 seasons catalogued |
| **B6 Context** | public.matches.stage_type | ⚠️ partial | 70% null; only populated for cup matches |
| **B6 Context** | public.matches.is_knockout | ⚠️ partial | 70% null |
| **B6 Context** | public.matches.competition_importance_weight | ⚠️ partial | 70% null |
| **B6 Context** | wc2026_fixtures.stage_name | ✅ ready | Group stage fixture schedule available |
| **B6 Context** | wc_history.matches.edition_year | ✅ ready | Full historical WC context |
| **B7 Market** | public.match_odds.odds (1X2) | ✅ ready | 1.2M rows, 64,869 matches covered |
| **B7 Market** | public.match_goals_odds.odds (O/U) | ✅ ready | 169K rows, ~matches covered |
| **B7 Market** | public.match_ah_odds.odds (AH) | ✅ ready | 35K rows |
| **B7 Market** | staging_football_data_uk_raw.raw_data[B365H] | ✅ ready | 92% fill in raw_data; needs JSONB extract |
| **B7 Market** | (missing) closing odds | 🔴 missing | Only opening line available; no drift |
| **B7 Market** | public.odds_live_snapshots | 🔴 missing | Table exists, 0 rows |
| **BD Divergence** | public.match_odds + public.matches | ⚠️ partial | Can compute implied prob vs. actual; no closing line |
| **BD Divergence** | (missing) sharp money indicators | 🔴 missing | No line movement data |
| **A1 Quant Agg** | model_lab.prematch_feature_matrix_snapshot_v1 | ✅ ready | 65,104 rows × 201 features |
| **A1 Quant Agg** | model_lab.calibration_predictions_v1 | ✅ ready | 325,520 predictions (5 run_keys) |
| **A1 Quant Agg** | public.match_stats (rolling) | ⚠️ partial | 65% fill; possession/passes at 8% |
| **A2 Narrative Agg** | public.matches.round | ⚠️ partial | ~80% fill; useful for context |
| **A2 Narrative Agg** | wc_history.events | ⚠️ partial | 2,806 WC events; partial coverage |
| **A2 Narrative Agg** | (missing) article/news | 🔴 missing | articles table is 0 rows |
| **MC Monte Carlo** | model_lab.calibration_predictions_v1.p_home/p_draw/p_away | ✅ ready | Probability outputs available |
| **MC Monte Carlo** | public.match_goals_odds | ✅ ready | O/U lines for goals distribution |
| **MC Monte Carlo** | (missing) player injury/suspension data | 🔴 missing | injuries_suspensions table is 0 rows |
| **RAG Memory** | model_lab.match_feature_snapshots | ⚠️ partial | 893 rows (feature JSONB blobs) |
| **RAG Memory** | wc_history.matches + wc_history.events | ✅ ready | Historical WC match narratives |
| **RAG Memory** | (missing) structured match narratives | 🔴 missing | No generated text stored anywhere |
| **MB Main** | All above tables | ⚠️ orchestration | Main brain aggregates; no dedicated table |
| **BL Live Data** | public.odds_live_snapshots | 🔴 missing | 0 rows; live feed not connected |
| **BL Live Data** | public.matches.status_elapsed | ⚠️ partial | Live match clock field exists but mostly null |
| **BR Reconciliation** | public.matches.result vs model_lab predictions | ✅ ready | Reconciliation possible post-match |
| **BR Reconciliation** | model_lab.calibration_predictions_v1 | ✅ ready | Full prediction history available |

---

## SECTION 6 — UNKNOWN / UNRECOGNIZED COLUMNS

The following columns could not be confidently identified from column name and context alone:

| Table | Column | Context clues | Flag |
|-------|--------|---------------|------|
| public.match_stats | `booking_points` | integer, always 0–40 range | Likely referee's booking tally (yellow=10, red=25, straight red=25) — confirm with FD docs |
| public.match_stats | `goals_prevented` | numeric, ~96% null | GK expected saves minus actual conceded? Provider-specific metric — confirm definition |
| public.matches | `deterministic_source_match_id` | text, unique, pattern `E0::2024-25::Arsenal::Chelsea` | Deduplication key — purpose clear, but format/generation rule not documented |
| public.matches | `competition_importance_weight` | numeric, ~70% null | Used in prediction weighting? Unclear how values are set |
| public.af_fixture_player_stats | `competition_type` | text, non-null | Appears to be `league` or `cup` — confirm enum values |
| model_lab.prematch_feature_matrix_snapshot_v1 | `data_quality_tier` | text | Quality classification for cold-start handling — confirm tier values |
| model_lab.prematch_feature_matrix_snapshot_v1 | `comeback_signal` | numeric | Rolling comeback frequency? Definition not in schema — confirm formula |
| model_lab.prematch_feature_matrix_snapshot_v1 | `late_pressure` | numeric | Aggregation of late-game attacking events? Confirm formula |
| model_lab.prematch_feature_matrix_snapshot_v1 | `tempo_index` | numeric | High-press proxy? Confirm derivation from shots+corners+possession |
| model_lab.prematch_feature_matrix_snapshot_v1 | `set_piece_threat` | numeric | Corners + free kicks proxy? Confirm formula |
| model_lab.calibration_predictions_v1 | `feature_quality_score` | numeric | Model input quality score — confirm range and threshold for "bad" prediction |
| wc_history.matches | `score_semantics_status` | text | Post-processing status for FT/AET/PEN score assignment — internal pipeline flag |
| wc_history.matches | `data_quality_status` | text | Data quality classification — confirm enum values |
| wc_history.source_mappings | (all columns) | Bridge table | Purpose clear (FD↔WC match linking), column semantics unclear |
| public.match_seals | (all columns) | 0 rows | Unknown purpose — table is empty, no documentation |
| public.mea_culpa | (all columns) | 0 rows | Appears to be a post-mortem/error tracking table — confirm intended use |
| public.honeypot_endpoints | (all columns) | 0 rows | Security honeypot registry — confirm operational status |
| public.review_rules / review_queue / review_decisions | (all columns) | 0 rows | Content moderation pipeline? — confirm intended use |
| public.persona_outputs | (all columns) | 0 rows | Debate/AI persona output storage — confirm relationship to debate_rounds |

---

## SECTION 7 — TOP 10 GAPS

### 1. Ball Possession / Passes / Advanced Possession Metrics
- **Field:** `ball_possession`, `total_passes`, `passes_accurate`, `passes_percentage`
- **Which brains:** B3 Stats, B4 Tactical, A1 Quant Agg, model_lab feature matrix
- **Current fill rate:** 8% — near unusable
- **Suggested source:** API-Football (`/fixtures/statistics` endpoint) for all historical fixtures
- **Estimated effort:** HIGH — requires mapping all 66,555 canonical matches to AF fixture IDs (~10% mapped currently), then bulk-fetching statistics endpoint. Bottleneck is the fixture ID mapping gap.

---

### 2. PPDA (Passes Per Defensive Action) / Pressing Metrics
- **Field:** `ppda`, `ppda_allowed`, `deep_progressions`, `high_press_rate`
- **Which brains:** B4 Tactical, A1 Quant Agg, BD Divergence
- **Current fill rate:** 0% — not modelled
- **Suggested source:** Understat (free, scraping), StatsBomb Open Data (limited), or Wyscout/InStat (paid API)
- **Estimated effort:** HIGH — requires new data source integration and schema additions

---

### 3. Expected Goals (xG / xGA)
- **Field:** `xg_home`, `xg_away`, `xg_ht_home`, `xg_ht_away`
- **Which brains:** B3 Stats, B4 Tactical, A1 Quant Agg, MC Monte Carlo
- **Current fill rate:** ~4% (`expected_goals_provider` column in match_stats)
- **Suggested source:** Understat (free scrape, covers top 6 leagues 2014+), API-Football Premium, StatsBomb
- **Estimated effort:** MEDIUM — Understat has clean xG data for top leagues; scraper + transformer needed

---

### 4. Closing Odds / Line Movement
- **Field:** `odds_closing_home`, `odds_closing_draw`, `odds_closing_away`, `line_movement_delta`
- **Which brains:** B7 Market, BD Divergence, A1 Quant Agg
- **Current fill rate:** 0% — only opening odds exist
- **Suggested source:** football-data.co.uk (has closing odds in raw_data for some bookmakers), Pinnacle API, OddsAPI
- **Estimated effort:** LOW — FD raw_data already contains closing Bet365/BW/IW odds in the JSONB; just needs promotion to columns via a migration + JSONB extraction transform

---

### 5. Referee Performance Statistics
- **Field:** `referee_yellow_rate`, `referee_red_rate`, `referee_foul_rate`, `referee_home_bias`
- **Which brains:** B5 Referee
- **Current fill rate:** 0% — name only, no statistics
- **Suggested source:** Can be computed from existing `public.matches.referee` + `public.match_stats` (yellow_cards, red_cards, fouls) where referee name is present (~40% of matches)
- **Estimated effort:** LOW — entirely derivable from existing data via a materialized view or aggregation function; no new source needed

---

### 6. Player Injury / Suspension Status
- **Field:** `player_id`, `match_id`, `injury_type`, `return_date`, `suspension_reason`
- **Which brains:** MC Monte Carlo, B4 Tactical
- **Current fill rate:** 0% — `injuries_suspensions` table exists but is empty
- **Suggested source:** API-Football (`/injuries` endpoint, `/players/squads`), Transfermarkt scrape
- **Estimated effort:** MEDIUM — API-Football covers ~last 5 seasons; historical injury data requires scraping

---

### 7. Lineup Coverage for League Matches
- **Field:** `formation`, `starting_xi`, `coach`
- **Which brains:** B4 Tactical, B3 Stats, model_lab (has_lineups feature)
- **Current fill rate:** ~11% (7,844 / 66,555 matches)
- **Suggested source:** API-Football (`/fixtures/lineups` endpoint) for all mapped fixtures
- **Estimated effort:** MEDIUM — mapping gap is the primary blocker (only 6,762 AF fixture IDs linked); need to extend `af_fixture_mappings` coverage then bulk-fetch lineups

---

### 8. Live/In-Play Match Data
- **Field:** `odds_live_*`, `match_stats_live_*`, `event_live_*`
- **Which brains:** BL Live Data
- **Current fill rate:** 0% — `odds_live_snapshots` has 0 rows; `status_elapsed` mostly null
- **Suggested source:** API-Football Premium (live fixtures/events endpoint), Betfair Exchange stream
- **Estimated effort:** HIGH — requires real-time streaming infrastructure, not batch ingestion

---

### 9. Standings / Form Table Context
- **Field:** `position`, `points`, `goal_difference`, `form_last5`
- **Which brains:** B6 Context, B3 Stats
- **Current fill rate:** 0% — `standings` table is empty
- **Suggested source:** API-Football (`/standings` endpoint), or derivable from existing `public.matches` result data
- **Estimated effort:** LOW — standings are fully derivable from the existing match results in `public.matches`; a SQL function computing points/GD/position per competition-season would suffice without any new API calls

---

### 10. AI-Generated Match Narratives / News Content
- **Field:** article text, summary text, translated content
- **Which brains:** B2 News, A2 Narrative Agg, RAG Memory
- **Current fill rate:** 0% — `articles`, `article_translations`, `post_match_reports` all empty
- **Suggested source:** Internal generation (LLM pipeline using existing match data), or licensed text feeds
- **Estimated effort:** MEDIUM — schema is in place; needs a generation pipeline triggering on match completion

---

## Appendix — Schema Row Count Summary

| Schema | Est. Total Rows |
|--------|-----------------|
| public | ~2,570,000 |
| model_lab | ~463,000 |
| wc_history | ~9,300 |
| auth | ~81 |
| supabase_migrations | 192 |
| storage | ~245 |
| realtime | ~69 |
| cron | ~15 |
| net | ~18 |
| vault | 1 |
| **TOTAL** | **~3,042,000** |

---

FINAL STATUS: tables=198 | rows=3042000 | green=31 | yellow=42 | red=24 | unknown_cols=19
