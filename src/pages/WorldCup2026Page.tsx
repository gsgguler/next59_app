import { useState, useMemo, useEffect } from 'react';
import { Trophy, MapPin, Clock, Search, Filter, Calendar, Globe, ChevronDown, Info } from 'lucide-react';
import {
  ALL_WC2026_FIXTURES,
  WC2026_GROUPS,
  STAGE_LABELS_TR,
  formatFixtureDateTR,
  formatKickoffTR,
  type WC2026Fixture,
  type FixtureStage,
} from '../data/worldCup2026Fixtures';
import Countdown from '../components/Countdown';

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
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-champagne/70">
          {groupLabel ? `${stageLabel} — ${groupLabel}` : stageLabel}
        </span>
        <span className="text-[10px] font-mono text-navy-500">#{fixture.match_no}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center shrink-0 text-base">
            {getFlag(fixture.home_team_code)}
          </div>
          <span className="text-sm font-semibold text-white truncate leading-tight">
            {isTBD ? <span className="text-navy-500 italic">TBD</span> : fixture.home_team}
          </span>
        </div>

        <div className="flex flex-col items-center px-2 shrink-0">
          <span className="text-[10px] font-bold tracking-widest text-champagne/60 uppercase">VS</span>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-0 justify-end">
          <span className="text-sm font-semibold text-white truncate text-right leading-tight">
            {isTBD ? <span className="text-navy-500 italic">TBD</span> : fixture.away_team}
          </span>
          <div className="w-9 h-9 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center shrink-0 text-base">
            {getFlag(fixture.away_team_code)}
          </div>
        </div>
      </div>

      <div className="h-px bg-navy-800 my-3" />

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
// Filter select
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
// Tournament info cards
// ---------------------------------------------------------------------------

const TOURNAMENT_STATS = [
  { label: 'Katılan Takım', value: '48', sub: 'tarihte en fazla' },
  { label: 'Toplam Maç', value: '104', sub: '72 grup + 32 eleme' },
  { label: 'Stadyum', value: '16', sub: '3 ülkede' },
  { label: 'Şehir', value: '16', sub: 'ABD, Kanada, Meksika' },
];

const HOST_COUNTRIES = [
  { name: 'ABD', flag: '\u{1F1FA}\u{1F1F8}', venues: 11, note: 'Ana ev sahibi' },
  { name: 'Kanada', flag: '\u{1F1E8}\u{1F1E6}', venues: 2, note: 'Toronto · Vancouver' },
  { name: 'Meksika', flag: '\u{1F1F2}\u{1F1FD}', venues: 3, note: 'CDMX · GDL · MTY' },
];

// ---------------------------------------------------------------------------
// Group brackets quick view
// ---------------------------------------------------------------------------

const GROUPS_DATA: Record<string, string[]> = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Switzerland', 'Qatar', 'Bosnia and Herzegovina'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['USA', 'Australia', 'Paraguay', 'Türkiye'],
  E: ['Germany', 'Ivory Coast', 'Ecuador', 'Curaçao'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'New Zealand', 'Iran'],
  H: ['Spain', 'Saudi Arabia', 'Uruguay', 'Cape Verde'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Uzbekistan', 'DR Congo'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
};

const TEAM_CODES: Record<string, string> = {
  'Mexico': 'MEX', 'South Africa': 'RSA', 'South Korea': 'KOR', 'Czechia': 'CZE',
  'Canada': 'CAN', 'Switzerland': 'SUI', 'Qatar': 'QAT', 'Bosnia and Herzegovina': 'BIH',
  'Brazil': 'BRA', 'Morocco': 'MAR', 'Scotland': 'SCO', 'Haiti': 'HAI',
  'USA': 'USA', 'Australia': 'AUS', 'Paraguay': 'PAR', 'Türkiye': 'TUR',
  'Germany': 'GER', 'Ivory Coast': 'CIV', 'Ecuador': 'ECU', 'Curaçao': 'CUW',
  'Netherlands': 'NED', 'Japan': 'JPN', 'Sweden': 'SWE', 'Tunisia': 'TUN',
  'Belgium': 'BEL', 'Egypt': 'EGY', 'New Zealand': 'NZL', 'Iran': 'IRN',
  'Spain': 'ESP', 'Saudi Arabia': 'KSA', 'Uruguay': 'URU', 'Cape Verde': 'CPV',
  'France': 'FRA', 'Senegal': 'SEN', 'Norway': 'NOR', 'Iraq': 'IRQ',
  'Argentina': 'ARG', 'Algeria': 'ALG', 'Austria': 'AUT', 'Jordan': 'JOR',
  'Portugal': 'POR', 'Colombia': 'COL', 'Uzbekistan': 'UZB', 'DR Congo': 'COD',
  'England': 'ENG', 'Croatia': 'CRO', 'Ghana': 'GHA', 'Panama': 'PAN',
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const INITIAL_DATES = 6;

export default function WorldCup2026Page() {
  const [teamSearch, setTeamSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [visibleDates, setVisibleDates] = useState(INITIAL_DATES);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  useEffect(() => {
    document.title = 'World Cup 2026 Fikstür & Gruplar — Next59';
  }, []);

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

  const clearFilters = () => {
    setTeamSearch('');
    setStageFilter('');
    setGroupFilter('');
    setCountryFilter('');
  };

  const hasActiveFilter = teamSearch || stageFilter || groupFilter || countryFilter;

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-20 sm:py-28">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-champagne/4 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-champagne/10 border border-champagne/20 text-champagne text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Trophy className="w-3.5 h-3.5" />
            FIFA Dünya Kupası 2026
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            World Cup 2026<br />
            <span className="text-champagne">Fikstür & Gruplar</span>
          </h1>

          <p className="text-navy-300 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            48 takım, 104 maç, 3 ülke. 11 Haziran 2026'da başlıyor.
          </p>

          {/* Countdown */}
          <div className="flex justify-center mb-10">
            <Countdown />
          </div>

          {/* Opening match card */}
          <div className="inline-flex items-center gap-4 bg-navy-800/60 border border-navy-700/60 backdrop-blur-sm rounded-2xl px-6 py-4">
            <div className="flex flex-col items-end min-w-0">
              <span className="text-sm font-semibold text-white">Mexico</span>
              <span className="text-lg">{getFlag('MEX')}</span>
            </div>
            <div className="flex flex-col items-center px-4">
              <span className="text-[10px] font-bold text-champagne/60 tracking-widest uppercase">Açılış Maçı</span>
              <span className="text-xs text-navy-400 mt-1">11 Haz · 22:00 TRT</span>
              <span className="text-[10px] text-navy-500 mt-0.5">Estadio Azteca</span>
            </div>
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-semibold text-white">South Africa</span>
              <span className="text-lg">{getFlag('RSA')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tournament stats ── */}
      <section className="bg-navy-900 border-y border-navy-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TOURNAMENT_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-black text-champagne tabular-nums">{s.value}</div>
                <div className="text-xs font-semibold text-white mt-0.5">{s.label}</div>
                <div className="text-[11px] text-navy-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Host countries ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-3 gap-4">
          {HOST_COUNTRIES.map((c) => (
            <div key={c.name} className="bg-navy-900 border border-navy-800 rounded-xl p-4 flex items-center gap-3">
              <span className="text-3xl">{c.flag}</span>
              <div>
                <div className="text-sm font-bold text-white">{c.name}</div>
                <div className="text-[11px] text-navy-400">{c.venues} stadyum · {c.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Groups ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <button
          onClick={() => setGroupsExpanded((v) => !v)}
          className="w-full flex items-center justify-between bg-navy-900 border border-navy-800 rounded-xl px-5 py-4 text-left hover:border-champagne/20 transition-colors"
        >
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-champagne" />
            Grup Tablosu (A–L)
          </span>
          <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform duration-200 ${groupsExpanded ? 'rotate-180' : ''}`} />
        </button>

        {groupsExpanded && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in">
            {Object.entries(GROUPS_DATA).map(([group, teams]) => (
              <div key={group} className="bg-navy-900 border border-navy-800 rounded-xl overflow-hidden">
                <div className="bg-navy-800/60 px-3 py-2">
                  <span className="text-xs font-bold text-champagne uppercase tracking-wide">Grup {group}</span>
                </div>
                <div className="divide-y divide-navy-800">
                  {teams.map((team) => (
                    <div key={team} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm shrink-0">{getFlag(TEAM_CODES[team] ?? 'TBD')}</span>
                      <span className="text-xs text-navy-300 truncate">{team}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Fixture module ── */}
      <section className="border-t border-navy-800">
        {/* Sticky filter bar */}
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

        {/* Fixture list */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-5 h-5 text-champagne" />
            <h2 className="text-lg font-bold text-white">Tüm Maçlar</h2>
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
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Editorial note ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 flex gap-3">
          <Info className="w-4 h-4 text-navy-500 shrink-0 mt-0.5" />
          <div className="text-xs text-navy-500 leading-relaxed">
            <span className="font-semibold text-navy-400">Fikstür Kaynağı:</span> Maç saatleri ve
            eşleşmeler Fox Sports, Roadtrips ve Yahoo Sports üzerinden çapraz doğrulanmıştır.
            FIFA'nın resmi dijital kanalı doğrudan erişime kapalı olduğundan tüm veriler
            üçüncü taraf kaynaklara dayanmaktadır. Resmi açıklamalar çıktıkça güncellenecektir.
            Naklen yayın saatleri Türkiye saatiyle (TRT, UTC+3) gösterilmektedir.
          </div>
        </div>
      </section>
    </div>
  );
}
