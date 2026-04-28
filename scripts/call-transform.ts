#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://jsordrrshzivxayryryi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk3NDg0MiwiZXhwIjoyMDkyNTUwODQyfQ.CIiKagCt1nJD74I3LR3MUym-MYSIrPyjHEz5VxylaN4';
const BATCH_SIZE = 75;

async function main() {
  console.log('\n=== NEXT59 Batch Transform ===\n');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: ce } = await supabase.from('countries').select('id').limit(1);
  if (ce) { console.error('Baglanti:', ce.message); process.exit(1); }

  const { count: sc } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true }).eq('is_processed', false);
  console.log(`Hedef: ${sc} | Batch: ${BATCH_SIZE} | ~${Math.ceil((sc || 0) / BATCH_SIZE)} CALL\n`);

  let tp = 0, cn = 0, t0 = Date.now();
  while (true) {
    cn++;
    const b0 = Date.now();
    const { count: bfr } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true }).eq('is_processed', false);
    if (!bfr || bfr === 0) { console.log('\nHepsi islendi!'); break; }

    const { data: r, error } = await supabase.rpc('transform_batch_fn', { p_batch_size: BATCH_SIZE });
    if (error) { console.error(`[CALL ${cn}] HATA: ${error.message}`); break; }

    const { count: aft } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true }).eq('is_processed', false);
    const p = (bfr || 0) - (aft || 0); tp += p;
    const el = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`  #${cn} | +${p} | Kalan:${aft} | Total:${tp} | ${(((Date.now() - b0) / 1000).toFixed(0))}s | ${el}dk | `, r);
    if (!aft || aft === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const { count: mc } = await supabase.from('matches').select('*', { count: 'exact', head: true });
  const { count: tc } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: st } = await supabase.from('match_stats').select('*', { count: 'exact', head: true });
  const { count: oc } = await supabase.from('match_odds').select('*', { count: 'exact', head: true });
  const { count: goc } = await supabase.from('match_goals_odds').select('*', { count: 'exact', head: true });
  const { count: ahc } = await supabase.from('match_ah_odds').select('*', { count: 'exact', head: true });
  console.log(`\n=== TAMAM ${((Date.now() - t0) / 60000).toFixed(1)}dk | Proc:${tp} ===`);
  console.log(`Matches:${mc} | Teams:${tc} | Stats:${st} | Odds:${oc} | O/U:${goc} | AH:${ahc}\n`);

  // IS BITTI - KENDINI DURDUR
  console.log('=== IS TAMAMLANDI - CIKILIYOR ===');
  process.exit(0);
}
main().catch(console.error);
