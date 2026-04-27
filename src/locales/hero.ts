import { useState } from 'react';

export const translations = {
  tr: {
    'hero.tagline': 'kehanet kâtibi',
    'hero.subtagline': 'Maçın 90 dakikasını, ilk düdükten önce yazıyoruz.',
    'hero.cta_primary': 'Maçları Keşfet',
    'hero.cta_secondary': 'Manifestomuzu Okuyun'
  },
  en: {
    'hero.tagline': "the oracle's scribe",
    'hero.subtagline': 'We write the 90 minutes before the first whistle.',
    'hero.cta_primary': 'Explore Matches',
    'hero.cta_secondary': 'Read Our Manifesto'
  }
};

export type TranslationKey = keyof typeof translations.tr;

export function useTranslation() {
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const t = (key: TranslationKey) => translations[lang][key] || key;
  const toggleLang = () => setLang(prev => prev === 'tr' ? 'en' : 'tr');

  return { t, lang, toggleLang };
}
