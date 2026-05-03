import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, Calendar, Trophy, Globe } from 'lucide-react';
import { Hero } from '../components/Hero';
import CookieBanner from '../components/legal/CookieBanner';
import { WC2026FixtureCard } from '../components/wc/WC2026FixtureCard';
import {
  ALL_WC2026_FIXTURES,
  WC2026_GROUPS,
  formatFixtureDateTR,
  type WC2026Fixture,
  type FixtureStage,
} from '../data/worldCup2026Fixtures';

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

// Location filter — grouped by host country, then city (A-Z within each).
// Filter value is the fixture's `city` field (raw city from fixture data).
// city_display labels shown to user match VENUE_META.city_display values.
const LOCATION_GROUPS = [
  {
    label: 'ABD',
    options: [
      { label: 'Atlanta',              value: 'Atlanta' },
      { label: 'Boston',               value: 'Foxborough' },
      { label: 'Dallas',               value: 'Arlington' },
      { label: 'Houston',              value: 'Houston' },
      { label: 'Kansas City',          value: 'Kansas City' },
      { label: 'Los Angeles',          value: 'Inglewood' },
      { label: 'Miami',                value: 'Miami' },
      { label: 'New York / New Jersey',value: 'East Rutherford' },
      { label: 'Philadelphia',         value: 'Philadelphia' },
      { label: 'Seattle',              value: 'Seattle' },
    ],
  },
  {
    label: 'Kanada',
    options: [
      { label: 'Toronto',   value: 'Toronto' },
      { label: 'Vancouver', value: 'Vancouver' },
    ],
  },
  {
    label: 'Meksika',
    options: [
      { label: 'Guadalajara', value: 'Guadalajara' },
      { label: 'Mexico City', value: 'Mexico City' },
      { label: 'Monterrey',   value: 'Monterrey' },
    ],
  },
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
// Filter select components
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
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none">
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
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
    </div>
  );
}

function LocationFilterSelect({
  icon,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none">
        {icon}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all cursor-pointer"
      >
        <option value="">Tüm Karşılaşma Yerleri</option>
        {LOCATION_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
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
  const [cityFilter, setCityFilter] = useState('');
  const [visibleDates, setVisibleDates] = useState(INITIAL_DATES);

  const filtered = useMemo(() => {
    let list = [...ALL_WC2026_FIXTURES];

    if (stageFilter) {
      list = list.filter((f) => f.stage === stageFilter as FixtureStage);
    }

    if (groupFilter) {
      list = list.filter((f) => f.group === groupFilter);
    }

    if (cityFilter) {
      list = list.filter((f) => f.city === cityFilter);
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
  }, [teamSearch, stageFilter, groupFilter, cityFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const visibleKeys = dateKeys.slice(0, visibleDates);
  const hasMore = visibleDates < dateKeys.length;

  useEffect(() => {
    setVisibleDates(INITIAL_DATES);
  }, [teamSearch, stageFilter, groupFilter, cityFilter]);

  useEffect(() => {
    document.title = 'Next59 — kehanet kâtibi';
  }, []);

  const clearFilters = () => {
    setTeamSearch('');
    setStageFilter('');
    setGroupFilter('');
    setCityFilter('');
  };

  const hasActiveFilter = teamSearch || stageFilter || groupFilter || cityFilter;

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

            <LocationFilterSelect
              icon={<Globe className="w-3.5 h-3.5" />}
              value={cityFilter}
              onChange={setCityFilter}
            />

            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-400" />
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
          <span className="text-xs text-readable-muted font-mono ml-auto">{filtered.length} maç</span>
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
