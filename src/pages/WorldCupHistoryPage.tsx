import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, MapPin, Search, ChevronDown, Shield, Swords } from 'lucide-react';
import { supabaseWcHistory } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WcEdition {
  edition_year: number;
  host_country: string;
  champion: string;
  total_matches: number;
  total_teams: number;
  start_date: string;
  end_date: string;
}

export interface WcMatch {
  id: string;
  edition_year: number;
  match_no: number;
  stage_code: string;
  stage_name_en: string;
  group_name: string | null;
  match_date: string;
  home_team_name: string;
  away_team_name: string;
  home_score_ft: number | null;
  away_score_ft: number | null;
  home_score_90: number | null;
  away_score_90: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  decided_by: string | null;
  home_score_aet: number | null;
  away_score_aet: number | null;
  home_penalties: number | null;
  away_penalties: number | null;
  final_winner_name: string | null;
  venue_name: string | null;
  city: string | null;
  attendance: number | null;
  referee: string | null;
  result_90: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAMPION_ICON: Record<string, string> = {
  Brazil: '🇧🇷', Germany: '🇩🇪', 'West Germany': '🇩🇪', Italy: '🇮🇹',
  Argentina: '🇦🇷', France: '🇫🇷', Uruguay: '🇺🇾', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Spain: '🇪🇸',
};

export const STAGE_LABELS: Record<string, string> = {
  'Group stage': 'Grup', 'Round of 16': 'Son 16', 'Quarter-finals': 'Çeyrek Final',
  'Semi-finals': 'Yarı Final', '3rd Place Final': '3. Yer', 'Final': 'Final',
};

export function stageOrder(code: string): number {
  const map: Record<string, number> = {
    'Group stage': 0, 'Round of 16': 1, 'Quarter-finals': 2,
    'Semi-finals': 3, '3rd Place Final': 4, 'Final': 5,
  };
  return map[code] ?? 6;
}

export function buildScoreLabel(m: WcMatch): string {
  const reg = `${m.home_score_90 ?? m.home_score_ft ?? '?'}–${m.away_score_90 ?? m.away_score_ft ?? '?'}`;
  if (m.home_penalties != null) return `${reg} (UZ: ${m.home_score_aet}–${m.away_score_aet}, PEN: ${m.home_penalties}–${m.away_penalties})`;
  if (m.home_score_aet != null) return `${reg} (UZ: ${m.home_score_aet}–${m.away_score_aet})`;
  return reg;
}

// ── Match Card ────────────────────────────────────────────────────────────────

function MatchCard({ m }: { m: WcMatch }) {
  const isKnockout = m.stage_code !== 'Group stage';
  const stageLabel = STAGE_LABELS[m.stage_code] ?? m.stage_code;
  const groupSuffix = m.group_name ? ` ${m.group_name.replace('Group ', '')}` : '';

  const homeScore = m.home_score_90 ?? m.home_score_ft;
  const awayScore = m.away_score_90 ?? m.away_score_ft;
  const winner = m.final_winner_name;

  const homeClass = winner
    ? winner === m.home_team_name ? 'text-white font-bold' : 'text-navy-500'
    : 'text-navy-200';
  const awayClass = winner
    ? winner === m.away_team_name ? 'text-white font-bold' : 'text-navy-500'
    : 'text-navy-200';

  const decidedBadge = m.decided_by === 'penalties' ? 'PEN'
    : m.decided_by === 'extra_time' ? 'UZ' : null;

  return (
    <Link
      to={`/world-cup/tarihce/mac/${m.id}`}
      className="group flex items-center gap-3 px-4 py-3 border-b border-navy-800/40 hover:bg-navy-800/30 transition-colors last:border-0 cursor-pointer"
    >
      {/* Stage badge */}
      <span className={`hidden sm:inline shrink-0 text-xs font-semibold px-2 py-0.5 rounded-[4px] min-w-[56px] text-center ${
        isKnockout
          ? 'bg-champagne/10 text-champagne border border-champagne/20'
          : 'bg-navy-800 text-navy-400 border border-navy-700'
      }`}>
        {stageLabel}{groupSuffix}
      </span>

      {/* Home */}
      <span className={`flex-1 text-sm text-right truncate transition-colors group-hover:text-white ${homeClass}`}>
        {m.home_team_name}
      </span>

      {/* Score */}
      <div className="shrink-0 flex flex-col items-center min-w-[64px]">
        <span className="text-sm font-bold text-white tabular-nums">
          {homeScore ?? '?'}–{awayScore ?? '?'}
        </span>
        {decidedBadge && (
          <span className="text-[10px] font-bold text-champagne/70 leading-none">{decidedBadge}</span>
        )}
      </div>

      {/* Away */}
      <span className={`flex-1 text-sm truncate transition-colors group-hover:text-white ${awayClass}`}>
        {m.away_team_name}
      </span>

      {/* Venue + arrow */}
      <div className="hidden lg:flex items-center gap-2 shrink-0">
        <span className="text-xs text-navy-600 truncate max-w-[100px]">{m.city ?? m.venue_name ?? ''}</span>
        <span className="text-navy-700 group-hover:text-champagne transition-colors text-xs">›</span>
      </div>
    </Link>
  );
}

// ── Edition Card ──────────────────────────────────────────────────────────────

function EditionCard({
  edition, isSelected, onSelect,
}: { edition: WcEdition; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all duration-200 p-3.5 ${
        isSelected
          ? 'bg-champagne/10 border-champagne/40 shadow-md shadow-champagne/10'
          : 'bg-navy-900/60 border-navy-800 hover:border-navy-600 hover:bg-navy-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`text-xl font-black leading-none ${isSelected ? 'text-champagne' : 'text-white'}`}>
            {edition.edition_year}
          </span>
          <p className="text-xs text-navy-500 mt-0.5 leading-tight">{edition.host_country}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base leading-none mb-0.5">{CHAMPION_ICON[edition.champion] ?? '🏆'}</div>
          <p className="text-xs font-semibold text-navy-200 leading-tight">{edition.champion}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-navy-800/50">
        <span className="text-xs text-navy-600">{edition.total_teams} tk</span>
        <span className="w-1 h-1 rounded-full bg-navy-700" />
        <span className="text-xs text-navy-600">{edition.total_matches} maç</span>
      </div>
    </button>
  );
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

function EditionStats({ matches }: { matches: WcMatch[] }) {
  const goals = matches.reduce((s, m) => s + (m.home_score_90 ?? m.home_score_ft ?? 0) + (m.away_score_90 ?? m.away_score_ft ?? 0), 0);
  const draws = matches.filter((m) => m.result_90 === 'draw').length;
  const aet = matches.filter((m) => m.decided_by === 'extra_time').length;
  const pens = matches.filter((m) => m.decided_by === 'penalties').length;
  const avg = matches.length > 0 ? (goals / matches.length).toFixed(2) : '—';

  return (
    <div className="grid grid-cols-4 gap-2 mb-5">
      {[
        { label: 'Toplam Gol', value: goals },
        { label: 'Maç Başı', value: avg },
        { label: 'Beraberlik', value: draws },
        { label: 'UZ + PEN', value: aet + pens },
      ].map((s) => (
        <div key={s.label} className="bg-navy-900/50 border border-navy-800 rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-white">{s.value}</p>
          <p className="text-xs text-navy-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorldCupHistoryPage() {
  const [editions, setEditions] = useState<WcEdition[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    document.title = 'Dünya Kupası Tarihi (1930–2022) — Next59';
  }, []);

  useEffect(() => {
    supabaseWcHistory
      .from('wch_editions')
      .select('edition_year,host_country,champion,total_matches,total_teams,start_date,end_date')
      .not('host_country', 'is', null)
      .order('edition_year', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setEditions(data as WcEdition[]);
          setSelectedYear((data as WcEdition[])[0]?.edition_year ?? null);
        }
        setLoadingEditions(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    setLoadingMatches(true);
    setSearch('');
    setStageFilter('');
    supabaseWcHistory
      .from('wch_matches')
      .select('id,edition_year,match_no,stage_code,stage_name_en,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,home_score_ht,away_score_ht,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,venue_name,city,attendance,referee,result_90,home_team_id,away_team_id')
      .eq('edition_year', selectedYear)
      .order('match_date', { ascending: true })
      .order('match_no', { ascending: true })
      .then(({ data }) => {
        if (data) setMatches(data as WcMatch[]);
        setLoadingMatches(false);
      });
  }, [selectedYear]);

  const selectedEdition = editions.find((e) => e.edition_year === selectedYear);

  const stageOptions = useMemo(() => {
    const codes = [...new Set(matches.map((m) => m.stage_code))];
    return codes.sort((a, b) => stageOrder(a) - stageOrder(b));
  }, [matches]);

  const filtered = useMemo(() => {
    let list = [...matches];
    if (stageFilter) list = list.filter((m) => m.stage_code === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.home_team_name.toLowerCase().includes(q) ||
          m.away_team_name.toLowerCase().includes(q) ||
          (m.city ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [matches, stageFilter, search]);

  const groupedByStage = useMemo(() => {
    const map = new Map<string, WcMatch[]>();
    for (const m of filtered) {
      if (!map.has(m.stage_code)) map.set(m.stage_code, []);
      map.get(m.stage_code)!.push(m);
    }
    return [...map.entries()].sort(([a], [b]) => stageOrder(a) - stageOrder(b));
  }, [filtered]);

  const championCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of editions) {
      if (e.champion) map[e.champion] = (map[e.champion] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [editions]);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-14 sm:py-20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-champagne/4 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-champagne/10 border border-champagne/20 text-champagne text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <Trophy className="w-3.5 h-3.5" />
            FIFA Dünya Kupası — Tarihsel Arşiv
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-3">
            Dünya Kupası Tarihi<br />
            <span className="text-champagne">1930 — 2022</span>
          </h1>
          <p className="text-navy-300 text-base max-w-xl mx-auto mb-7">
            22 turnuva · Her skoru, sahasını ve şampiyonunu keşfet.
          </p>
          {!loadingEditions && (
            <div className="flex flex-wrap justify-center gap-2">
              {championCounts.map(([name, count]) => (
                <span key={name} className="flex items-center gap-1.5 bg-navy-900/80 border border-navy-700/50 px-3 py-1.5 rounded-full text-xs">
                  <span>{CHAMPION_ICON[name] ?? '🏆'}</span>
                  <span className="font-semibold text-white">{name}</span>
                  <span className="font-bold text-champagne">{count}×</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Body */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Edition list */}
          <aside className="lg:w-52 shrink-0">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3 px-0.5">Turnuvalar</p>
            {loadingEditions ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-20 bg-navy-900/40 rounded-xl animate-pulse" />
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
            <Link
              to="/world-cup-2026"
              className="mt-4 flex items-center gap-1.5 text-xs text-champagne hover:text-champagne/70 font-semibold px-0.5 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5" />
              2026 Fikstürüne Git →
            </Link>
          </aside>

          {/* Match explorer */}
          <div className="flex-1 min-w-0">
            {selectedEdition ? (
              <>
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-black text-white">{selectedEdition.edition_year} Dünya Kupası</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                      <span className="flex items-center gap-1 text-sm text-navy-400">
                        <MapPin className="w-3.5 h-3.5" />{selectedEdition.host_country}
                      </span>
                      {selectedEdition.start_date && (
                        <span className="flex items-center gap-1 text-sm text-navy-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(selectedEdition.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                          {' – '}
                          {new Date(selectedEdition.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-champagne">
                        <Trophy className="w-3.5 h-3.5" />{selectedEdition.champion}
                      </span>
                    </div>
                  </div>
                </div>

                {!loadingMatches && matches.length > 0 && (
                  <EditionStats matches={matches} />
                )}

                {/* Filters */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Takım veya şehir ara…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-700 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:border-champagne/50 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={stageFilter}
                      onChange={(e) => setStageFilter(e.target.value)}
                      className="appearance-none pl-3 pr-8 py-2 bg-navy-900 border border-navy-700 rounded-lg text-sm text-navy-200 focus:outline-none focus:border-champagne/50 cursor-pointer"
                    >
                      <option value="">Tüm Turlar</option>
                      {stageOptions.map((s) => (
                        <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500 pointer-events-none" />
                  </div>
                </div>

                {/* Match groups */}
                {loadingMatches ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-12 bg-navy-900/40 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16">
                    <Swords className="w-8 h-8 mx-auto mb-3 text-navy-700" />
                    <p className="text-sm text-navy-500">Eşleşen maç yok.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedByStage.map(([stage, sm]) => (
                      <div key={stage} className="bg-navy-900/40 border border-navy-800 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-navy-800/60 bg-navy-900/60">
                          <div className="flex items-center gap-2">
                            {stage === 'Final' ? (
                              <Trophy className="w-3.5 h-3.5 text-champagne" />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-navy-500" />
                            )}
                            <span className={`text-xs font-bold uppercase tracking-wider ${stage === 'Final' ? 'text-champagne' : 'text-navy-400'}`}>
                              {STAGE_LABELS[stage] ?? stage}
                            </span>
                          </div>
                          <span className="text-xs text-navy-600">{sm.length} maç</span>
                        </div>
                        {/* Column labels */}
                        <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 border-b border-navy-800/30">
                          <span className="hidden sm:block shrink-0 w-[60px] text-xs text-navy-600">Tur</span>
                          <span className="flex-1 text-xs text-navy-600 text-right">Ev Sahibi</span>
                          <span className="shrink-0 min-w-[64px] text-center text-xs text-navy-600">Skor</span>
                          <span className="flex-1 text-xs text-navy-600">Deplasman</span>
                          <span className="hidden lg:block shrink-0 w-[100px] text-xs text-navy-600">Şehir</span>
                        </div>
                        {sm.map((m) => <MatchCard key={m.id} m={m} />)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-navy-600">
                <p className="text-sm">Soldan bir turnuva seçin.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
