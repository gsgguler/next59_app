import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  SlidersHorizontal,
  Archive,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArchiveMatch {
  match_id: string;
  match_date: string;
  match_time: string | null;
  round: string | null;
  referee: string | null;
  competition_id: string;
  competition_name: string;
  season_id: string;
  season_year: number;
  season_label: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score_ft: number | null;
  away_score_ft: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  result: string | null;
  result_label: string | null;
  total_goals_ft: number | null;
  has_ft_score: boolean;
  has_shot_data: boolean;
  has_card_data: boolean;
  has_corner_data: boolean;
  home_total_shots: number | null;
  away_total_shots: number | null;
  home_shots_on_goal: number | null;
  away_shots_on_goal: number | null;
  home_corner_kicks: number | null;
  away_corner_kicks: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_yellow_cards: number | null;
  away_yellow_cards: number | null;
  home_red_cards: number | null;
  away_red_cards: number | null;
}

interface Competition {
  competition_id: string;
  competition_name: string;
}

interface Season {
  season_id: string;
  season_label: string;
  season_year: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const RESULT_OPTIONS = [
  { label: 'Tüm Sonuçlar', value: '' },
  { label: 'Ev Sahibi Kazandı', value: 'H' },
  { label: 'Beraberlik', value: 'D' },
  { label: 'Deplasman Kazandı', value: 'A' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function resultBadgeClass(result: string | null): string {
  switch (result) {
    case 'H':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'D':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    case 'A':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
    default:
      return 'bg-navy-800 text-navy-400 border-navy-700';
  }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ArchiveSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-navy-900/60 border border-navy-800 rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-3 w-24 bg-navy-800 rounded" />
            <div className="h-3 w-32 bg-navy-800 rounded" />
            <div className="flex-1" />
            <div className="h-6 w-16 bg-navy-800 rounded" />
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-4 w-28 bg-navy-800 rounded" />
            <div className="h-6 w-16 bg-navy-700 rounded-lg" />
            <div className="h-4 w-28 bg-navy-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Chip ────────────────────────────────────────────────────────────────

function StatChip({
  label,
  home,
  away,
}: {
  label: string;
  home: number | null;
  away: number | null;
}) {
  if (home === null && away === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-navy-800/80 border border-navy-700/60 text-navy-300 px-2 py-0.5 rounded-full">
      <span className="text-navy-400">{label}:</span>
      <span>{home ?? '–'}</span>
      <span className="text-navy-600">–</span>
      <span>{away ?? '–'}</span>
    </span>
  );
}

// ─── Match Row ────────────────────────────────────────────────────────────────

function MatchRow({ match }: { match: ArchiveMatch }) {
  const hasHT = match.home_score_ht !== null && match.away_score_ht !== null;

  return (
    <div className="group bg-navy-900/50 hover:bg-navy-900/80 border border-navy-800/60 hover:border-navy-700 rounded-xl p-4 transition-all duration-200">
      {/* Top row: meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy-500 mb-3">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatDate(match.match_date)}
        </span>
        <span className="text-navy-700">·</span>
        <span className="text-navy-400 font-medium">{match.competition_name}</span>
        <span className="text-navy-700">·</span>
        <span>{match.season_label}</span>
        {match.round && (
          <>
            <span className="text-navy-700">·</span>
            <span>{match.round}</span>
          </>
        )}
        {match.referee && (
          <>
            <span className="text-navy-700">·</span>
            <span>Hakem: {match.referee}</span>
          </>
        )}
      </div>

      {/* Score row */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <span className="flex-1 text-sm font-semibold text-white text-right truncate">
          {match.home_team_name}
        </span>

        {/* Score block */}
        <div className="flex flex-col items-center shrink-0">
          {match.has_ft_score ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-white tabular-nums w-6 text-center">
                  {match.home_score_ft}
                </span>
                <span className="text-navy-500 font-bold">–</span>
                <span className="text-lg font-bold text-white tabular-nums w-6 text-center">
                  {match.away_score_ft}
                </span>
              </div>
              {hasHT && (
                <div className="text-[10px] text-navy-500 tabular-nums">
                  İY {match.home_score_ht}–{match.away_score_ht}
                </div>
              )}
            </>
          ) : (
            <span className="text-navy-600 text-sm">– : –</span>
          )}
        </div>

        {/* Away team */}
        <span className="flex-1 text-sm font-semibold text-white text-left truncate">
          {match.away_team_name}
        </span>

        {/* Result badge */}
        {match.result && (
          <span
            className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${resultBadgeClass(match.result)}`}
          >
            {match.result_label ?? match.result}
          </span>
        )}
      </div>

      {/* Stat chips */}
      {(match.has_shot_data || match.has_card_data || match.has_corner_data) && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-navy-800/50">
          <StatChip label="Şut" home={match.home_total_shots} away={match.away_total_shots} />
          <StatChip label="İsabetli" home={match.home_shots_on_goal} away={match.away_shots_on_goal} />
          <StatChip label="Korner" home={match.home_corner_kicks} away={match.away_corner_kicks} />
          <StatChip label="Faul" home={match.home_fouls} away={match.away_fouls} />
          <StatChip label="Sarı" home={match.home_yellow_cards} away={match.away_yellow_cards} />
          <StatChip label="Kırmızı" home={match.home_red_cards} away={match.away_red_cards} />
        </div>
      )}
    </div>
  );
}

// ─── Filter Select ─────────────────────────────────────────────────────────────

function FilterSelect({
  icon,
  value,
  onChange,
  options,
  placeholder,
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-500 pointer-events-none">
          {icon}
        </div>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all cursor-pointer ${icon ? 'pl-8' : 'pl-3'}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const [matches, setMatches] = useState<ArchiveMatch[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filter state
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedResult, setSelectedResult] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSearchInput, setTeamSearchInput] = useState('');
  const teamSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refereeTerm, setRefereeTerm] = useState('');
  const [refereeInput, setRefereeInput] = useState('');
  const refereeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [minGoals, setMinGoals] = useState('');
  const [maxGoals, setMaxGoals] = useState('');
  const [hasShotDataOnly, setHasShotDataOnly] = useState(false);
  const [hasCardDataOnly, setHasCardDataOnly] = useState(false);

  // ── Load filter options once ───────────────────────────────────────────────

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase
        .from('v_historical_match_archive')
        .select('competition_id, competition_name, season_id, season_label, season_year')
        .limit(5000);

      if (!data) return;

      const compMap = new Map<string, Competition>();
      const seasonMap = new Map<string, Season>();

      for (const row of data) {
        if (row.competition_id && !compMap.has(row.competition_id)) {
          compMap.set(row.competition_id, {
            competition_id: row.competition_id,
            competition_name: row.competition_name,
          });
        }
        if (row.season_id && !seasonMap.has(row.season_id)) {
          seasonMap.set(row.season_id, {
            season_id: row.season_id,
            season_label: row.season_label,
            season_year: row.season_year,
          });
        }
      }

      setCompetitions(
        Array.from(compMap.values()).sort((a, b) =>
          a.competition_name.localeCompare(b.competition_name, 'tr'),
        ),
      );
      setSeasons(
        Array.from(seasonMap.values()).sort((a, b) => b.season_year - a.season_year),
      );
    }

    loadFilters();
  }, []);

  // ── Debounce team search ───────────────────────────────────────────────────

  useEffect(() => {
    if (teamSearchTimer.current) clearTimeout(teamSearchTimer.current);
    teamSearchTimer.current = setTimeout(() => {
      setTeamSearch(teamSearchInput);
      setPage(0);
    }, 400);
    return () => {
      if (teamSearchTimer.current) clearTimeout(teamSearchTimer.current);
    };
  }, [teamSearchInput]);

  // ── Debounce referee search ────────────────────────────────────────────────

  useEffect(() => {
    if (refereeTimer.current) clearTimeout(refereeTimer.current);
    refereeTimer.current = setTimeout(() => {
      setRefereeTerm(refereeInput);
      setPage(0);
    }, 400);
    return () => {
      if (refereeTimer.current) clearTimeout(refereeTimer.current);
    };
  }, [refereeInput]);

  // ── Fetch matches ──────────────────────────────────────────────────────────

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('v_historical_match_archive')
        .select('*', { count: 'exact' })
        .order('match_date', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (selectedCompetitionId) {
        query = query.eq('competition_id', selectedCompetitionId);
      }
      if (selectedSeasonId) {
        query = query.eq('season_id', selectedSeasonId);
      }
      if (selectedResult) {
        query = query.eq('result', selectedResult);
      }
      if (startDate) {
        query = query.gte('match_date', startDate);
      }
      if (endDate) {
        query = query.lte('match_date', endDate);
      }
      if (teamSearch.length >= 2) {
        query = query.or(
          `home_team_name.ilike.%${teamSearch}%,away_team_name.ilike.%${teamSearch}%`,
        );
      }
      if (refereeTerm.length >= 2) {
        query = query.ilike('referee', `%${refereeTerm}%`);
      }
      if (minGoals !== '') {
        query = query.gte('total_goals_ft', Number(minGoals));
      }
      if (maxGoals !== '') {
        query = query.lte('total_goals_ft', Number(maxGoals));
      }
      if (hasShotDataOnly) {
        query = query.eq('has_shot_data', true);
      }
      if (hasCardDataOnly) {
        query = query.eq('has_card_data', true);
      }

      const { data, error: fetchErr, count } = await query;

      if (fetchErr) throw fetchErr;
      setMatches((data as ArchiveMatch[]) ?? []);
      setTotalCount(count ?? null);
    } catch {
      setError('Maç arşivi yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    selectedCompetitionId,
    selectedSeasonId,
    selectedResult,
    startDate,
    endDate,
    teamSearch,
    refereeTerm,
    minGoals,
    maxGoals,
    hasShotDataOnly,
    hasCardDataOnly,
  ]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Reset page when filters change
  function resetPage() {
    setPage(0);
  }

  function clearAllFilters() {
    setTeamSearchInput('');
    setTeamSearch('');
    setSelectedCompetitionId('');
    setSelectedSeasonId('');
    setSelectedResult('');
    setStartDate('');
    setEndDate('');
    setRefereeInput('');
    setRefereeTerm('');
    setMinGoals('');
    setMaxGoals('');
    setHasShotDataOnly(false);
    setHasCardDataOnly(false);
    setPage(0);
  }

  const hasActiveFilters =
    teamSearch ||
    selectedCompetitionId ||
    selectedSeasonId ||
    selectedResult ||
    startDate ||
    endDate ||
    refereeTerm ||
    minGoals ||
    maxGoals ||
    hasShotDataOnly ||
    hasCardDataOnly;

  const totalPages = totalCount !== null ? Math.ceil(totalCount / PAGE_SIZE) : null;

  useEffect(() => {
    document.title = 'Maç Arşivi — Next59';
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      {/* ── Page Header ── */}
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Archive className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">
                Maç Arşivi
              </h1>
              <p className="mt-1 text-sm text-navy-400 max-w-xl">
                2000'den 2025'e kadar oynanmış maçların skor, sezon, lig ve temel istatistik arşivi.
              </p>
              <p className="mt-1.5 text-xs text-navy-600">
                Bu arşiv canlı maç verisi kullanmaz; yalnızca geçmiş maç kayıtlarından oluşturulmuştur.
              </p>
            </div>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            {[
              { label: 'Toplam Maç', value: '65.104' },
              { label: 'Tarih Aralığı', value: '2000–2025' },
              { label: 'Lig / Turnuva', value: '21' },
              { label: 'Sezon', value: '25' },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3"
              >
                <div className="text-xl font-bold text-white tabular-nums">{s.value}</div>
                <div className="text-[11px] text-navy-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sticky Filter Bar ── */}
      <div className="sticky top-16 z-30 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          {/* Primary filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-500 uppercase tracking-wider shrink-0">
              <Filter className="w-3.5 h-3.5" />
            </div>

            {/* Team search */}
            <div className="relative min-w-[160px] flex-1 max-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
              <input
                type="text"
                placeholder="Takım ara..."
                value={teamSearchInput}
                onChange={(e) => setTeamSearchInput(e.target.value)}
                className="w-full bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-3 py-2 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              />
            </div>

            {/* Competition */}
            <FilterSelect
              value={selectedCompetitionId}
              onChange={(v) => { setSelectedCompetitionId(v); resetPage(); }}
              placeholder="Tüm Ligler"
              options={competitions.map((c) => ({
                label: c.competition_name,
                value: c.competition_id,
              }))}
            />

            {/* Season */}
            <FilterSelect
              value={selectedSeasonId}
              onChange={(v) => { setSelectedSeasonId(v); resetPage(); }}
              placeholder="Tüm Sezonlar"
              options={seasons.map((s) => ({
                label: s.season_label,
                value: s.season_id,
              }))}
            />

            {/* Result */}
            <FilterSelect
              value={selectedResult}
              onChange={(v) => { setSelectedResult(v); resetPage(); }}
              options={RESULT_OPTIONS}
            />

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); resetPage(); }}
                className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              />
              <span className="text-navy-600 text-xs">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); resetPage(); }}
                className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              />
            </div>

            {/* Advanced toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                showAdvanced
                  ? 'bg-champagne/10 border-champagne/30 text-champagne'
                  : 'bg-navy-900 border-navy-700 text-navy-400 hover:text-white hover:border-navy-600'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Gelişmiş
            </button>

            {/* Clear */}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-xs text-navy-500 hover:text-red-400 transition-colors px-2 py-2"
              >
                <X className="w-3.5 h-3.5" />
                Temizle
              </button>
            )}
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-navy-800/50 animate-fade-in">
              {/* Referee */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Hakem ara..."
                  value={refereeInput}
                  onChange={(e) => setRefereeInput(e.target.value)}
                  className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-3 py-2 w-40 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
                />
              </div>

              {/* Min/Max goals */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-navy-500">Gol:</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  placeholder="Min"
                  value={minGoals}
                  onChange={(e) => { setMinGoals(e.target.value); resetPage(); }}
                  className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-2.5 py-2 w-16 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
                />
                <span className="text-navy-600 text-xs">–</span>
                <input
                  type="number"
                  min="0"
                  max="30"
                  placeholder="Max"
                  value={maxGoals}
                  onChange={(e) => { setMaxGoals(e.target.value); resetPage(); }}
                  className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-2.5 py-2 w-16 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
                />
              </div>

              {/* Toggles */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasShotDataOnly}
                  onChange={(e) => { setHasShotDataOnly(e.target.checked); resetPage(); }}
                  className="w-3.5 h-3.5 rounded accent-champagne"
                />
                <span className="text-xs text-navy-400">Şut verisi var</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasCardDataOnly}
                  onChange={(e) => { setHasCardDataOnly(e.target.checked); resetPage(); }}
                  className="w-3.5 h-3.5 rounded accent-champagne"
                />
                <span className="text-xs text-navy-400">Kart verisi var</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Result count */}
        {!loading && totalCount !== null && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-navy-500">
              <span className="text-white font-medium">{totalCount.toLocaleString('tr-TR')}</span>{' '}
              maç bulundu
              {totalPages !== null && (
                <span>
                  {' '}· Sayfa{' '}
                  <span className="text-white font-medium">{page + 1}</span>{' '}
                  / {totalPages.toLocaleString('tr-TR')}
                </span>
              )}
            </p>
          </div>
        )}

        {/* States */}
        {loading ? (
          <ArchiveSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-navy-400">{error}</p>
            <button
              onClick={fetchMatches}
              className="text-xs text-champagne hover:text-champagne-light transition-colors"
            >
              Tekrar Dene
            </button>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Archive className="w-10 h-10 text-navy-700" />
            <p className="text-sm text-navy-500">Bu filtrelerle eşleşen maç bulunamadı.</p>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-champagne hover:text-champagne-light transition-colors"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchRow key={m.match_id} match={m} />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && !error && totalPages !== null && totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-navy-800/50">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-navy-700 bg-navy-900 text-navy-300 hover:text-white hover:border-navy-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Önceki
            </button>

            <div className="flex items-center gap-1">
              {/* Page number pills */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i;
                } else if (page < 4) {
                  pageNum = i < 5 ? i : i === 5 ? -1 : totalPages - 1;
                } else if (page > totalPages - 5) {
                  pageNum = i === 0 ? 0 : i === 1 ? -1 : totalPages - 7 + i;
                } else {
                  const offsets = [0, -1, page - 2, page - 1, page, page + 1, page + 2];
                  pageNum = i < offsets.length ? offsets[i] : -1;
                }

                if (pageNum === -1) {
                  return (
                    <span key={`ellipsis-${i}`} className="text-navy-600 px-1 text-sm">
                      …
                    </span>
                  );
                }

                const isCurrentPage = pageNum === page;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                      isCurrentPage
                        ? 'bg-champagne text-navy-950 font-bold'
                        : 'text-navy-400 hover:text-white hover:bg-navy-800'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min((totalPages ?? 1) - 1, p + 1))}
              disabled={page >= (totalPages ?? 1) - 1}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-navy-700 bg-navy-900 text-navy-300 hover:text-white hover:border-navy-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Sonraki
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
