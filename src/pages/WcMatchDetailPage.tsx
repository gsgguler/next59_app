import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, Calendar, Users, ArrowLeft,
  Shield, Clock, ChevronRight, Swords,
  CircleDot, ArrowLeftRight, Square,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { STAGE_LABELS, stageOrder, type WcMatch } from './WorldCupHistoryPage';

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

interface WcEvent {
  id: string;
  match_id: string;
  elapsed: number | null;
  extra_time: number | null;
  event_type: string;
  event_detail: string | null;
  player_name: string | null;
  assist_player_name: string | null;
  comments: string | null;
  team_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Flag({ iso2, size = 'md' }: { iso2: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!iso2) return null;
  const style: React.CSSProperties =
    size === 'lg' ? { width: 52, height: 36 }
    : size === 'sm' ? { width: 20, height: 14 }
    : { width: 32, height: 22 };
  return (
    <span
      className={`fi fi-${iso2.toLowerCase()} rounded-[3px] shadow-sm inline-block shrink-0`}
      style={{ ...style, display: 'inline-block' }}
    />
  );
}

function dateFmt(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function elapsedLabel(e: WcEvent): string {
  if (e.elapsed == null) return '';
  if (e.extra_time != null && e.extra_time > 0) return `${e.elapsed}+${e.extra_time}'`;
  return `${e.elapsed}'`;
}

// event_type -> icon + colour
function EventIcon({ type, detail }: { type: string; detail: string | null }) {
  const t = type.toLowerCase();
  const d = (detail ?? '').toLowerCase();

  if (t === 'goal' || t === 'subst' && d === 'own goal') {
    const isOg = d.includes('own goal');
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isOg ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
        <CircleDot className={`w-3 h-3 ${isOg ? 'text-red-400' : 'text-emerald-400'}`} />
      </span>
    );
  }
  if (t === 'card') {
    const isRed = d.includes('red') || d.includes('second yellow');
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy-800">
        <Square className={`w-3 h-3 ${isRed ? 'text-red-400 fill-red-400' : 'text-yellow-400 fill-yellow-400'}`} />
      </span>
    );
  }
  if (t === 'subst') {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy-800">
        <ArrowLeftRight className="w-3 h-3 text-sky-400" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-navy-800">
      <CircleDot className="w-3 h-3 text-navy-500" />
    </span>
  );
}

function eventLabel(ev: WcEvent): string {
  const t = ev.event_type.toLowerCase();
  const d = (ev.event_detail ?? '').toLowerCase();
  if (t === 'goal') {
    if (d.includes('own goal')) return 'Kendi Kalesine';
    if (d.includes('penalty')) return 'Penaltıdan';
    if (d.includes('free kick')) return 'Serbest Vuruştan';
    return 'Gol';
  }
  if (t === 'card') {
    if (d.includes('red') || d.includes('second yellow')) return 'Kırmızı Kart';
    return 'Sarı Kart';
  }
  if (t === 'subst') return 'Oyuncu Değişikliği';
  return ev.event_detail ?? ev.event_type;
}

// ── Match Events Timeline ─────────────────────────────────────────────────────

function EventsTimeline({
  events, homeTeamName, awayTeamName,
}: { events: WcEvent[]; homeTeamName: string; awayTeamName: string }) {
  if (events.length === 0) return (
    <p className="text-sm text-navy-500 py-6 text-center">Bu maç için detaylı olay kaydı bulunmuyor.</p>
  );

  const sorted = [...events].sort((a, b) => {
    const ea = (a.elapsed ?? 0) * 100 + (a.extra_time ?? 0);
    const eb = (b.elapsed ?? 0) * 100 + (b.extra_time ?? 0);
    return ea - eb;
  });

  return (
    <div className="space-y-1">
      {sorted.map((ev) => {
        const isHome = ev.team_name === homeTeamName;
        const isAway = ev.team_name === awayTeamName;
        const isGoal = ev.event_type.toLowerCase() === 'goal';

        return (
          <div
            key={ev.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isGoal ? 'bg-emerald-500/5 border border-emerald-500/10' : 'hover:bg-navy-800/20'} transition-colors`}
          >
            {/* Elapsed */}
            <span className="shrink-0 w-10 text-xs font-mono font-bold text-navy-400 text-right">
              {elapsedLabel(ev)}
            </span>

            {/* Home side */}
            {isHome ? (
              <div className="flex-1 flex items-center gap-2">
                <EventIcon type={ev.event_type} detail={ev.event_detail} />
                <div className="min-w-0">
                  <span className={`text-sm leading-tight block ${isGoal ? 'text-white font-semibold' : 'text-navy-200'} truncate`}>
                    {ev.player_name ?? '—'}
                  </span>
                  <span className="text-xs text-navy-500 leading-tight block">
                    {eventLabel(ev)}
                    {ev.assist_player_name && ` · yrd. ${ev.assist_player_name}`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {/* Center divider */}
            <div className="w-px h-8 bg-navy-800/60 shrink-0" />

            {/* Away side */}
            {isAway ? (
              <div className="flex-1 flex items-center justify-end gap-2">
                <div className="min-w-0 text-right">
                  <span className={`text-sm leading-tight block ${isGoal ? 'text-white font-semibold' : 'text-navy-200'} truncate`}>
                    {ev.player_name ?? '—'}
                  </span>
                  <span className="text-xs text-navy-500 leading-tight block">
                    {eventLabel(ev)}
                    {ev.assist_player_name && ` · yrd. ${ev.assist_player_name}`}
                  </span>
                </div>
                <EventIcon type={ev.event_type} detail={ev.event_detail} />
              </div>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── H2H Previous Meetings ─────────────────────────────────────────────────────

function PreviousMeetings({ homeTeamId, awayTeamId, excludeId }: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  excludeId: string;
}) {
  const [meetings, setMeetings] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!homeTeamId || !awayTeamId) { setLoading(false); return; }
    supabase
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

  if (loading) return (
    <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (meetings.length === 0) return (
    <p className="text-sm text-navy-500 py-4 text-center">Kayıtlarımızda bu iki takımın önceki karşılaşması bulunamadı.</p>
  );

  return (
    <div className="space-y-1.5">
      {meetings.map((m) => {
        const homeScore = m.home_score_90 ?? m.home_score_ft;
        const awayScore = m.away_score_90 ?? m.away_score_ft;
        const winner = m.final_winner_name;
        const badge = m.decided_by === 'penalties' ? 'PEN' : m.decided_by === 'extra_time' ? 'UZ' : null;
        return (
          <Link key={m.id} to={`/world-cup/tarihce/mac/${m.id}`}
            className="flex items-center gap-3 px-3 py-2.5 bg-navy-900/60 border border-navy-800 rounded-lg hover:border-navy-600 hover:bg-navy-900 transition-colors group"
          >
            <span className="text-xs font-bold text-navy-500 shrink-0 w-8">{m.edition_year}</span>
            <span className="text-xs text-navy-500 shrink-0 w-16">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
            <span className={`flex-1 text-xs text-right truncate ${winner === m.home_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>{m.home_team_name}</span>
            <div className="shrink-0 flex flex-col items-center min-w-[48px]">
              <span className="text-xs font-bold text-white tabular-nums">{homeScore ?? '?'}–{awayScore ?? '?'}</span>
              {badge && <span className="text-[9px] text-champagne/70">{badge}</span>}
            </div>
            <span className={`flex-1 text-xs truncate ${winner === m.away_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>{m.away_team_name}</span>
            <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0"/>
          </Link>
        );
      })}
    </div>
  );
}

// ── Team History ──────────────────────────────────────────────────────────────

function TeamHistory({ teamId, teamName, excludeId }: {
  teamId: string | null; teamName: string; excludeId: string;
}) {
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) { setLoading(false); return; }
    supabase
      .from('wch_matches')
      .select('id,edition_year,match_no,stage_code,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,result_90')
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .neq('id', excludeId)
      .order('edition_year', { ascending: false })
      .order('match_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setMatches(data as WcMatch[]);
        setLoading(false);
      });
  }, [teamId, excludeId]);

  if (loading) return (
    <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (matches.length === 0) return (
    <p className="text-sm text-navy-500 py-4 text-center">Başka maç kaydı yok.</p>
  );

  const byEdition = new Map<number, WcMatch[]>();
  for (const m of matches) {
    if (!byEdition.has(m.edition_year)) byEdition.set(m.edition_year, []);
    byEdition.get(m.edition_year)!.push(m);
  }

  return (
    <div className="space-y-4">
      {[...byEdition.entries()].sort((a, b) => b[0] - a[0]).map(([year, ems]) => (
        <div key={year}>
          <p className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1.5 px-0.5">{year} Dünya Kupası</p>
          <div className="space-y-1">
            {ems.sort((a, b) => stageOrder(a.stage_code) - stageOrder(b.stage_code)).map((m) => {
              const isHome = m.home_team_name === teamName;
              const opponent = isHome ? m.away_team_name : m.home_team_name;
              const teamScore = isHome ? (m.home_score_90 ?? m.home_score_ft) : (m.away_score_90 ?? m.away_score_ft);
              const oppScore = isHome ? (m.away_score_90 ?? m.away_score_ft) : (m.home_score_90 ?? m.home_score_ft);
              const winner = m.final_winner_name;
              const badge = m.decided_by === 'penalties' ? 'PEN' : m.decided_by === 'extra_time' ? 'UZ' : null;
              const outcomeClass = !winner
                ? 'bg-navy-800/40 text-navy-400 border-navy-700'
                : winner === teamName
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20';
              return (
                <Link key={m.id} to={`/world-cup/tarihce/mac/${m.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 bg-navy-900/60 border border-navy-800 rounded-lg hover:border-navy-600 hover:bg-navy-900 transition-colors group"
                >
                  <span className={`shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center border ${outcomeClass}`}>
                    {!winner ? 'B' : winner === teamName ? 'G' : 'M'}
                  </span>
                  <span className="text-xs text-navy-500 shrink-0 w-14">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
                  <span className="flex-1 text-xs text-navy-200 truncate">{isHome ? '(Ev) ' : '(Dep) '}{opponent}</span>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="text-xs font-bold text-white tabular-nums">{teamScore ?? '?'}–{oppScore ?? '?'}</span>
                    {badge && <span className="text-[9px] text-champagne/70">{badge}</span>}
                  </div>
                  <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0"/>
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
  const [events, setEvents] = useState<WcEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'events' | 'h2h' | 'home' | 'away'>('events');

  useEffect(() => {
    if (!matchId) return;
    supabase
      .from('wch_matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { navigate('/world-cup/tarihce', { replace: true }); return; }
        const m = data as WcMatch;
        setMatch(m);
        document.title = `${m.home_team_name} – ${m.away_team_name} · ${m.edition_year} Dünya Kupası — Next59`;

        // Load teams in parallel
        if (m.home_team_id) {
          supabase.from('wch_teams').select('id,edition_year,name_en,name_tr,iso2,fifa_code,confederation').eq('id', m.home_team_id).maybeSingle()
            .then(({ data: td }) => { if (td) setHomeTeam(td as WcTeam); });
        }
        if (m.away_team_id) {
          supabase.from('wch_teams').select('id,edition_year,name_en,name_tr,iso2,fifa_code,confederation').eq('id', m.away_team_id).maybeSingle()
            .then(({ data: td }) => { if (td) setAwayTeam(td as WcTeam); });
        }
        // Load events
        supabase.from('wch_events').select('*').eq('match_id', matchId).order('elapsed', { ascending: true })
          .then(({ data: evs }) => { if (evs) setEvents(evs as WcEvent[]); });

        setLoading(false);
      });
  }, [matchId, navigate]);

  const homeScore90 = match ? (match.home_score_90 ?? match.home_score_ft) : null;
  const awayScore90 = match ? (match.away_score_90 ?? match.away_score_ft) : null;

  // Split events by team for scorers summary
  const homeGoals = useMemo(() =>
    events.filter(e => e.event_type.toLowerCase() === 'goal' && e.team_name === match?.home_team_name),
    [events, match]
  );
  const awayGoals = useMemo(() =>
    events.filter(e => e.event_type.toLowerCase() === 'goal' && e.team_name === match?.away_team_name),
    [events, match]
  );

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

  const winner = match.final_winner_name;
  const isKnockout = match.stage_code !== 'Group stage';
  const stageLabel = STAGE_LABELS[match.stage_code] ?? match.stage_code;
  const groupSuffix = match.group_name ? ` · ${match.group_name}` : '';

  return (
    <div className="min-h-screen">
      {/* ── Hero Scoreboard ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] bg-champagne/3 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs text-navy-500">
            <Link to="/world-cup/tarihce" className="flex items-center gap-1 hover:text-champagne transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />Tarihçe
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span>{match.edition_year}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">{stageLabel}{groupSuffix}</span>
          </div>

          {/* Stage badge */}
          <div className="flex justify-center mb-5">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
              isKnockout ? 'bg-champagne/10 border-champagne/30 text-champagne' : 'bg-navy-800 border-navy-700 text-navy-400'
            }`}>
              {match.stage_code === 'Final' ? <Trophy className="w-3.5 h-3.5"/> : <Shield className="w-3.5 h-3.5"/>}
              {stageLabel}{groupSuffix}
            </span>
          </div>

          {/* Scoreboard */}
          <div className="flex items-center justify-center gap-4 sm:gap-10 mb-5">
            {/* Home */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
              <Flag iso2={homeTeam?.iso2 ?? null} size="lg" />
              <span className={`text-center text-sm sm:text-base font-bold leading-tight ${winner === match.home_team_name ? 'text-white' : 'text-navy-300'}`}>
                {homeTeam?.name_tr ?? match.home_team_name}
              </span>
              {homeTeam?.name_en && homeTeam.name_en !== match.home_team_name && (
                <span className="text-xs text-navy-600">{match.home_team_name}</span>
              )}
            </div>

            {/* Score */}
            <div className="flex flex-col items-center shrink-0">
              {/* HT score shown above the main score */}
              {match.home_score_ht != null && (
                <div className="text-xs text-navy-500 mb-1 tabular-nums font-mono">
                  İY {match.home_score_ht}–{match.away_score_ht}
                </div>
              )}
              {/* Main score: final time (AET if played, else 90min) */}
              <div className="flex items-center gap-3">
                <span className={`text-5xl sm:text-6xl font-black tabular-nums ${winner === match.home_team_name ? 'text-white' : 'text-navy-300'}`}>
                  {match.home_score_aet ?? homeScore90 ?? '?'}
                </span>
                <span className="text-2xl text-navy-600 font-light">–</span>
                <span className={`text-5xl sm:text-6xl font-black tabular-nums ${winner === match.away_team_name ? 'text-white' : 'text-navy-300'}`}>
                  {match.away_score_aet ?? awayScore90 ?? '?'}
                </span>
              </div>
              {/* If went to penalties, show PEN below */}
              {match.home_penalties != null && (
                <div className="text-xs font-bold text-champagne tabular-nums mt-1">
                  PEN {match.home_penalties}–{match.away_penalties}
                </div>
              )}
              {/* Decided-by label */}
              {match.decided_by && match.decided_by !== 'regulation' && (
                <div className="text-[10px] text-champagne/60 mt-0.5 uppercase tracking-widest font-semibold">
                  {match.decided_by === 'extra_time' ? 'Uzatmada' : 'Penaltıda'}
                </div>
              )}
              {winner && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-champagne bg-champagne/10 border border-champagne/20 px-2.5 py-1 rounded-full">
                  <Trophy className="w-3 h-3" />
                  {winner === match.home_team_name
                    ? (homeTeam?.name_tr ?? winner)
                    : (awayTeam?.name_tr ?? winner)}
                </span>
              )}
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
              <Flag iso2={awayTeam?.iso2 ?? null} size="lg" />
              <span className={`text-center text-sm sm:text-base font-bold leading-tight ${winner === match.away_team_name ? 'text-white' : 'text-navy-300'}`}>
                {awayTeam?.name_tr ?? match.away_team_name}
              </span>
              {awayTeam?.name_en && awayTeam.name_en !== match.away_team_name && (
                <span className="text-xs text-navy-600">{match.away_team_name}</span>
              )}
            </div>
          </div>

          {/* Goals summary below score (if events exist) */}
          {(homeGoals.length > 0 || awayGoals.length > 0) && (
            <div className="flex justify-center gap-8 mb-5 text-xs">
              <div className="text-right space-y-0.5">
                {homeGoals.map((g, i) => (
                  <div key={i} className="text-navy-300">
                    <span className="text-emerald-400 font-mono">{elapsedLabel(g)}</span>
                    {' '}{g.player_name}
                    {(g.event_detail ?? '').toLowerCase().includes('own goal') && <span className="text-red-400"> (KK)</span>}
                    {(g.event_detail ?? '').toLowerCase().includes('penalty') && <span className="text-champagne/70"> (P)</span>}
                  </div>
                ))}
              </div>
              <div className="w-px bg-navy-800" />
              <div className="text-left space-y-0.5">
                {awayGoals.map((g, i) => (
                  <div key={i} className="text-navy-300">
                    <span className="text-emerald-400 font-mono">{elapsedLabel(g)}</span>
                    {' '}{g.player_name}
                    {(g.event_detail ?? '').toLowerCase().includes('own goal') && <span className="text-red-400"> (KK)</span>}
                    {(g.event_detail ?? '').toLowerCase().includes('penalty') && <span className="text-champagne/70"> (P)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match meta */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-navy-400">
            {match.match_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5"/>{dateFmt(match.match_date)}
              </span>
            )}
            {(match.venue_name || match.city) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5"/>
                {[match.venue_name, match.city].filter(Boolean).join(', ')}
              </span>
            )}
            {match.attendance != null && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5"/>{match.attendance.toLocaleString('tr-TR')} seyirci
              </span>
            )}
            {match.referee && (
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5"/>Hk: {match.referee}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Score breakdown + team cards grid */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Score breakdown */}
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">Skor Özeti</h3>
            <div className="space-y-2">
              {match.home_score_ht != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-navy-400">İlk Yarı</span>
                  <span className="text-sm font-semibold text-navy-200 tabular-nums">{match.home_score_ht} – {match.away_score_ht}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-navy-400">90 Dakika</span>
                <span className="text-sm font-bold text-white tabular-nums">{homeScore90 ?? '?'} – {awayScore90 ?? '?'}</span>
              </div>
              {match.home_score_aet != null && (
                <div className="flex items-center justify-between border-t border-navy-800 pt-2">
                  <span className="text-sm text-navy-400">Uzatma Sonu</span>
                  <span className="text-sm font-bold text-white tabular-nums">{match.home_score_aet} – {match.away_score_aet}</span>
                </div>
              )}
              {match.home_penalties != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-champagne">Penaltı Atışları</span>
                  <span className="text-sm font-bold text-champagne tabular-nums">{match.home_penalties} – {match.away_penalties}</span>
                </div>
              )}
              {match.decided_by && match.decided_by !== 'regulation' && (
                <div className="flex items-center justify-between border-t border-navy-800 pt-2">
                  <span className="text-sm text-navy-500">Sonuç</span>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-champagne/10 border border-champagne/20 text-champagne rounded-full">
                    {match.decided_by === 'extra_time' ? 'Uzatmada bitti' : 'Penaltıda bitti'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Team info */}
          <div className="space-y-3">
            {([
              { team: homeTeam, name: match.home_team_name, side: 'Ev Sahibi' },
              { team: awayTeam, name: match.away_team_name, side: 'Deplasman' },
            ] as { team: WcTeam | null; name: string; side: string }[]).map(({ team, name, side }) => (
              <div key={side} className="bg-navy-900/50 border border-navy-800 rounded-xl p-3">
                <p className="text-xs text-navy-500 mb-2">{side}</p>
                <div className="flex items-center gap-2.5">
                  <Flag iso2={team?.iso2 ?? null} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight truncate">
                      {team?.name_tr ?? name}
                    </p>
                    <p className="text-xs text-navy-400 truncate">{name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {team?.fifa_code && <p className="text-xs font-mono text-navy-400">{team.fifa_code}</p>}
                    {team?.confederation && <p className="text-xs text-navy-600">{team.confederation}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-900/60 border border-navy-800 rounded-xl p-1 mb-4">
          {([
            { key: 'events', label: 'Maç Olayları' },
            { key: 'h2h', label: 'Karşılaşmalar' },
            { key: 'home', label: homeTeam?.name_tr ?? match.home_team_name },
            { key: 'away', label: awayTeam?.name_tr ?? match.away_team_name },
          ] as { key: 'events' | 'h2h' | 'home' | 'away'; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 px-1.5 text-xs font-semibold rounded-lg transition-all truncate ${
                activeTab === key ? 'bg-navy-800 text-white shadow-sm' : 'text-navy-500 hover:text-navy-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-navy-900/40 border border-navy-800 rounded-xl p-4">
          {activeTab === 'events' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">Maç Kronolojisi</p>
              <EventsTimeline events={events} homeTeamName={match.home_team_name} awayTeamName={match.away_team_name}/>
            </>
          )}
          {activeTab === 'h2h' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">Dünya Kupası'nda Önceki Karşılaşmalar</p>
              <PreviousMeetings homeTeamId={match.home_team_id} awayTeamId={match.away_team_id} excludeId={match.id}/>
            </>
          )}
          {activeTab === 'home' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">{homeTeam?.name_tr ?? match.home_team_name} — Dünya Kupası Geçmişi</p>
              <TeamHistory teamId={match.home_team_id} teamName={match.home_team_name} excludeId={match.id}/>
            </>
          )}
          {activeTab === 'away' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">{awayTeam?.name_tr ?? match.away_team_name} — Dünya Kupası Geçmişi</p>
              <TeamHistory teamId={match.away_team_id} teamName={match.away_team_name} excludeId={match.id}/>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-xs text-navy-700">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5"/>
            {match.match_no ? `Maç #${match.match_no} · ` : ''}{match.edition_year} Dünya Kupası
          </span>
          <Link to="/world-cup/tarihce" className="flex items-center gap-1 hover:text-navy-400 transition-colors">
            <ArrowLeft className="w-3 h-3"/>Tüm Maçlar
          </Link>
        </div>
      </section>
    </div>
  );
}
