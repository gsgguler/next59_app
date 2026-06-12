import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, BarChart2 } from 'lucide-react';
import { ALL_WC2026_FIXTURES, WC2026_GROUPS, type WC2026Fixture } from '../data/worldCup2026Fixtures';
import { COUNTRY_BY_FIFA } from '../data/worldCup2026Countries';
import { supabase } from '../lib/supabase';
import SEO from '../components/seo/SEO';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveMatchState {
  fixture_key: string;
  status_short: string;
  home_score: number;
  away_score: number;
}

interface TeamStats {
  code: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  pts: number;
}

// ---------------------------------------------------------------------------
// Standings computation
// ---------------------------------------------------------------------------

function computeGroupStandings(
  group: string,
  fixtures: WC2026Fixture[],
  results: Map<string, LiveMatchState>,
): TeamStats[] {
  const groupFixtures = fixtures.filter(
    (f) => f.stage === 'Group Stage' && f.group === group,
  );

  const stats = new Map<string, TeamStats>();

  // seed with all teams so we always have 4 rows even if no matches played
  for (const f of groupFixtures) {
    if (!stats.has(f.home_team_code)) {
      stats.set(f.home_team_code, {
        code: f.home_team_code,
        played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0,
      });
    }
    if (!stats.has(f.away_team_code)) {
      stats.set(f.away_team_code, {
        code: f.away_team_code,
        played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0,
      });
    }
  }

  for (const f of groupFixtures) {
    const res = results.get(f.id);
    if (!res) continue;
    const isFinished =
      res.status_short === 'FT' ||
      res.status_short === 'AET' ||
      res.status_short === 'PEN';
    if (!isFinished) continue;

    const hg = res.home_score;
    const ag = res.away_score;

    const home = stats.get(f.home_team_code)!;
    const away = stats.get(f.away_team_code)!;

    home.played++;
    away.played++;
    home.gf += hg; home.ga += ag;
    away.gf += ag; away.ga += hg;

    if (hg > ag) {
      home.wins++; home.pts += 3;
      away.losses++;
    } else if (hg === ag) {
      home.draws++; home.pts += 1;
      away.draws++; away.pts += 1;
    } else {
      away.wins++; away.pts += 3;
      home.losses++;
    }
  }

  const rows = Array.from(stats.values());
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.code.localeCompare(b.code);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function TeamFlag({ code, size = 'sm' }: { code: string; size?: 'sm' | 'md' }) {
  const country = COUNTRY_BY_FIFA[code];
  const iso2 = country?.iso2 ?? code.toLowerCase();
  const cls = size === 'md' ? 'w-6 h-4' : 'w-5 h-3.5';
  return (
    <span
      className={`fi fi-${iso2} ${cls} rounded-[2px] flex-shrink-0`}
      title={country?.name_en ?? code}
    />
  );
}

function GroupTable({
  group,
  rows,
}: {
  group: string;
  rows: TeamStats[];
}) {
  return (
    <div className="bg-navy-900/60 border border-navy-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-navy-800/60 border-b border-navy-700/50">
        <span className="text-xs font-bold tracking-widest text-champagne/80 uppercase">
          Grup {group}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_repeat(8,_minmax(0,_2rem))] items-center gap-x-1 px-4 py-1.5 border-b border-navy-700/30">
        <span className="w-4" />
        <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Takım</span>
        {(['OM', 'G', 'B', 'M', 'AG', 'YG', 'A', 'P'] as const).map((h) => (
          <span
            key={h}
            className={`text-[10px] font-semibold tracking-wider text-center uppercase ${
              h === 'P' ? 'text-champagne/70' : 'text-slate-500'
            }`}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {rows.map((team, idx) => {
        const country = COUNTRY_BY_FIFA[team.code];
        const gd = team.gf - team.ga;
        const qualifies = idx < 2;

        return (
          <div
            key={team.code}
            className={`relative grid grid-cols-[auto_1fr_repeat(8,_minmax(0,_2rem))] items-center gap-x-1 px-4 py-2.5 transition-colors hover:bg-navy-800/40 ${
              idx < rows.length - 1 ? 'border-b border-navy-700/20' : ''
            }`}
          >
            {/* Qualify indicator bar */}
            {qualifies && (
              <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-sky-500 rounded-r" />
            )}

            {/* Rank */}
            <span
              className={`w-4 text-xs font-bold text-center ${
                qualifies ? 'text-sky-400' : 'text-slate-500'
              }`}
            >
              {idx + 1}
            </span>

            {/* Team name + flag */}
            <div className="flex items-center gap-2 min-w-0">
              <TeamFlag code={team.code} />
              <span className="text-sm font-medium text-slate-200 truncate">
                {country?.name_tr ?? country?.name_en ?? team.code}
              </span>
            </div>

            {/* Stats */}
            {[
              team.played,
              team.wins,
              team.draws,
              team.losses,
              team.gf,
              team.ga,
              gd > 0 ? `+${gd}` : gd,
            ].map((val, i) => (
              <span
                key={i}
                className="text-xs text-center text-slate-400 tabular-nums"
              >
                {val}
              </span>
            ))}
            {/* Points */}
            <span className="text-xs font-bold text-center text-champagne tabular-nums">
              {team.pts}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WcStandingsPage() {
  const [liveStates, setLiveStates] = useState<Map<string, LiveMatchState>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      const { data, error } = await supabase
        .from('wc2026_live_match_state_public')
        .select('fixture_key, status_short, home_score, away_score');

      if (error) {
        console.error('standings fetch error', error);
        setLoading(false);
        return;
      }

      // Build fixture_id → LiveMatchState map using fixture_key
      // fixture_key = wc2026-NNN, fixture.id = wc2026-NNN
      const byFixtureId = new Map<string, LiveMatchState>();
      for (const row of data ?? []) {
        if (row.fixture_key) byFixtureId.set(row.fixture_key, row as LiveMatchState);
      }
      setLiveStates(byFixtureId);
      setLoading(false);
    }

    fetchResults();
  }, []);

  const groupStandings = useMemo(() => {
    return WC2026_GROUPS.map((g) => ({
      group: g,
      rows: computeGroupStandings(g, ALL_WC2026_FIXTURES, liveStates),
    }));
  }, [liveStates]);

  return (
    <>
      <SEO
        title="WC 2026 Puan Durumu | Next59"
        description="2026 FIFA Dünya Kupası grup puan durumları — tüm gruplar, takım istatistikleri ve sıralamalar."
      />

      <div className="min-h-screen bg-navy-950">
        {/* Hero */}
        <div className="relative bg-gradient-to-b from-navy-900 to-navy-950 border-b border-navy-700/40">
          <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-champagne flex-shrink-0" />
              <span className="text-xs font-bold tracking-widest text-champagne/70 uppercase">
                FIFA World Cup 2026
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-3">
              Grup Puan Durumu
            </h1>
            <p className="text-slate-400 text-sm max-w-lg">
              Tamamlanan maçlara göre hesaplanan anlık sıralamalar. İlk iki takım bir sonraki tura geçer.
            </p>

            {/* Sub-nav */}
            <div className="flex items-center gap-1 mt-6">
              <Link
                to="/world-cup-2026"
                className="text-sm px-4 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800/60 transition-colors"
              >
                Fikstür
              </Link>
              <Link
                to="/world-cup-2026/puan-durumu"
                className="text-sm px-4 py-1.5 rounded-lg bg-champagne/10 text-champagne font-semibold border border-champagne/20"
              >
                Puan Durumu
              </Link>
              <Link
                to="/world-cup/tarihce"
                className="text-sm px-4 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800/60 transition-colors"
              >
                Tarihsel Arşiv
              </Link>
            </div>
          </div>
        </div>

        {/* Groups grid */}
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {WC2026_GROUPS.map((g) => (
                <div
                  key={g}
                  className="h-48 bg-navy-900/40 border border-navy-700/30 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-3 bg-sky-500 rounded-sm" />
                  <span className="text-xs text-slate-400">Son 32'ye Kalıfiye</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>OM=Maç</span>
                  <span>G=Galibiyet</span>
                  <span>B=Beraberlik</span>
                  <span>M=Mağlubiyet</span>
                  <span>AG=Attığı</span>
                  <span>YG=Yediği</span>
                  <span>A=Averaj</span>
                  <span className="text-champagne/70">P=Puan</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupStandings.map(({ group, rows }) => (
                  <GroupTable key={group} group={group} rows={rows} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
