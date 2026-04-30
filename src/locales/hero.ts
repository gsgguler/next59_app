import { useState } from 'react';

export const translations = {
  tr: {
    'hero.tagline': 'kehanet k\u00e2tibi',
    'hero.subtagline': 'Ma\u00e7\u0131n 90 dakikas\u0131n\u0131, ilk d\u00fcd\u00fckten \u00f6nce yaz\u0131yoruz.',
    'hero.cta_primary': 'Ma\u00e7lar\u0131 Ke\u015ffet',
    'hero.cta_secondary': 'Manifestomuzu Okuyun',
    'footer.tagline_line1': 'Ma\u00e7 ba\u015flamadan, 90 dakikay\u0131 yaz\u0131yoruz.',
    'footer.tagline_line2': 'Tarafs\u0131z, veriyle \u00e7al\u0131\u015fan futbol gazetecili\u011fi.'
  },
  en: {
    'hero.tagline': "the oracle's scribe",
    'hero.subtagline': 'We write the 90 minutes before the first whistle.',
    'hero.cta_primary': 'Explore Matches',
    'hero.cta_secondary': 'Read Our Manifesto',
    'footer.tagline_line1': 'We write the 90 minutes before the match starts.',
    'footer.tagline_line2': 'Independent, data-driven football journalism.'
  }
};

export type TranslationKey = keyof typeof translations.tr;

export function useTranslation() {
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const t = (key: TranslationKey) => translations[lang][key] || key;
  const toggleLang = () => setLang(prev => prev === 'tr' ? 'en' : 'tr');

  return { t, lang, toggleLang };
}
