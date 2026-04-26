import type { MatchData } from '../../data/mockMatches';

export default function PowerBalance({ match }: { match: MatchData }) {
  const homeElo = match.home_elo ?? 1500;
  const awayElo = match.away_elo ?? 1500;
  const eloDiff = homeElo - awayElo;
  const totalElo = homeElo + awayElo;
  const homePct = (homeElo / totalElo) * 100;
  const higherTeam = eloDiff >= 0 ? match.home_team.name : match.away_team.name;

  return (
    <div className="space-y-8">
      {/* Elo Comparison */}
      <Section title="Elo Karsilastirmasi">
        <div className="flex items-end justify-between mb-4">
          <div className="text-center">
            <p className="text-xs text-navy-500 mb-1">{match.home_team.short_name}</p>
            <p className="text-3xl sm:text-4xl font-mono font-bold text-champagne tabular-nums">
              {Math.round(homeElo)}
            </p>
          </div>
          <div className="text-center px-4">
            <p className="text-xs text-navy-600 mb-1">Fark</p>
            <p className={`text-lg font-mono font-bold tabular-nums ${eloDiff >= 0 ? 'text-champagne' : 'text-navy-300'}`}>
              {eloDiff >= 0 ? '+' : ''}{Math.round(eloDiff)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-navy-500 mb-1">{match.away_team.short_name}</p>
            <p className="text-3xl sm:text-4xl font-mono font-bold text-navy-300 tabular-nums">
              {Math.round(awayElo)}
            </p>
          </div>
        </div>

        {/* Visual bar */}
        <div className="h-3 rounded-full overflow-hidden flex bg-navy-800">
          <div
            className="h-full bg-gradient-to-r from-champagne/80 to-champagne/50 transition-all"
            style={{ width: `${homePct}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-navy-500/50 to-navy-400/40 transition-all"
            style={{ width: `${100 - homePct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-navy-500 mt-1.5">
          <span>{match.home_team.name}</span>
          <span>{match.away_team.name}</span>
        </div>

        {Math.abs(eloDiff) > 10 && (
          <p className="text-xs text-navy-400 mt-3">
            {higherTeam}, {Math.abs(Math.round(eloDiff))} Elo puani ustunluge sahip.
          </p>
        )}

        <p className="text-[10px] text-navy-600 mt-2 leading-relaxed">
          Elo, takimin son 30 uluslararasi macina dayali hesaplanmis guc endeksidir.
        </p>
      </Section>

      {/* Recent Form */}
      <Section title="Form Durumu">
        <div className="grid sm:grid-cols-2 gap-6">
          <FormDisplay
            teamName={match.home_team.name}
            shortName={match.home_team.short_name}
            elo={homeElo}
          />
          <FormDisplay
            teamName={match.away_team.name}
            shortName={match.away_team.short_name}
            elo={awayElo}
          />
        </div>
        <div className="mt-4 flex items-center gap-4 text-[10px] text-navy-600">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> G = Galibiyet</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-navy-600" /> B = Beraberlik</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> M = Maglubiyet</span>
        </div>
      </Section>

      {/* Team Stats */}
      <Section title="Takim Istatistikleri">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Mac Basi Gol (Ev)" home={estimateGoals(homeElo)} away={estimateGoals(awayElo)} />
          <StatCard label="Mac Basi Yenilen Gol" home={estimateConceded(homeElo)} away={estimateConceded(awayElo)} />
          <StatCard label="Kalesini Kapama %" home={`${estimateCleanSheet(homeElo)}%`} away={`${estimateCleanSheet(awayElo)}%`} />
          <StatCard label="Derecelendirme Mac Sayisi" home="30" away="30" />
        </div>
      </Section>

      {/* Squad Assessment */}
      <Section title="Kadro Degerlendirmesi">
        <div className="bg-navy-800/40 border border-navy-700/40 rounded-lg p-6 text-center">
          <p className="text-sm text-navy-500">
            Kadro bilgisi mac saatine yakin eklenecektir.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function FormDisplay({ teamName, shortName, elo }: { teamName: string; shortName: string; elo: number }) {
  const form = generateMockForm(elo);
  return (
    <div className="bg-navy-900/60 border border-navy-800 rounded-lg p-4">
      <p className="text-xs font-semibold text-navy-300 mb-3">{teamName}</p>
      <div className="flex items-center gap-1.5">
        {form.map((result, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
              result === 'W'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : result === 'D'
                  ? 'bg-navy-700 text-navy-400 border border-navy-600'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {result === 'W' ? 'G' : result === 'D' ? 'B' : 'M'}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-navy-600 mt-2">
        {shortName} son 5 mac: {form.map((r) => (r === 'W' ? 'G' : r === 'D' ? 'B' : 'M')).join('-')}
      </p>
    </div>
  );
}

function generateMockForm(elo: number): ('W' | 'D' | 'L')[] {
  const winRate = Math.min(0.7, Math.max(0.2, (elo - 1400) / 600));
  const results: ('W' | 'D' | 'L')[] = [];
  let seed = Math.round(elo);
  for (let i = 0; i < 5; i++) {
    seed = (seed * 16807 + 7) % 2147483647;
    const r = (seed % 1000) / 1000;
    if (r < winRate) results.push('W');
    else if (r < winRate + 0.25) results.push('D');
    else results.push('L');
  }
  return results;
}

function StatCard({ label, home, away }: { label: string; home: string; away: string }) {
  return (
    <div className="bg-navy-900/60 border border-navy-800 rounded-lg p-3">
      <p className="text-[10px] text-navy-500 mb-2 uppercase tracking-wider">{label}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono font-semibold text-champagne tabular-nums">{home}</span>
        <span className="text-[10px] text-navy-600">vs</span>
        <span className="text-sm font-mono font-semibold text-navy-300 tabular-nums">{away}</span>
      </div>
    </div>
  );
}

function estimateGoals(elo: number): string {
  return (0.5 + (elo - 1400) / 800).toFixed(1);
}

function estimateConceded(elo: number): string {
  return (1.8 - (elo - 1400) / 800).toFixed(1);
}

function estimateCleanSheet(elo: number): string {
  return Math.round(10 + ((elo - 1400) / 400) * 30).toString();
}
