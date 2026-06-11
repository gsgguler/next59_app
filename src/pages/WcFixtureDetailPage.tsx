import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, Calendar, Users, ArrowLeft, ChevronRight,
  Shield, Clock, Swords, HelpCircle, Globe, BarChart3, Timer,
  Zap, AlertTriangle, Activity, Target, BookOpen, ChevronDown,

} from 'lucide-react';
import {
  ALL_WC2026_FIXTURES, VENUE_META, STAGE_LABELS_TR,
  getUserTimeZone, formatMatchDateTime,
  type WC2026Fixture,
} from '../data/worldCup2026Fixtures';
import { COUNTRY_BY_FIFA } from '../data/worldCup2026Countries';
import { supabase } from '../lib/supabase';
import { STAGE_LABELS, stageOrder, type WcMatch } from './WorldCupHistoryPage';
import type { WcScenarioData, WcTeamProfile } from '../hooks/useWcScenarios';
import SEO from '../components/seo/SEO';

const userTZ = getUserTimeZone();

// ── Team Past WC History (from DB) ───────────────────────────────────────────

function TeamPastWC({ teamCode, teamNameEn }: { teamCode: string; teamNameEn: string }) {
  const [matches, setMatches] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Map FIFA 3-letter codes to common DB name variants
  const NAME_OVERRIDES: Record<string, string> = {
    'USA': 'USA',
    'GER': 'Germany',
    'ENG': 'England',
    'KOR': 'South Korea',
    'CIV': "Côte d'Ivoire",
    'NED': 'Netherlands',
    'BEL': 'Belgium',
    'SUI': 'Switzerland',
    'URU': 'Uruguay',
    'ARG': 'Argentina',
    'BRA': 'Brazil',
    'FRA': 'France',
    'ESP': 'Spain',
    'POR': 'Portugal',
    'JPN': 'Japan',
    'MEX': 'Mexico',
    'AUS': 'Australia',
    'CAN': 'Canada',
    'SCO': 'Scotland',
    'TUR': 'Turkey',
    'CRO': 'Croatia',
    'SEN': 'Senegal',
    'MAR': 'Morocco',
    'NOR': 'Norway',
    'QAT': 'Qatar',
    'IRN': 'Iran',
    'IRQ': 'Iraq',
    'KSA': 'Saudi Arabia',
    'ECU': 'Ecuador',
    'CPV': 'Cape Verde',
    'COD': 'DR Congo',
    'COL': 'Colombia',
    'GHA': 'Ghana',
    'PAR': 'Paraguay',
    'NZL': 'New Zealand',
    'EGY': 'Egypt',
    'RSA': 'South Africa',
    'ALG': 'Algeria',
    'AUT': 'Austria',
    'JOR': 'Jordan',
    'HAI': 'Haiti',
    'UZB': 'Uzbekistan',
    'CUW': 'Curaçao',
    'PAN': 'Panama',
    'TUN': 'Tunisia',
    'BIH': 'Bosnia and Herzegovina',
    'SWE': 'Sweden',
    'CZE': 'Czech Republic',
  };

  const dbName = NAME_OVERRIDES[teamCode] ?? teamNameEn;

  useEffect(() => {
    supabase
      .from('wch_matches')
      .select('id,edition_year,stage_code,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,result_90')
      .or(`home_team_name.eq.${dbName},away_team_name.eq.${dbName}`)
      .order('edition_year', { ascending: false })
      .order('match_date', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (data) setMatches(data as WcMatch[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dbName]);

  if (loading) return (
    <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (matches.length === 0) return (
    <div className="text-center py-8">
      <Globe className="w-8 h-8 mx-auto mb-2 text-navy-700"/>
      <p className="text-sm text-slate-300">Dünya Kupası geçmiş kaydı bulunamadı.</p>
      <p className="text-xs text-slate-400 mt-1">({dbName} olarak arandı)</p>
    </div>
  );

  // Editions summary
  const byEdition = new Map<number, WcMatch[]>();
  for (const m of matches) {
    if (!byEdition.has(m.edition_year)) byEdition.set(m.edition_year, []);
    byEdition.get(m.edition_year)!.push(m);
  }

  const totalG = matches.filter(m => m.final_winner_name === dbName).length;
  const totalB = matches.filter(m => !m.final_winner_name).length;
  const totalM = matches.filter(m => m.final_winner_name && m.final_winner_name !== dbName).length;

  return (
    <div>
      {/* W/D/L summary */}
      <div className="flex gap-3 mb-4">
        {[
          { label: 'Galibiyet', val: totalG, cls: 'text-emerald-400' },
          { label: 'Beraberlik', val: totalB, cls: 'text-slate-300' },
          { label: 'Mağlubiyet', val: totalM, cls: 'text-red-400' },
          { label: 'Toplam', val: matches.length, cls: 'text-champagne' },
        ].map(s => (
          <div key={s.label} className="flex-1 text-center bg-navy-900/60 border border-navy-800 rounded-lg py-2">
            <p className={`text-lg font-black ${s.cls}`}>{s.val}</p>
            <p className="text-xs text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Matches by edition */}
      <div className="space-y-4">
        {[...byEdition.entries()].sort((a, b) => b[0] - a[0]).map(([year, ems]) => (
          <div key={year}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-0.5">{year} Dünya Kupası</p>
            <div className="space-y-1">
              {ems.sort((a, b) => stageOrder(a.stage_code) - stageOrder(b.stage_code)).map((m) => {
                const isHome = m.home_team_name === dbName;
                const opponent = isHome ? m.away_team_name : m.home_team_name;
                const teamScore = isHome ? (m.home_score_90 ?? m.home_score_ft) : (m.away_score_90 ?? m.away_score_ft);
                const oppScore = isHome ? (m.away_score_90 ?? m.away_score_ft) : (m.home_score_90 ?? m.home_score_ft);
                const winner = m.final_winner_name;
                const badge = m.decided_by === 'penalties' ? 'PEN' : m.decided_by === 'extra_time' ? 'UZ' : null;
                const outcomeClass = !winner
                  ? 'bg-navy-800/40 text-navy-400 border-navy-700'
                  : winner === dbName
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20';
                return (
                  <Link key={m.id} to={`/world-cup/tarihce/mac/${m.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 bg-navy-900/60 border border-navy-800 rounded-lg hover:border-navy-600 hover:bg-navy-900 transition-colors group"
                  >
                    <span className={`shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center border ${outcomeClass}`}>
                      {!winner ? 'B' : winner === dbName ? 'G' : 'M'}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0 w-14">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
                    <span className="flex-1 text-xs text-slate-200 truncate">{isHome ? '(Ev) ' : '(Dep) '}{opponent}</span>
                    <div className="shrink-0 flex items-center gap-1">
                      <span className="text-xs font-bold text-white tabular-nums">{teamScore ?? '?'}–{oppScore ?? '?'}</span>
                      {badge && <span className="text-xs text-champagne/80 font-medium">{badge === 'PEN' ? 'Pen.' : 'Uzatma'}</span>}
                    </div>
                    <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0"/>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── H2H Past WC Meetings ─────────────────────────────────────────────────────

function H2HPastWC({ homeCode, awayCode, homeName, awayName }: {
  homeCode: string; awayCode: string; homeName: string; awayName: string;
}) {
  const [meetings, setMeetings] = useState<WcMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const NAME_MAP: Record<string, string> = {
    'USA': 'USA', 'GER': 'Germany', 'ENG': 'England', 'KOR': 'South Korea',
    'NED': 'Netherlands', 'FRA': 'France', 'ESP': 'Spain', 'ARG': 'Argentina',
    'BRA': 'Brazil', 'POR': 'Portugal', 'MEX': 'Mexico', 'JPN': 'Japan',
    'URU': 'Uruguay', 'BEL': 'Belgium', 'SUI': 'Switzerland', 'CRO': 'Croatia',
    'SEN': 'Senegal', 'MAR': 'Morocco', 'TUR': 'Turkey', 'KSA': 'Saudi Arabia',
    'CIV': "Côte d'Ivoire", 'AUS': 'Australia', 'CAN': 'Canada', 'IRN': 'Iran',
    'QAT': 'Qatar', 'ECU': 'Ecuador', 'COL': 'Colombia', 'GHA': 'Ghana',
    'PAR': 'Paraguay', 'NOR': 'Norway', 'EGY': 'Egypt', 'RSA': 'South Africa',
    'ALG': 'Algeria', 'AUT': 'Austria', 'SCO': 'Scotland', 'NZL': 'New Zealand',
    'SWE': 'Sweden', 'CZE': 'Czech Republic', 'TUN': 'Tunisia',
  };

  const hn = NAME_MAP[homeCode] ?? homeName;
  const an = NAME_MAP[awayCode] ?? awayName;

  useEffect(() => {
    supabase
      .from('wch_matches')
      .select('id,edition_year,stage_code,group_name,match_date,home_team_name,away_team_name,home_score_ft,away_score_ft,home_score_90,away_score_90,decided_by,home_score_aet,away_score_aet,home_penalties,away_penalties,final_winner_name,result_90')
      .or(
        `and(home_team_name.eq.${hn},away_team_name.eq.${an}),and(home_team_name.eq.${an},away_team_name.eq.${hn})`
      )
      .order('match_date', { ascending: false })
      .then(({ data }) => {
        if (data) setMeetings(data as WcMatch[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hn, an]);

  if (loading) return (
    <div className="space-y-2">{[0,1].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (meetings.length === 0) return (
    <div className="text-center py-8">
      <Swords className="w-8 h-8 mx-auto mb-2 text-navy-700"/>
      <p className="text-sm text-slate-300">Bu iki takım daha önce Dünya Kupası'nda karşılaşmamış.</p>
      <p className="text-xs text-slate-400 mt-1">({hn} vs {an})</p>
    </div>
  );

  // Overall stats
  const hnWins = meetings.filter(m => m.final_winner_name === hn).length;
  const anWins = meetings.filter(m => m.final_winner_name === an).length;
  const draws = meetings.filter(m => !m.final_winner_name).length;

  return (
    <div>
      {/* H2H summary bar */}
      <div className="flex items-center gap-2 mb-4 bg-navy-900/60 border border-navy-800 rounded-xl p-3">
        <div className="flex-1 text-right">
          <p className="text-sm font-bold text-white">{homeName}</p>
          <p className="text-2xl font-black text-champagne">{hnWins}</p>
        </div>
        <div className="px-4 text-center">
          <p className="text-xs text-slate-400 mb-0.5">Karşılaşma</p>
          <p className="text-xl font-black text-slate-200">{meetings.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Beraberlik: {draws}</p>
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-white">{awayName}</p>
          <p className="text-2xl font-black text-champagne">{anWins}</p>
        </div>
      </div>

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
              <span className="text-xs font-bold text-slate-300 shrink-0 w-8">{m.edition_year}</span>
              <span className="text-xs text-slate-400 shrink-0 w-16">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
              <span className={`flex-1 text-xs text-right truncate ${winner === m.home_team_name ? 'text-white font-semibold' : 'text-slate-400'}`}>
                {m.home_team_name}
              </span>
              <div className="shrink-0 flex flex-col items-center min-w-[52px]">
                <span className="text-xs font-bold text-white tabular-nums">{homeScore ?? '?'}–{awayScore ?? '?'}</span>
                {badge && <span className="text-xs text-champagne/80 font-medium">{badge === 'PEN' ? 'Pen.' : 'Uzatma'}</span>}
              </div>
              <span className={`flex-1 text-xs truncate ${winner === m.away_team_name ? 'text-white font-semibold' : 'text-slate-400'}`}>
                {m.away_team_name}
              </span>
              <ChevronRight className="w-3 h-3 text-navy-700 group-hover:text-champagne transition-colors shrink-0"/>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Group Standings Context ───────────────────────────────────────────────────

function GroupContext({ fixture, allFixtures }: { fixture: WC2026Fixture; allFixtures: WC2026Fixture[] }) {
  if (!fixture.group) return null;
  const groupFixtures = allFixtures.filter(f => f.group === fixture.group && f.stage === 'Group Stage');
  const teams = [...new Set([
    ...groupFixtures.map(f => f.home_team_code),
    ...groupFixtures.map(f => f.away_team_code),
  ])];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Grup {fixture.group} Fikstürü</p>
      <div className="space-y-1">
        {groupFixtures.map((f) => {
          const hc = COUNTRY_BY_FIFA[f.home_team_code];
          const ac = COUNTRY_BY_FIFA[f.away_team_code];
          const isCurrent = f.id === fixture.id;
          return (
            <div key={f.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                isCurrent ? 'bg-champagne/5 border-champagne/20' : 'bg-navy-900/40 border-navy-800/60'
              }`}
            >
              <span className="text-xs text-slate-400 shrink-0 w-20">{formatMatchDateTime(f.kickoff_utc, userTZ)}</span>
              <span className="flex items-center gap-1.5 flex-1 justify-end">
                {hc && <span className={`fi fi-${hc.iso2} rounded-[3px] shrink-0`} style={{width:16,height:11,display:'inline-block'}}/>}
                <span className={`text-xs truncate ${isCurrent ? 'text-white font-semibold' : 'text-slate-300'}`}>{hc?.name_tr ?? f.home_team}</span>
              </span>
              <span className="text-xs text-slate-400 shrink-0">–</span>
              <span className="flex items-center gap-1.5 flex-1">
                {ac && <span className={`fi fi-${ac.iso2} rounded-[3px] shrink-0`} style={{width:16,height:11,display:'inline-block'}}/>}
                <span className={`text-xs truncate ${isCurrent ? 'text-white font-semibold' : 'text-slate-300'}`}>{ac?.name_tr ?? f.away_team}</span>
              </span>
              {isCurrent && <span className="text-xs text-champagne shrink-0">← Bu Maç</span>}
            </div>
          );
        })}
      </div>
      {teams.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {teams.map(code => {
            const c = COUNTRY_BY_FIFA[code];
            if (!c) return null;
            const isCurrent = code === fixture.home_team_code || code === fixture.away_team_code;
            return (
              <span key={code} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                isCurrent ? 'bg-champagne/10 border-champagne/30 text-white font-semibold' : 'bg-navy-900/60 border-navy-800 text-slate-400'
              }`}>
                <span className={`fi fi-${c.iso2} rounded-[2px]`} style={{width:14,height:10,display:'inline-block'}}/>
                {c.name_tr}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 90-Minute Scenario Panel ──────────────────────────────────────────────────

interface Wc90MinData {
  tempo_profile: string | null;
  first_15_story: string | null;
  minutes_15_30_story: string | null;
  minutes_30_45_story: string | null;
  minutes_45_60_story: string | null;
  minutes_60_75_story: string | null;
  minutes_75_90_story: string | null;
  key_match_triggers: string[] | null;
  confidence_label: string | null;
}

// ── DB-driven 5-min flow types ────────────────────────────────────────────────

interface FlowPeriodRow {
  period_start: number;
  period_end: number;
  period_label: string;
  goal_risk_home: number;
  goal_risk_away: number;
  home_pressure_score: number;
  away_pressure_score: number;
  yellow_card_risk_home: number;
  yellow_card_risk_away: number;
  red_card_risk_home: number;
  red_card_risk_away: number;
  corner_risk_home: number;
  corner_risk_away: number;
  foul_risk_home: number;
  foul_risk_away: number;
  offside_risk_home: number;
  offside_risk_away: number;
  narrative_text: string | null;
  confidence: number;
  expected_momentum_side: string | null;
  scenario_version: number;
}

interface ProjectedStatsRow {
  home_team_name: string;
  away_team_name: string;
  home_total_shots: number;
  away_total_shots: number;
  home_shots_on_target: number;
  away_shots_on_target: number;
  home_possession_pct: number;
  away_possession_pct: number;
  home_fouls: number;
  away_fouls: number;
  home_yellow_cards: number;
  away_yellow_cards: number;
  home_red_cards: number;
  away_red_cards: number;
  home_offsides: number;
  away_offsides: number;
  home_corners: number;
  away_corners: number;
  home_goals_projection: number;
  away_goals_projection: number;
  home_xg: number;
  away_xg: number;
  confidence: number;
}

function periodColor(start: number): string {
  if (start < 20) return 'text-sky-400';
  if (start < 45) return 'text-amber-400';
  if (start < 65) return 'text-emerald-400';
  if (start < 75) return 'text-orange-400';
  return 'text-red-400';
}

function RiskBadge({ value, label, color = 'amber' }: { value: number; label: string; color?: string }) {
  const pct = Math.round(value * 100);
  const cls = color === 'red' ? 'bg-red-900/40 text-red-300 border-red-700/40'
    : color === 'sky' ? 'bg-sky-900/40 text-sky-300 border-sky-700/40'
    : color === 'emerald' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40'
    : color === 'orange' ? 'bg-orange-900/40 text-orange-300 border-orange-700/40'
    : 'bg-amber-900/40 text-amber-300 border-amber-700/40';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {label} <span className="font-mono font-bold">{pct}%</span>
    </span>
  );
}

function MomentumDot({ side }: { side: string | null }) {
  if (!side || side === 'balanced') return <span className="text-[10px] text-slate-500">—</span>;
  const cls = side === 'home' ? 'bg-champagne' : 'bg-sky-400';
  const label = side === 'home' ? 'Ev' : 'Dep';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}


function Wc5MinFlowPanel({ fixtureUuid, apiFootballFixtureId, isTBD }: { fixtureUuid: string | null; apiFootballFixtureId: number | null; isTBD: boolean }) {
  const [rows, setRows] = useState<FlowPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [keyTriggers, setKeyTriggers] = useState<string[]>([]);

  useEffect(() => {
    if (isTBD) { setLoading(false); return; }
    if (!fixtureUuid) { setLoading(false); return; }
    supabase
      .from('wc2026_5min_flow_scenarios')
      .select('period_start,period_end,period_label,goal_risk_home,goal_risk_away,home_pressure_score,away_pressure_score,yellow_card_risk_home,yellow_card_risk_away,red_card_risk_home,red_card_risk_away,corner_risk_home,corner_risk_away,foul_risk_home,foul_risk_away,offside_risk_home,offside_risk_away,narrative_text,confidence,expected_momentum_side,scenario_version')
      .eq('fixture_id', fixtureUuid)
      .eq('is_current', true)
      .eq('is_public', true)
      .order('period_start', { ascending: true })
      .then(res => {
        if (res?.data) setRows(res.data as FlowPeriodRow[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fixtureUuid, isTBD]);

  // Pull key_match_triggers from legacy 90-min scenarios table
  useEffect(() => {
    if (isTBD || !apiFootballFixtureId) return;
    supabase
      .from('wc2026_match_90min_scenarios')
      .select('key_match_triggers')
      .eq('fixture_id', apiFootballFixtureId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(res => {
        if (res?.data?.key_match_triggers) setKeyTriggers(res.data.key_match_triggers as string[]);
      });
  }, [apiFootballFixtureId, isTBD]);

  const ver = rows[0]?.scenario_version ?? 1;

  return (
    <div className="border border-navy-800/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-navy-800/30 hover:bg-navy-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Timer className="w-4 h-4 text-champagne shrink-0" />
          <span className="text-sm font-bold text-white">5 Dakikalık Maç Senaryosu</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-700 text-navy-300 font-mono">v{ver}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 bg-navy-900/20">
          <p className="text-[11px] text-navy-500 leading-relaxed">
            Bu alan gerçek maç sonucu değildir. Next59 modeli; takım geçmişi, eleme performansı, oyuncu profilleri, venue psikolojisi ve kadro güncellemelerine göre 5 dakikalık akış projeksiyonu üretir.
          </p>

          <div className="space-y-0.5">
            {rows.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">5 dakikalık maç senaryosu hazırlanıyor.</p>
            ) : rows.map(row => {
              const col = periodColor(row.period_start);
              const maxGoal = Math.max(row.goal_risk_home, row.goal_risk_away);
              const maxCard = Math.max(row.yellow_card_risk_home, row.yellow_card_risk_away);
              const maxCorner = Math.max(row.corner_risk_home, row.corner_risk_away);
              const maxFoul = Math.max(row.foul_risk_home, row.foul_risk_away);
              return (
                <div key={row.period_start} className="flex flex-col gap-1 px-2.5 py-2 rounded-md bg-navy-800/25 border border-white/[0.04] hover:bg-navy-800/40 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`shrink-0 text-[11px] font-bold font-mono w-10 ${col}`}>{row.period_label}'</span>
                    <MomentumDot side={row.expected_momentum_side} />
                    <div className="flex items-center gap-1 flex-wrap">
                      {maxGoal > 0.04 && (
                        <RiskBadge value={maxGoal} label="Gol riski" color="amber" />
                      )}
                      {maxCard > 0.04 && (
                        <RiskBadge value={maxCard} label="Kart riski" color="red" />
                      )}
                      {maxCorner > 0.04 && (
                        <RiskBadge value={maxCorner} label="Korner riski" color="sky" />
                      )}
                      {maxFoul > 0.08 && (
                        <RiskBadge value={maxFoul} label="Faul yoğunluğu" color="orange" />
                      )}
                    </div>
                  </div>
                  {row.narrative_text && (
                    <p className="text-[11px] text-slate-400 leading-snug pl-12">{row.narrative_text}</p>
                  )}
                </div>
              );
            })}
          </div>

          {keyTriggers.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Kritik Tetikleyiciler</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keyTriggers.map((t, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-navy-800 border border-navy-700 text-slate-300">{t}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 pt-1 border-t border-navy-800/40">
            <AlertTriangle className="w-3.5 h-3.5 text-navy-500 shrink-0 mt-0.5" />
            <p className="text-xs text-navy-500 leading-relaxed">
              Bu çalışma, maç öncesi mevcut verilerle hazırlanmış yapay zekâ destekli istatistiksel senaryo analizidir. Kesin sonuç vaadi içermez.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

function safeNum(v: number | null | undefined): number | null {
  if (v == null || isNaN(Number(v))) return null;
  return Number(v);
}

function fmtStat(v: number | null | undefined, decimals = 1): string {
  const n = safeNum(v);
  return n != null ? n.toFixed(decimals) : '—';
}

function fmtPct(v: number | null | undefined): string {
  const n = safeNum(v);
  return n != null ? n.toFixed(0) + '%' : '—';
}

function WcProjectedStatsCard({ fixtureUuid, isTBD }: { fixtureUuid: string | null; isTBD: boolean }) {
  const [stats, setStats] = useState<ProjectedStatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isTBD) { setLoading(false); return; }
    if (!fixtureUuid) { setLoading(false); return; }
    supabase
      .from('wc2026_projected_match_stats')
      .select('*')
      .eq('fixture_id', fixtureUuid)
      .eq('is_current', true)
      .eq('is_public', true)
      .maybeSingle()
      .then(res => {
        if (res?.data) setStats(res.data as ProjectedStatsRow);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fixtureUuid, isTBD]);

  if (isTBD) return null;

  const hasStats = !loading && stats != null;

  interface StatRowDef { label: string; h: number | null; a: number | null; fmt: (v: number | null) => string }
  const statRows: StatRowDef[] = hasStats && stats ? [
    { label: 'Toplam Şut', h: safeNum(stats.home_total_shots), a: safeNum(stats.away_total_shots), fmt: v => fmtStat(v, 1) },
    { label: 'İsabetli Şut', h: safeNum(stats.home_shots_on_target), a: safeNum(stats.away_shots_on_target), fmt: v => fmtStat(v, 1) },
    { label: 'Top Hakimiyeti', h: safeNum(stats.home_possession_pct), a: safeNum(stats.away_possession_pct), fmt: v => fmtPct(v) },
    { label: 'Korner', h: safeNum(stats.home_corners), a: safeNum(stats.away_corners), fmt: v => fmtStat(v, 1) },
    { label: 'Faul', h: safeNum(stats.home_fouls), a: safeNum(stats.away_fouls), fmt: v => fmtStat(v, 1) },
    { label: 'Sarı Kart', h: safeNum(stats.home_yellow_cards), a: safeNum(stats.away_yellow_cards), fmt: v => fmtStat(v, 2) },
    { label: 'Kırmızı Kart', h: safeNum(stats.home_red_cards), a: safeNum(stats.away_red_cards), fmt: v => fmtStat(v, 2) },
    { label: 'Ofsayt', h: safeNum(stats.home_offsides), a: safeNum(stats.away_offsides), fmt: v => fmtStat(v, 1) },
    ...(safeNum(stats.home_xg) != null || safeNum(stats.away_xg) != null
      ? [{ label: 'xG', h: safeNum(stats.home_xg), a: safeNum(stats.away_xg), fmt: (v: number | null) => fmtStat(v, 2) }]
      : []),
  ] : [];

  return (
    <div className="border border-navy-800/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-navy-800/30 hover:bg-navy-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Target className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-sm font-bold text-white">Olası Maç İstatistik Projeksiyonu</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/40 border border-sky-700/40 text-sky-300 font-medium">
            Model Tahmini
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 bg-navy-900/20">
          {loading ? (
            <div className="space-y-2">
              {[0,1,2].map(i => <div key={i} className="h-4 bg-navy-800/30 rounded animate-pulse"/>)}
            </div>
          ) : !hasStats ? (
            <p className="text-xs text-slate-400 py-2">İstatistik projeksiyonu hazırlanıyor.</p>
          ) : stats && (
            <>
              {/* Projected score */}
              <div className="flex items-center justify-center gap-4 py-2.5 bg-navy-800/40 rounded-lg">
                <span className="text-xs font-semibold text-slate-300 truncate max-w-[80px]">{stats.home_team_name}</span>
                <span className="text-xl font-black font-mono text-champagne tabular-nums">
                  {fmtStat(safeNum(stats.home_goals_projection), 1)} – {fmtStat(safeNum(stats.away_goals_projection), 1)}
                </span>
                <span className="text-xs font-semibold text-slate-300 truncate max-w-[80px]">{stats.away_team_name}</span>
              </div>

              {/* Confidence */}
              {safeNum(stats.confidence) != null && (
                <div className="flex items-center justify-center">
                  <span className="text-[11px] text-slate-500">Model güven skoru: </span>
                  <span className="text-[11px] font-semibold text-sky-400 ml-1">{Math.round(safeNum(stats.confidence)! * 100)}%</span>
                </div>
              )}

              {/* Stat comparison rows */}
              <div className="space-y-2 pt-1">
                {statRows.map(({ label, h, a, fmt }) => {
                  const hn = safeNum(h) ?? 0;
                  const an = safeNum(a) ?? 0;
                  const total = hn + an;
                  const hPct = total > 0 ? Math.round((hn / total) * 100) : 50;
                  const aPct = 100 - hPct;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-champagne tabular-nums">{fmt(h)}</span>
                        <span className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</span>
                        <span className="text-xs font-mono text-sky-300 tabular-nums">{fmt(a)}</span>
                      </div>
                      <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden flex gap-px">
                        <div className="bg-champagne/70 rounded-l-full transition-all" style={{ width: `${hPct}%` }} />
                        <div className="bg-sky-400/70 rounded-r-full transition-all" style={{ width: `${aPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-start gap-2 pt-1 border-t border-navy-800/40">
            <Activity className="w-3.5 h-3.5 text-navy-500 shrink-0 mt-0.5" />
            <p className="text-xs text-navy-500 leading-relaxed">
              Bu çalışma, maç öncesi mevcut verilerle hazırlanmış yapay zekâ destekli istatistiksel senaryo analizidir. Kesin sonuç vaadi içermez.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WcOldScenariosSection({ fixtureUuid }: { fixtureUuid: string | null }) {
  const [versions, setVersions] = useState<number[]>([]);
  const [selectedVer, setSelectedVer] = useState<number | null>(null);
  const [oldRows, setOldRows] = useState<FlowPeriodRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!fixtureUuid) return;
    supabase
      .from('wc2026_5min_flow_scenarios')
      .select('scenario_version')
      .eq('fixture_id', fixtureUuid)
      .eq('is_current', false)
      .order('scenario_version', { ascending: false })
      .then(res => {
        if (!res?.data) return;
        const vers = [...new Set((res.data as { scenario_version: number }[]).map(r => r.scenario_version))];
        setVersions(vers);
        if (vers.length > 0) setSelectedVer(vers[0]);
      });
  }, [fixtureUuid]);

  useEffect(() => {
    if (!open || selectedVer === null || !fixtureUuid) return;
    supabase
      .from('wc2026_5min_flow_scenarios')
      .select('period_start,period_end,period_label,goal_risk_home,goal_risk_away,home_pressure_score,away_pressure_score,yellow_card_risk_home,yellow_card_risk_away,red_card_risk_home,red_card_risk_away,corner_risk_home,corner_risk_away,foul_risk_home,foul_risk_away,offside_risk_home,offside_risk_away,narrative_text,confidence,expected_momentum_side,scenario_version')
      .eq('fixture_id', fixtureUuid)
      .eq('scenario_version', selectedVer)
      .order('period_start', { ascending: true })
      .then(res => {
        if (res?.data) setOldRows(res.data as FlowPeriodRow[]);
      });
  }, [fixtureUuid, open, selectedVer]);

  if (versions.length === 0) return null;

  return (
    <div className="border border-navy-800/40 rounded-xl overflow-hidden opacity-70 hover:opacity-100 transition-opacity">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-navy-900/30 hover:bg-navy-800/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-sm font-medium text-slate-400">Eski Yorum</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-slate-500 font-mono">{versions.length} versiyon</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-navy-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3 bg-navy-900/10">
          {versions.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {versions.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedVer(v)}
                  className={`text-xs px-2.5 py-1 rounded border font-mono transition-colors ${
                    selectedVer === v
                      ? 'bg-navy-700 border-navy-600 text-slate-200'
                      : 'bg-navy-900/40 border-navy-800 text-slate-500 hover:border-navy-700'
                  }`}
                >
                  v{v}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-0.5">
            {oldRows.map(row => (
              <div key={row.period_start} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-navy-800/15 border border-white/[0.02]">
                <span className="shrink-0 text-[11px] font-bold font-mono w-10 text-slate-500">{row.period_label}'</span>
                <p className="text-[11px] text-slate-600 leading-snug">{row.narrative_text ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Enriched qualifier stats from wc_qualifier_team_summary ──────────────────

interface WcEnrichedQualifier {
  team_name: string;
  confederation: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  win_rate: number;
  goals_for_per_match: number;
  goals_against_per_match: number;
  avg_possession_pct: number | null;
  avg_total_shots: number | null;
  avg_shots_on_goal: number | null;
  avg_corners: number | null;
  avg_yellow_cards: number | null;
  total_xg: number | null;
  xg_per_match: number | null;
}

// ── Prediction Panel ──────────────────────────────────────────────────────────

interface DisplayProbs {
  home_pct: number;
  draw_pct: number;
  away_pct: number;
  display_label: string;
}

interface WcScenarioState {
  scenario: WcScenarioData | null;
  homeProfile: WcTeamProfile | null;
  awayProfile: WcTeamProfile | null;
  homeQualifier: WcEnrichedQualifier | null;
  awayQualifier: WcEnrichedQualifier | null;
  scenario90: Wc90MinData | null;
  calibratedAt: string | null;
  displayProbs: DisplayProbs | null;
}

function ConfidenceDot({ level }: { level: string }) {
  const color =
    level === 'HIGH' ? 'bg-emerald-500' :
    level === 'MEDIUM' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`w-2 h-2 rounded-full ${color} inline-block shrink-0`} />;
}

const CONFIDENCE_TR: Record<string, string> = {
  HIGH: 'Yüksek',
  MEDIUM: 'Orta',
  LOW: 'Düşük',
};

const TEMPO_TR: Record<string, string> = {
  HIGH: 'Yüksek Tempo',
  MEDIUM: 'Orta Tempo',
  LOW: 'Düşük Tempo',
  high: 'Yüksek Tempo',
  medium: 'Orta Tempo',
  low: 'Düşük Tempo',
};

function confidenceTr(level: string): string {
  return CONFIDENCE_TR[level?.toUpperCase()] ?? level;
}

function tempoTr(level: string): string {
  return TEMPO_TR[level] ?? level;
}

function RiskBar({ value, label, color = 'amber' }: { value: number; label: string; color?: 'amber' | 'red' | 'sky' | 'emerald' }) {
  const pct = Math.round(value * 100);
  const barColor =
    color === 'red' ? 'bg-red-500' :
    color === 'sky' ? 'bg-sky-400' :
    color === 'emerald' ? 'bg-emerald-500' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-300 w-28 shrink-0 leading-tight">{label}</span>
      <div className="flex-1 h-2 bg-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums text-slate-200 w-9 text-right font-semibold">{pct}%</span>
    </div>
  );
}

function TeamStrengthRow({ profile, side }: { profile: WcTeamProfile; side: 'home' | 'away' }) {
  const isHome = side === 'home';
  const elo = Math.round(profile.historical_elo_rating);
  const si = Math.round(profile.injury_adjusted_strength_index ?? profile.wc2026_team_strength_index);
  return (
    <div className={`flex flex-col gap-1.5 ${isHome ? 'items-start' : 'items-end'}`}>
      <div className={`flex items-center gap-1.5 ${isHome ? '' : 'flex-row-reverse'}`}>
        <span className="text-xs text-slate-400">ELO Puanı</span>
        <span className="text-sm font-bold text-white tabular-nums">{elo}</span>
      </div>
      <div className={`flex items-center gap-1.5 ${isHome ? '' : 'flex-row-reverse'}`}>
        <span className="text-xs text-slate-400">Form + Kadro Güç Endeksi</span>
        <span className="text-sm font-semibold text-champagne tabular-nums">{si}</span>
      </div>
      <div className={`flex items-center gap-1.5 ${isHome ? '' : 'flex-row-reverse'}`}>
        <ConfidenceDot level={profile.calibration_confidence} />
        <span className="text-xs text-slate-300">{confidenceTr(profile.calibration_confidence)} güven</span>
      </div>
    </div>
  );
}

const CONF_BADGE: Record<string, { label: string; cls: string }> = {
  UEFA: { label: 'UEFA', cls: 'bg-blue-900/50 text-blue-300 border-blue-700/40' },
  CONMEBOL: { label: 'CONMEBOL', cls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40' },
  CONCACAF: { label: 'CONCACAF', cls: 'bg-amber-900/50 text-amber-300 border-amber-700/40' },
  CAF: { label: 'CAF', cls: 'bg-orange-900/50 text-orange-300 border-orange-700/40' },
  AFC: { label: 'AFC', cls: 'bg-red-900/50 text-red-300 border-red-700/40' },
  OFC: { label: 'OFC', cls: 'bg-teal-900/50 text-teal-300 border-teal-700/40' },
  Intercontinental: { label: 'Playoff', cls: 'bg-purple-900/40 text-purple-300 border-purple-700/40' },
};

function EnrichedQualifierPanel({ stats, side }: {
  stats: WcEnrichedQualifier;
  side: 'home' | 'away';
}) {
  const isHome = side === 'home';
  const winPct = Math.round(stats.win_rate * 100);
  const gd = stats.goal_difference;
  const gdLabel = gd > 0 ? `+${gd}` : `${gd}`;
  const gdColor = gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400' : 'text-slate-400';
  const badge = CONF_BADGE[stats.confederation];

  return (
    <div className={`flex flex-col gap-1 ${isHome ? 'items-start' : 'items-end'}`}>
      {badge && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.cls} mb-0.5`}>
          {badge.label}
        </span>
      )}
      <div className={`flex items-center gap-1 flex-wrap ${isHome ? '' : 'justify-end'}`}>
        <span className="text-xs bg-navy-800 px-1.5 py-0.5 rounded text-slate-200 font-mono">{stats.matches_played}O</span>
        <span className="text-xs bg-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-300 font-mono">{stats.wins}G</span>
        <span className="text-xs bg-navy-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">{stats.draws}B</span>
        <span className="text-xs bg-red-900/40 px-1.5 py-0.5 rounded text-red-300 font-mono">{stats.losses}M</span>
      </div>
      <div className={`flex items-center gap-2 ${isHome ? '' : 'flex-row-reverse'}`}>
        <span className="text-xs text-slate-400">{stats.goals_for}–{stats.goals_against}</span>
        <span className={`text-xs font-semibold ${gdColor}`}>{gdLabel}</span>
        <span className="text-xs text-champagne font-bold">{stats.points} pts</span>
      </div>
      <div className={`flex items-center gap-1.5 ${isHome ? '' : 'flex-row-reverse'}`}>
        <div className="w-16 h-1.5 bg-navy-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${winPct >= 70 ? 'bg-emerald-500' : winPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${winPct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-slate-300 font-mono">{winPct}% G</span>
      </div>
      {stats.avg_total_shots != null && (
        <div className={`flex items-center gap-1 text-xs text-slate-400 ${isHome ? '' : 'flex-row-reverse'}`}>
          <span className="text-slate-500">Şut:</span>
          <span className="font-mono text-slate-300">{stats.avg_total_shots.toFixed(1)}</span>
          {stats.avg_shots_on_goal != null && (
            <span className="text-slate-500">({stats.avg_shots_on_goal.toFixed(1)} isab.)</span>
          )}
        </div>
      )}
      {stats.avg_possession_pct != null && (
        <div className={`flex items-center gap-1 text-xs text-slate-400 ${isHome ? '' : 'flex-row-reverse'}`}>
          <span className="text-slate-500">Top:</span>
          <span className="font-mono text-slate-300">{stats.avg_possession_pct.toFixed(0)}%</span>
        </div>
      )}
      {stats.xg_per_match != null && (
        <div className={`flex items-center gap-1 text-xs ${isHome ? '' : 'flex-row-reverse'}`}>
          <span className="text-slate-500">xG:</span>
          <span className="font-mono text-sky-300 font-semibold">{stats.xg_per_match.toFixed(2)}/maç</span>
        </div>
      )}
    </div>
  );
}

// ── Lineup + Referee Panel ────────────────────────────────────────────────────

interface LineupRow {
  team_code: string;
  shirt_number: number;
  player_name: string;
  position: string;
  is_starting: boolean;
}

interface PlayerQualityRow {
  team_code: string;
  player_name: string;
  last_match_rating: number;
  att: number;
  tec: number;
  tac: number;
  def: number;
  cre: number;
}

interface RefereeProfileRow {
  name: string;
  country: string | null;
  matches: number | null;
  yellow_cards: number | null;
  direct_red_cards: number | null;
  second_yellow_red_cards: number | null;
  yellow_cards_per_match: number | null;
  direct_red_cards_per_match: number | null;
  total_red_card_effect_per_match: number | null;
  total_cards: number | null;
  total_cards_per_match: number | null;
  card_tendency: string | null;
  red_card_scenario_risk: string | null;
  match_flow_interruption_risk: string | null;
}

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const POSITION_TR: Record<string, string> = { GK: 'KAL', DEF: 'DEF', MID: 'ORT', FWD: 'HUC' };

function tendencyColor(val: string | null) {
  if (!val) return 'text-slate-400';
  const v = val.toLowerCase();
  if (v === 'high' || v === 'elevated') return 'text-red-400';
  if (v === 'medium' || v === 'medium_high') return 'text-amber-400';
  return 'text-emerald-400';
}

function tendencyLabel(val: string | null) {
  if (!val) return '—';
  const v = val.toLowerCase();
  if (v === 'elevated' || v === 'high') return 'Yüksek';
  if (v === 'medium_high' || v === 'medium') return 'Orta-Yüksek';
  if (v === 'low') return 'Düşük';
  return val;
}

function WcLineupAndRefereePanel({
  fixtureStringId,
  homeTeamCode,
  awayTeamCode,
}: {
  fixtureStringId: string;
  homeTeamCode: string;
  awayTeamCode: string;
}) {
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [qualities, setQualities] = useState<PlayerQualityRow[]>([]);
  const [referee, setReferee] = useState<RefereeProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fixtureStringId || homeTeamCode === 'TBD' || awayTeamCode === 'TBD') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const [luRes, pqRes, rfRes] = await Promise.all([
        supabase
          .from('wc_fixture_lineups_manual')
          .select('team_code,shirt_number,player_name,position,is_starting')
          .eq('fixture_id', fixtureStringId)
          .eq('is_starting', true)
          .order('team_code')
          .order('shirt_number'),
        supabase
          .from('wc_fixture_player_quality_manual')
          .select('team_code,player_name,last_match_rating,att,tec,tac,def,cre')
          .eq('fixture_id', fixtureStringId),
        supabase
          .from('wc_fixture_referees')
          .select('wc_referee_profiles(name,country,matches,yellow_cards,direct_red_cards,second_yellow_red_cards,yellow_cards_per_match,direct_red_cards_per_match,total_red_card_effect_per_match,total_cards,total_cards_per_match,card_tendency,red_card_scenario_risk,match_flow_interruption_risk)')
          .eq('fixture_id', fixtureStringId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setLineups((luRes.data ?? []) as LineupRow[]);
      setQualities((pqRes.data ?? []) as PlayerQualityRow[]);
      const rfData = rfRes.data as { wc_referee_profiles: RefereeProfileRow } | null;
      setReferee(rfData?.wc_referee_profiles ?? null);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [fixtureStringId, homeTeamCode, awayTeamCode]);

  if (loading) return null;
  if (lineups.length === 0 && !referee) return null;

  const homeStarters = lineups
    .filter(p => p.team_code === homeTeamCode)
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9));
  const awayStarters = lineups
    .filter(p => p.team_code === awayTeamCode)
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9));

  return (
    <div className="space-y-4 mb-6">
      {/* Lineups */}
      {(homeStarters.length > 0 || awayStarters.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-champagne"/>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Maç Kadrosu</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ code: homeTeamCode, starters: homeStarters, side: 'Ev Sahibi' }, { code: awayTeamCode, starters: awayStarters, side: 'Deplasman' }].map(({ code, starters, side }) => (
              <div key={code}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400 mb-2">{side} · {code}</p>
                <div className="space-y-1">
                  {starters.map(p => (
                    <div key={`${p.shirt_number}-${p.player_name}`} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-navy-400 w-4 shrink-0 text-right">{p.shirt_number}</span>
                      <span className="text-[10px] font-bold text-navy-500 w-6 shrink-0">{POSITION_TR[p.position] ?? p.position}</span>
                      <span className="text-xs text-slate-200 truncate">{p.player_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Featured player quality */}
      {qualities.length > 0 && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-champagne"/>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Öne Çıkan Oyuncular</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {qualities.map(q => (
              <div key={`${q.team_code}-${q.player_name}`} className="bg-navy-800/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white truncate">{q.player_name}</span>
                  <span className="text-xs font-mono font-bold text-champagne ml-1 shrink-0">{q.last_match_rating.toFixed(1)}</span>
                </div>
                <p className="text-[10px] text-navy-400 mb-2">{q.team_code}</p>
                <div className="grid grid-cols-3 gap-1">
                  {([['ATT', q.att], ['TEC', q.tec], ['TAC', q.tac], ['DEF', q.def], ['CRE', q.cre]] as [string, number][]).map(([label, val]) => (
                    <div key={label} className="text-center">
                      <div className="text-[10px] text-navy-500">{label}</div>
                      <div className="text-xs font-bold text-slate-200">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referee profile */}
      {referee && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400"/>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Hakem Profili</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{referee.name}</p>
                {referee.country && <p className="text-xs text-navy-400">{referee.country}</p>}
              </div>
              {referee.matches != null && (
                <span className="text-xs bg-navy-800 px-2 py-1 rounded-lg font-mono text-slate-300">
                  {referee.matches} maç
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {referee.yellow_cards_per_match != null && (
                <div className="bg-navy-800/50 rounded-lg p-2">
                  <div className="text-xs text-amber-400 font-bold">{referee.yellow_cards_per_match.toFixed(2)}</div>
                  <div className="text-[10px] text-navy-400 mt-0.5">Sarı/Maç</div>
                </div>
              )}
              {referee.direct_red_cards_per_match != null && (
                <div className="bg-navy-800/50 rounded-lg p-2">
                  <div className="text-xs text-red-400 font-bold">{referee.direct_red_cards_per_match.toFixed(2)}</div>
                  <div className="text-[10px] text-navy-400 mt-0.5">Kırmızı/Maç</div>
                </div>
              )}
              {referee.total_cards_per_match != null && (
                <div className="bg-navy-800/50 rounded-lg p-2">
                  <div className="text-xs text-slate-200 font-bold">{referee.total_cards_per_match.toFixed(2)}</div>
                  <div className="text-[10px] text-navy-400 mt-0.5">Top. Kart/Maç</div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-[10px] text-navy-500 mb-0.5">Kart Eğilimi</div>
                <div className={`font-semibold ${tendencyColor(referee.card_tendency)}`}>
                  {tendencyLabel(referee.card_tendency)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-navy-500 mb-0.5">Kırmızı Kart Riski</div>
                <div className={`font-semibold ${tendencyColor(referee.red_card_scenario_risk)}`}>
                  {tendencyLabel(referee.red_card_scenario_risk)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-navy-500 mb-0.5">Akış Kesintisi</div>
                <div className={`font-semibold ${tendencyColor(referee.match_flow_interruption_risk)}`}>
                  {tendencyLabel(referee.match_flow_interruption_risk)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function WcPredictionPanel({
  fixtureUuid,
  apiFootballFixtureId,
  homeApiTeamId,
  awayApiTeamId,
  isTBD,
  homeTeamName,
  awayTeamName,
}: {
  fixtureUuid: string | null;
  apiFootballFixtureId: number | null;
  homeApiTeamId: number | null;
  awayApiTeamId: number | null;
  isTBD: boolean;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const [state, setState] = useState<WcScenarioState>({
    scenario: null, homeProfile: null, awayProfile: null,
    homeQualifier: null, awayQualifier: null, scenario90: null, calibratedAt: null,
    displayProbs: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isTBD) { setLoading(false); return; }
    if (!apiFootballFixtureId || !homeApiTeamId || !awayApiTeamId) { setLoading(false); return; }
    let cancelled = false;

    async function fetchData() {
      try {
      const { data: run } = await supabase
        .from('wc2026_calibration_runs')
        .select('id, completed_at')
        .eq('run_status', 'completed')
        .gt('matches_processed', 0)
        .order('matches_processed', { ascending: false })
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!run || cancelled) { setLoading(false); return; }

      const [{ data: scenRow }, { data: profiles }] = await Promise.all([
        supabase
          .from('wc2026_match_scenario_calibration')
          .select('*')
          .eq('calibration_run_id', run.id)
          .eq('api_football_fixture_id', apiFootballFixtureId)
          .maybeSingle(),
        supabase
          .from('wc2026_team_calibration_profiles')
          .select('*')
          .eq('calibration_run_id', run.id)
          .in('api_football_team_id', [homeApiTeamId, awayApiTeamId]),
      ]);

      if (cancelled) return;

      const homeProfile = (profiles ?? []).find(p => p.api_football_team_id === homeApiTeamId) ?? null;
      const awayProfile = (profiles ?? []).find(p => p.api_football_team_id === awayApiTeamId) ?? null;

      const teamIdStrings = [String(homeApiTeamId), String(awayApiTeamId)];
      const [{ data: enrichedRows }, { data: scenario90Row }] = await Promise.all([
        supabase
          .from('wc_qualifier_team_summary')
          .select('provider_team_id,team_name,confederation,matches_played,wins,draws,losses,goals_for,goals_against,goal_difference,points,win_rate,goals_for_per_match,goals_against_per_match,avg_possession_pct,avg_total_shots,avg_shots_on_goal,avg_corners,avg_yellow_cards,total_xg,xg_per_match')
          .eq('provider', 'api_football')
          .in('provider_team_id', teamIdStrings),
        supabase
          .from('wc2026_match_90min_scenarios')
          .select('tempo_profile,first_15_story,minutes_15_30_story,minutes_30_45_story,minutes_45_60_story,minutes_60_75_story,minutes_75_90_story,key_match_triggers,confidence_label')
          .eq('fixture_id', apiFootballFixtureId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const enrichedMap = new Map<string, WcEnrichedQualifier>();
      for (const row of enrichedRows ?? []) {
        enrichedMap.set(row.provider_team_id, {
          team_name: row.team_name,
          confederation: row.confederation,
          matches_played: row.matches_played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          goals_for: row.goals_for,
          goals_against: row.goals_against,
          goal_difference: row.goal_difference,
          points: row.points,
          win_rate: Number(row.win_rate),
          goals_for_per_match: Number(row.goals_for_per_match),
          goals_against_per_match: Number(row.goals_against_per_match),
          avg_possession_pct: row.avg_possession_pct != null ? Number(row.avg_possession_pct) : null,
          avg_total_shots: row.avg_total_shots != null ? Number(row.avg_total_shots) : null,
          avg_shots_on_goal: row.avg_shots_on_goal != null ? Number(row.avg_shots_on_goal) : null,
          avg_corners: row.avg_corners != null ? Number(row.avg_corners) : null,
          avg_yellow_cards: row.avg_yellow_cards != null ? Number(row.avg_yellow_cards) : null,
          total_xg: row.total_xg != null ? Number(row.total_xg) : null,
          xg_per_match: row.xg_per_match != null ? Number(row.xg_per_match) : null,
        });
      }

      // Fetch display-safe calibrated probabilities (no internal source fields)
      const { data: dpRow } = await supabase
        .from('wc2026_fixture_display_probabilities')
        .select('home_pct,draw_pct,away_pct,display_label')
        .eq('fixture_id', fixtureUuid)
        .maybeSingle();

      const displayProbs: DisplayProbs | null = dpRow
        ? {
            home_pct: parseFloat(dpRow.home_pct),
            draw_pct: parseFloat(dpRow.draw_pct),
            away_pct: parseFloat(dpRow.away_pct),
            display_label: dpRow.display_label ?? 'Next59 Kalibre Model Tahmini',
          }
        : null;

      setState({
        scenario: scenRow as WcScenarioData | null,
        homeProfile: homeProfile as WcTeamProfile | null,
        awayProfile: awayProfile as WcTeamProfile | null,
        homeQualifier: enrichedMap.get(String(homeApiTeamId)) ?? null,
        awayQualifier: enrichedMap.get(String(awayApiTeamId)) ?? null,
        scenario90: scenario90Row as Wc90MinData | null,
        calibratedAt: run.completed_at ?? null,
        displayProbs,
      });
      setLoading(false);
      } catch {
        setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [isTBD, apiFootballFixtureId, homeApiTeamId, awayApiTeamId]);

  if (isTBD) {
    return (
      <div className="bg-navy-900/40 border border-navy-800/60 rounded-xl p-5 mt-6">
        <div className="flex items-center gap-2.5 mb-1">
          <BarChart3 className="w-4 h-4 text-navy-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Maç Analizi</h3>
        </div>
        <p className="text-xs text-navy-400 mt-1">
          Rakip takımlar belli olduktan sonra analiz burada yayınlanacak.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-navy-900/40 border border-navy-800/60 rounded-xl p-5 mt-6 space-y-3">
        <div className="h-4 bg-navy-800 rounded w-32 animate-pulse" />
        <div className="h-2 bg-navy-800 rounded w-full animate-pulse" />
        <div className="h-2 bg-navy-800 rounded w-3/4 animate-pulse" />
      </div>
    );
  }

  const { scenario, homeProfile, awayProfile, homeQualifier, awayQualifier, calibratedAt, displayProbs } = state;

  if (!scenario) {
    return (
      <div className="bg-navy-900/40 border border-navy-800/60 rounded-xl p-5 mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-navy-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Analiz Henüz Hazır Değil</h3>
        </div>
        <p className="text-xs text-navy-400">
          Bu maç için model tahmini hazırlanıyor. Turnuva başlamadan önce yayınlanacak.
        </p>
      </div>
    );
  }

  const hp = displayProbs ? Math.round(displayProbs.home_pct) : Math.round(scenario.home_win_probability * 100);
  const dp = displayProbs ? Math.round(displayProbs.draw_pct) : Math.round(scenario.draw_probability * 100);
  const ap = displayProbs ? Math.round(displayProbs.away_pct) : Math.round(scenario.away_win_probability * 100);
  const predictionLabel = displayProbs?.display_label ?? 'Model Tahmini';
  const leading = hp > ap ? 'home' : ap > hp ? 'away' : 'draw';

  const fmtDate = calibratedAt
    ? new Date(calibratedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="bg-navy-900/40 border border-navy-800/60 rounded-xl p-5 mt-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-champagne shrink-0" />
          <h3 className="text-sm font-bold text-white">{predictionLabel}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <ConfidenceDot level={scenario.calibration_confidence} />
          <span className="text-xs text-slate-300">{confidenceTr(scenario.calibration_confidence)} Güven</span>
          {fmtDate && (
            <span className="text-xs text-slate-400 ml-1">{fmtDate}</span>
          )}
        </div>
      </div>

      {/* 1X2 Probability Bar */}
      <div>
        <p className="text-xs text-slate-400 mb-2">Senaryo Olasılıkları</p>
        <div className="flex items-end justify-between mb-2">
          <div className="text-center">
            <div className={`text-lg font-bold tabular-nums ${leading === 'home' ? 'text-champagne' : 'text-white'}`}>{hp}%</div>
            <div className="text-xs text-slate-300 truncate max-w-[80px]">{homeTeamName}</div>
          </div>
          <div className="text-center">
            <div className={`text-base font-bold tabular-nums ${leading === 'draw' ? 'text-champagne/80' : 'text-slate-400'}`}>{dp}%</div>
            <div className="text-xs text-slate-400">Beraberlik</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold tabular-nums ${leading === 'away' ? 'text-sky-400' : 'text-white'}`}>{ap}%</div>
            <div className="text-xs text-slate-300 truncate max-w-[80px]">{awayTeamName}</div>
          </div>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex gap-px bg-navy-800">
          <div
            className={`rounded-l-full transition-all ${leading === 'home' ? 'bg-champagne' : 'bg-navy-600'}`}
            style={{ width: `${hp}%` }}
          />
          <div
            className={`transition-all ${leading === 'draw' ? 'bg-champagne/50' : 'bg-navy-700'}`}
            style={{ width: `${dp}%` }}
          />
          <div
            className={`rounded-r-full transition-all ${leading === 'away' ? 'bg-sky-400' : 'bg-navy-600'}`}
            style={{ width: `${ap}%` }}
          />
        </div>
      </div>

      {/* Predicted Score */}
      <div className="flex items-center justify-center gap-4 py-2.5 bg-navy-800/40 rounded-lg">
        <span className="text-xs text-slate-400 uppercase tracking-wider">Tahmini Skor</span>
        <span className="text-xl font-bold font-mono text-white tabular-nums">
          {scenario.predicted_score_home} – {scenario.predicted_score_away}
        </span>
      </div>

      {/* Team Strength Comparison */}
      {(homeProfile || awayProfile) && (
        <div className="border border-navy-800/60 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 text-center">
            Güç Karşılaştırması
          </div>
          <div className="flex items-start justify-between gap-2">
            {homeProfile ? (
              <TeamStrengthRow profile={homeProfile} side="home" />
            ) : (
              <div className="text-xs text-slate-400 italic">Veri yok</div>
            )}
            <div className="text-center px-2">
              <div className="text-xs text-slate-400 mb-1">Güç Farkı</div>
              <div className={`text-base font-bold tabular-nums ${scenario.strength_diff > 0 ? 'text-champagne' : scenario.strength_diff < 0 ? 'text-sky-400' : 'text-slate-400'}`}>
                {scenario.strength_diff > 0 ? '+' : ''}{Math.round(scenario.strength_diff)}
              </div>
            </div>
            {awayProfile ? (
              <TeamStrengthRow profile={awayProfile} side="away" />
            ) : (
              <div className="text-xs text-slate-400 italic">Veri yok</div>
            )}
          </div>
        </div>
      )}

      {/* Qualifier Stats — all confederations */}
      {(homeQualifier || awayQualifier) && (
        <div className="border border-navy-800/40 rounded-lg p-4 bg-navy-900/20">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 text-center">
            Eleme Performansı
          </div>
          <div className="flex items-start justify-between gap-2">
            {homeQualifier ? (
              <EnrichedQualifierPanel stats={homeQualifier} side="home" />
            ) : (
              <div className="text-xs text-slate-500 italic">—</div>
            )}
            <div className="text-center px-1 flex flex-col items-center gap-1 pt-5">
              <span className="text-xs text-slate-500">vs</span>
            </div>
            {awayQualifier ? (
              <EnrichedQualifierPanel stats={awayQualifier} side="away" />
            ) : (
              <div className="text-xs text-slate-500 italic">—</div>
            )}
          </div>
        </div>
      )}

      {/* WC Risk Indices */}
      <div className="space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Turnuva Risk Endeksleri
        </div>
        <RiskBar value={scenario.late_goal_probability} label="Geç Gol Riski" color="amber" />
        <RiskBar value={scenario.wc2026_chaos_probability} label="Kaos Olasılığı" color="red" />
        <RiskBar value={scenario.comeback_probability} label="Geri Dönüş İhtimali" color="sky" />
        <RiskBar value={scenario.wc2026_fatigue_risk} label="Yorgunluk Riski" color="amber" />
        <RiskBar value={scenario.first_half_goal_probability} label="İlk Yarı Gol İhtimali" color="emerald" />
      </div>

      {/* DB-driven 5-min flow panel */}
      <Wc5MinFlowPanel fixtureUuid={fixtureUuid} apiFootballFixtureId={apiFootballFixtureId} isTBD={isTBD} />

      {/* Projected stats card */}
      <WcProjectedStatsCard fixtureUuid={fixtureUuid} isTBD={isTBD} />

      {/* Sealed old scenario versions — Eski Yorum */}
      <WcOldScenariosSection fixtureUuid={fixtureUuid} />

      {/* Tempo + Set piece */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1.5">İlk 15 dk Temposu</div>
          <div className="text-sm font-semibold text-white capitalize">
            {scenario.first_15_tempo ? tempoTr(scenario.first_15_tempo) : '—'}
          </div>
        </div>
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1.5">Duran Top Tehdidi</div>
          <div className="text-sm font-semibold text-white capitalize">
            {scenario.set_piece_threat ? confidenceTr(scenario.set_piece_threat) : '—'}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-navy-800/40">
        Bu çalışma, maç öncesi mevcut verilerle hazırlanmış yapay zekâ destekli istatistiksel senaryo analizidir. Kesin sonuç vaadi içermez.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WcFixtureDetailPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();

  const fixture = useMemo(
    () => ALL_WC2026_FIXTURES.find(f => f.id === fixtureId) ?? null,
    [fixtureId],
  );

  const [activeTab, setActiveTab] = useState<'info' | 'h2h' | 'home' | 'away'>('info');

  const [dbFixture, setDbFixture] = useState<{
    uuid: string;
    apiFootballFixtureId: number | null;
    homeApiTeamId: number | null;
    awayApiTeamId: number | null;
  } | null>(null);

  useEffect(() => {
    if (!fixture || fixture.home_team_code === 'TBD' || fixture.away_team_code === 'TBD') return;
    let cancelled = false;
    setDbFixture(null);
    supabase
      .from('wc2026_fixtures')
      .select('id, api_football_fixture_id, home_api_team_id, away_api_team_id')
      .eq('match_number', fixture.match_no)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setDbFixture({
          uuid: data.id,
          apiFootballFixtureId: data.api_football_fixture_id,
          homeApiTeamId: data.home_api_team_id,
          awayApiTeamId: data.away_api_team_id,
        });
      });
    return () => { cancelled = true; };
  }, [fixture?.match_no]);

  useEffect(() => {
    if (!fixture) { navigate('/world-cup-2026', { replace: true }); return; }
  }, [fixture, navigate]);

  if (!fixture) return null;

  const homeCountry = COUNTRY_BY_FIFA[fixture.home_team_code];
  const awayCountry = COUNTRY_BY_FIFA[fixture.away_team_code];
  const venue = VENUE_META[fixture.venue];
  const isTBD = fixture.home_team_code === 'TBD' || fixture.away_team_code === 'TBD';
  const fixtureStringId = `wc2026-${String(fixture.match_no).padStart(3, '0')}`;
  const isGroupStage = fixture.stage === 'Group Stage';
  const stageLabel = STAGE_LABELS_TR[fixture.stage];
  const groupLabel = fixture.group ? `Grup ${fixture.group}` : null;
  const trTime = formatMatchDateTime(fixture.kickoff_utc, userTZ);

  const matchDate = new Date(fixture.kickoff_utc).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: userTZ,
  });

  const TABS = [
    { key: 'info' as const, label: 'Maç Bilgisi' },
    { key: 'h2h' as const, label: 'Geçmiş Karşılaşma' },
    { key: 'home' as const, label: homeCountry?.name_tr ?? fixture.home_team },
    { key: 'away' as const, label: awayCountry?.name_tr ?? fixture.away_team },
  ];

  return (
    <div className="min-h-screen">
      <SEO
        title={isTBD ? 'WC 2026 Maç Senaryosu — Next59' : `${fixture.home_team} - ${fixture.away_team} Maç Senaryosu — Next59`}
        description={isTBD ? '2026 Dünya Kupası maçı için Next59 olasılık ve senaryo analizi.' : `${fixture.home_team} - ${fixture.away_team} maçı için Next59 olasılık, skor beklentisi ve senaryo analizi.`}
        canonical={`/world-cup-2026/mac/${fixtureId ?? ''}`}
      />
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-champagne/4 rounded-full blur-3xl"/>
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs text-slate-400">
            <Link to="/world-cup-2026" className="flex items-center gap-1 hover:text-champagne transition-colors">
              <ArrowLeft className="w-3.5 h-3.5"/>2026 Fikstür
            </Link>
            <ChevronRight className="w-3 h-3"/>
            <span className="text-slate-400">{stageLabel}{groupLabel ? ` · ${groupLabel}` : ''}</span>
          </div>

          {/* Stage badge */}
          <div className="flex justify-center mb-6">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
              isGroupStage ? 'bg-navy-800 border-navy-700 text-navy-300' : 'bg-champagne/10 border-champagne/30 text-champagne'
            }`}>
              {fixture.stage === 'Final' ? <Trophy className="w-3.5 h-3.5"/> : <Shield className="w-3.5 h-3.5"/>}
              {stageLabel}{groupLabel ? ` · ${groupLabel}` : ''}
              <span className="text-navy-400 font-mono ml-1 text-xs">#{fixture.match_no}</span>
            </span>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-center gap-4 sm:gap-10 mb-6">
            {/* Home */}
            <div className="flex flex-col items-center gap-2.5 flex-1 max-w-[170px]">
              {homeCountry ? (
                <span className={`fi fi-${homeCountry.iso2} rounded-[4px] shadow-md`} style={{width:56,height:38,display:'inline-block'}}/>
              ) : (
                <div className="w-14 h-10 rounded-lg bg-navy-800/60 border border-navy-700 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-navy-400"/>
                </div>
              )}
              <div className="text-center">
                <p className="text-base sm:text-lg font-black text-white leading-tight">
                  {homeCountry?.name_en ?? fixture.home_team}
                </p>
                <p className="text-sm text-slate-300 leading-tight">
                  {homeCountry?.name_tr ?? 'Belirlenecek'}
                </p>
              </div>
            </div>

            {/* Center */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-3xl font-black text-slate-400">VS</span>
              <div className="mt-2 text-center">
                <p className="text-sm font-bold text-champagne">{trTime}</p>
                <p className="text-xs text-slate-400 mt-0.5">{matchDate}</p>
              </div>
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-2.5 flex-1 max-w-[170px]">
              {awayCountry ? (
                <span className={`fi fi-${awayCountry.iso2} rounded-[4px] shadow-md`} style={{width:56,height:38,display:'inline-block'}}/>
              ) : (
                <div className="w-14 h-10 rounded-lg bg-navy-800/60 border border-navy-700 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-navy-400"/>
                </div>
              )}
              <div className="text-center">
                <p className="text-base sm:text-lg font-black text-white leading-tight">
                  {awayCountry?.name_en ?? fixture.away_team}
                </p>
                <p className="text-sm text-slate-300 leading-tight">
                  {awayCountry?.name_tr ?? 'Belirlenecek'}
                </p>
              </div>
            </div>
          </div>

          {/* Venue summary */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-300">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5"/>{matchDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5"/>{trTime} (Türkiye Saati)
            </span>
            {venue && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5"/>
                {fixture.venue} · {venue.city_display} · {venue.country_tr}
              </span>
            )}
            {venue?.capacity && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5"/>
                {venue.capacity.toLocaleString('tr-TR')} kişilik kapasite
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* Info cards row */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Venue detail */}
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Stadyum Bilgisi</h3>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-navy-400 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-sm font-bold text-white">{fixture.venue}</p>
                  {venue && (
                    <p className="text-xs text-slate-400">{venue.city_display} · {venue.country_tr}</p>
                  )}
                </div>
              </div>
              {venue?.capacity && (
                <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Kapasite</span>
                  <span className="text-sm font-bold text-white">{venue.capacity.toLocaleString('tr-TR')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-navy-400">Ülke</span>
                <span className="text-sm font-semibold text-white">
                  {fixture.country === 'USA' ? 'ABD' : fixture.country === 'Canada' ? 'Kanada' : 'Meksika'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-navy-400">Yerel Saat</span>
                <span className="text-sm font-mono text-navy-200">{fixture.kickoff_local_label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-navy-400">Türkiye Saati</span>
                <span className="text-sm font-mono font-bold text-champagne">{trTime}</span>
              </div>
            </div>
          </div>

          {/* Team cards */}
          <div className="space-y-3">
            {[
              { country: homeCountry, code: fixture.home_team_code, name: fixture.home_team, side: 'Ev Sahibi' },
              { country: awayCountry, code: fixture.away_team_code, name: fixture.away_team, side: 'Deplasman' },
            ].map(({ country, code, name, side }) => (
              <div key={side} className="bg-navy-900/50 border border-navy-800 rounded-xl p-3">
                <p className="text-xs text-navy-400 mb-2">{side}</p>
                <div className="flex items-center gap-2.5">
                  {country ? (
                    <span className={`fi fi-${country.iso2} rounded-[3px] shadow-sm shrink-0`} style={{width:28,height:20,display:'inline-block'}}/>
                  ) : (
                    <div className="w-7 h-5 rounded bg-navy-800 shrink-0 flex items-center justify-center">
                      <HelpCircle className="w-3 h-3 text-navy-400"/>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight truncate">{country?.name_en ?? name}</p>
                    <p className="text-xs text-navy-400 truncate">{country?.name_tr ?? 'Belirlenecek'}</p>
                  </div>
                  <span className="text-xs font-mono text-navy-400 shrink-0">{code !== 'TBD' ? code : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lineup + Referee panel */}
        <WcLineupAndRefereePanel
          fixtureStringId={fixtureStringId}
          homeTeamCode={fixture.home_team_code}
          awayTeamCode={fixture.away_team_code}
        />

        {/* Prediction panel */}
        <WcPredictionPanel
            fixtureUuid={dbFixture?.uuid ?? null}
            apiFootballFixtureId={dbFixture?.apiFootballFixtureId ?? null}
            homeApiTeamId={dbFixture?.homeApiTeamId ?? null}
            awayApiTeamId={dbFixture?.awayApiTeamId ?? null}
            isTBD={isTBD}
            homeTeamName={fixture.home_team}
            awayTeamName={fixture.away_team}
          />

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-900/60 border border-navy-800 rounded-xl p-1 mt-6 mb-4 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-[80px] py-2 px-2 text-xs font-semibold rounded-lg transition-all truncate ${
                activeTab === key ? 'bg-navy-800 text-white shadow-sm' : 'text-navy-400 hover:text-navy-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-navy-900/40 border border-navy-800 rounded-xl p-4">
          {activeTab === 'info' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-400 mb-3">
                {isGroupStage ? `Grup ${fixture.group} — Diğer Maçlar` : 'Turnuva Bağlamı'}
              </p>
              {isGroupStage ? (
                <GroupContext fixture={fixture} allFixtures={ALL_WC2026_FIXTURES}/>
              ) : (
                <div className="text-sm text-navy-400 py-4 text-center">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-navy-700"/>
                  <p>Bu bir eleme maçı. Gruplar tamamlandıktan sonra rakipler belli olacak.</p>
                </div>
              )}
            </>
          )}
          {activeTab === 'h2h' && !isTBD && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-400 mb-3">
                Dünya Kupası'ndaki Önceki Karşılaşmalar (1930–2022)
              </p>
              <H2HPastWC
                homeCode={fixture.home_team_code}
                awayCode={fixture.away_team_code}
                homeName={homeCountry?.name_en ?? fixture.home_team}
                awayName={awayCountry?.name_en ?? fixture.away_team}
              />
            </>
          )}
          {activeTab === 'h2h' && isTBD && (
            <p className="text-sm text-navy-400 py-6 text-center">Rakipler henüz belli olmadığından geçmiş karşılaşma gösterilemiyor.</p>
          )}
          {activeTab === 'home' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-400 mb-3">
                {homeCountry?.name_tr ?? fixture.home_team} — Dünya Kupası Geçmişi (1930–2022)
              </p>
              {homeCountry ? (
                <TeamPastWC teamCode={fixture.home_team_code} teamNameEn={homeCountry.name_en}/>
              ) : (
                <p className="text-sm text-navy-400 py-6 text-center">Takım henüz belli olmadı.</p>
              )}
            </>
          )}
          {activeTab === 'away' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-400 mb-3">
                {awayCountry?.name_tr ?? fixture.away_team} — Dünya Kupası Geçmişi (1930–2022)
              </p>
              {awayCountry ? (
                <TeamPastWC teamCode={fixture.away_team_code} teamNameEn={awayCountry.name_en}/>
              ) : (
                <p className="text-sm text-navy-400 py-6 text-center">Takım henüz belli olmadı.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-xs text-navy-700">
          <span className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5"/>
            FIFA Dünya Kupası 2026 · Maç #{fixture.match_no}
          </span>
          <Link to="/world-cup-2026" className="flex items-center gap-1 hover:text-navy-400 transition-colors">
            <ArrowLeft className="w-3 h-3"/>Tüm Fikstür
          </Link>
        </div>
      </section>
    </div>
  );
}
