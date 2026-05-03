import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, MapPin, Search, ChevronDown, ChevronRight, Shield, Swords } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface Edition {
  edition_year: number;
  host_country: string;
  champion: string;
  total_matches: number;
  total_teams: number;
  start_date: string;
  end_date: string;
}

interface WcMatch {
  edition_year: number;
  match_no: number;
  stage_code: string;
  stage_name_en: string;
  group_name: string;
  match_date: string;
  home_team_name: string;
  away_team_name: string;
  home_score_90: number;
  away_score_90: number;
  decided_by: string;
  home_score_aet: number | null;
  away_score_aet: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  final_winner_name: string | null;
  venue_name: string;
  city: string;
  result_90: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHAMPION_COUNTS: Record<string, number> = {
  Brazil: 5, Germany: 4, 'West Germany': 4, Italy: 4,
  Argentina: 3, France: 2, Uruguay: 2,
  England: 1, Spain: 1,
};

function getChampionTitles(name: string): number {
  return (CHAMPION_COUNTS[name] ?? 0);
}

function scoreLabel(m: WcMatch): string {
  if (m.home_penalties != null) {
    return `${m.home_score_90}–${m.away_score_90} (pen. ${m.home_penalties}–${m.away_penalties})`;
  }
  if (m.home_score_aet != null) {
    return `${m.home_score_aet}–${m.away_score_aet} (uzatmada)`;
  }
  return `${m.home_score_90}–${m.away_score_90}`;
}

function resultClass(m: WcMatch): { home: string; away: string } {
  const winner = m.final_winner_name;
  if (!winner) return { home: 'text-navy-300', away: 'text-navy-300' };
  if (winner === m.home_team_name) return { home: 'text-white font-bold', away: 'text-navy-400' };
  return { home: 'text-navy-400', away: 'text-white font-bold' };
}

function stageOrder(code: string): number {
  const map: Record<string, number> = {
    'Group stage': 0, 'Round of 16': 1, 'Quarter-finals': 2,
    'Semi-finals': 3, '3rd Place Final': 4, 'Final': 5,
  };
  return map[code] ?? 6;
}

const STAGE_LABELS: Record<string, string> = {
  'Group stage': 'Grup', 'Round of 16': 'Son 16', 'Quarter-finals': 'Çeyrek Final',
  'Semi-finals': 'Yarı Final', '3rd Place Final': '3. Yer', 'Final': 'Final',
};

const DECIDED_LABELS: Record<string, string> = {
  regulation: '', extra_time: 'UZ', penalties: 'PEN',
};

// Famous champions list for display
const CHAMPION_ICON: Record<string, string> = {
  Brazil: '🇧🇷', Germany: '🇩🇪', 'West Germany': '🇩🇪', Italy: '🇮🇹',
  Argentina: '🇦🇷', France: '🇫🇷', Uruguay: '🇺🇾', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Spain: '🇪🇸',
};

// ── Edition Card ─────────────────────────────────────────────────────────────

function EditionCard({
  edition,
  isSelected,
  onSelect,
}: {
  edition: Edition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const titles = getChampionTitles(edition.champion);
  const flag = CHAMPION_ICON[edition.champion] ?? '🏆';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left group relative rounded-xl border transition-all duration-200 p-4 ${
        isSelected
          ? 'bg-champagne/10 border-champagne/40 shadow-md shadow-champagne/10'
          : 'bg-navy-900/60 border-navy-800 hover:border-navy-600 hover:bg-navy-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-2xl font-black leading-none ${isSelected ? 'text-champagne' : 'text-white group-hover:text-champagne/80'} transition-colors`}>
              {edition.edition_year}
            </span>
            {isSelected && <ChevronRight className="w-4 h-4 text-champagne" />}
          </div>
          <p className="text-xs text-navy-400 leading-tight">{edition.host_country}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg leading-none mb-0.5">{flag}</div>
          <p className="text-xs font-semibold text-navy-200 leading-tight">{edition.champion}</p>
          {titles > 1 && (
            <p className="text-xs text-champagne/70">{titles}. kez</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-navy-800/60">
        <span className="text-xs text-navy-500">{edition.total_teams} takım</span>
        <span className="w-1 h-1 rounded-full bg-navy-700" />
        <span className="text-xs text-navy-500">{edition.total_matches} maç</span>
      </div>
    </button>
  );
}

// ── Match Row ─────────────────────────────────────────────────────────────────

function MatchRow({ m }: { m: WcMatch }) {
  const rc = resultClass(m);
  const badge = DECIDED_LABELS[m.decided_by];
  const stageLabel = STAGE_LABELS[m.stage_code] ?? m.stage_code;
  const isKnockout = m.stage_code !== 'Group stage';

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors last:border-0">
      {/* Stage badge */}
      <span className={`hidden sm:inline shrink-0 text-xs font-semibold px-2 py-0.5 rounded-[4px] ${
        isKnockout
          ? 'bg-champagne/10 text-champagne border border-champagne/20'
          : 'bg-navy-800 text-navy-400 border border-navy-700'
      }`}>
        {stageLabel}
        {m.group_name ? ` ${m.group_name.replace('Group ', '')}` : ''}
      </span>

      {/* Home team */}
      <span className={`flex-1 text-sm text-right truncate ${rc.home}`}>
        {m.home_team_name}
      </span>

      {/* Score */}
      <div className="shrink-0 flex flex-col items-center min-w-[72px]">
        <span className="text-sm font-bold text-white tabular-nums">
          {m.home_score_90}–{m.away_score_90}
        </span>
        {badge && (
          <span className="text-xs font-bold text-champagne/70">{badge}</span>
        )}
        {m.home_score_aet != null && !m.home_penalties && (
          <span className="text-xs text-navy-500">({m.home_score_aet}–{m.away_score_aet})</span>
        )}
        {m.home_penalties != null && (
          <span className="text-xs text-navy-500">({m.home_penalties}–{m.away_penalties})</span>
        )}
      </div>

      {/* Away team */}
      <span className={`flex-1 text-sm truncate ${rc.away}`}>
        {m.away_team_name}
      </span>

      {/* Venue */}
      <span className="hidden lg:block shrink-0 text-xs text-navy-500 truncate max-w-[120px]">
        {m.city || m.venue_name}
      </span>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function EditionStats({ edition, matches }: { edition: Edition; matches: WcMatch[] }) {
  const goals = matches.reduce((s, m) => s + m.home_score_90 + m.away_score_90, 0);
  const draws = matches.filter((m) => m.result_90 === 'draw').length;
  const aet = matches.filter((m) => m.decided_by === 'extra_time').length;
  const pens = matches.filter((m) => m.decided_by === 'penalties').length;
  const avg = matches.length > 0 ? (goals / matches.length).toFixed(2) : '—';

  const startYear = edition.start_date ? new Date(edition.start_date).getFullYear() : edition.edition_year;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Toplam Gol', value: goals },
        { label: 'Maç Başı Gol', value: avg },
        { label: 'Beraberlik', value: draws },
        { label: aet && pens ? `UZ: ${aet} / PEN: ${pens}` : 'Uzatma / Pen', value: aet + pens || '—' },
      ].map((s) => (
        <div key={s.label} className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3">
          <p className="text-2xl font-black text-white">{s.value}</p>
          <p className="text-xs text-navy-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorldCupHistoryPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    document.title = 'Dünya Kupası Tarihi (1930–2006) — Next59';
  }, []);

  // Load editions
  useEffect(() => {
    supabase
      .from('editions')
      .select('edition_year,host_country,champion,total_matches,total_teams,start_date,end_date')
      .schema('wc_history')
      .not('host_country', 'is', null)
      .order('edition_year', { ascending: false })
      .then(({ data }) => {
        if (data) setEditions(data as Edition[]);
        setLoadingEditions(false);
        // Default to most recent covered edition
        if (data && data.length > 0) setSelectedYear(data[0].edition_year);
      });
  }, []);

  // Load matches for selected year
  useEffect(() => {
    if (!selectedYear) return;
    setLoadingMatches(true);
    setSearchQuery('');
    setStageFilter('');
    supabase
      .from('matches')
      .select('*')
      .schema('wc_history')
      .eq('edition_year', selectedYear)
      .order('match_date', { ascending: true })
      .order('match_no', { ascending: true })
      .then(({ data }) => {
        if (data) setMatches(data as WcMatch[]);
        setLoadingMatches(false);
      });
  }, [selectedYear]);

  const selectedEdition = editions.find((e) => e.edition_year === selectedYear);

  // Stage options for current edition
  const stageOptions = useMemo(() => {
    const codes = [...new Set(matches.map((m) => m.stage_code))];
    return codes.sort((a, b) => stageOrder(a) - stageOrder(b));
  }, [matches]);

  // Filtered matches
  const filtered = useMemo(() => {
    let list = [...matches];
    if (stageFilter) list = list.filter((m) => m.stage_code === stageFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.home_team_name.toLowerCase().includes(q) ||
          m.away_team_name.toLowerCase().includes(q) ||
          (m.city ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [matches, stageFilter, searchQuery]);

  // Group by stage for knockout / by date for group stage
  const groupedByStage = useMemo(() => {
    const map = new Map<string, WcMatch[]>();
    for (const m of filtered) {
      const key = m.stage_code;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    const sorted = [...map.entries()].sort(([a], [b]) => stageOrder(a) - stageOrder(b));
    return sorted;
  }, [filtered]);

  // Champion stats (all time)
  const championCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of editions) {
      if (e.champion) map[e.champion] = (map[e.champion] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [editions]);

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-16 sm:py-24">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-champagne/4 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-champagne/10 border border-champagne/20 text-champagne text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Trophy className="w-3.5 h-3.5" />
            FIFA Dünya Kupası — Tarihsel Arşiv
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-4">
            Dünya Kupası Tarihi<br />
            <span className="text-champagne">1930 — 2006</span>
          </h1>

          <p className="text-navy-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-8">
            18 turnuva, 709 maç. İlk golden son finale — tüm sonuçlar, sahalar ve şampiyonlar.
          </p>

          {/* Champion leaderboard */}
          {!loadingEditions && championCounts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-2">
              {championCounts.map(([name, count]) => (
                <div
                  key={name}
                  className="flex items-center gap-1.5 bg-navy-900/80 border border-navy-700/60 px-3 py-1.5 rounded-full"
                >
                  <span className="text-sm">{CHAMPION_ICON[name] ?? '🏆'}</span>
                  <span className="text-xs font-semibold text-white">{name}</span>
                  <span className="text-xs font-bold text-champagne">{count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Main Content ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Edition Sidebar ── */}
          <aside className="lg:w-56 shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3 px-1">
              Turnuvalar
            </p>
            {loadingEditions ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 bg-navy-900/60 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {editions.map((e) => (
                  <EditionCard
                    key={e.edition_year}
                    edition={e}
                    isSelected={selectedYear === e.edition_year}
                    onSelect={() => setSelectedYear(e.edition_year)}
                  />
                ))}
              </div>
            )}

            {/* Link to 2026 */}
            <Link
              to="/world-cup-2026"
              className="mt-4 flex items-center gap-2 text-xs text-champagne hover:text-champagne/80 font-semibold px-1 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5" />
              2026 Fikstürüne Git →
            </Link>
          </aside>

          {/* ── Match Explorer ── */}
          <div className="flex-1 min-w-0">
            {selectedEdition ? (
              <>
                {/* Edition header */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
                  <div>
                    <h2 className="text-2xl font-black text-white">
                      {selectedEdition.edition_year} Dünya Kupası
                    </h2>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-sm text-navy-400">
                        <MapPin className="w-3.5 h-3.5" />
                        {selectedEdition.host_country}
                      </span>
                      {selectedEdition.start_date && (
                        <span className="flex items-center gap-1 text-sm text-navy-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(selectedEdition.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                          {' — '}
                          {new Date(selectedEdition.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-champagne">
                        <Trophy className="w-3.5 h-3.5" />
                        {selectedEdition.champion}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                {!loadingMatches && matches.length > 0 && (
                  <EditionStats edition={selectedEdition} matches={matches} />
                )}

                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Takım veya şehir ara…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-700 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:border-champagne/50 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={stageFilter}
                      onChange={(e) => setStageFilter(e.target.value)}
                      className="appearance-none pl-3 pr-8 py-2 bg-navy-900 border border-navy-700 rounded-lg text-sm text-navy-200 focus:outline-none focus:border-champagne/50 transition-colors cursor-pointer"
                    >
                      <option value="">Tüm Turlar</option>
                      {stageOptions.map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500 pointer-events-none" />
                  </div>
                </div>

                {/* Match list */}
                {loadingMatches ? (
                  <div className="space-y-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-12 bg-navy-900/60 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-navy-500">
                    <Swords className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Eşleşen maç bulunamadı.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedByStage.map(([stage, stageMatches]) => (
                      <div key={stage} className="bg-navy-900/40 border border-navy-800 rounded-xl overflow-hidden">
                        {/* Stage header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-navy-800/60 bg-navy-900/60">
                          <div className="flex items-center gap-2">
                            {stage === 'Final' ? (
                              <Trophy className="w-3.5 h-3.5 text-champagne" />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-navy-500" />
                            )}
                            <span className={`text-xs font-bold uppercase tracking-wider ${
                              stage === 'Final' ? 'text-champagne' : 'text-navy-400'
                            }`}>
                              {STAGE_LABELS[stage] ?? stage}
                            </span>
                          </div>
                          <span className="text-xs text-navy-600">{stageMatches.length} maç</span>
                        </div>

                        {/* Column headers */}
                        <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 border-b border-navy-800/30 bg-navy-900/20">
                          <span className="hidden sm:block shrink-0 w-14 text-xs text-navy-600 font-medium">Tur</span>
                          <span className="flex-1 text-xs text-navy-600 text-right">Ev Sahibi</span>
                          <span className="shrink-0 min-w-[72px] text-center text-xs text-navy-600">Skor</span>
                          <span className="flex-1 text-xs text-navy-600">Deplasman</span>
                          <span className="hidden lg:block shrink-0 w-[120px] text-xs text-navy-600">Şehir</span>
                        </div>

                        {/* Matches */}
                        {stageMatches.map((m) => (
                          <MatchRow key={`${m.edition_year}-${m.match_no}`} m={m} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-navy-500">
                <div className="text-center">
                  <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Bir turnuva seçin.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
