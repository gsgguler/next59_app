import { useUserTimezone } from '../hooks/useUserTimezone';
import { useTranslation } from 'react-i18next';
import { formatMatchTime, FormatStyle } from '../utils/formatMatchTime';
import { formatInTimeZone } from 'date-fns-tz';

interface Props {
  utcKickoff: string;
  venueTimezone?: string;
  showVenueZone?: boolean;
  style?: FormatStyle;
}

export function MatchTime({ utcKickoff, venueTimezone, showVenueZone = false, style = 'hybrid' }: Props) {
  const userTz = useUserTimezone();
  const { t, i18n } = useTranslation();

  const userFormatted = formatMatchTime(utcKickoff, userTz, { style, locale: i18n.language });
  const showSecondLine = showVenueZone && venueTimezone && venueTimezone !== userTz;
  const venueTime = showSecondLine ? formatInTimeZone(new Date(utcKickoff), venueTimezone, 'HH:mm zzz') : null;

  return (
    <div className="match-time flex flex-col">
      <time dateTime={utcKickoff} title={`Local: ${userFormatted}`} className="block font-mono font-medium">
        {userFormatted}
      </time>
      {showSecondLine && (
        <span className="block text-xs text-white/50 mt-0.5">
          {t('match.venue_time', { time: venueTime })}
        </span>
      )}
    </div>
  );
}
