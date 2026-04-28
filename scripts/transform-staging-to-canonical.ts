#!/usr/bin/env tsx
/**
 * NEXT59 — TRANSFORM: staging_football_data_uk_raw → canonical tables
 * 
 * Akis:
 * 1. Staging'de is_processed=false olanlari cek (batch: 500)
 * 2. Her kayit icin:
 *    a. Takim adlarini teams tablosuna ekle (canonical)
 *    b. competition_seasons'dan comp_season_id bul (league_code + season_code)
 *    c. matches tablosuna ekle (UPSERT deterministic_source_match_id)
 *    d. match_stats tablosuna ekle (FT + HT istatistikler)
 *    e. match_odds tablosuna ekle (B365 acilis oranlari)
 * 3. Staging kaydini is_processed=true yap
 * 
 * Calistir: npx tsx scripts/transform-staging-to-canonical.ts
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// CONFIG
// ============================================
const SUPABASE_URL = 'https://jsordrrshzivxayryryi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk3NDg0MiwiZXhwIjoyMDkyNTUwODQyfQ.CIiKagCt1nJD74I3LR3MUym-MYSIrPyjHEz5VxylaN4';
const BATCH_SIZE = 500; // her seferde kac staging satiri islenecek

// football-data.co.uk → DB provider mapping
const PROVIDER_MAP: Record<string, { name: string; markets: { col: string; selection: string; market: string }[] }> = {
  B365: { name: 'Bet365', markets: [{ col: 'B365H', selection: 'Home', market: '1X2' }, { col: 'B365D', selection: 'Draw', market: '1X2' }, { col: 'B365A', selection: 'Away', market: '1X2' }] },
  BW:   { name: 'Betway', markets: [{ col: 'BWH', selection: 'Home', market: '1X2' }, { col: 'BWD', selection: 'Draw', market: '1X2' }, { col: 'BWA', selection: 'Away', market: '1X2' }] },
  PS:   { name: 'Pinnacle', markets: [{ col: 'PSH', selection: 'Home', market: '1X2' }, { col: 'PSD', selection: 'Draw', market: '1X2' }, { col: 'PSA', selection: 'Away', market: '1X2' }] },
  WH:   { name: 'William Hill', markets: [{ col: 'WHH', selection: 'Home', market: '1X2' }, { col: 'WHD', selection: 'Draw', market: '1X2' }, { col: 'WHA', selection: 'Away', market: '1X2' }] },
};

// ============================================
// HELPERS
// ============================================
interface StagingRow {
  id: string;
  deterministic_source_match_id: string;
  league_code: string;
  season_code: string;
  match_date: string | null;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  referee: string | null;
  raw_data: Record<string, unknown>;
}

interface TeamCache {
  [name: string]: string; // team name → team UUID
}

interface CompSeasonCache {
  [key: string]: string; // "E0|2425" → comp_season UUID
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('\n========================================');
  console.log('NEXT59 — STAGING → CANONICAL TRANSFORM');
  console.log('========================================\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Baglanti testi
  const { error: connErr } = await supabase.from('countries').select('id').limit(1);
  if (connErr) { console.error('Supabase baglanti hatasi:', connErr.message); process.exit(1); }
  console.log('Supabase OK\n');

  // Cache'ler
  const teamCache: TeamCache = {};
  const compSeasonCache: CompSeasonCache = {};

  // Toplam staging satiri sayisi
  const { count: totalStaging, error: countErr } = await supabase
    .from('staging_football_data_uk_raw')
    .select('*', { count: 'exact', head: true })
    .eq('is_processed', false);
  
  if (countErr) { console.error('Sayim hatasi:', countErr.message); process.exit(1); }
  console.log(`Islenecek staging satiri: ${totalStaging}\n`);

  let processedTotal = 0;
  let insertedMatches = 0;
  let insertedStats = 0;
  let insertedOdds = 0;
  let errors = 0;

  // Batch batch isle
  while (true) {
    const { data: rows, error: fetchErr } = await supabase
      .from('staging_football_data_uk_raw')
      .select('id, deterministic_source_match_id, league_code, season_code, match_date, home_team, away_team, home_score, away_score, referee, raw_data')
      .eq('is_processed', false)
      .limit(BATCH_SIZE);

    if (fetchErr) { console.error('Fetch hatasi:', fetchErr.message); break; }
    if (!rows || rows.length === 0) break;

    for (const row of rows as StagingRow[]) {
      try {
        const raw = row.raw_data as Record<string, string | number | null>;
        const homeTeamName = row.home_team || (raw['HomeTeam'] as string) || null;
        const awayTeamName = row.away_team || (raw['AwayTeam'] as string) || null;

        if (!homeTeamName || !awayTeamName) {
          console.log(`  [SKIP] Takim adi eksik: ${row.id}`);
          continue;
        }

        // 1. Takimlari canonical'e ekle/cachele
        const homeTeamId = await getOrCreateTeam(supabase, teamCache, homeTeamName);
        const awayTeamId = await getOrCreateTeam(supabase, teamCache, awayTeamName);

        // 2. Competition season ID bul
        const compSeasonId = await getCompSeasonId(supabase, compSeasonCache, row.league_code, row.season_code);
        if (!compSeasonId) {
          console.log(`  [SKIP] CompSeason bulunamadi: ${row.league_code} ${row.season_code}`);
          continue;
        }

        // 3. Matches tablosuna ekle
        const matchInsert = {
          competition_season_id: compSeasonId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          match_date: row.match_date,
          deterministic_source_match_id: row.deterministic_source_match_id,
          home_score_ft: row.home_score,
          away_score_ft: row.away_score,
          home_score_ht: raw['HTHG'] != null ? parseFloat(raw['HTHG'] as string) : null,
          away_score_ht: raw['HTAG'] != null ? parseFloat(raw['HTAG'] as string) : null,
          referee: row.referee,
          status_short: row.home_score != null ? 'FT' : 'NS',
        };

        const { data: matchUpsert, error: matchErr } = await supabase
          .from('matches')
          .upsert(matchInsert, { onConflict: 'deterministic_source_match_id' })
          .select('id')
          .single();

        if (matchErr) { console.error(`  [MATCH ERR] ${matchErr.message}`); errors++; continue; }
        insertedMatches++;
        const matchId = matchUpsert!.id;

        // 4. Match stats ekle (FT)
        const ftStats = [
          {
            match_id: matchId, team_id: homeTeamId, half: 'FT',
            total_shots: raw['HS'] != null ? parseInt(raw['HS'] as string) : null,
            shots_on_goal: raw['HST'] != null ? parseInt(raw['HST'] as string) : null,
            fouls: raw['HF'] != null ? parseInt(raw['HF'] as string) : null,
            corner_kicks: raw['HC'] != null ? parseInt(raw['HC'] as string) : null,
            yellow_cards: raw['HY'] != null ? parseInt(raw['HY'] as string) : null,
            red_cards: raw['HR'] != null ? parseInt(raw['HR'] as string) : null,
          },
          {
            match_id: matchId, team_id: awayTeamId, half: 'FT',
            total_shots: raw['AS'] != null ? parseInt(raw['AS'] as string) : null,
            shots_on_goal: raw['AST'] != null ? parseInt(raw['AST'] as string) : null,
            fouls: raw['AF'] != null ? parseInt(raw['AF'] as string) : null,
            corner_kicks: raw['AC'] != null ? parseInt(raw['AC'] as string) : null,
            yellow_cards: raw['AY'] != null ? parseInt(raw['AY'] as string) : null,
            red_cards: raw['AR'] != null ? parseInt(raw['AR'] as string) : null,
          },
        ];

        const { error: statsErr } = await supabase.from('match_stats').upsert(ftStats, { onConflict: 'match_id,team_id,half' });
        if (!statsErr) insertedStats += 2;

        // 5. Odds ekle (B365 acilis oranlari)
        const oddsRows = [];
        for (const [code, provider] of Object.entries(PROVIDER_MAP)) {
          for (const m of provider.markets) {
            const val = raw[m.col];
            if (val != null && val !== '') {
              oddsRows.push({
                match_id: matchId,
                market: m.market,
                selection: m.selection,
                odds: parseFloat(val as string),
                odds_type: 'opening',
                provider_name: provider.name,
              });
            }
          }
        }

        if (oddsRows.length > 0) {
          const { error: oddsErr } = await supabase.from('match_odds').insert(oddsRows);
          if (!oddsErr) insertedOdds += oddsRows.length;
        }

        // 6. Staging'i islenmis olarak isaretle
        await supabase
          .from('staging_football_data_uk_raw')
          .update({ is_processed: true, processed_at: new Date().toISOString(), canonical_match_id: matchId })
          .eq('id', row.id);

        processedTotal++;

      } catch (err) {
        console.error(`  [ERR] ${(err as Error).message}`);
        errors++;
      }
    }

    console.log(`  Batch tamam: ${processedTotal} satir islenmis | ${insertedMatches} mac | ${insertedStats} stat | ${insertedOdds} odds | ${errors} hata`);
  }

  console.log('\n========================================');
  console.log('TRANSFORM TAMAM');
  console.log(`Toplan islenen: ${processedTotal}`);
  console.log(`Eklenen mac:    ${insertedMatches}`);
  console.log(`Eklenen stat:   ${insertedStats}`);
  console.log(`Eklenen odds:   ${insertedOdds}`);
  console.log(`Hata:           ${errors}`);
  console.log('========================================\n');
}

// ============================================
// TAKIM: Cache'de varsa don, yoksa olustur
// ============================================
async function getOrCreateTeam(supabase: any, cache: TeamCache, name: string): Promise<string> {
  if (cache[name]) return cache[name];

  const { data: existing } = await supabase
    .from('teams')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .single();

  if (existing) {
    cache[name] = existing.id;
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from('teams')
    .insert({ name })
    .select('id')
    .single();

  if (error) throw new Error(`Takim ekleme hatasi (${name}): ${error.message}`);
  cache[name] = inserted!.id;
  return inserted!.id;
}

// ============================================
// COMPETITION SEASON: Cache'de varsa don, yoksa bul
// ============================================
async function getCompSeasonId(supabase: any, cache: CompSeasonCache, code: string, season: string): Promise<string | null> {
  const key = `${code}|${season}`;
  if (cache[key]) return cache[key];

  const { data, error } = await supabase
    .from('competition_seasons')
    .select('id')
    .eq('football_data_uk_code', code)
    .eq('football_data_uk_season_label', season)
    .limit(1)
    .single();

  if (error || !data) return null;
  cache[key] = data.id;
  return data.id;
}

main().catch(console.error);
