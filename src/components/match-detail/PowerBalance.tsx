import type { UIMatch } from '../../types/ui-models';

export default function PowerBalance({ match }: { match: UIMatch }) {
  const homeElo = match.home_elo ?? null;
  const awayElo = match.away_elo ?? null;

  const hasElo = homeElo !== null && awayElo !== null;

  return (
    <div className="space-y-8">
      {/* Elo Comparison */}
      <Section title="Elo Karşılaştırması">
        {hasElo ? (
          <EloDisplay
            homeElo={homeElo}
            awayElo={awayElo}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
          />
        ) : (
          <DataPending label="Elo derecelendirmesi bu maç için henüz hesaplanmamış." />
        )}
      </Section>

      {/* Recent Form */}
      <Section title="Form Durumu">
        <DataPending label="Son maç form verisi bu maç için henüz mevcut değil." />
      </Section>

      {/* Squad Assessment */}
      <Section title="Kadro Değerlendirmesi">
        <DataPending label="Kadro bilgisi maç saatine yakın eklenecektir." />
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

function DataPending({ label }: { label: string }) {
  return (
    <div className="bg-navy-800/40 border border-navy-700/40 rounded-lg p-6 text-center">
      <p className="text-sm text-readable-muted">{label}</p>
    </div>
  );
}

function EloDisplay({
  homeElo,
  awayElo,
  homeTeam,
  awayTeam,
}: {
  homeElo: number;
  awayElo: number;
  homeTeam: UIMatch['home_team'];
  awayTeam: UIMatch['away_team'];
}) {
  const eloDiff = homeElo - awayElo;
  const totalElo = homeElo + awayElo;
  const homePct = (homeElo / totalElo) * 100;
  const higherTeam = eloDiff >= 0 ? homeTeam.name : awayTeam.name;

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div className="text-center">
          <p className="text-xs text-readable-muted mb-1">{homeTeam.short_name}</p>
          <p className="text-3xl sm:text-4xl font-mono font-bold text-champagne tabular-nums">
            {Math.round(homeElo)}
          </p>
        </div>
        <div className="text-center px-4">
          <p className="text-xs text-readable-muted mb-1">Fark</p>
          <p className={`text-lg font-mono font-bold tabular-nums ${eloDiff >= 0 ? 'text-champagne' : 'text-navy-300'}`}>
            {eloDiff >= 0 ? '+' : ''}{Math.round(eloDiff)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-readable-muted mb-1">{awayTeam.short_name}</p>
          <p className="text-3xl sm:text-4xl font-mono font-bold text-navy-300 tabular-nums">
            {Math.round(awayElo)}
          </p>
        </div>
      </div>

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
      <div className="flex justify-between text-[10px] text-readable-muted mt-1.5">
        <span>{homeTeam.name}</span>
        <span>{awayTeam.name}</span>
      </div>

      {Math.abs(eloDiff) > 10 && (
        <p className="text-xs text-navy-400 mt-3">
          {higherTeam}, {Math.abs(Math.round(eloDiff))} Elo puanı üstünlüğe sahip.
        </p>
      )}

      <p className="text-[10px] text-readable-muted mt-2 leading-relaxed">
        Elo, takımın son 30 uluslararası maçına dayalı hesaplanmış güç endeksidir.
      </p>
    </>
  );
}
