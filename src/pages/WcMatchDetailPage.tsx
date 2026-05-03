import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, Calendar, Users, ArrowLeft,
  Shield, Clock, ChevronRight, Swords,
} from 'lucide-react';
import { supabaseWcHistory } from '../lib/supabase';
import { STAGE_LABELS, buildScoreLabel, stageOrder, type WcMatch } from './WorldCupHistoryPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WcTeam {
  id: string;
  edition_year: number;
  name_en: string;
  name_tr: string | null;
  iso2: string | null;
  fifa_code: string | null;
  confederation: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Flag({ iso2, size = 'md' }: { iso2: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!iso2) return null;
  const cls = size === 'lg' ? 'w-12 h-8' : size === 'sm' ? 'w-5 h-3.5' : 'w-8 h-5';
  return <span className={`fi fi-${iso2.toLowerCase()} ${cls} rounded-[3px] shadow-sm inline-block`} />;
}

function resultBg(m: WcMatch, side: 'home' | 'away'): string {
  const winner = m.final_winner_name;
  if (!winner) return '';
  const isWinner = side === 'home' ? winner === m.home_team_name : winner === m.away_team_name;
  return isWinner ? 'ring-1 ring-champagne/30' : '';
}

function dateFmt(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function PreviousMeetings({ homeTeamId, awayTeamId, excludeId }: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  excludeId: string;
}) {
  const [meetings, setMeetings] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!homeTeamId || !awayTeamId) { setLoading(false); return; }

    supabaseWcHistory
      .from('wch_matches')
      .select('id,edition_year,match_no,stage_code,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,result_90')
      .or(`and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`)
      .neq('id', excludeId)
      .order('match_date', { ascending: false })
      .then(({ data }) => {
        if (data) setMeetings(data as WcMatch[]);
        setLoading(false);
      });
  }, [homeTeamId, awayTeamId, excludeId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-navy-800/40 rounded-lg animate-pulse" />)}
      </div>
    );
  }
  if (meetings.length === 0) {
    return <p className="text-sm text-navy-500 py-4 text-center">Kayıtlarımızda karşılaşma bulunamadı.</p>;
  }

  return (
    <div className="space-y-1.5">
      {meetings.map((m) => {
        const homeScore = m.home_score_90 ?? m.home_score_ft;
        const awayScore = m.away_score_90 ?? m.away_score_ft;
        const winner = m.final_winner_name;
        const decidedBadge = m.decided_by === 'penalties' ? 'PEN' : m.decided_by === 'extra_time' ? 'UZ' : null;
        return (
          <Link
            key={m.id}
            to={`/world-cup/tarihce/mac/${m.id}`}
            className="flex items-center gap-3 px-3 py-2.5 bg-navy-900/60 border border-navy-800 rounded-lg hover:border-navy-600 hover:bg-navy-900 transition-colors group"
          >
            <span className="text-xs font-bold text-navy-500 shrink-0 w-8">{m.edition_year}</span>
            <span className="text-xs text-navy-500 shrink-0 w-14">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
            <span className={`flex-1 text-xs text-right truncate ${winner === m.home_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>
              {m.home_team_name}
            </span>
            <div className="shrink-0 flex flex-col items-center">
              <span className="text-xs font-bold text-white tabular-nums">{homeScore ?? '?'}–{awayScore ?? '?'}</span>
              {decidedBadge && <span className="text-[9px] text-champagne/70">{decidedBadge}</span>}
            </div>
            <span className={`flex-1 text-xs truncate ${winner === m.away_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>
              {m.away_team_name}
            </span>
            <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}

function TeamHistory({ teamId, teamName, excludeId }: {
  teamId: string | null;
  teamName: string;
  excludeId: string;
}) {
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) { setLoading(false); return; }
    supabaseWcHistory
      .from('wch_matches')
      .select('id,edition_year,match_no,stage_code,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,result_90')
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .neq('id', excludeId)
      .order('edition_year', { ascending: false })
      .order('match_date', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setMatches(data as WcMatch[]);
        setLoading(false);
      });
  }, [teamId, excludeId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 4].map((i) => <div key={i} className="h-10 bg-navy-800/40 rounded-lg animate-pulse" />)}
      </div>
    );
  }
  if (matches.length === 0) {
    return <p className="text-sm text-navy-500 py-4 text-center">Başka maç kaydı yok.</p>;
  }

  // Group by edition
  const byEdition = new Map<number, WcMatch[]>();
  for (const m of matches) {
    if (!byEdition.has(m.edition_year)) byEdition.set(m.edition_year, []);
    byEdition.get(m.edition_year)!.push(m);
  }
  const editions = [...byEdition.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="space-y-3">
      {editions.map(([year, ems]) => (
        <div key={year}>
          <p className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1.5 px-0.5">{year}</p>
          <div className="space-y-1">
            {ems.sort((a, b) => stageOrder(a.stage_code) - stageOrder(b.stage_code)).map((m) => {
              const isHome = m.home_team_name === teamName;
              const opponent = isHome ? m.away_team_name : m.home_team_name;
              const teamScore = isHome
                ? (m.home_score_90 ?? m.home_score_ft)
                : (m.away_score_90 ?? m.away_score_ft);
              const oppScore = isHome
                ? (m.away_score_90 ?? m.away_score_ft)
                : (m.home_score_90 ?? m.home_score_ft);
              const winner = m.final_winner_name;
              const outcomeClass = !winner
                ? 'bg-navy-800/40 text-navy-400'
                : winner === teamName
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20';
              const outcomeLabel = !winner ? 'B' : winner === teamName ? 'G' : 'M';
              const decidedBadge = m.decided_by === 'penalties' ? 'PEN' : m.decided_by === 'extra_time' ? 'UZ' : null;

              return (
                <Link
                  key={m.id}
                  to={`/world-cup/tarihce/mac/${m.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 bg-navy-900/60 border border-navy-800 rounded-lg hover:border-navy-600 hover:bg-navy-900 transition-colors group"
                >
                  <span className={`shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center border ${outcomeClass}`}>
                    {outcomeLabel}
                  </span>
                  <span className="text-xs text-navy-500 shrink-0 w-16">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
                  <span className="flex-1 text-xs text-navy-200 truncate">{isHome ? 'Ev — ' : 'Dep — '}{opponent}</span>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="text-xs font-bold text-white tabular-nums">{teamScore ?? '?'}–{oppScore ?? '?'}</span>
                    {decidedBadge && <span className="text-[9px] text-champagne/70">{decidedBadge}</span>}
                  </div>
                  <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Detail Page ──────────────────────────────────────────────────────────

export default function WcMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<WcMatch | null>(null);
  const [homeTeam, setHomeTeam] = useState<WcTeam | null>(null);
  const [awayTeam, setAwayTeam] = useState<WcTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'h2h' | 'home' | 'away'>('h2h');

  useEffect(() => {
    if (!matchId) return;
    supabaseWcHistory
      .from('wch_matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { navigate('/world-cup/tarihce', { replace: true }); return; }
        const m = data as WcMatch;
        setMatch(m);
        document.title = `${m.home_team_name} vs ${m.away_team_name} · ${m.edition_year} — Next59`;

        // Load teams
        if (m.home_team_id) {
          supabaseWcHistory
            .from('wch_teams')
            .select('id,edition_year,name_en,name_tr,iso2,fifa_code,confederation')
            .eq('id', m.home_team_id)
            .maybeSingle()
            .then(({ data: td }) => { if (td) setHomeTeam(td as WcTeam); });
        }
        if (m.away_team_id) {
          supabaseWcHistory
            .from('wch_teams')
            .select('id,edition_year,name_en,name_tr,iso2,fifa_code,confederation')
            .eq('id', m.away_team_id)
            .maybeSingle()
            .then(({ data: td }) => { if (td) setAwayTeam(td as WcTeam); });
        }
        setLoading(false);
      });
  }, [matchId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-champagne/30 border-t-champagne animate-spin" />
          <p className="text-sm text-navy-500">Yükleniyor…</p>
        </div>
      </div>
    );
  }

  if (!match) return null;

  const homeScore90 = match.home_score_90 ?? match.home_score_ft;
  const awayScore90 = match.away_score_90 ?? match.away_score_ft;
  const winner = match.final_winner_name;
  const isKnockout = match.stage_code !== 'Group stage';
  const stageLabel = STAGE_LABELS[match.stage_code] ?? match.stage_code;
  const groupSuffix = match.group_name ? ` · ${match.group_name}` : '';

  return (
    <div className="min-h-screen">
      {/* Hero scoreboard */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] bg-champagne/3 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          {/* Back + breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs text-navy-500">
            <Link to="/world-cup/tarihce" className="flex items-center gap-1 hover:text-champagne transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Tarihçe
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span>{match.edition_year}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">{stageLabel}{groupSuffix}</span>
          </div>

          {/* Stage badge */}
          <div className="flex justify-center mb-6">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
              isKnockout
                ? 'bg-champagne/10 border-champagne/30 text-champagne'
                : 'bg-navy-800 border-navy-700 text-navy-400'
            }`}>
              {match.stage_code === 'Final' ? <Trophy className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
              {stageLabel}{groupSuffix}
            </span>
          </div>

          {/* Scoreboard */}
          <div className="flex items-center justify-center gap-4 sm:gap-8 mb-6">
            {/* Home team */}
            <div className={`flex flex-col items-center gap-2 flex-1 max-w-[160px] ${resultBg(match, 'home')}`}>
              <Flag iso2={homeTeam?.iso2 ?? null} size="lg" />
              <span className={`text-center text-sm sm:text-base font-bold leading-tight ${winner === match.home_team_name ? 'text-white' : 'text-navy-300'}`}>
                {match.home_team_name}
              </span>
              {homeTeam?.name_tr && homeTeam.name_tr !== match.home_team_name && (
                <span className="text-xs text-navy-500">{homeTeam.name_tr}</span>
              )}
            </div>

            {/* Score */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex items-center gap-3">
                <span className={`text-5xl sm:text-6xl font-black tabular-nums ${winner === match.home_team_name ? 'text-white' : 'text-navy-300'}`}>
                  {homeScore90 ?? '?'}
                </span>
                <span className="text-2xl text-navy-600 font-light">–</span>
                <span className={`text-5xl sm:text-6xl font-black tabular-nums ${winner === match.away_team_name ? 'text-white' : 'text-navy-300'}`}>
                  {awayScore90 ?? '?'}
                </span>
              </div>
              {/* Extra time / penalties */}
              {match.home_score_aet != null && (
                <div className="mt-1 text-xs text-navy-400 tabular-nums">
                  Uzatmada: {match.home_score_aet}–{match.away_score_aet}
                </div>
              )}
              {match.home_penalties != null && (
                <div className="mt-0.5 text-xs font-semibold text-champagne tabular-nums">
                  Penaltı: {match.home_penalties}–{match.away_penalties}
                </div>
              )}
              {/* HT score */}
              {match.home_score_ht != null && (
                <div className="mt-1 text-xs text-navy-500">
                  İlk Yarı: {match.home_score_ht}–{match.away_score_ht}
                </div>
              )}
              {winner && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-champagne bg-champagne/10 border border-champagne/20 px-2.5 py-1 rounded-full">
                  <Trophy className="w-3 h-3" /> {winner}
                </span>
              )}
            </div>

            {/* Away team */}
            <div className={`flex flex-col items-center gap-2 flex-1 max-w-[160px] ${resultBg(match, 'away')}`}>
              <Flag iso2={awayTeam?.iso2 ?? null} size="lg" />
              <span className={`text-center text-sm sm:text-base font-bold leading-tight ${winner === match.away_team_name ? 'text-white' : 'text-navy-300'}`}>
                {match.away_team_name}
              </span>
              {awayTeam?.name_tr && awayTeam.name_tr !== match.away_team_name && (
                <span className="text-xs text-navy-500">{awayTeam.name_tr}</span>
              )}
            </div>
          </div>

          {/* Match meta */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-navy-400">
            {match.match_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {dateFmt(match.match_date)}
              </span>
            )}
            {(match.venue_name || match.city) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {[match.venue_name, match.city].filter(Boolean).join(', ')}
              </span>
            )}
            {match.attendance != null && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {match.attendance.toLocaleString('tr-TR')} seyirci
              </span>
            )}
            {match.referee && (
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Hk: {match.referee}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Full score breakdown card */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-4">Skor Özeti</h3>
          <div className="space-y-2.5">
            {/* Regulation */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-navy-400">90 Dakika</span>
              <span className="text-sm font-bold text-white tabular-nums">
                {homeScore90 ?? '?'} – {awayScore90 ?? '?'}
              </span>
            </div>
            {/* HT */}
            {match.home_score_ht != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-navy-400">İlk Yarı (45')</span>
                <span className="text-sm font-semibold text-navy-200 tabular-nums">
                  {match.home_score_ht} – {match.away_score_ht}
                </span>
              </div>
            )}
            {/* AET */}
            {match.home_score_aet != null && (
              <div className="flex items-center justify-between border-t border-navy-800 pt-2.5">
                <span className="text-sm text-navy-400">Uzatma Sonu</span>
                <span className="text-sm font-semibold text-navy-200 tabular-nums">
                  {match.home_score_aet} – {match.away_score_aet}
                </span>
              </div>
            )}
            {/* Penalties */}
            {match.home_penalties != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-champagne font-semibold">Penaltı Atışları</span>
                <span className="text-sm font-bold text-champagne tabular-nums">
                  {match.home_penalties} – {match.away_penalties}
                </span>
              </div>
            )}
            {/* Decided by */}
            {match.decided_by && match.decided_by !== 'regulation' && (
              <div className="flex items-center justify-between border-t border-navy-800 pt-2.5">
                <span className="text-sm text-navy-500">Sonuç</span>
                <span className="text-xs font-semibold px-2.5 py-1 bg-champagne/10 border border-champagne/20 text-champagne rounded-full">
                  {match.decided_by === 'extra_time' ? 'Uzatmada Bitti' : 'Penaltıda Bitti'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Team info cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { team: homeTeam, name: match.home_team_name, side: 'Ev Sahibi' },
            { team: awayTeam, name: match.away_team_name, side: 'Deplasman' },
          ].map(({ team, name, side }) => (
            <div key={side} className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
              <p className="text-xs text-navy-500 mb-2">{side}</p>
              <div className="flex items-center gap-2.5 mb-3">
                <Flag iso2={team?.iso2 ?? null} size="md" />
                <div>
                  <p className="text-sm font-bold text-white leading-tight">{name}</p>
                  {team?.name_tr && team.name_tr !== name && (
                    <p className="text-xs text-navy-400">{team.name_tr}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                {team?.fifa_code && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy-500">FIFA Kodu</span>
                    <span className="text-xs font-mono font-semibold text-navy-300">{team.fifa_code}</span>
                  </div>
                )}
                {team?.confederation && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy-500">Konfederasyon</span>
                    <span className="text-xs text-navy-300">{team.confederation}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs: H2H / Team histories */}
        <div className="mb-4">
          <div className="flex gap-1 bg-navy-900/60 border border-navy-800 rounded-xl p-1">
            {([
              { key: 'h2h', label: 'Karşılaşmalar', icon: Swords },
              { key: 'home', label: match.home_team_name, icon: Shield },
              { key: 'away', label: match.away_team_name, icon: Shield },
            ] as { key: 'h2h' | 'home' | 'away'; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all truncate ${
                  activeTab === key
                    ? 'bg-navy-800 text-white shadow-sm'
                    : 'text-navy-500 hover:text-navy-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="bg-navy-900/40 border border-navy-800 rounded-xl p-4">
          {activeTab === 'h2h' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
                Dünya Kupası'nda Önceki Karşılaşmalar
              </p>
              <PreviousMeetings
                homeTeamId={match.home_team_id}
                awayTeamId={match.away_team_id}
                excludeId={match.id}
              />
            </>
          )}
          {activeTab === 'home' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
                {match.home_team_name} — WC Geçmişi
              </p>
              <TeamHistory
                teamId={match.home_team_id}
                teamName={match.home_team_name}
                excludeId={match.id}
              />
            </>
          )}
          {activeTab === 'away' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
                {match.away_team_name} — WC Geçmişi
              </p>
              <TeamHistory
                teamId={match.away_team_id}
                teamName={match.away_team_name}
                excludeId={match.id}
              />
            </>
          )}
        </div>

        {/* Match no + source */}
        <div className="mt-6 flex items-center justify-between text-xs text-navy-700">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Maç #{match.match_no} · {match.edition_year} Dünya Kupası
          </span>
          <Link
            to="/world-cup/tarihce"
            className="flex items-center gap-1 hover:text-navy-400 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Tüm Maçlar
          </Link>
        </div>
      </section>
    </div>
  );
}
