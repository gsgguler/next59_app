import { useNavigate } from 'react-router-dom';
import type { UIMatch } from '../../types/ui-models';
import { generateNarrativePreview } from '../../utils/narrativeEngine';
import ShareMatchCard from '../ShareMatchCard';

const statusConfig = {
  scheduled: { label: 'Yaklaşıyor', cls: 'bg-navy-800 text-navy-300 border-navy-700' },
  live: { label: 'CANLI', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' },
  finished: { label: 'Tamamlandı', cls: 'bg-navy-800/60 text-navy-500 border-navy-700/50' },
} as const;

function FlagBadge({ code, name }: { code: string; name: string }) {
  const flag = countryCodeToFlag(code);
  return (
    <div className="w-10 h-10 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center shrink-0" title={name}>
      <span className="text-lg leading-none">{flag}</span>
    </div>
  );
}

function countryCodeToFlag(cc: string): string {
  const map: Record<string, string> = {
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
  return map[cc.toUpperCase()] ?? '\u{1F3F3}\u{FE0F}';
}

function EloBar({ homeElo, awayElo }: { homeElo: number | null; awayElo: number | null }) {
  if (!homeElo || !awayElo) {
    return (
      <div className="mt-3">
        <div className="h-1.5 rounded-full bg-navy-800 overflow-hidden">
          <div className="h-full w-full bg-navy-700" />
        </div>
        <p className="text-[10px] text-navy-600 mt-1 text-center">Elo verisi yok</p>
      </div>
    );
  }

  const total = homeElo + awayElo;
  const homePct = (homeElo / total) * 100;

  return (
    <div className="mt-3">
      <div className="h-1.5 rounded-full bg-navy-800 overflow-hidden flex">
        <div
          className="h-full bg-champagne/60 transition-all"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="h-full bg-navy-500/60 transition-all"
          style={{ width: `${100 - homePct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] tabular-nums text-navy-500">{Math.round(homeElo)}</span>
        <span className="text-[10px] text-navy-600 font-medium">ELO</span>
        <span className="text-[10px] tabular-nums text-navy-500">{Math.round(awayElo)}</span>
      </div>
    </div>
  );
}

export default function MatchTimelineCard({ match }: { match: UIMatch }) {
  const navigate = useNavigate();
  const status = statusConfig[match.status] ?? statusConfig.scheduled;

  const kickoff = new Date(match.kickoff_at);
  const timeStr = kickoff.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const narrative = generateNarrativePreview(
    match.prediction,
    match.home_team.name,
    match.away_team.name,
  );

  return (
    <button
      onClick={() => navigate(`/mac/${match.id}`)}
      className="relative w-full text-left bg-navy-900 border border-navy-800 rounded-xl p-4 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-champagne/5 hover:border-champagne/20 transition-all duration-200 group"
    >
      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <FlagBadge code={match.home_team.country_code} name={match.home_team.name} />
          <span className="text-sm font-semibold text-white truncate">
            {match.home_team.name}
          </span>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center px-2 shrink-0 w-20">
          <span className="text-[10px] font-bold tracking-widest text-champagne uppercase">VS</span>
          <span className="text-sm font-mono font-semibold text-white tabular-nums mt-0.5">{timeStr}</span>
          <span className={`mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.cls}`}>
            {status.label}
          </span>
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-2.5 min-w-0 justify-end">
          <span className="text-sm font-semibold text-white truncate text-right">
            {match.away_team.name}
          </span>
          <FlagBadge code={match.away_team.country_code} name={match.away_team.name} />
        </div>
      </div>

      {/* Elo bar */}
      <EloBar homeElo={match.home_elo} awayElo={match.away_elo} />

      {/* Narrative */}
      <p className="mt-2.5 text-xs text-navy-400 leading-relaxed line-clamp-1 group-hover:text-navy-300 transition-colors">
        {narrative}
      </p>

      <ShareMatchCard
        matchId={match.id}
        homeTeam={match.home_team.name}
        awayTeam={match.away_team.name}
        prediction={
          match.prediction
            ? match.prediction.home_prob > match.prediction.away_prob
              ? match.prediction.home_prob > match.prediction.draw_prob
                ? 'Galibiyet'
                : 'Beraberlik'
              : match.prediction.away_prob > match.prediction.draw_prob
                ? 'Maglubiyet'
                : 'Beraberlik'
            : ''
        }
        probability={
          match.prediction
            ? String(Math.round(Math.max(match.prediction.home_prob, match.prediction.draw_prob, match.prediction.away_prob)))
            : ''
        }
        matchDate={match.kickoff_at}
        league="2026 Dunya Kupasi"
      />
    </button>
  );
}
