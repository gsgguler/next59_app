import { MapPin, Clock, HelpCircle } from 'lucide-react';
import { COUNTRY_BY_FIFA } from '../../data/worldCup2026Countries';
import {
  STAGE_LABELS_TR,
  formatKickoffTR,
  type WC2026Fixture,
} from '../../data/worldCup2026Fixtures';

// ---------------------------------------------------------------------------
// Flag component — uses flag-icons CSS (MIT licence)
// flag-icons class format: "fi fi-{iso2}" for standard countries,
// "fi fi-gb-sct" / "fi fi-gb-eng" for Scotland / England subdivisions.
// ---------------------------------------------------------------------------

function CountryFlag({ iso2, size = 'md' }: { iso2: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm'
    ? 'w-5 h-[14px]'
    : 'w-7 h-5';
  return (
    <span
      className={`fi fi-${iso2} ${dim} rounded-[2px] shadow-sm shrink-0 object-cover`}
      style={{ display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// TBD placeholder — neutral icon, no flag, bilingual label
// ---------------------------------------------------------------------------

function TBDTeam({
  placeholder,
  align = 'left',
}: {
  placeholder: string;
  align?: 'left' | 'right';
}) {
  const isRight = align === 'right';
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${isRight ? 'justify-end' : ''}`}>
      {isRight && (
        <div className={`flex flex-col ${isRight ? 'items-end' : 'items-start'} min-w-0`}>
          <span className="text-[11px] text-navy-500 italic leading-tight truncate">{placeholder}</span>
        </div>
      )}
      <div className="w-9 h-9 rounded-lg bg-navy-800/60 border border-navy-700/60 flex items-center justify-center shrink-0">
        <HelpCircle className="w-4 h-4 text-navy-600" />
      </div>
      {!isRight && (
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[11px] text-navy-500 italic leading-tight truncate">{placeholder}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team display — flag + EN name + TR name
// ---------------------------------------------------------------------------

function TeamDisplay({
  code,
  align = 'left',
}: {
  code: string;
  align?: 'left' | 'right';
}) {
  const country = COUNTRY_BY_FIFA[code];
  const isRight = align === 'right';

  if (!country) {
    return <TBDTeam placeholder="TBD" align={align} />;
  }

  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${isRight ? 'justify-end' : ''}`}>
      {isRight && (
        <div className="flex flex-col items-end min-w-0">
          <span className="text-sm font-semibold text-white truncate leading-tight">
            {country.name_en}
          </span>
          <span className="text-[10px] text-navy-500 leading-tight truncate">
            {country.name_tr}
          </span>
        </div>
      )}
      <div className="w-9 h-9 rounded-lg bg-navy-800 border border-navy-700/60 flex items-center justify-center shrink-0 overflow-hidden">
        <CountryFlag iso2={country.iso2} size="md" />
      </div>
      {!isRight && (
        <div className="flex flex-col items-start min-w-0">
          <span className="text-sm font-semibold text-white truncate leading-tight">
            {country.name_en}
          </span>
          <span className="text-[10px] text-navy-500 leading-tight truncate">
            {country.name_tr}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fixture card
// ---------------------------------------------------------------------------

export function WC2026FixtureCard({ fixture }: { fixture: WC2026Fixture }) {
  const isTBD = fixture.home_team_code === 'TBD' || fixture.home_team === 'TBD';
  const trTime = formatKickoffTR(fixture.kickoff_utc);
  const stageLabel = STAGE_LABELS_TR[fixture.stage];
  const groupLabel = fixture.group ? `Grup ${fixture.group}` : null;

  // For TBD knockout slots the fixture carries a descriptive label like
  // "Winner Group A" — surface it bilingually when possible.
  function tbdLabel(teamName: string): string {
    return teamName && teamName !== 'TBD' ? teamName : 'Belirlenecek';
  }

  return (
    <div className="relative bg-navy-900 border border-navy-800 rounded-xl p-4 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-champagne/5 hover:border-champagne/20 transition-all duration-200">
      {/* Stage + match no */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-champagne/70">
          {groupLabel ? `${stageLabel} — ${groupLabel}` : stageLabel}
        </span>
        <span className="text-[10px] font-mono text-navy-600">#{fixture.match_no}</span>
      </div>

      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        {isTBD ? (
          <TBDTeam placeholder={tbdLabel(fixture.home_team)} align="left" />
        ) : (
          <TeamDisplay code={fixture.home_team_code} align="left" />
        )}

        {/* VS */}
        <div className="flex flex-col items-center px-1.5 shrink-0">
          <span className="text-[10px] font-bold tracking-widest text-champagne/50 uppercase">VS</span>
        </div>

        {/* Away */}
        {isTBD ? (
          <TBDTeam placeholder={tbdLabel(fixture.away_team)} align="right" />
        ) : (
          <TeamDisplay code={fixture.away_team_code} align="right" />
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-navy-800 my-3" />

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-navy-400">
        <div className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-navy-600 shrink-0" />
          <span className="truncate">{fixture.venue}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3 text-navy-600" />
          <span className="tabular-nums">{trTime}</span>
        </div>
      </div>
    </div>
  );
}
