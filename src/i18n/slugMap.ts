export const slugMap: Record<string, Record<string, string>> = {
  tr: {
    privacy: 'gizlilik',
    terms: 'kullanim-kosullari',
    manifesto: 'manifesto',
    cookies: 'cerez-politikasi',
  },
  en: {
    privacy: 'privacy',
    terms: 'terms',
    manifesto: 'manifesto',
    cookies: 'cookies',
  },
};

export function getLocalizedSlug(canonicalKey: string, lang: string): string {
  return slugMap[lang]?.[canonicalKey] || canonicalKey;
}
