const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jsordrrshzivxayryryi.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const BATCH_SIZE = 500;
const MAX_ITERATIONS = 15;
const DELAY_MS = 2000;

async function runBatch(iteration: number): Promise<{ done: boolean; fetched: number; matchesUpserted: number | string; outcomesUpserted: number | string; errorCount: number }> {
  const url = `${SUPABASE_URL}/functions/v1/transform-fd-to-final?batch_size=${BATCH_SIZE}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const report = await res.json();

  if (report.message?.includes('No unprocessed')) {
    return { done: true, fetched: 0, matchesUpserted: 0, outcomesUpserted: 0, errorCount: 0 };
  }

  return {
    done: false,
    fetched: report.staging_rows_fetched ?? 0,
    matchesUpserted: report.matches?.upserted ?? 0,
    outcomesUpserted: report.outcomes?.upserted ?? 0,
    errorCount: report.error_count ?? 0,
  };
}

async function main() {
  console.log('=== Backfill: transform-fd-to-final ===');
  console.log(`URL: ${SUPABASE_URL}/functions/v1/transform-fd-to-final`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  let totalFetched = 0;
  let totalMatches = 0;
  let totalOutcomes = 0;
  let totalErrors = 0;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    console.log(`--- Batch ${i} ---`);
    const result = await runBatch(i);

    if (result.done) {
      console.log('  No more unprocessed rows. Backfill complete.');
      break;
    }

    const mu = typeof result.matchesUpserted === 'number' ? result.matchesUpserted : 0;
    const ou = typeof result.outcomesUpserted === 'number' ? result.outcomesUpserted : 0;

    totalFetched += result.fetched;
    totalMatches += mu;
    totalOutcomes += ou;
    totalErrors += result.errorCount;

    console.log(`  Fetched: ${result.fetched} | Matches: ${mu} | Outcomes: ${ou} | Errors: ${result.errorCount}`);

    if (i < MAX_ITERATIONS) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log('');
  console.log('=== BACKFILL SUMMARY ===');
  console.log(`Total staging rows fetched: ${totalFetched}`);
  console.log(`Total matches upserted:     ${totalMatches}`);
  console.log(`Total outcomes upserted:     ${totalOutcomes}`);
  console.log(`Total errors:               ${totalErrors}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
