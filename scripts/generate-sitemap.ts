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
  { loc: '/login', changefreq: 'monthly', priority: '0.3' },
  { loc: '/register', changefreq: 'monthly', priority: '0.3' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.2' },
  { loc: '/kvkk', changefreq: 'yearly', priority: '0.2' },
  { loc: '/cookies', changefreq: 'yearly', priority: '0.2' },
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
