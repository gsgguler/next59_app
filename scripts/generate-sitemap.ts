import fs from 'fs';

const BASE = 'https://next59.com';
const STATIC_PAGES = ['', 'manifesto', 'about', 'contact'];

const localSlugMap: Record<string, Record<string, string>> = {
  tr: { privacy: 'gizlilik', terms: 'kullanim-kosullari', manifesto: 'manifesto', cookies: 'cerez-politikasi' },
  en: { privacy: 'privacy', terms: 'terms', manifesto: 'manifesto', cookies: 'cookies' },
};

function getSlug(key: string, lang: string) { return localSlugMap[lang]?.[key] || key; }

async function generate() {
  const urls: string[] = [];
  for (const page of STATIC_PAGES) {
    for (const lang of ['tr', 'en']) {
      const slug = getSlug(page, lang);
      urls.push(`
        <url>
          <loc>${BASE}/${lang}/${slug}</loc>
          <xhtml:link rel="alternate" hreflang="tr" href="${BASE}/tr/${getSlug(page, 'tr')}" />
          <xhtml:link rel="alternate" hreflang="en" href="${BASE}/en/${getSlug(page, 'en')}" />
          <changefreq>weekly</changefreq>
          <priority>0.8</priority>
        </url>
      `);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('')}\n</urlset>`;
  fs.writeFileSync('public/sitemap.xml', xml);
  fs.writeFileSync('public/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
}

generate().catch(console.error);
