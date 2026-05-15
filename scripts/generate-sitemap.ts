import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const SITE_URL = 'https://www.next59.com';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const STATIC_PAGES = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/world-cup-2026', changefreq: 'daily', priority: '0.9' },
  { loc: '/mac-arsivi', changefreq: 'weekly', priority: '0.7' },
  { loc: '/mac-arsivi/ligler', changefreq: 'weekly', priority: '0.6' },
  { loc: '/futbol-analitigi', changefreq: 'monthly', priority: '0.6' },
  { loc: '/futbol-analitigi/nasil-calisir', changefreq: 'monthly', priority: '0.5' },
  { loc: '/futbol-analitigi/metodoloji', changefreq: 'monthly', priority: '0.5' },
  { loc: '/futbol-analitigi/veri-kaynaklari', changefreq: 'monthly', priority: '0.5' },
  { loc: '/next59', changefreq: 'monthly', priority: '0.5' },
  { loc: '/next59/hakkimizda', changefreq: 'yearly', priority: '0.4' },
  { loc: '/next59/bahis-karsiti-durus', changefreq: 'yearly', priority: '0.4' },
  { loc: '/next59/yayin-ilkeleri', changefreq: 'yearly', priority: '0.4' },
  { loc: '/next59/sss', changefreq: 'monthly', priority: '0.4' },
  // Canonical auth routes (not /login or /register which are redirects)
  { loc: '/giris', changefreq: 'monthly', priority: '0.3' },
  { loc: '/kayit', changefreq: 'monthly', priority: '0.3' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.2' },
  { loc: '/kvkk', changefreq: 'yearly', priority: '0.2' },
  { loc: '/cookies', changefreq: 'yearly', priority: '0.2' },
  { loc: '/yasal-uyari', changefreq: 'yearly', priority: '0.2' },
];

async function generateSitemap() {
  const now = new Date().toISOString().split('T')[0];

  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at, updated_at')
    .order('kickoff_at', { ascending: true })
    .limit(200);

  const urls: string[] = [];

  for (const page of STATIC_PAGES) {
    urls.push(`  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  }

  if (matches) {
    for (const m of matches) {
      const lastmod = m.updated_at
        ? new Date(m.updated_at).toISOString().split('T')[0]
        : now;
      urls.push(`  <url>
    <loc>${SITE_URL}/mac/${m.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`);
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

  const publicDir = resolve(import.meta.dirname ?? '.', '..', 'public');
  writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf-8');
  writeFileSync(resolve(publicDir, 'robots.txt'), robots, 'utf-8');

  console.log(`Sitemap generated: ${STATIC_PAGES.length} static + ${matches?.length ?? 0} match pages`);
}

generateSitemap().catch((err) => {
  console.error('Sitemap generation failed:', err);
  process.exit(1);
});
