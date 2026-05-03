import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, Calendar, Users, ArrowLeft, ChevronRight,
  Shield, Clock, Swords, HelpCircle, Globe,
} from 'lucide-react';
import {
  ALL_WC2026_FIXTURES, VENUE_META, STAGE_LABELS_TR, formatKickoffTR,
  type WC2026Fixture,
} from '../data/worldCup2026Fixtures';
import { COUNTRY_BY_FIFA } from '../data/worldCup2026Countries';
import { supabase } from '../lib/supabase';
import { STAGE_LABELS, stageOrder, type WcMatch } from './WorldCupHistoryPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WcTeamRecord {
  id: string;
  edition_year: number;
  name_en: string;
  iso2: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Flag({ iso2, size = 'md' }: { iso2: string | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (!iso2) return null;
  const style: React.CSSProperties =
    size === 'xl' ? { width: 64, height: 44 }
    : size === 'lg' ? { width: 48, height: 34 }
    : size === 'sm' ? { width: 20, height: 14 }
    : { width: 32, height: 22 };
  return (
    <span
      className="fi rounded-[3px] shadow-sm inline-block shrink-0"
      style={{ ...style, display: 'inline-block' }}
      // flag-icons requires class-based approach
      ref={(el) => { if (el) el.className = `fi fi-${iso2.toLowerCase()} rounded-[3px] shadow-sm inline-block`; }}
    />
  );
}

// Small flag using className directly
function FlagClass({ iso2, size = 'md' }: { iso2: string | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (!iso2) return null;
  const px = size === 'xl' ? 64 : size === 'lg' ? 48 : size === 'sm' ? 20 : 32;
  const py = size === 'xl' ? 44 : size === 'lg' ? 34 : size === 'sm' ? 14 : 22;
  return (
    <span
      className={`fi fi-${iso2.toLowerCase()} rounded-[3px] shadow-sm shrink-0`}
      style={{ width: px, height: py, display: 'inline-block' }}
    />
  );
}

function dateFmtLong(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

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
        setLoading(false);
      });
  }, [dbName]);

  if (loading) return (
    <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (matches.length === 0) return (
    <div className="text-center py-8">
      <Globe className="w-8 h-8 mx-auto mb-2 text-navy-700"/>
      <p className="text-sm text-navy-500">Dünya Kupası geçmiş kaydı bulunamadı.</p>
      <p className="text-xs text-navy-600 mt-1">({dbName} olarak arandı)</p>
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
          { label: 'Beraberlik', val: totalB, cls: 'text-navy-300' },
          { label: 'Mağlubiyet', val: totalM, cls: 'text-red-400' },
          { label: 'Toplam', val: matches.length, cls: 'text-champagne' },
        ].map(s => (
          <div key={s.label} className="flex-1 text-center bg-navy-900/60 border border-navy-800 rounded-lg py-2">
            <p className={`text-lg font-black ${s.cls}`}>{s.val}</p>
            <p className="text-[10px] text-navy-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Matches by edition */}
      <div className="space-y-4">
        {[...byEdition.entries()].sort((a, b) => b[0] - a[0]).map(([year, ems]) => (
          <div key={year}>
            <p className="text-xs font-bold text-navy-500 uppercase tracking-wider mb-1.5 px-0.5">{year} Dünya Kupası</p>
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
        setLoading(false);
      });
  }, [hn, an]);

  if (loading) return (
    <div className="space-y-2">{[0,1].map(i => <div key={i} className="h-10 bg-navy-800/30 rounded-lg animate-pulse"/>)}</div>
  );
  if (meetings.length === 0) return (
    <div className="text-center py-8">
      <Swords className="w-8 h-8 mx-auto mb-2 text-navy-700"/>
      <p className="text-sm text-navy-500">Bu iki takım daha önce Dünya Kupası'nda karşılaşmamış.</p>
      <p className="text-xs text-navy-600 mt-1">({hn} vs {an})</p>
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
          <p className="text-xs text-navy-500 mb-0.5">Karşılaşma</p>
          <p className="text-xl font-black text-navy-300">{meetings.length}</p>
          <p className="text-xs text-navy-500 mt-0.5">Beraberlik: {draws}</p>
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
              <span className="text-xs font-bold text-navy-400 shrink-0 w-8">{m.edition_year}</span>
              <span className="text-xs text-navy-500 shrink-0 w-16">{STAGE_LABELS[m.stage_code] ?? m.stage_code}</span>
              <span className={`flex-1 text-xs text-right truncate ${winner === m.home_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>
                {m.home_team_name}
              </span>
              <div className="shrink-0 flex flex-col items-center min-w-[52px]">
                <span className="text-xs font-bold text-white tabular-nums">{homeScore ?? '?'}–{awayScore ?? '?'}</span>
                {badge && <span className="text-[9px] text-champagne/70">{badge}</span>}
              </div>
              <span className={`flex-1 text-xs truncate ${winner === m.away_team_name ? 'text-white font-semibold' : 'text-navy-400'}`}>
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
      <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">Grup {fixture.group} Fikstürü</p>
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
              <span className="text-xs text-navy-500 shrink-0 w-20">{formatKickoffTR(f.kickoff_utc)}</span>
              <span className="flex items-center gap-1.5 flex-1 justify-end">
                {hc && <span className={`fi fi-${hc.iso2} rounded-[3px] shrink-0`} style={{width:16,height:11,display:'inline-block'}}/>}
                <span className={`text-xs truncate ${isCurrent ? 'text-white font-semibold' : 'text-navy-300'}`}>{hc?.name_tr ?? f.home_team}</span>
              </span>
              <span className="text-xs text-navy-600 shrink-0">–</span>
              <span className="flex items-center gap-1.5 flex-1">
                {ac && <span className={`fi fi-${ac.iso2} rounded-[3px] shrink-0`} style={{width:16,height:11,display:'inline-block'}}/>}
                <span className={`text-xs truncate ${isCurrent ? 'text-white font-semibold' : 'text-navy-300'}`}>{ac?.name_tr ?? f.away_team}</span>
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
                isCurrent ? 'bg-champagne/10 border-champagne/30 text-white font-semibold' : 'bg-navy-900/60 border-navy-800 text-navy-400'
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WcFixtureDetailPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();

  const fixture = useMemo(
    () => ALL_WC2026_FIXTURES.find(f => f.id === fixtureId) ?? null,
    [fixtureId],
  );

  const [activeTab, setActiveTab] = useState<'info' | 'h2h' | 'home' | 'away'>('info');

  useEffect(() => {
    if (!fixture) { navigate('/world-cup-2026', { replace: true }); return; }
    document.title = `${fixture.home_team} vs ${fixture.away_team} · WC 2026 — Next59`;
  }, [fixture, navigate]);

  if (!fixture) return null;

  const homeCountry = COUNTRY_BY_FIFA[fixture.home_team_code];
  const awayCountry = COUNTRY_BY_FIFA[fixture.away_team_code];
  const venue = VENUE_META[fixture.venue];
  const isTBD = fixture.home_team_code === 'TBD' || fixture.away_team_code === 'TBD';
  const isGroupStage = fixture.stage === 'Group Stage';
  const stageLabel = STAGE_LABELS_TR[fixture.stage];
  const groupLabel = fixture.group ? `Grup ${fixture.group}` : null;
  const trTime = formatKickoffTR(fixture.kickoff_utc);

  const matchDate = new Date(fixture.match_date).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const TABS = [
    { key: 'info' as const, label: 'Maç Bilgisi' },
    { key: 'h2h' as const, label: 'Geçmiş Karşılaşma' },
    { key: 'home' as const, label: homeCountry?.name_tr ?? fixture.home_team },
    { key: 'away' as const, label: awayCountry?.name_tr ?? fixture.away_team },
  ];

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-12 sm:py-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-champagne/4 rounded-full blur-3xl"/>
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-xs text-navy-500">
            <Link to="/world-cup-2026" className="flex items-center gap-1 hover:text-champagne transition-colors">
              <ArrowLeft className="w-3.5 h-3.5"/>2026 Fikstür
            </Link>
            <ChevronRight className="w-3 h-3"/>
            <span className="text-navy-400">{stageLabel}{groupLabel ? ` · ${groupLabel}` : ''}</span>
          </div>

          {/* Stage badge */}
          <div className="flex justify-center mb-6">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
              isGroupStage ? 'bg-navy-800 border-navy-700 text-navy-300' : 'bg-champagne/10 border-champagne/30 text-champagne'
            }`}>
              {fixture.stage === 'Final' ? <Trophy className="w-3.5 h-3.5"/> : <Shield className="w-3.5 h-3.5"/>}
              {stageLabel}{groupLabel ? ` · ${groupLabel}` : ''}
              <span className="text-navy-600 font-mono ml-1">#{fixture.match_no}</span>
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
                  <HelpCircle className="w-5 h-5 text-navy-600"/>
                </div>
              )}
              <div className="text-center">
                <p className="text-base sm:text-lg font-black text-white leading-tight">
                  {homeCountry?.name_en ?? fixture.home_team}
                </p>
                <p className="text-sm text-navy-400 leading-tight">
                  {homeCountry?.name_tr ?? 'Belirlenecek'}
                </p>
              </div>
            </div>

            {/* Center */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-3xl font-black text-navy-600">VS</span>
              <div className="mt-2 text-center">
                <p className="text-sm font-bold text-champagne">{trTime}</p>
                <p className="text-xs text-navy-500 mt-0.5">{matchDate}</p>
              </div>
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-2.5 flex-1 max-w-[170px]">
              {awayCountry ? (
                <span className={`fi fi-${awayCountry.iso2} rounded-[4px] shadow-md`} style={{width:56,height:38,display:'inline-block'}}/>
              ) : (
                <div className="w-14 h-10 rounded-lg bg-navy-800/60 border border-navy-700 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-navy-600"/>
                </div>
              )}
              <div className="text-center">
                <p className="text-base sm:text-lg font-black text-white leading-tight">
                  {awayCountry?.name_en ?? fixture.away_team}
                </p>
                <p className="text-sm text-navy-400 leading-tight">
                  {awayCountry?.name_tr ?? 'Belirlenecek'}
                </p>
              </div>
            </div>
          </div>

          {/* Venue summary */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-navy-400">
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">Stadyum Bilgisi</h3>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-navy-500 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-sm font-bold text-white">{fixture.venue}</p>
                  {venue && (
                    <p className="text-xs text-navy-400">{venue.city_display} · {venue.country_tr}</p>
                  )}
                </div>
              </div>
              {venue?.capacity && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-navy-400">Kapasite</span>
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
                <p className="text-xs text-navy-500 mb-2">{side}</p>
                <div className="flex items-center gap-2.5">
                  {country ? (
                    <span className={`fi fi-${country.iso2} rounded-[3px] shadow-sm shrink-0`} style={{width:28,height:20,display:'inline-block'}}/>
                  ) : (
                    <div className="w-7 h-5 rounded bg-navy-800 shrink-0 flex items-center justify-center">
                      <HelpCircle className="w-3 h-3 text-navy-600"/>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-tight truncate">{country?.name_en ?? name}</p>
                    <p className="text-xs text-navy-400 truncate">{country?.name_tr ?? 'Belirlenecek'}</p>
                  </div>
                  <span className="text-xs font-mono text-navy-500 shrink-0">{code !== 'TBD' ? code : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Kadro notice */}
        <div className="bg-navy-900/40 border border-navy-800/60 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-4 h-4 text-navy-500 shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-navy-300">Kadrolar Henüz Açıklanmadı</p>
              <p className="text-xs text-navy-500 mt-0.5">
                Resmi maç kadroları turnuva başlamadan önce FIFA tarafından açıklanacak.
                Teknik direktör bilgileri ve kesin kadro aşağıda görünecek.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-900/60 border border-navy-800 rounded-xl p-1 mb-4 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-[80px] py-2 px-2 text-xs font-semibold rounded-lg transition-all truncate ${
                activeTab === key ? 'bg-navy-800 text-white shadow-sm' : 'text-navy-500 hover:text-navy-300'
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
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
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
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
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
            <p className="text-sm text-navy-500 py-6 text-center">Rakipler henüz belli olmadığından geçmiş karşılaşma gösterilemiyor.</p>
          )}
          {activeTab === 'home' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
                {homeCountry?.name_tr ?? fixture.home_team} — Dünya Kupası Geçmişi (1930–2022)
              </p>
              {homeCountry ? (
                <TeamPastWC teamCode={fixture.home_team_code} teamNameEn={homeCountry.name_en}/>
              ) : (
                <p className="text-sm text-navy-500 py-6 text-center">Takım henüz belli olmadı.</p>
              )}
            </>
          )}
          {activeTab === 'away' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-navy-500 mb-3">
                {awayCountry?.name_tr ?? fixture.away_team} — Dünya Kupası Geçmişi (1930–2022)
              </p>
              {awayCountry ? (
                <TeamPastWC teamCode={fixture.away_team_code} teamNameEn={awayCountry.name_en}/>
              ) : (
                <p className="text-sm text-navy-500 py-6 text-center">Takım henüz belli olmadı.</p>
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
