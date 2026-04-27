/**
 * check-fd-mappings.ts
 *
 * Read-only diagnostic: compares team names in staging_football_data_uk_raw
 * against the teams and provider_mappings tables.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=ey... npx tsx scripts/check-fd-mappings.ts
 *
 * Requires service_role key because staging + provider_mappings have
 * restricted RLS. The script performs ZERO writes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  } catch { /* .env optional */ }
  return env;
}

const fileEnv = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || fileEnv.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '\n  Missing credentials.\n' +
    '  Run with: SUPABASE_SERVICE_ROLE_KEY=ey... npx tsx scripts/check-fd-mappings.ts\n' +
    '  SUPABASE_URL is read from .env (VITE_SUPABASE_URL).\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (no SDK needed)
// ---------------------------------------------------------------------------

async function supabaseGet<T>(
  table: string,
  select: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', select);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase GET ${table} failed (${res.status}): ${body}`);
  }

  return (await res.json()) as T[];
}

async function supabaseRpc<T>(fnName: string, body: Record<string, unknown> = {}): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${fnName} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
    .replace(/İ/gi, 'i').replace(/Ş/g, 's').replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/Ö/g, 'o').replace(/Ç/g, 'c');
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Levenshtein ratio
  const len = Math.max(na.length, nb.length);
  if (len === 0) return 1.0;
  const dist = levenshtein(na, nb);
  return 1 - dist / len;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface StagingRow { home_team: string; away_team: string }
interface TeamRow { id: string; name: string; short_name: string | null; tla: string | null }
interface MappingRow {
  provider_entity_name: string;
  internal_entity_id: string;
  provider_name: string;
}

async function main() {
  console.log('\n=== football-data.co.uk Staging --> Teams Mapping Check ===\n');

  // 1. Fetch distinct team names from staging
  console.log('Fetching staging team names...');
  const stagingHome = await supabaseGet<StagingRow>(
    'staging_football_data_uk_raw',
    'home_team',
    { 'league_code': 'eq.T1', 'order': 'home_team', 'limit': '10000' },
  );
  const stagingAway = await supabaseGet<StagingRow>(
    'staging_football_data_uk_raw',
    'away_team',
    { 'league_code': 'eq.T1', 'order': 'away_team', 'limit': '10000' },
  );

  const stagingNames = new Set<string>();
  for (const r of stagingHome) if (r.home_team) stagingNames.add(r.home_team.trim());
  for (const r of stagingAway) if (r.away_team) stagingNames.add(r.away_team.trim());

  console.log(`  Distinct staging team names: ${stagingNames.size}\n`);

  // 2. Fetch all teams from teams table
  console.log('Fetching teams table...');
  const teams = await supabaseGet<TeamRow>(
    'teams',
    'id,name,short_name,tla',
    { 'limit': '1000' },
  );
  console.log(`  Teams in DB: ${teams.length}`);

  // 3. Fetch provider_mappings for football-data.co.uk
  console.log('Fetching provider_mappings...');
  const mappings = await supabaseGet<MappingRow>(
    'provider_mappings',
    'provider_entity_name,internal_entity_id,provider_name',
    { 'entity_type': 'eq.team', 'limit': '5000' },
  );
  console.log(`  Provider mappings (team): ${mappings.length}\n`);

  // 4. Build lookup structures
  const teamById = new Map<string, TeamRow>();
  const teamByNormName = new Map<string, TeamRow>();
  for (const t of teams) {
    teamById.set(t.id, t);
    teamByNormName.set(normalize(t.name), t);
    if (t.short_name) teamByNormName.set(normalize(t.short_name), t);
    if (t.tla) teamByNormName.set(normalize(t.tla), t);
  }

  const mappingByNormName = new Map<string, MappingRow>();
  for (const m of mappings) {
    if (m.provider_entity_name) {
      mappingByNormName.set(normalize(m.provider_entity_name), m);
    }
  }

  // 5. Classify each staging name
  const matched: { staging: string; dbName: string; method: string }[] = [];
  const fuzzyMatch: { staging: string; dbName: string; score: number }[] = [];
  const unmapped: string[] = [];

  for (const stagingName of [...stagingNames].sort()) {
    const norm = normalize(stagingName);

    // Exact match on teams table (name, short_name, tla)
    if (teamByNormName.has(norm)) {
      matched.push({
        staging: stagingName,
        dbName: teamByNormName.get(norm)!.name,
        method: 'exact (teams table)',
      });
      continue;
    }

    // Exact match on provider_mappings
    if (mappingByNormName.has(norm)) {
      const pm = mappingByNormName.get(norm)!;
      const dbTeam = teamById.get(pm.internal_entity_id);
      matched.push({
        staging: stagingName,
        dbName: dbTeam?.name ?? pm.internal_entity_id,
        method: `exact (provider_mappings / ${pm.provider_name})`,
      });
      continue;
    }

    // Fuzzy match: find best candidate
    let bestScore = 0;
    let bestTeam: TeamRow | null = null;
    for (const t of teams) {
      const s = similarity(stagingName, t.name);
      if (s > bestScore) {
        bestScore = s;
        bestTeam = t;
      }
      if (t.short_name) {
        const s2 = similarity(stagingName, t.short_name);
        if (s2 > bestScore) {
          bestScore = s2;
          bestTeam = t;
        }
      }
    }

    if (bestScore >= 0.80 && bestTeam) {
      fuzzyMatch.push({
        staging: stagingName,
        dbName: bestTeam.name,
        score: Math.round(bestScore * 100),
      });
    } else {
      unmapped.push(stagingName);
    }
  }

  // 6. Print report
  console.log('─'.repeat(72));
  console.log(`  EXACT MATCHES: ${matched.length}`);
  console.log('─'.repeat(72));
  for (const m of matched) {
    const marker = m.staging === m.dbName ? ' ' : '*';
    console.log(`  ${marker} "${m.staging}" --> "${m.dbName}"  [${m.method}]`);
  }

  if (fuzzyMatch.length > 0) {
    console.log('\n' + '─'.repeat(72));
    console.log(`  FUZZY MATCHES (>=80% similarity, need manual verification): ${fuzzyMatch.length}`);
    console.log('─'.repeat(72));
    for (const f of fuzzyMatch) {
      console.log(`  ? "${f.staging}" --> "${f.dbName}"  [${f.score}% match]`);
    }
  }

  if (unmapped.length > 0) {
    console.log('\n' + '─'.repeat(72));
    console.log(`  UNMAPPED TEAMS (no match found): ${unmapped.length}`);
    console.log('─'.repeat(72));
    for (const u of unmapped) {
      // Show closest candidate even if below threshold
      let bestScore = 0;
      let bestName = '';
      for (const t of teams) {
        const s = similarity(u, t.name);
        if (s > bestScore) { bestScore = s; bestName = t.name; }
      }
      const hint = bestScore > 0.4 ? `  (closest: "${bestName}" at ${Math.round(bestScore * 100)}%)` : '';
      console.log(`  X "${u}"${hint}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Total distinct staging names:  ${stagingNames.size}`);
  console.log(`  Exact matches:                 ${matched.length}`);
  console.log(`  Fuzzy matches (need review):   ${fuzzyMatch.length}`);
  console.log(`  Unmapped (no match):           ${unmapped.length}`);
  console.log(`  Coverage:                      ${((matched.length / stagingNames.size) * 100).toFixed(1)}% exact, ${(((matched.length + fuzzyMatch.length) / stagingNames.size) * 100).toFixed(1)}% total`);
  console.log('='.repeat(72));

  if (unmapped.length === 0 && fuzzyMatch.length === 0) {
    console.log('\n  All staging team names have exact matches. Ready for transform.\n');
  } else {
    console.log(
      `\n  ACTION REQUIRED: ${unmapped.length + fuzzyMatch.length} team(s) need mapping entries` +
      '\n  before staging-to-final transform can run safely.\n' +
      '  Next step: create provider_mappings rows for unmapped teams,\n' +
      '  or add a name alias table.\n',
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
