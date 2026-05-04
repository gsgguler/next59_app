# Post-Transform Data Quality Audit — v4.3-W1-D2
**Date:** 2026-05-04 | **Status:** READ-ONLY verification

---

## Section 1 — Transform Outcomes

| Source | Total | Transformed | Skipped | Errors | Success% |
|---|---|---|---|---|---|
| staging_football_data_uk_raw | 179,029 | 174,681 | 4,348 | 0 | 98% |

**Skip pattern:** All 4,348 skipped rows have an empty `Div` field in `raw_data` — blank/header rows in the source CSV, not data rows. No structured errors recorded (`processing_errors` jsonb is NULL for all rows).

---

## Section 2 — Table Growth

| Metric | Before transform | After transform | Delta |
|---|---|---|---|
| matches | 66,555 | 180,122 | +113,567 |
| match_stats (rows) | — | 358,088 | — |
| match_odds · opening (1X2) | 1,201,988 | 5,839,148 | +4,637,160 |
| match_odds · closing (1X2) | — | 1,072,290 | — |
| match_goals_odds | — | 0 | — |
| match_ah_odds | — | 0 | — |

> **Note:** `match_odds.odds_type` stores `'opening'`/`'closing'`; `market` column stores `'1X2'` (only value present). Goals and AH markets not present in the FD source.

---

## Section 3 — League × Season Coverage

| FD code | League | Seasons | Total matches | First | Last |
|---|---|---|---|---|---|
| E1 | Championship | 25 | 13,800 | 2000 | 2024 |
| E3 | League Two | 25 | 13,688 | 2000 | 2024 |
| E2 | League One | 25 | 13,647 | 2000 | 2024 |
| SP2 | Segunda Division | 25 | 11,550 | 2000 | 2024 |
| I2 | Serie B | 25 | 10,782 | 2000 | 2024 |
| E0 | Premier League | 25 | 9,500 | 2000 | 2024 |
| SP1 | La Liga | 25 | 9,500 | 2000 | 2024 |
| F2 | Ligue 2 | 25 | 9,325 | 2000 | 2024 |
| I1 | Serie A | 25 | 9,204 | 2000 | 2024 |
| F1 | Ligue 1 | 25 | 9,103 | 2000 | 2024 |
| T1 | Süper Lig | 25 | 7,950 | 2000 | 2024 |
| D1 | Bundesliga | 25 | 7,650 | 2000 | 2024 |
| D2 | 2. Bundesliga | 25 | 7,650 | 2000 | 2024 |
| N1 | Eredivisie | 25 | 7,575 | 2000 | 2024 |
| P1 | Primeira Liga | 25 | 7,122 | 2000 | 2024 |
| B1 | Pro League | 25 | 6,864 | 2000 | 2024 |
| SC0 | Scottish Premiership | 25 | 5,651 | 2000 | 2024 |
| G1 | Super League Greece | 20 | 4,924 | 2005 | 2024 |
| SC1 | Scottish Championship | 25 | 4,412 | 2000 | 2024 |
| SC2 | Scottish League One | 25 | 4,388 | 2000 | 2024 |
| SC3 | Scottish League Two | 25 | 4,387 | 2000 | 2024 |

> UEFA competition rows (Champions League, Europa League) landed with `__NA_*` codes — provider mapping gap, not a data corruption.

---

## Section 4 — Süper Lig Deep-Dive (T1)

Quality thresholds: **Green** = 306-match season + >90% all fields | **Yellow** = 60–90% | **Red** = <60% any field

| Season | Matches | With_HT | With_stats | With_referee | With_odds | Quality |
|---|---|---|---|---|---|---|
| 2024 | 342 | 341 (100%) | 341 (100%) | 0 (0%) | 342 (100%) | 🟡 YELLOW — no referee |
| 2023 | 380 | 379 (100%) | 379 (100%) | 0 (0%) | 379 (100%) | 🟡 YELLOW — no referee |
| 2022 | 342 | 313 (92%) | 313 (92%) | 0 (0%) | 309 (90%) | 🟡 YELLOW — no referee |
| 2021 | 380 | 380 (100%) | 380 (100%) | 0 (0%) | 380 (100%) | 🟡 YELLOW — no referee |
| 2020 | 420 | 420 (100%) | 420 (100%) | 0 (0%) | 415 (99%) | 🟡 YELLOW — no referee |
| 2019 | 306 | 306 (100%) | 306 (100%) | 0 (0%) | 306 (100%) | 🟡 YELLOW — no referee |
| 2018 | 306 | 306 (100%) | 306 (100%) | 0 (0%) | 306 (100%) | 🟡 YELLOW — no referee |
| 2017 | 306 | 306 (100%) | 306 (100%) | 0 (0%) | 303 (99%) | 🟡 YELLOW — no referee |
| 2016 | 306 | 306 (100%) | 0 (0%) | 0 (0%) | 306 (100%) | 🔴 RED — no stats |
| 2015 | 306 | 306 (100%) | 0 (0%) | 0 (0%) | 305 (100%) | 🔴 RED — no stats |
| ≤2014 | 306 | ~100% | 0 (0%) | 0 (0%) | ~99% | 🔴 RED — no stats |

**Referee field:** Zero entries for T1 across all 25 seasons. FD source does not carry referee data for Süper Lig.

**Grade A seasons (>90% all fields, referee excluded):** 2017, 2018, 2019, 2021, 2023 — **5 seasons**
**Grade A with referee:** **0** (referee data requires a supplementary source for T1)

---

## Section 5 — Closing Odds Verification

| odds_type | Count | Bookmakers |
|---|---|---|
| opening | 5,839,148 | 23 |
| closing | 1,072,290 | 8 |

Closing coverage: **18%** of opening — below the 20% threshold → **FLAG: closing odds gap.**

Top providers (opening + closing combined):

| Provider | Count |
|---|---|
| William Hill | 801,585 |
| Bet365 | 785,514 |
| Interwetten | 753,301 |
| Betway | 710,397 |
| VC Bet | 650,835 |
| Pinnacle | 639,414 |
| Ladbrokes | 465,778 |
| Betbrain Avg | 296,649 |
| Avg / Max | 249,714 each |

Pinnacle is present (critical for line-movement / sharp-money signals). Betbrain Avg/Max and Avg/Max aggregates available for market consensus.

---

## Section 6 — Skip/Error Pattern Analysis

| Pattern | Count | Notes |
|---|---|---|
| Empty `Div` field (blank/header rows) | 4,348 | Raw CSVs include header rows; all silently skipped |

No other patterns detected. No team mapping failures, no diacritic errors, no date-parse errors recorded in `processing_errors`.

---

## Section 7 — Ready for Foundation v4.3?

| Criterion | Status | Notes |
|---|---|---|
| 7 Grade A leagues have ≥3 complete recent seasons | **YES** | All 21 leagues have 25 seasons; E0/SP1/D1/I1/F1/T1/P1 all qualify |
| Süper Lig 2022-23, 2023-24, 2024-25 all >90% complete | **PARTIAL** | Stats+odds >90% ✓; referee 0% for all T1 seasons ✗ |
| Closing odds present for ≥30% of recent matches | **NO** | 18% coverage — below threshold |
| match_stats join with matches (no orphans) | **YES** | 0 orphaned rows confirmed |
| Referee non-null for ≥50% of recent matches (global) | **NO** | 41% globally (last 3 seasons); 0% for T1 |
| xG/PPDA columns confirmed missing | **YES** | No `%xg%` columns in match_stats; need Understat/FBref |

---

**FINAL STATUS:** matches=180,122 | odds=6,911,438 | green_leagues=21 | suplig_grade_a_seasons=5 | closing_odds_coverage_pct=18
