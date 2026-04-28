// Global fetch override (Node.js 24 sorunu)
import nodeFetch from 'node-fetch';
// @ts-ignore
global.fetch = nodeFetch;
// @ts-ignore
global.Request = nodeFetch.Request;
// @ts-ignore
global.Response = nodeFetch.Response;
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// ============================================
// SUPABASE CONFIG — DOĞRUDAN EMBED
// ============================================
const SUPABASE_URL = 'https://jsordrrshzivxayryryi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5aSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0.CIiKagCt1nJD74I3LR3MUym-MYSIrPyjHEz5VxylaN4';

const BATCH_SIZE = 10;
const DELAY_FILES = 2000;
const DELAY_BATCHES = 10000;

interface LeagueConfig {
  code: string;
  name: string;
  seasons: number[];
}

const LEAGUES: LeagueConfig[] = [
  { code: 'E0',  name: 'Premier League',       seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'E1',  name: 'Championship',         seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'E2',  name: 'League One',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'E3',  name: 'League Two',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SC0', name: 'Scottish Premiership', seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SC1', name: 'Scottish Championship',seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SC2', name: 'Scottish League One',  seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SC3', name: 'Scottish League Two',  seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'D1',  name: 'Bundesliga',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'D2',  name: '2. Bundesliga',        seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'I1',  name: 'Serie A',              seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'I2',  name: 'Serie B',              seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SP1', name: 'La Liga',              seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'SP2', name: 'Segunda Division',     seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'F1',  name: 'Ligue 1',              seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'F2',  name: 'Ligue 2',              seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'N1',  name: 'Eredivisie',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'B1',  name: 'Pro League',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'P1',  name: 'Primeira Liga',        seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'T1',  name: 'Sueper Lig',           seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
  { code: 'G1',  name: 'Super League Greece',  seasons: Array.from({length: 25}, (_, i) => 2000 + i) },
];

const TOTAL_FILES = LEAGUES.reduce((acc, l) => acc + l.seasons.length, 0);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function seasonToLabel(year: number): string {
  const y2 = year % 100;
  const next = (y2 + 1) % 100;
  return String(y2).padStart(2, '0') + String(next).padStart(2, '0');
}

function buildCsvUrl(code: string, year: number): string {
  return `https://www.football-data.co.uk/mmz4281/${seasonToLabel(year)}/${code}.csv`;
}

function matchId(code: string, sl: string, date: string, home: string, away: string): string {
  return `${code}|${sl}|${date}|${home}|${away}`;
}

interface CsvRow {
  [key: string]: string;
}

async function fetchCsv(url: string): Promise<CsvRow[] | null> {
  try {
    console.log(`  Fetching: ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      if (res.status === 404) { console.log('  404 - dosya yok'); return null; }
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.trim().length < 100) { console.log('  Bos dosya'); return null; }
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
    console.log(`  ${records.length} satir`);
    return records;
  } catch (err) {
    console.error(`  Hata: ${err instanceof Error ? err.message : '?'}`);
    return null;
  }
}

async function insertBatch(supabase: SupabaseClient, records: CsvRow[], code: string, sl: string, file: string) {
  let inserted = 0;
  let errors = 0;
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const rows = batch.map(row => {
      const home = row['HomeTeam'] || row['Home'] || null;
      const away = row['AwayTeam'] || row['Away'] || null;
      const dateRaw = row['Date'] || null;
      let matchDate: string | null = null;
      if (dateRaw) {
        if (dateRaw.includes('/')) {
          const [d, m, y] = dateRaw.split('/');
          const fy = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y;
          matchDate = `${fy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else if (dateRaw.includes('-')) matchDate = dateRaw;
      }
      return {
        source_file: file, league_code: code, season_code: sl,
        row_hash: `${file}|${JSON.stringify(row)}`,
        deterministic_source_match_id: matchId(code, sl, dateRaw || '', home || '', away || ''),
        match_date: matchDate, home_team: home, away_team: away,
        home_score: row['FTHG'] ? parseInt(row['FTHG']) : null,
        away_score: row['FTAG'] ? parseInt(row['FTAG']) : null,
        referee: row['Referee'] || null,
        raw_data: row as Record<string, unknown>,
      };
    });
    const { error } = await supabase.from('staging_football_data_uk_raw').upsert(rows, {
      onConflict: 'deterministic_source_match_id', ignoreDuplicates: true
    });
    if (error) { console.error(`  Insert hata: ${error.message}`); errors += batch.length; }
    else inserted += batch.length;
  }
  return { inserted, errors };
}

async function main() {
  console.log(`\nNEXT59 CSV IMPORTER | ${TOTAL_FILES} dosya\n`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
  const { error: e } = await supabase.from('countries').select('count').limit(1);
  if (e) { console.error('Supabase hata:', e.message); process.exit(1); }
  console.log('Supabase OK\n');

  const { data: src } = await supabase.from('data_sources').select('id').eq('name', 'football-data.co.uk').single();
  if (!src) { console.error('Seed data eksik!'); process.exit(1); }
  const sourceId = src.id;

  let totalInserted = 0;
  let processed = 0;
  const t0 = Date.now();

  for (const league of LEAGUES) {
    for (const year of league.seasons) {
      processed++;
      const sl = seasonToLabel(year);
      console.log(`[${processed}/${TOTAL_FILES}] ${league.name} ${year}-${year + 1}`);
      const records = await fetchCsv(buildCsvUrl(league.code, year));
      if (!records || records.length === 0) { console.log('  Atlandi\n'); continue; }

      const { data: run } = await supabase.from('ingestion_runs').insert({
        source_id: sourceId, run_type: 'historical_csv',
        target_league_code: league.code, target_season: year, status: 'running',
      }).select('id').single();

      const r = await insertBatch(supabase, records, league.code, sl, `${league.code}_${sl}.csv`);
      totalInserted += r.inserted;
      console.log(`  ${r.inserted}/${records.length} satir staging'e\n`);

      if (run) {
        await supabase.from('ingestion_runs').update({
          status: r.errors > 0 ? 'partial_error' : 'success',
          records_found: records.length, records_inserted: r.inserted,
          completed_at: new Date().toISOString(),
        }).eq('id', run.id);
      }
      await sleep(DELAY_FILES);
      if (processed % BATCH_SIZE === 0) {
        const mins = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`--- BATCH (${processed}) | ${totalInserted} satir | ${mins}dk ---\n`);
        await sleep(DELAY_BATCHES);
      }
    }
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== BITTI: ${totalInserted} satir | ${mins} dk ===\n`);
}

main().catch(console.error);
