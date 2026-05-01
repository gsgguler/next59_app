import { MapPin, HelpCircle } from 'lucide-react';
import { COUNTRY_BY_FIFA } from '../../data/worldCup2026Countries';
import {
  STAGE_LABELS_TR,
  formatKickoffTR,
  VENUE_META,
  type WC2026Fixture,
} from '../../data/worldCup2026Fixtures';

// ---------------------------------------------------------------------------
// Flag — flag-icons CSS (MIT licence).
// The .fi class sets display:inline-block and uses background-image.
// We must supply explicit px dimensions via style, not Tailwind w-/h- classes,
// because flag-icons' own `width:1.333333em` overrides Tailwind utility widths.
// ---------------------------------------------------------------------------

function CountryFlag({ iso2 }: { iso2: string }) {
  return (
    <span
      className={`fi fi-${iso2} rounded-[3px] shadow-sm shrink-0`}
      style={{ width: 28, height: 20, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// TBD placeholder — neutral icon, no flag, bilingual label
// ---------------------------------------------------------------------------

function TBDTeam({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  const isRight = align === 'right';
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${isRight ? 'justify-end' : ''}`}>
      {isRight && (
        <div className="flex flex-col items-end min-w-0">
          <span className="text-[11px] text-navy-500 italic leading-tight truncate max-w-[90px]">{label}</span>
        </div>
      )}
      <div className="w-9 h-9 rounded-lg bg-navy-800/60 border border-navy-700/60 flex items-center justify-center shrink-0">
        <HelpCircle className="w-4 h-4 text-navy-600" />
      </div>
      {!isRight && (
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[11px] text-navy-500 italic leading-tight truncate max-w-[90px]">{label}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team display — flag + EN name + TR name
// ---------------------------------------------------------------------------

function TeamDisplay({ code, align = 'left' }: { code: string; align?: 'left' | 'right' }) {
  const country = COUNTRY_BY_FIFA[code];
  const isRight = align === 'right';

  if (!country) return <TBDTeam label="TBD" align={align} />;

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
      <div
        className="rounded-lg bg-navy-800 border border-navy-700/60 flex items-center justify-center shrink-0 overflow-hidden"
        style={{ width: 36, height: 36 }}
      >
        <CountryFlag iso2={country.iso2} />
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
  const venue = VENUE_META[fixture.venue];

  function tbdLabel(name: string) {
    return name && name !== 'TBD' ? name : 'Belirlenecek';
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
        {isTBD ? (
          <TBDTeam label={tbdLabel(fixture.home_team)} align="left" />
        ) : (
          <TeamDisplay code={fixture.home_team_code} align="left" />
        )}

        <div className="flex flex-col items-center px-1.5 shrink-0">
          <span className="text-[10px] font-bold tracking-widest text-champagne/50 uppercase">VS</span>
        </div>

        {isTBD ? (
          <TBDTeam label={tbdLabel(fixture.away_team)} align="right" />
        ) : (
          <TeamDisplay code={fixture.away_team_code} align="right" />
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-navy-800 my-3" />

      {/* Venue meta row — rich: country_tr · city_display / stadium · capacity */}
      <div className="flex items-start justify-between gap-2 text-[11px] text-navy-400">
        <div className="flex items-start gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-navy-600 shrink-0 mt-px" />
          <div className="min-w-0">
            {venue ? (
              <>
                <span className="text-navy-500">{venue.country_tr} · {venue.city_display}</span>
                <span className="block text-navy-600 truncate">
                  {fixture.venue}
                  {venue.capacity ? (
                    <span className="text-navy-700"> · {venue.capacity.toLocaleString('tr-TR')} kişi</span>
                  ) : null}
                </span>
              </>
            ) : (
              <span className="truncate">{fixture.venue}, {fixture.city}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 tabular-nums text-navy-400 font-medium">{trTime}</div>
      </div>
    </div>
  );
}
