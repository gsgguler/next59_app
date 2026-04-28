#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jsordrrshzivxayryryi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk3NDg0MiwiZXhwIjoyMDkyNTUwODQyfQ.CIiKagCt1nJD74I3LR3MUym-MYSIrPyjHEz5VxylaN4';
const BATCH_SIZE = 100;
const REST_TIME = 10000;

async function main() {
  console.log('\n=== NEXT59 BATCH PROCESS BASLADI ===');
  console.log(`Batch: ${BATCH_SIZE} | Dinlenme: ${REST_TIME / 1000}sn | Timeout: SINIRSIZ\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let tp = 0, cn = 0, t0 = Date.now();

  while (true) {
    cn++;

    const { count: bfr, error: countErr } = await supabase
      .from('staging_football_data_uk_raw')
      .select('*', { count: 'exact', head: true })
      .eq('is_processed', false);

    if (countErr) { console.error('Hata:', countErr.message); break; }
    if (!bfr || bfr === 0) { console.log('\nISLENECEK VERI KALMADI!'); break; }

    const { data: r, error } = await supabase.rpc('transform_batch_fn', { p_batch_size: BATCH_SIZE });

    if (error) {
      console.error(`[Batch #${cn}] HATA: ${error.message}`);
      break;
    }

    const { count: aft } = await supabase
      .from('staging_football_data_uk_raw')
      .select('*', { count: 'exact', head: true })
      .eq('is_processed', false);

    const processedInThisBatch = (bfr || 0) - (aft || 0);
    tp += processedInThisBatch;
    const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);

    console.log(` #${cn}: +${processedInThisBatch} | Kalan: ${aft} | Toplam: ${tp} | ${elapsedMin}dk`);

    if (!aft || aft === 0) break;

    await new Promise(res => setTimeout(res, REST_TIME));
  }

  const totalMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== TAMAMLANDI | ${tp} SATIR | ${totalMin} dk ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error('KRITIK HATA:', err);
  process.exit(1);
});
