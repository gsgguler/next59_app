/**
 * World Cup 2026 — Country/team metadata for all 48 qualified nations.
 * Flags rendered via flag-icons (MIT licence) using ISO 3166-1 alpha-2 codes.
 * flag-icons source: https://github.com/lipis/flag-icons
 *
 * Special cases:
 *  - Scotland / England: GB-SCT / GB-ENG subdivision codes — flag-icons supports these
 *    via "gb-sct" / "gb-eng" subcode classes.
 *  - Curaçao: "cw" ISO2.
 *  - Ivory Coast / Côte d'Ivoire: "ci" ISO2.
 *  - DR Congo: "cd" ISO2.
 */

export interface WC2026Country {
  fifa_code: string;
  iso2: string;         // ISO 3166-1 alpha-2 (used with flag-icons: fi fi-{iso2})
  name_en: string;
  name_tr: string;
}

export const WC2026_COUNTRIES: WC2026Country[] = [
  // Group A
  { fifa_code: 'MEX', iso2: 'mx', name_en: 'Mexico',               name_tr: 'Meksika' },
  { fifa_code: 'RSA', iso2: 'za', name_en: 'South Africa',         name_tr: 'Güney Afrika' },
  { fifa_code: 'KOR', iso2: 'kr', name_en: 'South Korea',          name_tr: 'Güney Kore' },
  { fifa_code: 'CZE', iso2: 'cz', name_en: 'Czechia',              name_tr: 'Çekya' },
  // Group B
  { fifa_code: 'CAN', iso2: 'ca', name_en: 'Canada',               name_tr: 'Kanada' },
  { fifa_code: 'SUI', iso2: 'ch', name_en: 'Switzerland',          name_tr: 'İsviçre' },
  { fifa_code: 'QAT', iso2: 'qa', name_en: 'Qatar',                name_tr: 'Katar' },
  { fifa_code: 'BIH', iso2: 'ba', name_en: 'Bosnia & Herzegovina', name_tr: 'Bosna Hersek' },
  // Group C
  { fifa_code: 'BRA', iso2: 'br', name_en: 'Brazil',               name_tr: 'Brezilya' },
  { fifa_code: 'MAR', iso2: 'ma', name_en: 'Morocco',              name_tr: 'Fas' },
  { fifa_code: 'SCO', iso2: 'gb-sct', name_en: 'Scotland',         name_tr: 'İskoçya' },
  { fifa_code: 'HAI', iso2: 'ht', name_en: 'Haiti',                name_tr: 'Haiti' },
  // Group D
  { fifa_code: 'USA', iso2: 'us', name_en: 'USA',                  name_tr: 'ABD' },
  { fifa_code: 'AUS', iso2: 'au', name_en: 'Australia',            name_tr: 'Avustralya' },
  { fifa_code: 'PAR', iso2: 'py', name_en: 'Paraguay',             name_tr: 'Paraguay' },
  { fifa_code: 'TUR', iso2: 'tr', name_en: 'Türkiye',              name_tr: 'Türkiye' },
  // Group E
  { fifa_code: 'GER', iso2: 'de', name_en: 'Germany',              name_tr: 'Almanya' },
  { fifa_code: 'CIV', iso2: 'ci', name_en: 'Ivory Coast',          name_tr: 'Fildişi Sahili' },
  { fifa_code: 'ECU', iso2: 'ec', name_en: 'Ecuador',              name_tr: 'Ekvador' },
  { fifa_code: 'CUW', iso2: 'cw', name_en: 'Curaçao',              name_tr: 'Curaçao' },
  // Group F
  { fifa_code: 'NED', iso2: 'nl', name_en: 'Netherlands',          name_tr: 'Hollanda' },
  { fifa_code: 'JPN', iso2: 'jp', name_en: 'Japan',                name_tr: 'Japonya' },
  { fifa_code: 'SWE', iso2: 'se', name_en: 'Sweden',               name_tr: 'İsveç' },
  { fifa_code: 'TUN', iso2: 'tn', name_en: 'Tunisia',              name_tr: 'Tunus' },
  // Group G
  { fifa_code: 'BEL', iso2: 'be', name_en: 'Belgium',              name_tr: 'Belçika' },
  { fifa_code: 'EGY', iso2: 'eg', name_en: 'Egypt',                name_tr: 'Mısır' },
  { fifa_code: 'NZL', iso2: 'nz', name_en: 'New Zealand',          name_tr: 'Yeni Zelanda' },
  { fifa_code: 'IRN', iso2: 'ir', name_en: 'Iran',                 name_tr: 'İran' },
  // Group H
  { fifa_code: 'ESP', iso2: 'es', name_en: 'Spain',                name_tr: 'İspanya' },
  { fifa_code: 'KSA', iso2: 'sa', name_en: 'Saudi Arabia',         name_tr: 'Suudi Arabistan' },
  { fifa_code: 'URU', iso2: 'uy', name_en: 'Uruguay',              name_tr: 'Uruguay' },
  { fifa_code: 'CPV', iso2: 'cv', name_en: 'Cape Verde',           name_tr: 'Yeşil Burun Adaları' },
  // Group I
  { fifa_code: 'FRA', iso2: 'fr', name_en: 'France',               name_tr: 'Fransa' },
  { fifa_code: 'SEN', iso2: 'sn', name_en: 'Senegal',              name_tr: 'Senegal' },
  { fifa_code: 'NOR', iso2: 'no', name_en: 'Norway',               name_tr: 'Norveç' },
  { fifa_code: 'IRQ', iso2: 'iq', name_en: 'Iraq',                 name_tr: 'Irak' },
  // Group J
  { fifa_code: 'ARG', iso2: 'ar', name_en: 'Argentina',            name_tr: 'Arjantin' },
  { fifa_code: 'ALG', iso2: 'dz', name_en: 'Algeria',              name_tr: 'Cezayir' },
  { fifa_code: 'AUT', iso2: 'at', name_en: 'Austria',              name_tr: 'Avusturya' },
  { fifa_code: 'JOR', iso2: 'jo', name_en: 'Jordan',               name_tr: 'Ürdün' },
  // Group K
  { fifa_code: 'POR', iso2: 'pt', name_en: 'Portugal',             name_tr: 'Portekiz' },
  { fifa_code: 'COL', iso2: 'co', name_en: 'Colombia',             name_tr: 'Kolombiya' },
  { fifa_code: 'UZB', iso2: 'uz', name_en: 'Uzbekistan',           name_tr: 'Özbekistan' },
  { fifa_code: 'COD', iso2: 'cd', name_en: 'DR Congo',             name_tr: 'Kongo (DRC)' },
  // Group L
  { fifa_code: 'ENG', iso2: 'gb-eng', name_en: 'England',          name_tr: 'İngiltere' },
  { fifa_code: 'CRO', iso2: 'hr', name_en: 'Croatia',              name_tr: 'Hırvatistan' },
  { fifa_code: 'GHA', iso2: 'gh', name_en: 'Ghana',                name_tr: 'Gana' },
  { fifa_code: 'PAN', iso2: 'pa', name_en: 'Panama',               name_tr: 'Panama' },
];

const _byFifa: Record<string, WC2026Country> = {};
for (const c of WC2026_COUNTRIES) _byFifa[c.fifa_code] = c;
export const COUNTRY_BY_FIFA = _byFifa;
