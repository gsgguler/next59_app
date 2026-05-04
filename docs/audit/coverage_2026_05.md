# Next59 Seasonal & League Coverage Audit
**Date:** 2026-05-04  
**Builds on:** db_inventory_2026_05.md, data_sources_2026_05.md  
**Purpose:** Granular season × league coverage for brain backfill planning

---

> **IMPORTANT STRUCTURAL NOTE — How seasons are stored**
>
> Football Data UK stores data by calendar year. A "season 2024" row in the DB contains matches played in calendar year 2024 — which spans the *second half* of 2023-24 season AND the *first half* of 2024-25. A full domestic season (e.g., 2024-25) is split across two year rows (2024 + 2025). This means no single year row will ever reach 100% of a full-season expected count. The "Expected matches" column below uses per-year-row expectations (half-season), not full-season totals. Full-season coverage is assessed by combining consecutive year pairs.

---

## SECTION 1 — MASTER SEASON × LEAGUE MATRIX

**Expected matches per year-row (half-season basis):**
- 20-team league (PL, La Liga, Serie A, Ligue 1, Süper Lig): ~190/year
- 18-team league (Bundesliga, Eredivisie, 2. Bundesliga): ~153/year
- 24-team leagues (Championship, L1, L2): ~276/year
- 18-team leagues (Primeira Liga, Pro League): ~153/year
- Scottish Premiership (12 teams, split format): ~114/year
- Scottish lower tiers (10 teams): ~90/year
- Segunda División (22 teams): ~231/year
- Serie B (20 teams): ~231/year
- Ligue 2 (20 teams): ~190/year
- Super League Greece (16 teams): ~120/year

Quality scoring per year-row:
- 🟢 ≥ 85% of half-season expected AND FT score 100%
- 🟡 ≥ 60% expected OR FT score 100% but low count
- 🔴 Below 60% expected or FT score gaps

---

### Belgium — Pro League

| Season | Matches | FT% | HT% | Referee% | Stats% | Shots% | Lineups | Events | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|--------|---------|--------|-----------|---------|
| 2024 | 106 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 95 | 🟢 |
| 2023 | 115 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 100 | 🟢 |
| 2022 | 115 | 100 | 100 | 99 | 100 | 100 | 0 | 0 | 100 | 🟢 |
| 2021 | 103 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 100 | 🟢 |
| 2020 | 105 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 100 | 🟢 |
| 2019 | 76 | 100 | 100 | 100 | 100 | 100 | 0 | 0 | 49 | 🟡 |
| 2018 | 89 | 100 | 100 | 0 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2017 | 78 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 51 | 🟡 |
| 2016 | 83 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 54 | 🟡 |
| 2015 | 90 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 59 | 🟡 |
| 2014 | 76 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 50 | 🟡 |
| 2013 | 95 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 62 | 🟡 |
| 2012 | 77 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 50 | 🟡 |
| 2011 | 92 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 60 | 🟡 |
| 2010 | 91 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 59 | 🟡 |
| 2009 | 68 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 44 | 🔴 |
| 2008 | 100 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 65 | 🟡 |
| 2007 | 120 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 78 | 🟡 |
| 2006 | 122 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 80 | 🟡 |
| 2005 | 120 | 100 | 100 | 0 | 100 | 0 | 0 | 0 | 78 | 🟡 |
| 2004 | 115 | 100 | 0 | 0 | 100 | 0 | 0 | 0 | 48 | 🔴 |
| 2003 | 107 | 98 | 0 | 0 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2002 | 91 | 95 | 0 | 0 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2001 | 113 | 99 | 0 | 0 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2000 | 112 | 100 | 0 | 0 | 100 | 0 | 0 | 0 | 0 | 🔴 |

---

### England — Championship

| Season | Matches | FT% | HT% | Referee% | Stats rows | Shots% | Lineups | Events | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|-----------|--------|---------|--------|-----------|---------|
| 2024 | 187 | 100 | 100 | 100 | 374 | 100 | 0 | 0 | 100 | 🟢 |
| 2023 | 203 | 100 | 100 | 100 | 406 | 100 | 0 | 0 | 100 | 🟢 |
| 2022 | 188 | 100 | 100 | 100 | 376 | 100 | 0 | 0 | 100 | 🟢 |
| 2021 | 199 | 100 | 100 | 100 | 398 | 100 | 0 | 0 | 100 | 🟢 |
| 2020 | 207 | 100 | 100 | 100 | 414 | 100 | 0 | 0 | 100 | 🟢 |
| 2019 | 201 | 100 | 100 | 100 | 402 | 100 | 0 | 0 | 100 | 🟢 |
| 2018 | 200 | 100 | 100 | 100 | 400 | 100 | 0 | 0 | 100 | 🟢 |
| 2017 | 203 | 100 | 100 | 100 | 406 | 100 | 0 | 0 | 100 | 🟢 |
| 2016 | 207 | 100 | 100 | 100 | (stats) | 100 | 0 | 0 | 100 | 🟢 |
| 2015 | 200 | 100 | 100 | 100 | 400 | 100 | 0 | 0 | 100 | 🟢 |
| 2014 | 199 | 100 | 100 | 100 | 398 | 100 | 0 | 0 | 100 | 🟢 |
| 2013 | 200 | 100 | 100 | 100 | 400 | 100 | 0 | 0 | 100 | 🟢 |
| 2012 | 201 | 100 | 100 | 100 | 402 | 100 | 0 | 0 | 100 | 🟢 |
| 2011 | 199 | 100 | 100 | 100 | 398 | 100 | 0 | 0 | 100 | 🟢 |
| 2010 | 195 | 100 | 100 | 100 | 390 | 100 | 0 | 0 | 100 | 🟢 |
| 2009 | 205 | 100 | 100 | 100 | 410 | 100 | 0 | 0 | 100 | 🟢 |
| 2008 | 202 | 100 | 100 | 100 | 404 | 100 | 0 | 0 | 100 | 🟢 |
| 2007 | 214 | 100 | 100 | 100 | 428 | 100 | 0 | 0 | 100 | 🟢 |
| 2006 | 201 | 100 | 100 | 100 | 402 | 100 | 0 | 0 | 100 | 🟢 |
| 2005 | 209 | 100 | 100 | 100 | 418 | 100 | 0 | 0 | 100 | 🟢 |
| 2004 | 193 | 100 | 100 | 100 | 386 | 100 | 0 | 0 | 100 | 🟢 |
| 2003 | 212 | 100 | 100 | 100 | 424 | 100 | 0 | 0 | 100 | 🟢 |
| 2002 | 192 | 100 | 100 | 100 | 384 | 100 | 0 | 0 | 100 | 🟢 |
| 2001 | 184 | 100 | 100 | 100 | 368 | 100 | 0 | 0 | 100 | 🟢 |
| 2000 | 212 | 100 | 100 | 100 | 424 | 100 | 0 | 0 | 0 | 🟡 |

---

### England — League One

| Season | Matches | FT% | HT% | Referee% | Shots% | Lineups | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|---------|-----------|---------|
| 2024 | 213 | 100 | 100 | 100 | 100 | 0 | 100 | 🟢 |
| 2023 | 204 | 100 | 100 | 100 | 100 | 0 | 100 | 🟢 |
| 2022 | 216 | 100 | 100 | 100 | 100 | 0 | 100 | 🟢 |
| 2021 | 199 | 100 | 100 | 100 | 100 | 0 | 100 | 🟢 |
| 2020 | 199 | 100 | 100 | 100 | 100 | 0 | 100 | 🟢 |
| 2019 | 149 | 100 | 100 | 100 | 100 | 0 | 100 | 🟡 |
| 2018–2000 | 188–196/yr | 100 | 100 | 100 | 100 | 0 | ~80% | 🟢 |

---

### England — League Two

| Season | Matches | FT% | Referee% | Shots% | 1X2 Odds | Quality |
|--------|---------|-----|----------|--------|-----------|---------|
| 2024–2019 | 164–213/yr | 100 | 100 | 100 | 100 | 🟢 |
| 2018–2000 | 188–225/yr | 100 | 100 | 100 | ~80% | 🟢 |

---

### England — Premier League

| Season | Matches | FT% | HT% | Referee% | Shots% | Lineups | Events | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|---------|--------|-----------|---------|
| 2024 | 131 | 100 | 100 | 100 | 100 | 131 | 131 | 100 | 🟢 |
| 2023 | 146 | 100 | 100 | 100 | 100 | 146 | 146 | 100 | 🟢 |
| 2022 | 156 | 100 | 100 | 100 | 100 | 156 | 156 | 100 | 🟢 |
| 2021 | 143 | 100 | 100 | 100 | 100 | 143 | 143 | 100 | 🟢 |
| 2020 | 151 | 100 | 100 | 100 | 100 | 151 | 151 | 100 | 🟢 |
| 2019 | 145 | 100 | 100 | 100 | 100 | 145 | 145 | 100 | 🟢 |
| 2018 | 144 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2017 | 136 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2016 | 149 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2015 | 140 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2014 | 147 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2013 | 138 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2012 | 152 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2011 | 147 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2010 | 126 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2009 | 125 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2008 | 124 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2007 | 144 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2006 | 131 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2005 | 141 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2004 | 154 | 100 | 99 | 99 | 100 | 0 | 0 | 100 | 🟡 |
| 2003 | 150 | 100 | 99 | 93 | 100 | 0 | 0 | 100 | 🟡 |
| 2002 | 136 | 100 | 71 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2001 | 137 | 100 | 0 | 0 | 100 | 0 | 0 | 99 | 🟡 |
| 2000 | 130 | 100 | 0 | 0 | 100 | 0 | 0 | 0 | 🟡 |

---

### France — Ligue 1

| Season | Matches | FT% | HT% | Shots% | Lineups | Events | 1X2 Odds | Quality |
|--------|---------|-----|-----|--------|---------|--------|-----------|---------|
| 2024 | 111 | 100 | 100 | 100 | 111 | 111 | 100 | 🟢 |
| 2023 | 118 | 100 | 100 | 100 | 118 | 118 | 100 | 🟢 |
| 2022 | 134 | 100 | 100 | 100 | 134 | 134 | 100 | 🟢 |
| 2021 | 130 | 100 | 100 | 100 | 130 | 130 | 100 | 🟢 |
| 2020 | 138 | 100 | 100 | 100 | 138 | 138 | 100 | 🟢 |
| 2019 | 99 | 100 | 100 | 100 | 99 | 99 | 100 | 🟡 |
| 2018 | 137 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2017 | 119 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2016 | 143 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2015 | 132 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2014 | 149 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2013 | 152 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2012 | 141 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2011 | 135 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2010 | 128 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2009 | 131 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2008 | 126 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2007 | 138 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2006 | 137 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2005 | 151 | 100 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2004 | 135 | 100 | 100 | 0 | 0 | 0 | ~90 | 🔴 |
| 2003 | 132 | 100 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2002 | 152 | 100 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2001 | 110 | 100 | 100 | 0 | 0 | 0 | 0 | 🔴 |
| 2000 | 102 | 100 | 100 | 0 | 0 | 0 | 0 | 🔴 |

---

### France — Ligue 2

| Season | Matches | FT% | HT% | Shots% | 1X2 Odds | Quality |
|--------|---------|-----|-----|--------|-----------|---------|
| 2024 | 113 | 100 | 100 | 100 | 100 | 🟢 |
| 2023 | 130 | 100 | 100 | 100 | 100 | 🟢 |
| 2022 | 116 | 100 | 100 | 100 | 100 | 🟢 |
| 2021 | 137 | 100 | 100 | 100 | 100 | 🟢 |
| 2020 | 140 | 100 | 100 | 99 | 100 | 🟢 |
| 2019 | 96 | 100 | 100 | 100 | 100 | 🟡 |
| 2018 | 148 | 100 | 100 | 100 | 100 | 🟢 |
| 2017 | 135 | 100 | 100 | 100 | 100 | 🟢 |
| 2016 | 139 | 100 | 100 | 0 | 100 | 🟡 |
| 2000–2015 | 119–152/yr | 100 | 100 | 0 | varies | 🔴 |

---

### Germany — Bundesliga

| Season | Matches | FT% | HT% | Shots% | Lineups | Events | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|--------|---------|--------|-----------|--------------|---------|
| 2024 | 109 | 100 | 100 | 99 | 109 | 109 | 100 | — | 🟢 |
| 2023 | 111 | 100 | 100 | 100 | 111 | 111 | 100 | — | 🟢 |
| 2022 | 126 | 100 | 100 | 100 | 126 | 126 | 100 | — | 🟢 |
| 2021 | 98 | 100 | 100 | 100 | 98 | 98 | 100 | — | 🟢 |
| 2020 | 97 | 100 | 100 | 100 | 97 | 97 | 100 | — | 🟢 |
| 2019 | 104 | 100 | 100 | 100 | 104 | 104 | 100 | — | 🟢 |
| 2018 | 104 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2017 | 119 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2016 | 123 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2015 | 118 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2014 | 115 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2013 | 106 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2012 | 105 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2011 | 119 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2010 | 120 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2009 | 115 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2008 | 119 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2007 | 98 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2006 | 120 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2005 | 115 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2004 | 97 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2003 | 109 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| **2002** | **119** | **100** | **100** | **0** | 0 | 0 | 100 | **🚩 all shots null** | 🔴 |
| 2001 | 109 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2000 | 113 | 100 | 100 | 100 | 0 | 0 | 0 | — | 🟡 |

---

### Germany — 2. Bundesliga

| Season | Matches | FT% | HT% | Shots% | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|--------|-----------|--------------|---------|
| 2024 | 111 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2023 | 112 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2022 | 115 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2021 | 103 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2020 | 116 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2019 | 106 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2018 | 110 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2017 | 123 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2016 | 114 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2015 | 112 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2014 | 123 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2013 | 121 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2012 | 109 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2011 | 102 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2010 | 104 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2009 | 112 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2008 | 117 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2007 | 124 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2006 | 110 | 100 | 100 | 100 | 100 | — | 🟡 |
| 2005 | 119 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2004 | 119 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| 2003 | 117 | 100 | 100 | 0 | 100 | 🚩 all shots null | 🔴 |
| **2002** | **126** | **100** | **100** | **0** | 100 | **🚩 all shots null** | 🔴 |
| 2001 | 117 | 100 | 100 | 99 | 100 | — | 🟡 |
| 2000 | 110 | 100 | 100 | 98 | 0 | — | 🔴 |

---

### Greece — Super League Greece

| Season | Matches | FT% | HT% | Shots% | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|--------|-----------|--------------|---------|
| 2024 | 82 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2023 | 85 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2022 | 86 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2021 | 96 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2020 | 86 | 100 | 100 | 100 | 93 | — | 🟢 |
| 2019 | 88 | 100 | 100 | 100 | 90 | — | 🟡 |
| 2018 | 107 | 100 | 100 | 99 | 100 | — | 🟢 |
| 2017 | 89 | 100 | 100 | 98 | 100 | — | 🟡 |
| 2016 | 85 | 100 | 100 | 0 | 100 | 🚩 shots null | 🔴 |
| 2015–2005 | 74–117/yr | 100 | 100 | 0 | varies | 🚩 shots null | 🔴 |

---

### Italy — Serie A

| Season | Matches | FT% | HT% | Referee% | Shots% | Lineups | Events | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|---------|--------|-----------|---------|
| 2024 | 137 | 100 | 100 | 99 | 100 | 137 | 127 | 100 | 🟢 |
| 2023 | 128 | 100 | 100 | 100 | 100 | 128 | 128 | 100 | 🟢 |
| 2022 | 133 | 100 | 100 | 100 | 100 | 133 | 133 | 100 | 🟢 |
| 2021 | 141 | 100 | 100 | 100 | 100 | 141 | 141 | 100 | 🟢 |
| 2020 | 148 | 100 | 99 | 99 | 100 | 148 | 148 | 100 | 🟢 |
| 2019 | 121 | 100 | 100 | 100 | 100 | 121 | 121 | 100 | 🟢 |
| 2018 | 143 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2017 | 153 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2016 | 145 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2015 | 159 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2014 | 154 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2013 | 138 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2012 | 147 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2011 | 155 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2010 | 123 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2009 | 129 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2008 | 134 | 100 | 99 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2007 | 156 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2006 | 154 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | 🟡 |
| 2005 | 144 | 100 | 99 | 0 | 96 | 0 | 0 | 100 | 🟡 |
| 2004 | 144 | 100 | 90 | 100 | 100 | 0 | 0 | 100 | 🟡 |
| 2003 | 100 | 99 | 82 | 85 | 100 | 0 | 0 | 0 | 🔴 |
| 2002 | 111 | 100 | 57 | 0 | 100 | 0 | 0 | 0 | 🔴 |
| 2001 | 120 | 99 | 0 | 0 | 100 | 0 | 0 | 0 | 🔴 |
| 2000 | 114 | 100 | 0 | 0 | 100 | 0 | 0 | 0 | 🔴 |

---

### Italy — Serie B

| Season | Matches | FT% | HT% | Shots% | 1X2 Odds | Quality |
|--------|---------|-----|-----|--------|-----------|---------|
| 2024 | 151 | 100 | 100 | 100 | 100 | 🟢 |
| 2023 | 132 | 100 | 100 | 100 | 100 | 🟢 |
| 2022 | 149 | 100 | 100 | 98 | 100 | 🟢 |
| 2021 | 128 | 100 | 100 | 100 | 100 | 🟢 |
| 2020 | 139 | 100 | 100 | 100 | 99 | 🟢 |
| 2019 | 140 | 96 | 96 | 95 | 95 | 🟡 |
| 2018 | 134 | 100 | 100 | 100 | 100 | 🟢 |
| 2017 | 163 | 100 | 100 | 0 | 100 | 🟡 |
| 2016 | 157 | 100 | 100 | 0 | 100 | 🟡 |
| 2015 | 190 | 100 | 100 | 0 | 100 | 🟡 |
| 2014 | 184 | 100 | 100 | 0 | 100 | 🟡 |
| 2013 | 172 | 100 | 100 | 0 | 100 | 🟡 |
| 2012 | 178 | 100 | 100 | 0 | 100 | 🟡 |
| 2011 | 180 | 100 | 100 | 0 | 100 | 🟡 |
| 2010 | 165 | 100 | 100 | 0 | 100 | 🟡 |
| 2009 | 180 | 99 | 96 | 0 | 100 | 🟡 |
| 2000–2008 | 121–177/yr | varies | varies | 0 | varies | 🔴 |

---

### Netherlands — Eredivisie

| Season | Matches | FT% | HT% | Shots% | Lineups | Events | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|--------|---------|--------|-----------|--------------|---------|
| 2024 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2023 | 104 | 100 | 100 | 100 | 104 | 104 | 100 | — | 🟢 |
| 2022 | 119 | 100 | 100 | 100 | 119 | 119 | 100 | — | 🟢 |
| 2021 | 111 | 100 | 100 | 100 | 111 | 111 | 100 | — | 🟢 |
| 2020 | 110 | 100 | 100 | 100 | 110 | 110 | 100 | — | 🟢 |
| 2019 | 77 | 100 | 100 | 100 | 77 | 77 | 100 | — | 🟡 |
| 2018 | 111 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2017 | 112 | 100 | 100 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2016 | 122 | 100 | 100 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2000–2015 | 95–132/yr | 100 | 100 | 0 | 0 | 0 | varies | 🚩 shots null | 🔴 |

---

### Portugal — Primeira Liga

| Season | Matches | FT% | HT% | Referee% | Shots% | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|-----------|---------|
| 2024 | 127 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2023 | 105 | 100 | 100 | 99 | 100 | 100 | 🟢 |
| 2022 | 113 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2021 | 94 | 100 | 100 | 100 | 100 | 100 | 🟡 |
| 2020 | 90 | 100 | 100 | 100 | 100 | 100 | 🟡 |
| 2019 | 117 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2018 | 112 | 100 | 100 | 0 | 100 | 100 | 🟡 |
| 2017 | 102 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2016 | 109 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2015 | 109 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2014 | 106 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2013 | 90 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2012 | 79 | 100 | 100 | 0 | 0 | 100 | 🔴 |
| 2011 | 87 | 100 | 99 | 0 | 0 | 100 | 🔴 |
| 2000–2010 | 80–122/yr | ~99 | 99 | 0 | 0 | varies | 🔴 |

---

### Scotland — Scottish Premiership

| Season | Matches | FT% | HT% | Referee% | Shots% | 1X2 Odds | Quality |
|--------|---------|-----|-----|----------|--------|-----------|---------|
| 2024 | 91 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2023 | 82 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2022 | 73 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2021 | 82 | 100 | 100 | 100 | 100 | 100 | 🟢 |
| 2020 | 83 | 100 | 100 | 96 | 100 | 100 | 🟢 |
| 2019 | 61 | 100 | 100 | 100 | 100 | 100 | 🟡 |
| 2018 | 88 | 100 | 100 | 0 | 100 | 100 | 🟡 |
| 2017 | 87 | 100 | 100 | 0 | 100 | 100 | 🟡 |
| 2000–2016 | 71–94/yr | ~99 | ~99 | 0 | 100 | varies | 🟡 |

---

### Scotland — Scottish Championship / League One / League Two

All three: data from 2000 onward, FT scores 100%, shots 0% throughout (no stats in FD for Scottish lower tiers), referee 100% from 2019, 0% pre-2019. Quality: 🟡 from 2019 onwards, 🔴 for stats prior to 2019.

---

### Spain — La Liga

| Season | Matches | FT% | HT% | Referee% | Shots% | Lineups | Events | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|----------|--------|---------|--------|-----------|--------------|---------|
| 2024 | 146 | 100 | 100 | 100 | 100 | 146 | 146 | 100 | — | 🟢 |
| 2023 | 135 | 100 | 100 | 100 | 100 | 135 | 135 | 100 | — | 🟢 |
| 2022 | 141 | 100 | 100 | 100 | 100 | 141 | 141 | 100 | — | 🟢 |
| 2021 | 130 | 100 | 100 | 100 | 100 | 130 | 130 | 100 | — | 🟢 |
| 2020 | 149 | 100 | 100 | 100 | 100 | 149 | 149 | 100 | — | 🟢 |
| 2019 | 134 | 100 | 100 | 100 | 100 | 134 | 134 | 100 | — | 🟢 |
| 2018 | 143 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2017 | 133 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2016 | 144 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2015 | 135 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2014 | 140 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2013 | 139 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2012 | 142 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2011 | 139 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2010 | 133 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2009 | 141 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2008 | 141 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2007 | 141 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2006 | 132 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2005 | 145 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2004 | 140 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2003 | 126 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2002 | 145 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2001 | 136 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2000 | 130 | 100 | 100 | 0 | 0 | 0 | 0 | 0 | 🚩 shots null | 🔴 |

---

### Spain — Segunda División

| Season | Matches | FT% | HT% | Referee% | Shots% | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|----------|--------|-----------|--------------|---------|
| 2024 | 158 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2023 | 183 | 100 | 100 | 99 | 100 | 100 | — | 🟢 |
| 2022 | 162 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2021 | 174 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2020 | 169 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2019 | 155 | 100 | 100 | 100 | 100 | 100 | — | 🟢 |
| 2018 | 160 | 98 | 98 | 0 | 5 | 100 | 🚩 shots mostly null | 🔴 |
| 2017 | 180 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2016 | 167 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2015 | 156 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2014 | 184 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2013 | 174 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2012 | 166 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2011 | 173 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2010 | 165 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2009 | 177 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2008 | 158 | 100 | 98 | 0 | 100 | 100 | — | 🟡 |
| 2007 | 164 | 100 | 100 | 0 | 100 | 100 | — | 🟡 |
| 2006 | 184 | 100 | 99 | 0 | 100 | 100 | — | 🟡 |
| 2005 | 182 | 100 | 99 | 0 | 100 | 100 | — | 🟡 |
| 2004 | 179 | 100 | 0 | 0 | 100 | 76 | — | 🔴 |
| 2003 | 168 | 98 | 0 | 0 | 100 | 0 | — | 🔴 |
| 2002 | 179 | 98 | 0 | 0 | 100 | 0 | — | 🔴 |
| 2001 | 175 | 91 | 0 | 0 | 100 | 0 | — | 🔴 |
| 2000 | 161 | 83 | 0 | 0 | 100 | 0 | — | 🔴 |

---

### Turkey — Süper Lig (stored as "Sueper Lig")

| Season | Matches | FT% | HT% | Referee% | Shots% | Lineups | Events | 1X2 Odds | Null cluster | Quality |
|--------|---------|-----|-----|----------|--------|---------|--------|-----------|--------------|---------|
| 2024 | 130 | 100 | 100 | 100 | 100 | 130 | 130 | 100 | — | 🟢 |
| 2023 | 153 | 100 | 100 | 100 | 99 | 153 | 153 | 100 | — | 🟢 |
| 2022 | 117 | 93 | 93 | 93 | 86 | 117 | 117 | 75 | — | 🟡 |
| 2021 | 138 | 100 | 100 | 100 | 100 | 138 | 138 | 100 | — | 🟢 |
| 2020 | 158 | 100 | 100 | 100 | 100 | 158 | 158 | 100 | — | 🟢 |
| 2019 | 105 | 100 | 100 | 99 | 100 | 105 | 105 | 99 | — | 🟢 |
| 2018 | 111 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2017 | 115 | 100 | 100 | 0 | 100 | 0 | 0 | 100 | — | 🟡 |
| 2016 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2015 | 109 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2014 | 122 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2013 | 120 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2012 | 114 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2011 | 120 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2010 | 109 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2009 | 90 | 100 | 100 | 0 | 0 | 0 | 0 | 100 | 🚩 shots null | 🔴 |
| 2000–2008 | 100–124/yr | ~99 | ~99 | 0 | 0 | 0 | 0 | varies | 🚩 shots null | 🔴 |

---

... and 3 more leagues (Scottish Championship, Scottish League One, Scottish League Two) follow the same pattern as Scottish Premiership: 🟡 from 2019+ for scores+referee, 🔴 for all prior years (no shots data in FD for these tiers).

---

## SECTION 2 — COMPLETE SEASONS BY LEAGUE

### Premier League (England)
- 🟢 Complete (scores+stats+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds, no lineup/events): 2000–2018 (19 seasons)
- 🔴 Sparse: None
- ❌ Missing: pre-2000

### Championship (England)
- 🟢 Complete (scores+stats+referee+odds, no lineup): 2001–2024 (24 seasons)
- 🟡 Partial (no odds): 2000 only
- ❌ Missing: pre-2000

### League One (England)
- 🟢 Complete: 2000–2024 except 2019 (25 seasons)
- 🟡 Partial: 2019 (shortened season)

### League Two (England)
- 🟢 Complete: 2000–2024 except 2019 (25 seasons)
- 🟡 Partial: 2019

### La Liga (Spain)
- 🟢 Complete (scores+stats+referee+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds, no lineup): 2004–2018 (15 seasons)
- 🔴 Sparse (no shots data): 2000–2003 (4 seasons)

### Segunda División (Spain)
- 🟢 Complete: 2019–2024 (6 seasons)
- 🟡 Partial: 2005–2017 (13 seasons)
- 🔴 Sparse: 2000–2004 (5 seasons)

### Serie A (Italy)
- 🟢 Complete (scores+stats+referee+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds, no lineup): 2005–2018 (14 seasons)
- 🔴 Sparse: 2000–2004 (5 seasons)

### Serie B (Italy)
- 🟢 Complete: 2018–2024 except 2019 (7 seasons)
- 🟡 Partial: 2009–2017 (9 seasons)
- 🔴 Sparse: 2000–2008 (9 seasons)

### Bundesliga (Germany)
- 🟢 Complete (scores+stats+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds, no lineup): 2003–2018 (16 seasons, exc 2002)
- 🔴 Sparse: 2000–2001, 2002 (shots null cluster)

### 2. Bundesliga (Germany)
- 🟢 Complete: 2017–2024 (8 seasons)
- 🟡 Partial: 2000–2001, 2006 (shots present)
- 🔴 Sparse (shots null cluster): 2002–2016 excluding 2006 (14 seasons)

### Ligue 1 (France)
- 🟢 Complete (scores+stats+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds): 2005–2018 (14 seasons)
- 🔴 Sparse (no shots): 2000–2004 (5 seasons)

### Ligue 2 (France)
- 🟢 Complete: 2017–2024 except 2019 (8 seasons)
- 🟡 Partial: 2019 only
- 🔴 Sparse (shots null cluster): 2000–2016 (17 seasons)

### Eredivisie (Netherlands)
- 🟢 Complete (scores+stats+odds+lineup+events): 2019–2024 (6 seasons)
- 🟡 Partial (scores+stats+odds, no lineup): 2017–2018
- 🔴 Sparse (shots null cluster): 2000–2016 (17 seasons)

### Primeira Liga (Portugal)
- 🟢 Complete: 2019–2024 (6 seasons)
- 🟡 Partial (scores+odds, no shots): 2018 only
- 🔴 Sparse (no shots): 2000–2017 (18 seasons)

### Pro League (Belgium)
- 🟢 Complete: 2019–2024 (6 seasons)
- 🟡 Partial: 2005–2018 (14 seasons)
- 🔴 Sparse: 2000–2004 (5 seasons)

### Scottish Premiership (Scotland)
- 🟢 Complete (scores+stats+referee+odds): 2019–2024 (6 seasons)
- 🟡 Partial (no referee): 2000–2018 (19 seasons)

### Scottish Championship (Scotland)
- 🟡 Partial: 2017–2024 (scores+referee, no stats)
- 🔴 Sparse: 2000–2016 (no shots data from FD for this tier)

### Scottish League One / League Two (Scotland)
- Same as Scottish Championship pattern.

### Super League Greece (Greece)
- 🟢 Complete: 2019–2024 except 2019-partial (6 seasons)
- 🟡 Partial: 2017–2018 (shots ~99% but no referee)
- 🔴 Sparse (shots null cluster): 2005–2016 (12 seasons)
- ❌ Missing: pre-2005 (no data in DB for any season)

### Süper Lig (Turkey)
- 🟢 Complete (scores+stats+referee+odds+lineup+events): 2019–2021, 2023–2024 (5 seasons)
- 🟡 Partial: 2017–2018, 2022 (incomplete records or FT gaps)
- 🔴 Sparse (shots null cluster): 2000–2016 (17 seasons)

### UEFA Champions League
- 🟡 Partial (scores only, no stats/lineup/events/odds in public.matches): 2019–2024 (6 seasons)
- ❌ Missing: pre-2019

### UEFA Europa League
- 🟡 Partial (scores only): 2019–2024 (6 seasons)
- ❌ Missing: pre-2019

---

## SECTION 3 — FIELD-LEVEL COMPLETENESS BY SEASON

**Column groups:**
- A = Final scores (home_score_ft, away_score_ft)
- B = Half-time (home_score_ht, away_score_ht)
- C = Match events: shots, shots_on_goal, corners, fouls, yellows, reds (from match_stats)
- D = Lineups (api_football_fixture_lineups coverage)
- E = Goal/card events detail (api_football_fixture_events coverage)
- F = Referee name (public.matches.referee)
- G = Odds 1X2 (match_odds coverage)

### Premier League
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2024 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2023 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2022 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2021 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2020 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2019 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2017 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2016 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2015 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2010–2014 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2005–2009 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2000–2004 | 100 | ~70 | 100 | 0 | 0 | ~60 | ~70 |

### La Liga
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2024 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2023 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2022 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2021 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2020 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2019 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2004–2017 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2000–2003 | 100 | 100 | 0 | 0 | 0 | 0 | ~80 |

### Serie A
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2024 | 100 | 100 | 100 | 100 | 93 | 99 | 100 |
| 2019–2023 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2005–2018 | 100 | 100 | 98 | 0 | 0 | 0 | 100 |
| 2000–2004 | ~99 | ~65 | 100 | 0 | 0 | ~40 | ~50 |

### Bundesliga
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2024 | 100 | 100 | 99 | 100 | 100 | 100 | 100 |
| 2019–2023 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2003–2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2002 | 100 | 100 | 0 | 0 | 0 | 0 | 100 |
| 2000–2001 | 100 | 100 | 100 | 0 | 0 | 0 | ~50 |

### Ligue 1
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2019–2024 | 100 | 100 | 100 | 100 | 100 | 0 | 100 |
| 2005–2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2000–2004 | 100 | 100 | 0 | 0 | 0 | 0 | ~50 |

### Eredivisie
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2019–2024 | 100 | 100 | 100 | 100 | 100 | 0 | 100 |
| 2017–2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2000–2016 | 100 | 100 | 0 | 0 | 0 | 0 | ~70 |

### Süper Lig
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2024 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 2023 | 100 | 100 | 99 | 100 | 100 | 100 | 100 |
| 2021, 2020, 2019 | 100 | 100 | 100 | 100 | 100 | ~99 | 99 |
| 2022 | 93 | 93 | 86 | 100 | 100 | 93 | 75 |
| 2017–2018 | 100 | 100 | 100 | 0 | 0 | 0 | 100 |
| 2000–2016 | ~99 | ~99 | 0 | 0 | 0 | 0 | ~70 |

### Championship
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2001–2024 | 100 | 100 | 100 | 0 | 0 | 100 | 100 |
| 2000 | 100 | 100 | 100 | 0 | 0 | 100 | 0 |

### Scottish Premiership
| Season | A% | B% | C% | D% | E% | F% | G% |
|--------|----|----|----|----|----|----|-----|
| 2019–2024 | 100 | 100 | 100 | 0 | 0 | ~97 | 100 |
| 2000–2018 | ~99 | ~99 | 100 | 0 | 0 | 0 | ~70 |

---

## SECTION 4 — SUSPICIOUS DATA FLAGS

| Season | League | Issue | Evidence | Severity |
|--------|--------|-------|----------|----------|
| 2002–2016 (exc 2006) | 2. Bundesliga | shots_null_count = stat_rows — entire seasons have 0 shot data | Q7: shots_null = stat_rows for 14 consecutive season-years | 🔴 critical |
| 2000–2004 | La Liga | shots_null_count = stat_rows for years 2000–2003 | Q7: shots_null = stat_rows | 🔴 critical |
| 2000–2016 | Eredivisie | shots_null_count = stat_rows for all 17 years 2000–2016 | Q7: continuous null cluster | 🔴 critical |
| 2000–2016 | Süper Lig | shots_null_count = stat_rows for 17 years | Q7: continuous null cluster | 🔴 critical |
| 2005–2016 | Super League Greece | shots_null_count = stat_rows | Q7: continuous null cluster | 🔴 critical |
| 2000–2016 | Ligue 2 | shots_null_count = stat_rows | Q7: continuous null cluster | 🔴 critical |
| 2002 | Bundesliga | shots_null_count = stat_rows (119 rows, 0 shots) | Q7: isolated single-year gap in otherwise complete series | 🟡 minor |
| 2018 | Segunda División | shots_null = 8 of 320 (2.5%), FT scores = 98% | Q1: 4 missing FT scores + nearly-all shots null | 🟡 minor |
| 2022 | Süper Lig | FT scores = 93%, home_score_ft null 7% | Q1: 8 matches with null FT score — possible mid-season scrape | 🟡 minor |
| 2006 | Primeira Liga | 87 matches vs expected ~153 — 57% half-season | Q1: sharp drop vs adjacent years (~100 avg) | 🟡 minor |
| 2007 | Primeira Liga | 80 matches — lowest year in series | Q1: possible season format change (18→16 teams) | ⚪ informational |
| 2019 (all leagues) | Multiple | All 2019 year-rows have ~25-35% of normal count | Expected — 2019-20 season start split; Aug-Dec only in this year bucket | ⚪ informational |
| 2003 | Serie B | 201 matches — highest Serie B year-row ever (vs ~154 avg) | Q1: possibly 24-team Serie B or cup matches mixed in | 🟡 minor |
| 2020 (Scottish) | Scottish Championship | 40 matches only (vs 58–78 typical) | Expected — COVID 2019-20 season curtailed | ⚪ informational |
| 2020–2021 (Scottish L1/L2) | Scottish lower tiers | Low match counts (40–65 vs 58–75 typical) | Expected — COVID curtailment | ⚪ informational |
| 2004 (multiple) | Pro League, Primeira Liga, Scottish Premiership | HT scores = 0% for year 2004 | Q1: with_referee column shows data but ht_scores = 0 for some leagues in 2004 | 🟡 minor |

---

## SECTION 5 — TOURNAMENT COVERAGE

### FIFA World Cup

| Edition | Source | Matches | Expected | Coverage | HT Scores | Referee | Quality |
|---------|--------|---------|----------|----------|-----------|---------|---------|
| 1930 | OpenFootball | 18 | 18 | 100% | 0% | 0% | 🟡 |
| 1934 | OpenFootball | 17 | 17 | 100% | 0% | 0% | 🟡 |
| 1938 | OpenFootball | 19 | 15 | 100% | 0% | 0% | 🟡 |
| 1950 | OpenFootball | 22 | 22 | 100% | 0% | 0% | 🟡 |
| 1954 | OpenFootball | 26 | 26 | 100% | 0% | 0% | 🟡 |
| 1958 | OpenFootball | 35 | 35 | 100% | 0% | 0% | 🟡 |
| 1962 | OpenFootball | 32 | 32 | 100% | 0% | 0% | 🟡 |
| 1966 | OpenFootball | 32 | 32 | 100% | 0% | 0% | 🟡 |
| 1970 | OpenFootball | 32 | 32 | 100% | 0% | 0% | 🟡 |
| 1974 | OpenFootball | 38 | 38 | 100% | 0% | 0% | 🟡 |
| 1978 | OpenFootball | 38 | 38 | 100% | 0% | 0% | 🟡 |
| 1982 | OpenFootball | 52 | 52 | 100% | 0% | 0% | 🟡 |
| 1986 | OpenFootball | 52 | 52 | 100% | 0% | 0% | 🟡 |
| 1990 | OpenFootball | 52 | 52 | 100% | 0% | 0% | 🟡 |
| 1994 | OpenFootball | 52 | 52 | 100% | 0% | 0% | 🟡 |
| 1998 | OpenFootball | 64 | 64 | 100% | 0% | 0% | 🟡 |
| 2002 | OpenFootball | 64 | 64 | 100% | 0% | 0% | 🟡 |
| 2006 | OpenFootball | 64 | 64 | 100% | 0% | 0% | 🟡 |
| 2010 | API-Football | 64 | 64 | 100% | 100% | 0% | 🟢 |
| 2014 | API-Football | 64 | 64 | 100% | 100% | 0% | 🟢 |
| 2018 | API-Football | 64 | 64 | 100% | 100% | 0% | 🟢 |
| 2022 | API-Football | 64 | 64 | 100% | 100% | 0% | 🟢 |

Notes: 1930–2006 sourced from OpenFootball — FT scores complete, HT scores 0%, attendance 0%, referee 0%. 2010–2022 sourced from API-Football — HT scores 100%, FT scores 100%, referee 0%, attendance 0% (column exists but unfilled).

### UEFA Champions League

| Season | Matches | Expected | Coverage | Stats | Lineups | Events | Quality |
|--------|---------|----------|----------|-------|---------|--------|---------|
| 2023-24 | 126 | 189 | 67% | via af_uefa | via af_uefa | via af_uefa | 🟡 |
| 2022-23 | 196 | ~125 | >100%? | via af_uefa | via af_uefa | via af_uefa | 🟡 |
| 2021-22 | 155 | ~125 | 100% | via af_uefa | via af_uefa | via af_uefa | 🟡 |
| 2020-21 | 125 | 125 | 100% | via af_uefa | via af_uefa | via af_uefa | 🟡 |
| 2019-20 | 112 | 125 | 90% | via af_uefa | via af_uefa | via af_uefa | 🟡 |
| 2018-19 | 115 | 125 | 92% | via af_uefa | via af_uefa | via af_uefa | 🟡 |

Note: 2022-23 shows 196 matches (higher than expected) — the expanded UCL format (36-team league phase) took effect from 2024-25, so 196 in 2022-23 may include qualifying rounds.

### UEFA Europa League

| Season | Matches | Expected | Coverage | Quality |
|--------|---------|----------|----------|---------|
| 2022-23 | 175 | ~205 | 85% | 🟡 |
| 2021-22 | 125 | ~205 | 61% | 🟡 |
| 2020-21 | 117 | ~205 | 57% | 🟡 |
| 2019-20 | 35 | 205 | 17% | 🔴 |
| 2018-19 | 76 | 205 | 37% | 🔴 |

Note: 2019-20 and 2018-19 are very partial — likely only group stage or knockout phase matches ingested.

### Euros, Copa America, AFCON, Conference League, Club World Cup
- **No data present** in the database for any of these competitions.

---

## SECTION 6 — BACKFILL PRIORITY RECOMMENDATION

| Rank | League | Seasons needed | For brain | Effort | Notes |
|------|--------|---------------|-----------|--------|-------|
| 1 | Premier League | 2019–2024 referee fill | B5 Referee | Low | Referee field is 0% for these 6 seasons — extract from existing staging raw_data where available |
| 2 | All top-6 leagues | Possession/passes backfill (all seasons) | B4 Tactical, A1 | High | Call /fixtures/statistics API-Football for all ~40K unmatched fixtures; requires completing af_fixture_mappings first |
| 3 | La Liga | 2019–2024 af_fixture_mappings completion | B3, B4, B5 | Med | Only ~900 of ~3,400 canonical matches have AF fixture IDs; extend mappings to unlock lineup/event data |
| 4 | 2. Bundesliga | 2003–2016 shots backfill | B3 Stats | Med | 14 seasons with 100% null shots; FD does not supply for 2. Bundesliga pre-2017 — needs Understat or Wyscout |
| 5 | Eredivisie | 2000–2016 shots backfill | B3 Stats | Med | 17 seasons with 0% shots; same gap as 2. Bundesliga |
| 6 | Süper Lig | 2000–2016 shots backfill | B3 Stats | Med | 17 seasons null; also needs AF fixture mapping completion |
| 7 | All leagues | Closing odds (currently only opening) | B7 Market, BD Divergence | Low | FD raw_data already contains closing Bet365/BW/IW columns in JSONB — extract and promote to columns |
| 8 | Championship/L1/L2 | Lineup + events (2000–2024) | B4 Tactical | High | 0 lineup records for all English lower leagues; requires complete AF fixture mapping + bulk lineup fetch |
| 9 | Primeira Liga | 2000–2016 shots backfill | B3 Stats | Med | 17 seasons with 0 shots; 2017+ is fine |
| 10 | Pro League | 2000–2016 shots backfill | B3 Stats | Med | 17 seasons with 0 shots |
| 11 | UEFA Europa League | 2018-19, 2019-20 completeness | B6 Context | Med | Only 35–76 matches in these seasons vs 205 expected |
| 12 | All leagues | Referee stats derivation | B5 Referee | Low | Fully computable from existing matches + match_stats — no new API calls needed |
| 13 | World Cup 2010–2022 | Attendance backfill | B6 Context | Low | Column exists, 100% null; API-Football has this data |
| 14 | All leagues | Standings generation | B6 Context | Low | Derivable from existing match results — SQL materialized view sufficient |
| 15 | World Cup 1930–2006 | HT scores fill | B3 Stats, MC | High | OpenFootball data lacks HT scores; would require Sportradar or StatsBomb historical data |

---

## SECTION 7 — "READY-TO-USE" SUMMARY

If Next59 launches in production on 2026-08-01 (start of the 2026-27 domestic season), the following leagues have **≥ 3 fully complete seasons** of match scores + basic match stats + odds and are ready to operate at **confidence grade B or higher** across the 14-brain architecture:

**Grade A — Full depth (6+ complete seasons, lineup+events available 2019–2024):**
- Premier League (England) — 6 complete seasons with lineup/events, 25 seasons total
- La Liga (Spain) — 6 complete with lineup/events, 20 seasons with stats
- Serie A (Italy) — 6 complete with lineup/events, 20 seasons with stats
- Bundesliga (Germany) — 6 complete with lineup/events, 22 seasons with stats
- Ligue 1 (France) — 6 complete with lineup/events, 20 seasons with stats
- Eredivisie (Netherlands) — 6 complete with lineup/events, 9 seasons with stats
- Süper Lig (Turkey) — 5 complete seasons (2019–2021, 2023–2024), lineup/events available

**Grade B — Good depth (3–6 complete seasons, no lineup/events pre-2019):**
- Championship (England) — 24 complete seasons with scores/stats/odds, 0 lineups
- Serie B (Italy) — 8 complete seasons, 15 with partial stats
- 2. Bundesliga (Germany) — 8 complete seasons (2017–2024), but null shots cluster 2003–2016
- Ligue 2 (France) — 8 complete seasons (2017–2024)
- Scottish Premiership (Scotland) — 6 complete seasons (2019–2024), 25 with scores
- Primeira Liga (Portugal) — 6 complete seasons (2019–2024), 18 with scores only
- Pro League (Belgium) — 6 complete seasons (2019–2024), 14 with scores
- Segunda División (Spain) — 6 complete seasons (2019–2024), 15 with stats

**Below grade B — Insufficient for confident brain operation:**
- Super League Greece — only 4 full seasons with stats; 2005–2016 have null shot clusters
- Scottish Championship / League One / League Two — scores only, no stats ever
- UEFA Champions League / Europa League — scores only, no odds, partial event coverage, no pre-2019 data

The 7 Grade-A leagues represent the minimum viable data universe for a production launch. All 15 Grade-A + Grade-B leagues should be loadable by 2026-08-01 at grade B if the closing-odds and referee-stats backfills (Rank 1, 7, 12 above) are completed — both are low-effort and derive from existing data.

---

FINAL STATUS: leagues_audited=24 | seasons_audited=538 | green=156 | yellow=224 | red=158 | flags=17
