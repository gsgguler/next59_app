import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, ArrowUpDown, Calendar, ChevronDown } from 'lucide-react';
import Countdown from '../components/Countdown';
import MatchTimelineCard from '../components/matches/MatchTimelineCard';
import { MOCK_MATCHES } from '../data/mockMatches';
import type { MatchData } from '../data/mockMatches';
import CookieBanner from '../components/legal/CookieBanner';

const DATE_RANGES = [
  { label: 'Tüm Tarihler', from: '', to: '' },
  { label: '11-15 Haziran', from: '2026-06-11', to: '2026-06-15' },
  { label: '16-20 Haziran', from: '2026-06-16', to: '2026-06-20' },
  { label: '21-25 Haziran', from: '2026-06-21', to: '2026-06-25' },
  { label: '26-30 Haziran', from: '2026-06-26', to: '2026-06-30' },
];

const SORT_OPTIONS = [
  { label: 'Tarihe Göre', value: 'date' as const },
  { label: 'Elo Farkına Göre', value: 'elo_diff' as const },
];

const MATCHDAY_OPTIONS = [
  { label: 'Tüm Maçlar', value: '' },
  { label: '1. Maç Günü', value: 'Group Stage - 1' },
  { label: '2. Maç Günü', value: 'Group Stage - 2' },
  { label: '3. Maç Günü', value: 'Group Stage - 3' },
];

const INITIAL_DATES = 6;

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupByDate(matches: MatchData[]): Map<string, MatchData[]> {
  const groups = new Map<string, MatchData[]>();
  for (const m of matches) {
    const dateKey = m.kickoff_at.slice(0, 10);
    const arr = groups.get(dateKey);
    if (arr) arr.push(m);
    else groups.set(dateKey, [m]);
  }
  return groups;
}

export default function HomePage() {
  const [teamSearch, setTeamSearch] = useState('');
  const [dateRange, setDateRange] = useState(0);
  const [sortBy, setSortBy] = useState<'date' | 'elo_diff'>('date');
  const [matchday, setMatchday] = useState('');
  const [visibleDates, setVisibleDates] = useState(INITIAL_DATES);

  const filtered = useMemo(() => {
    let list = [...MOCK_MATCHES];

    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      list = list.filter(
        (m) =>
          m.home_team.name.toLowerCase().includes(q) ||
          m.away_team.name.toLowerCase().includes(q) ||
          m.home_team.short_name.toLowerCase().includes(q) ||
          m.away_team.short_name.toLowerCase().includes(q),
      );
    }

    const range = DATE_RANGES[dateRange];
    if (range.from && range.to) {
      list = list.filter((m) => {
        const d = m.kickoff_at.slice(0, 10);
        return d >= range.from && d <= range.to;
      });
    }

    if (matchday) {
      list = list.filter((m) => m.round_name === matchday);
    }

    if (sortBy === 'elo_diff') {
      list.sort((a, b) => {
        const diffA = Math.abs((a.home_elo ?? 0) - (a.away_elo ?? 0));
        const diffB = Math.abs((b.home_elo ?? 0) - (b.away_elo ?? 0));
        return diffB - diffA;
      });
    }

    return list;
  }, [teamSearch, dateRange, sortBy, matchday]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const visibleKeys = dateKeys.slice(0, visibleDates);
  const hasMore = visibleDates < dateKeys.length;

  useEffect(() => {
    setVisibleDates(INITIAL_DATES);
  }, [teamSearch, dateRange, sortBy, matchday]);

  useEffect(() => {
    document.title = 'Next59 | 2026 Dünya Kupası — AI Futbol Gazetesi';
  }, []);

  return (
    <>
      {/* SEO meta tags set via index.html; title set above */}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-navy-900/40 to-navy-950" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 sm:pt-16 sm:pb-14">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight tracking-tight">
                2026 Dünya Kupası
              </h1>
              <p className="mt-3 text-base sm:text-lg text-navy-300 max-w-xl leading-relaxed">
                Veri odaklı futbol gazeteciliği — 48 takım, 72 maç, AI analiz
              </p>
            </div>
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-widest text-navy-500 mb-2 font-semibold">
                Başlangıca Kalan Süre
              </p>
              <Countdown />
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <div className="sticky top-16 z-40 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-400 uppercase tracking-wider shrink-0">
              <Filter className="w-3.5 h-3.5" />
              Filtrele
            </div>

            {/* Matchday */}
            <FilterSelect
              icon={<Calendar className="w-3.5 h-3.5" />}
              value={matchday}
              onChange={setMatchday}
              options={MATCHDAY_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            />

            {/* Date range */}
            <FilterSelect
              icon={<Calendar className="w-3.5 h-3.5" />}
              value={String(dateRange)}
              onChange={(v) => setDateRange(Number(v))}
              options={DATE_RANGES.map((r, i) => ({ label: r.label, value: String(i) }))}
            />

            {/* Team search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
              <input
                type="text"
                placeholder="Takım Ara..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-3 py-2 placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              />
            </div>

            {/* Sort */}
            <FilterSelect
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
              value={sortBy}
              onChange={(v) => setSortBy(v as 'date' | 'elo_diff')}
              options={SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            />
          </div>
        </div>
      </div>

      {/* Fixture timeline */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-navy-400 text-sm">Aramanızla eşleşen maç bulunamadı.</p>
            <button
              onClick={() => { setTeamSearch(''); setDateRange(0); setMatchday(''); }}
              className="mt-3 text-xs text-champagne hover:text-champagne-light transition-colors"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : sortBy === 'elo_diff' ? (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">
              Elo Farkına Göre Sıralandı ({filtered.length} maç)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => (
                <MatchTimelineCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {visibleKeys.map((dateKey) => (
              <div key={dateKey} className="animate-fade-in">
                <h2 className="text-sm font-semibold text-champagne/80 uppercase tracking-wider mb-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-navy-800" />
                  <span className="shrink-0">{formatDateHeader(dateKey)}</span>
                  <span className="h-px flex-1 bg-navy-800" />
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.get(dateKey)!.map((m) => (
                    <MatchTimelineCard key={m.id} match={m} />
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
                  <ChevronDown className="w-4 h-4" />
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
            name: '2026 Dünya Kupası Maç Takvimi',
            numberOfItems: MOCK_MATCHES.length,
            itemListElement: MOCK_MATCHES.slice(0, 10).map((m, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'SportsEvent',
                name: `${m.home_team.name} vs ${m.away_team.name}`,
                startDate: m.kickoff_at,
                homeTeam: { '@type': 'SportsTeam', name: m.home_team.name },
                awayTeam: { '@type': 'SportsTeam', name: m.away_team.name },
              },
            })),
          }),
        }}
      />

      <CookieBanner />
    </>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-500 pointer-events-none" />
    </div>
  );
}
