import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, MapPin } from 'lucide-react';
import type { UIMatch } from '../../types/ui-models';

const statusConfig = {
  scheduled: { label: 'Yaklaşıyor', cls: 'bg-navy-800 text-navy-300 border-navy-700' },
  live: { label: 'CANLI', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' },
  finished: { label: 'Tamamlandı', cls: 'bg-navy-800/60 text-navy-500 border-navy-700/50' },
} as const;

const flagMap: Record<string, string> = {
  MX: '\u{1F1F2}\u{1F1FD}', ZA: '\u{1F1FF}\u{1F1E6}', KR: '\u{1F1F0}\u{1F1F7}',
  CZ: '\u{1F1E8}\u{1F1FF}', CA: '\u{1F1E8}\u{1F1E6}', BA: '\u{1F1E7}\u{1F1E6}',
  US: '\u{1F1FA}\u{1F1F8}', PY: '\u{1F1F5}\u{1F1FE}', QA: '\u{1F1F6}\u{1F1E6}',
  CH: '\u{1F1E8}\u{1F1ED}', BR: '\u{1F1E7}\u{1F1F7}', MA: '\u{1F1F2}\u{1F1E6}',
  HT: '\u{1F1ED}\u{1F1F9}', SC: '\u{1F1F8}\u{1F1E8}', AU: '\u{1F1E6}\u{1F1FA}',
  TR: '\u{1F1F9}\u{1F1F7}', DE: '\u{1F1E9}\u{1F1EA}', CW: '\u{1F1E8}\u{1F1FC}',
  NL: '\u{1F1F3}\u{1F1F1}', JP: '\u{1F1EF}\u{1F1F5}', CI: '\u{1F1E8}\u{1F1EE}',
  EC: '\u{1F1EA}\u{1F1E8}', SE: '\u{1F1F8}\u{1F1EA}', TN: '\u{1F1F9}\u{1F1F3}',
  ES: '\u{1F1EA}\u{1F1F8}', CV: '\u{1F1E8}\u{1F1FB}', BE: '\u{1F1E7}\u{1F1EA}',
  EG: '\u{1F1EA}\u{1F1EC}', SA: '\u{1F1F8}\u{1F1E6}', UY: '\u{1F1FA}\u{1F1FE}',
  IR: '\u{1F1EE}\u{1F1F7}', NZ: '\u{1F1F3}\u{1F1FF}', FR: '\u{1F1EB}\u{1F1F7}',
  SN: '\u{1F1F8}\u{1F1F3}', IQ: '\u{1F1EE}\u{1F1F6}', NO: '\u{1F1F3}\u{1F1F4}',
  AR: '\u{1F1E6}\u{1F1F7}', DZ: '\u{1F1E9}\u{1F1FF}', AT: '\u{1F1E6}\u{1F1F9}',
  JO: '\u{1F1EF}\u{1F1F4}', PT: '\u{1F1F5}\u{1F1F9}', CD: '\u{1F1E8}\u{1F1E9}',
  EN: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  HR: '\u{1F1ED}\u{1F1F7}', GH: '\u{1F1EC}\u{1F1ED}',
  PA: '\u{1F1F5}\u{1F1E6}', UZ: '\u{1F1FA}\u{1F1FF}', CO: '\u{1F1E8}\u{1F1F4}',
};

function Flag({ code }: { code: string }) {
  return (
    <span className="text-5xl sm:text-7xl leading-none">
      {flagMap[code.toUpperCase()] ?? '\u{1F3F3}\u{FE0F}'}
    </span>
  );
}

export default function MatchHeader({ match }: { match: UIMatch }) {
  const status = statusConfig[match.status] ?? statusConfig.scheduled;
  const kickoff = new Date(match.kickoff_at);
  const dateStr = kickoff.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = kickoff.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const roundLabel = match.round_name.replace('Group Stage - ', 'Grup Aşaması - Maç Günü ');

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/80 via-navy-950/60 to-navy-950" />
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/" className="inline-flex items-center gap-1 text-navy-400 hover:text-champagne transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tüm Maçlar
          </Link>
          <span>/</span>
          <span className="text-navy-400 truncate">
            {match.home_team.name} vs {match.away_team.name}
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          {/* Home */}
          <div className="flex-1 flex flex-col items-center sm:items-end gap-2 min-w-0">
            <Flag code={match.home_team.country_code} />
            <h1 className="font-display text-lg sm:text-2xl font-bold text-white text-center sm:text-right truncate max-w-full">
              {match.home_team.name}
            </h1>
            {match.home_elo && (
              <span className="text-[10px] font-mono text-navy-500 tabular-nums">
                ELO {Math.round(match.home_elo)}
              </span>
            )}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center shrink-0 px-2 sm:px-6">
            <span className="font-display text-2xl sm:text-4xl font-light text-champagne/60">VS</span>
            <span className="text-base sm:text-xl font-mono font-semibold text-white mt-1 tabular-nums">{timeStr}</span>
            <span className="text-[11px] text-navy-400 mt-1 text-center">{dateStr}</span>
            <span className={`mt-2 text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${status.cls}`}>
              {status.label}
            </span>
          </div>

          {/* Away */}
          <div className="flex-1 flex flex-col items-center sm:items-start gap-2 min-w-0">
            <Flag code={match.away_team.country_code} />
            <h1 className="font-display text-lg sm:text-2xl font-bold text-white text-center sm:text-left truncate max-w-full">
              {match.away_team.name}
            </h1>
            {match.away_elo && (
              <span className="text-[10px] font-mono text-navy-500 tabular-nums">
                ELO {Math.round(match.away_elo)}
              </span>
            )}
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-6 text-[11px] text-navy-500">
          {match.stadium && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {match.stadium.name}, {match.stadium.city}
            </span>
          )}
          <span>{roundLabel}</span>
          <span className="bg-navy-800 text-navy-400 px-2 py-0.5 rounded">Tarafsız Saha</span>
        </div>

        {/* Pre-match lock badge */}
        {match.status === 'scheduled' && (
          <div className="mt-5 flex justify-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-champagne/70 bg-champagne/5 border border-champagne/10 rounded-full px-3.5 py-1.5">
              <Lock className="w-3 h-3" />
              Maç başladığında kehanetler kilitlenir
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
