# Next59 Data Source Provenance Audit
**Date:** 2026-05-04  
**Type:** Forensic / Read-only  
**Scope:** All schemas — every source that has written historical match data

---

## STEP 1 — Source Columns

`public.data_sources` contains exactly **2 registered sources**:

| id (short) | name | base_url | active | rate_limit/min |
|---|---|---|---|---|
| 41035f26 | football-data.co.uk | https://www.football-data.co.uk | true | NULL |
| d8580550 | api-football | https://v3.football.api-sports.io | true | 52,000 |

`public.providers` — **0 rows** (empty).

Source-column survey confirmed `api_football_*` columns exist across 40+ tables. Dedicated ingestion-run tables: `public.ingestion_runs`, `public.af_uefa_ingestion_runs`, `public.wc2026_ingestion_runs`, `wc_history.ingestion_runs`.

---

## STEP 2 — Source URLs in Data

### football-data.co.uk
- **Evidence:** `staging_football_data_uk_raw.source_file` contains CSV filenames matching FD naming (`E0.csv`, `SP1.csv`, etc.); `staging_football_data_uk_raw.raw_data` JSONB keys are FD column headers (FTHG, FTAG, HS, B365H, etc.) — see Step 3.
- **Table:** `public.staging_football_data_uk_raw` — 179,029 rows
- **Date range:** 2000-07-28 → 2025-06-01
- **Edge function:** `import-fd-staging` fetches from `https://www.football-data.co.uk/mmz4281/{season}/{league}.csv` (no auth key required)

### API-Football (v3.football.api-sports.io)
- **Evidence:** `wc_history.matches.source_url` contains `https://v3.football.api-sports.io/fixtures?league=1&season={year}`; `public.wc2026_fixtures.source_url` contains same pattern; `af_uefa_fixture_raw.response_json` has keys `{fixture, teams, goals, score, league}` — canonical AF structure; `public.af_odds_bookmakers.provider = 'api_football'` (all 32 rows); `wc_history.raw_api_football_responses.provider = 'api_football'` (all 645 rows).
- **Tables:** `af_*` (~15 tables), `api_football_*` (~8 tables), `wc2026_*`, `wc_history.*`
- **Row footprint:** ~560,000+ rows across all affected tables
- **Date range:** 2019-present (league data); 2010–2022 (WC history); 2026 (WC fixtures)

### OpenFootball (raw.githubusercontent.com)
- **Evidence:** `wc_history.raw_openfootball_responses.source_url` = `https://raw.githubusercontent.com/openfootball/worldcup.json/master/{year}/worldcup.json`; `wc_history.matches.source_provider = 'openfootball'` for 709 rows; `wc_history.of_fetch_jobs` uses `pg_net_id` foreign key into `net._http_response` — fetches triggered via `net.http_get()` DB function.
- **Tables:** `wc_history.matches` (709 rows), `wc_history.raw_openfootball_responses` (38 rows), `wc_history.source_mappings` (214 rows)
- **Date range:** 1930–2006 World Cup editions only

### FIFA.com
- **Evidence:** `public.wc2026_fixtures.source_url` contains `https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/knockout-stage-match-schedule-bracket` for a subset of fixture records.
- **Tables:** `public.wc2026_fixtures` — partial (some fixtures only)
- **Notes:** No dedicated edge function exists for FIFA.com ingestion; this URL likely reflects manual/scrape seeding of the knockout schedule bracket.

### Sportmonks (api.sportmonks.com)
- **Evidence:** `supabase/functions/sportmonks-probe/index.ts` calls `https://api.sportmonks.com/v3` with `SPORTMONKS_API_KEY`. No Sportmonks-specific tables exist. No rows in any table are attributed to Sportmonks.
- **Status:** Edge function deployed; no data has been written to the database from this source.

No evidence found for: Understat, FBref, Sofascore, Transfermarkt, Flashscore, WhoScored, Opta, StatsBomb, SerpAPI, Apify, or any other football data provider.

---

## STEP 3 — JSONB Payload Shape Analysis

### `staging_football_data_uk_raw.raw_data` — football-data.co.uk
Keys present in all 179,029 rows: `Div`, `Date`, `HomeTeam`, `AwayTeam`, `FTHG`, `FTAG`, `FTR`, `HTHG`, `HTAG`, `HTR`. Odds keys present in majority: `B365H/D/A`, `BWH/D/A`, `IWH/D/A`, `WHH/D/A`, `VCH/D/A`, `LBH/D/A`. Match stat keys (present in ~65%): `HS`, `AS`, `HST`, `AST`, `HC`, `AC`, `HF`, `AF`, `HY`, `AY`, `HR`, `AR`.  
**Fingerprint:** football-data.co.uk

### `af_uefa_fixture_raw.response_json` — API-Football
Top-level keys on all 2,988 rows: `fixture`, `teams`, `goals`, `score`, `league`.  
**Fingerprint:** Standard API-Football fixtures endpoint envelope.

### `wc_history.raw_api_football_responses.response_json` — API-Football
Top-level keys on 645 rows: `get`, `parameters`, `errors`, `results`, `paging`, `response`.  
**Fingerprint:** Standard API-Football v3 outer envelope (paginated response wrapper).

### `wc_history.raw_openfootball_responses.response_json` — OpenFootball
Top-level keys: `name`, `matches` (2 keys only, every row).  
**Fingerprint:** openfootball/worldcup.json schema — distinct from both FD and AF patterns.

### `public.wc2026_api_football_raw_responses`
Entity types: `fixture` (72), `team` (48), `wc2026_fixtures` (1), `wc2026_players` (1), `wc2026_teams` (1), `league` (1).  
**Fingerprint:** API-Football — same envelope as other AF tables.

### `af_fixture_player_stats_raw.response_json`
Top-level keys: `fixture_id`, `teams` only (2 keys, 5,312 rows) — custom Next59 envelope wrapping AF player stat responses.

---

## STEP 4 — Ingestion Logs and Cron History

### pg_cron jobs
| jobid | jobname | schedule | command |
|---|---|---|---|
| 1 | prune-old-vitals | daily midnight | `DELETE FROM web_vitals WHERE created_at < now() - 30 days` |
| 2 | alert-poor-vitals | daily 9am | `SELECT alert_poor_vitals()` |

**No data ingestion cron jobs exist.** All ingestion is triggered externally (Edge Functions called via HTTP, scripts, or manual invocation).

### public.ingestion_runs
| source | run_type | status | count | date range |
|---|---|---|---|---|
| football-data.co.uk | historical_csv | success | 883 | 2026-04-28 13:10 → 14:02 |
| football-data.co.uk | historical_csv | partial_error | 36 | 2026-04-28 13:08 → 13:10 |

All 919 runs completed in a 53-minute window on 2026-04-28 — one-time bulk load, not ongoing.

### public.af_uefa_ingestion_runs
18 completed runs on 2026-05-03 covering UEFA leagues (AF league IDs 3 and 531), seasons 2019–2024. All status=`completed`.

### public.wc2026_ingestion_runs
1 run on 2026-05-02: type=`wc2026_full_probe`, 4 API calls, 124 raw rows, 0 transformed.

### wc_history.ingestion_runs
24 completed runs on 2026-05-02 (18-minute window), provider=`api_football` only.

### wc_history.of_fetch_jobs
18 rows — one per World Cup edition year (1930–2006), all status=`done`, all dispatched at 2026-05-03 00:43:01 UTC via `pg_net.http_get()`.

---

## STEP 5 — Edge Functions and DB Functions

### Edge Functions — External Service Mapping

| Function | External service | API key env var | What it ingests |
|---|---|---|---|
| `import-fd-staging` | football-data.co.uk | None (no auth) | Historical league CSV → staging |
| `transform-fd-to-final` | Internal only | SERVICE_ROLE_KEY | Staging → canonical matches |
| `e0-mw1-import` | Internal only | SERVICE_ROLE_KEY | AF raw staging → internal tables |
| `api-football-probe` | api-football v3 | API_FOOTBALL_KEY | League/fixture/player discovery |
| `af-fixture-mapping` | api-football v3 | API_FOOTBALL_KEY | Full fixtures for 7 domestic leagues |
| `af-fixture-events` | api-football v3 | API_FOOTBALL_KEY | Match events (goals/cards/subs) |
| `af-fixture-lineups` | api-football v3 | API_FOOTBALL_KEY | Lineups and formations |
| `af-fixture-statistics` | api-football v3 | API_FOOTBALL_KEY | Match statistics per team |
| `af-fixture-player-stats` | api-football v3 | API_FOOTBALL_KEY | Player-level match stats |
| `af-player-season-stats` | api-football v3 | API_FOOTBALL_KEY | Player season aggregates |
| `af-uefa-fixture-events` | api-football v3 | API_FOOTBALL_KEY | UEFA match events |
| `af-uefa-fixture-lineups` | api-football v3 | API_FOOTBALL_KEY | UEFA lineups |
| `af-uefa-fixture-statistics` | api-football v3 | API_FOOTBALL_KEY | UEFA match statistics |
| `af-uefa-odds-probe` | api-football v3 | API_FOOTBALL_KEY | Odds bookmakers/bets metadata |
| `import-wc2026` | api-football v3 | API_FOOTBALL_KEY | WC2026 teams/fixtures/players |
| `wc2026-raw-probe` | api-football v3 | API_FOOTBALL_KEY | WC2026 discovery/probe |
| `wc-history-probe` | api-football v3 + GitHub (openfootball) | API_FOOTBALL_KEY | WC history fixtures + openfootball JSON |
| `sportmonks-probe` | Sportmonks v3 | SPORTMONKS_API_KEY | Probe only — no data written yet |
| `e0-raw-probe` | api-football v3 | API_FOOTBALL_KEY | Premier League probe |
| `get-match-analysis` | Internal only | SERVICE_ROLE_KEY | Reads predictions/team strength |
| `generate-predictions-v1` | Internal only | SERVICE_ROLE_KEY | Computes predictions from internal data |

### DB Functions referencing external services
| Function | Service | Mechanism |
|---|---|---|
| `wch_of_fetch_year` | GitHub (openfootball raw JSON) | `net.http_get()` via pg_net |
| `wch_of_enqueue_all` | GitHub (loop over 1930–2006) | calls `wch_of_fetch_year` |
| `trigger_indexnow_on_publish` | IndexNow (Bing) + next59.com | HTTP POST via Supabase self-URL |
| `alert_poor_vitals` | Slack webhook | HTTP POST via pg_net |

---

## STEP 6 — Manual Entries

`public.matches` has no `created_by`, `user_id`, `author`, or `entered_by` columns.  
`public.admin_audit_log` — 0 rows.  
`wc2026_fixtures.source_url` contains one FIFA.com URL — this likely represents a manually-assisted fixture import or scrape; no automated function for this URL was found.  

**No confirmed manual entries** can be proven from DB evidence. The FIFA.com source_url is the only anomaly.

---

## STEP 7 — Column Fingerprint Analysis

| Table | FD fingerprint | AF fingerprint | OpenFootball | Notes |
|---|---|---|---|---|
| `staging_football_data_uk_raw` | ✅ FTHG,FTAG,HS,B365H (in raw_data) | — | — | Pure FD source |
| `match_stats` | — | ✅ shots_on_goal, shots_insidebox, expected_goals_provider | — | AF naming conventions |
| `match_odds` | ⚠️ bookmaker names match FD (Bet365, WH, IW, VC, LB) | — | — | Originated from FD raw_data odds columns |
| `af_fixture_player_stats` | — | ✅ api_football_fixture_id, api_football_player_id | — | Explicit AF IDs |
| `af_player_season_stats` | — | ✅ api_football_player_id, api_football_team_id | — | Explicit AF IDs |
| `af_uefa_fixture_*` | — | ✅ api_football_fixture_id | — | All explicit AF IDs |
| `wc_history.matches` (709 rows) | — | — | ✅ source_provider='openfootball' | 1930–2006 |
| `wc_history.matches` (256 rows) | — | ✅ source_provider='api_football', source_url=v3.api-sports.io | — | 2010–2022 |
| `model_lab.*` | — | — | — | Internal derivation only; no external fingerprint |
| `wc2026_fixtures` | — | ✅ api_football_fixture_id | ⚠️ 1 FIFA.com source_url | Mixed |

No evidence of Understat (no xG/npxG/PPDA columns outside model_lab computed features), FBref (no psxg/gca/sca/prgp columns), Sportradar (no event_uuid/srml_id), or Sportmonks (no sport_id/localteam — deployed function but 0 rows written).

---

## STEP 8 — Master Source Table

| Source | Evidence type | Tables affected | Row count | Date range | Active? |
|---|---|---|---|---|---|
| **football-data.co.uk** | Explicit `data_sources` entry; `ingestion_runs` (919 runs); raw JSONB keys (FTHG, HS, B365H); `source_file` column pattern; edge function `import-fd-staging` | `staging_football_data_uk_raw`, `matches` (via transform), `match_stats`, `match_odds`, `match_goals_odds`, `match_ah_odds` | ~1,730,000 | 2000-07-28 → 2025-06-01 | **No** — one-time bulk load on 2026-04-28; no ongoing cron |
| **API-Football (v3.football.api-sports.io)** | Explicit `data_sources` entry; `source_url` values in wc_history.matches and wc2026_fixtures; `response_json` envelope keys (get/parameters/paging/response); `provider='api_football'` in af_odds_bookmakers (all rows), wc_history.raw_api_football_responses (all rows); 15 dedicated edge functions using `API_FOOTBALL_KEY` | `af_fixture_*`, `af_player_*`, `af_uefa_*`, `api_football_*`, `wc2026_*`, `wc_history.matches` (256 rows), `wc_history.match_statistics`, `wc_history.raw_api_football_responses` | ~590,000 | 2010-2022 (WC); 2019–present (leagues/UEFA) | **Yes** — edge functions triggered manually/on-demand; no automated schedule |
| **OpenFootball (GitHub raw JSON)** | `wc_history.matches.source_provider='openfootball'` (709 rows); `raw_openfootball_responses.source_url` pattern; `source_mappings.provider='openfootball'` (214 rows); DB function `wch_of_fetch_year` using `net.http_get(github.com/openfootball/…)`; `of_fetch_jobs` table with pg_net IDs | `wc_history.matches`, `wc_history.raw_openfootball_responses`, `wc_history.source_mappings`, `wc_history.teams` (partial) | ~961 | 1930–2006 (WC editions only) | **No** — one-time load on 2026-05-03; no recurring job |
| **FIFA.com (web scrape / manual)** | `wc2026_fixtures.source_url = 'https://www.fifa.com/en/…/knockout-stage-match-schedule-bracket'` | `public.wc2026_fixtures` (partial) | Unknown (subset of 104) | 2026 | **Unknown** — no edge function found; no automation proven |
| **Sportmonks (api.sportmonks.com/v3)** | Edge function `sportmonks-probe` calls `https://api.sportmonks.com/v3` with `SPORTMONKS_API_KEY`; no Sportmonks tables exist; no rows attributed | (none) | 0 | — | **Deployed but inactive** — function exists, no data written |

### Unidentified Tables
The following tables contain rows but have no confirmed external source attribution:

| Table | Rows | Observation |
|---|---|---|
| `public.match_odds`, `match_goals_odds`, `match_ah_odds` | ~1.4M | Bookmaker names match FD naming (Bet365, WH, IW, VC, LB) but `provider_id` is 100% NULL. Likely derived from `staging_football_data_uk_raw.raw_data` odds columns via a transform, but no `ingestion_runs` record for this transformation exists. The 2026-04-28 ingestion timestamp aligns with the FD bulk load date. **Probable source: football-data.co.uk**, unconfirmed due to missing transform audit trail. |
| `public.competitions`, `public.teams`, `public.seasons` | 25 / 742 / 27 | No ingestion_run_id on these tables; likely seeded via migration scripts. No external source provenance. |
| `wc_history.teams` | 362 of 490 rows | 74% have `source_provider=NULL` — these were bulk-inserted alongside openfootball match data but the provider tag was not applied. **Probable source: openfootball**, unconfirmed. |
| `wc_history.editions` | 18 of 22 rows | `source_provider=NULL`, status=`candidate` — seeded as reference data, not via an API. Manual/migration origin. |

---

## Summary

**4 confirmed data sources** have written rows to the database:
1. football-data.co.uk — bulk historical league match + odds data (2000–2025)
2. API-Football v3 — league enrichment, UEFA, World Cup 2010–2022, WC2026 skeleton
3. OpenFootball (GitHub) — World Cup historical matches 1930–2006
4. FIFA.com — partial WC2026 fixture seeding (evidence: source_url; mechanism unconfirmed)

**1 deployed-but-inactive source:**
- Sportmonks — edge function exists with API key; 0 rows written

**No evidence** of any other provider (Understat, FBref, Sportradar, Opta, StatsBomb, Transfermarkt, Flashscore, WhoScored, SerpAPI, Apify, or any scraper framework).

---

FINAL STATUS: identified_sources=4 | unidentified_tables=4 | active_pipelines=0 | manual_entries=0
