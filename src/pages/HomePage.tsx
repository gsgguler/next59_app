import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, Calendar, Trophy, MapPin, Clock, Globe } from 'lucide-react';
import { Hero } from '../components/Hero';
import CookieBanner from '../components/legal/CookieBanner';
import {
  ALL_WC2026_FIXTURES,
  WC2026_GROUPS,
  STAGE_LABELS_TR,
  formatFixtureDateTR,
  formatKickoffTR,
  type WC2026Fixture,
  type FixtureStage,
} from '../data/worldCup2026Fixtures';

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const FIFA_TO_EMOJI: Record<string, string> = {
  MEX: '\u{1F1F2}\u{1F1FD}', RSA: '\u{1F1FF}\u{1F1E6}', KOR: '\u{1F1F0}\u{1F1F7}',
  CZE: '\u{1F1E8}\u{1F1FF}', CAN: '\u{1F1E8}\u{1F1E6}', SUI: '\u{1F1E8}\u{1F1ED}',
  QAT: '\u{1F1F6}\u{1F1E6}', BIH: '\u{1F1E7}\u{1F1E6}', BRA: '\u{1F1E7}\u{1F1F7}',
  MAR: '\u{1F1F2}\u{1F1E6}', SCO: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E006F}\u{E007F}',
  HAI: '\u{1F1ED}\u{1F1F9}', USA: '\u{1F1FA}\u{1F1F8}', AUS: '\u{1F1E6}\u{1F1FA}',
  PAR: '\u{1F1F5}\u{1F1FE}', TUR: '\u{1F1F9}\u{1F1F7}', GER: '\u{1F1E9}\u{1F1EA}',
  CIV: '\u{1F1E8}\u{1F1EE}', ECU: '\u{1F1EA}\u{1F1E8}', CUW: '\u{1F1E8}\u{1F1FC}',
  NED: '\u{1F1F3}\u{1F1F1}', JPN: '\u{1F1EF}\u{1F1F5}', SWE: '\u{1F1F8}\u{1F1EA}',
  TUN: '\u{1F1F9}\u{1F1F3}', BEL: '\u{1F1E7}\u{1F1EA}', EGY: '\u{1F1EA}\u{1F1EC}',
  NZL: '\u{1F1F3}\u{1F1FF}', IRN: '\u{1F1EE}\u{1F1F7}', ESP: '\u{1F1EA}\u{1F1F8}',
  KSA: '\u{1F1F8}\u{1F1E6}', URU: '\u{1F1FA}\u{1F1FE}', CPV: '\u{1F1E8}\u{1F1FB}',
  FRA: '\u{1F1EB}\u{1F1F7}', SEN: '\u{1F1F8}\u{1F1F3}', NOR: '\u{1F1F3}\u{1F1F4}',
  IRQ: '\u{1F1EE}\u{1F1F6}', ARG: '\u{1F1E6}\u{1F1F7}', ALG: '\u{1F1E9}\u{1F1FF}',
  AUT: '\u{1F1E6}\u{1F1F9}', JOR: '\u{1F1EF}\u{1F1F4}', POR: '\u{1F1F5}\u{1F1F9}',
  COL: '\u{1F1E8}\u{1F1F4}', UZB: '\u{1F1FA}\u{1F1FF}', COD: '\u{1F1E8}\u{1F1E9}',
  ENG: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  CRO: '\u{1F1ED}\u{1F1F7}', GHA: '\u{1F1EC}\u{1F1ED}', PAN: '\u{1F1F5}\u{1F1E6}',
  TBD: '\u{2753}',
};

function getFlag(code: string): string {
  return FIFA_TO_EMOJI[code] ?? '\u{1F3F3}\u{FE0F}';
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const STAGE_FILTER_OPTIONS = [
  { label: 'Tüm Maçlar', value: '' },
  { label: 'Grup Maçları', value: 'Group Stage' },
  { label: 'Son 32', value: 'Round of 32' },
  { label: 'Son 16', value: 'Round of 16' },
  { label: 'Çeyrek Final', value: 'Quarter-final' },
  { label: 'Yarı Final', value: 'Semi-final' },
  { label: 'Final', value: 'Final' },
];

const GROUP_FILTER_OPTIONS = [
  { label: 'Tüm Gruplar', value: '' },
  ...WC2026_GROUPS.map((g) => ({ label: `Grup ${g}`, value: g })),
];

const COUNTRY_OPTIONS = [
  { label: 'Tüm Ülkeler', value: '' },
  { label: 'ABD', value: 'USA' },
  { label: 'Kanada', value: 'Canada' },
  { label: 'Meksika', value: 'Mexico' },
];

function groupByDate(fixtures: WC2026Fixture[]): Map<string, WC2026Fixture[]> {
  const map = new Map<string, WC2026Fixture[]>();
  for (const f of fixtures) {
    const arr = map.get(f.match_date);
    if (arr) arr.push(f);
    else map.set(f.match_date, [f]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Fixture card
// ---------------------------------------------------------------------------

function WC2026FixtureCard({ fixture }: { fixture: WC2026Fixture }) {
  const isTBD = fixture.home_team === 'TBD';
  const trTime = formatKickoffTR(fixture.kickoff_utc);
  const stageLabel = STAGE_LABELS_TR[fixture.stage];
  const groupLabel = fixture.group ? `Grup ${fixture.group}` : null;

  return (
    <div className="relative bg-navy-900 border border-navy-800 rounded-xl p-4 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-champagne/5 hover:border-champagne/20 transition-all duration-200 group">
      {/* Stage + match no */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-champagne/70">
          {groupLabel ? `${stageLabel} — ${groupLabel}` : stageLabel}
        </span>
        <span className="text-[10px] font-mono text-navy-500">#{fixture.match_no}</span>
      </div>

      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center shrink-0 text-base">
            {getFlag(fixture.home_team_code)}
          </div>
          <span className="text-sm font-semibold text-white truncate leading-tight">
            {isTBD ? <span className="text-navy-500 italic">TBD</span> : fixture.home_team}
          </span>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center px-2 shrink-0">
          <span className="text-[10px] font-bold tracking-widest text-champagne/60 uppercase">VS</span>
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-2 min-w-0 justify-end">
          <span className="text-sm font-semibold text-white truncate text-right leading-tight">
            {isTBD ? <span className="text-navy-500 italic">TBD</span> : fixture.away_team}
          </span>
          <div className="w-9 h-9 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center shrink-0 text-base">
            {getFlag(fixture.away_team_code)}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-navy-800 my-3" />

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-navy-400">
        <div className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-navy-500 shrink-0" />
          <span className="truncate">{fixture.venue}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3 text-navy-500" />
          <span className="tabular-nums">{trTime}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter select component
// ---------------------------------------------------------------------------

function FilterSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="relative">
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-500 pointer-events-none">
        {icon}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-500 pointer-events-none" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const INITIAL_DATES = 6;

export default function HomePage() {
  const [teamSearch, setTeamSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [visibleDates, setVisibleDates] = useState(INITIAL_DATES);

  const filtered = useMemo(() => {
    let list = [...ALL_WC2026_FIXTURES];

    if (stageFilter) {
      list = list.filter((f) => f.stage === stageFilter as FixtureStage);
    }

    if (groupFilter) {
      list = list.filter((f) => f.group === groupFilter);
    }

    if (countryFilter) {
      list = list.filter((f) => f.country === countryFilter);
    }

    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      list = list.filter(
        (f) =>
          f.home_team.toLowerCase().includes(q) ||
          f.away_team.toLowerCase().includes(q) ||
          f.home_team_code.toLowerCase().includes(q) ||
          f.away_team_code.toLowerCase().includes(q),
      );
    }

    return list;
  }, [teamSearch, stageFilter, groupFilter, countryFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const visibleKeys = dateKeys.slice(0, visibleDates);
  const hasMore = visibleDates < dateKeys.length;

  useEffect(() => {
    setVisibleDates(INITIAL_DATES);
  }, [teamSearch, stageFilter, groupFilter, countryFilter]);

  useEffect(() => {
    document.title = 'Next59 — kehanet kâtibi';
  }, []);

  const clearFilters = () => {
    setTeamSearch('');
    setStageFilter('');
    setGroupFilter('');
    setCountryFilter('');
  };

  const hasActiveFilter = teamSearch || stageFilter || groupFilter || countryFilter;

  return (
    <>
      <Hero />

      {/* Filter bar */}
      <div className="sticky top-14 sm:top-16 z-40 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-400 uppercase tracking-wider shrink-0">
              <Filter className="w-3.5 h-3.5" />
              Filtrele
            </div>

            <FilterSelect
              icon={<Trophy className="w-3.5 h-3.5" />}
              value={stageFilter}
              onChange={setStageFilter}
              options={STAGE_FILTER_OPTIONS}
            />

            <FilterSelect
              icon={<Calendar className="w-3.5 h-3.5" />}
              value={groupFilter}
              onChange={setGroupFilter}
              options={GROUP_FILTER_OPTIONS}
            />

            <FilterSelect
              icon={<Globe className="w-3.5 h-3.5" />}
              value={countryFilter}
              onChange={setCountryFilter}
              options={COUNTRY_OPTIONS}
            />

            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
              <input
                type="text"
                placeholder="Takım Ara..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-3 py-2 placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              />
            </div>

            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                className="text-xs text-navy-400 hover:text-champagne transition-colors shrink-0"
              >
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fixture grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-8">
          <Trophy className="w-5 h-5 text-champagne" />
          <h2 className="text-lg font-bold text-white">World Cup 2026 Fikstürü</h2>
          <span className="text-xs text-navy-500 font-mono ml-auto">{filtered.length} maç</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-navy-400 text-sm">Aramanızla eşleşen maç bulunamadı.</p>
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-champagne hover:text-champagne-light transition-colors"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {visibleKeys.map((dateKey) => (
              <div key={dateKey} className="animate-fade-in">
                <h3 className="text-sm font-semibold text-champagne/80 uppercase tracking-wider mb-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-navy-800" />
                  <span className="shrink-0">{formatFixtureDateTR(dateKey)}</span>
                  <span className="h-px flex-1 bg-navy-800" />
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.get(dateKey)!.map((f) => (
                    <WC2026FixtureCard key={f.id} fixture={f} />
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setVisibleDates((v) => v + 6)}
                  className="inline-flex items-center gap-2 bg-navy-900 border border-navy-700 hover:border-champagne/30 text-navy-300 hover:text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-all"
                >
                  Daha Fazla Göster
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6l5 5 5-5" /></svg>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: '2026 FIFA Dünya Kupası Fikstürü',
            numberOfItems: ALL_WC2026_FIXTURES.length,
            itemListElement: ALL_WC2026_FIXTURES.slice(0, 10).map((f, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'SportsEvent',
                name: `${f.home_team} vs ${f.away_team}`,
                startDate: f.kickoff_utc,
                location: { '@type': 'Place', name: f.venue, address: { '@type': 'PostalAddress', addressLocality: f.city } },
                homeTeam: { '@type': 'SportsTeam', name: f.home_team },
                awayTeam: { '@type': 'SportsTeam', name: f.away_team },
              },
            })),
          }),
        }}
      />

      <CookieBanner />
    </>
  );
}
