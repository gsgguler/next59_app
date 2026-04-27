import { formatInTimeZone } from 'date-fns-tz';
import { differenceInMinutes, addDays } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';

const LOCALES: Record<string, Locale> = { tr, en: enUS };
export type FormatStyle = 'absolute' | 'relative' | 'hybrid' | 'kickoff';

interface Options {
  style?: FormatStyle;
  locale?: string;
  showTimezone?: boolean;
}

export function formatMatchTime(
  utcKickoff: string | Date,
  userTz: string,
  options: Options = {}
): string {
  const { style = 'hybrid', locale = 'tr', showTimezone = false } = options;
  const dateLocale = LOCALES[locale] || enUS;
  const kickoff = typeof utcKickoff === 'string' ? new Date(utcKickoff) : utcKickoff;
  const now = new Date();

  const minutesUntil = differenceInMinutes(kickoff, now);

  if (style === 'kickoff') {
    const time = formatInTimeZone(kickoff, userTz, 'HH:mm', { locale: dateLocale });
    if (showTimezone) {
      const tzAbbr = formatInTimeZone(kickoff, userTz, 'zzz', { locale: dateLocale });
      return `${time} ${tzAbbr}`;
    }
    return time;
  }

  if (style === 'relative' && Math.abs(minutesUntil) < 60 * 24) {
    return formatRelative(minutesUntil, locale);
  }

  if (style === 'hybrid' || style === 'absolute') {
    const kickoffDayStr = formatInTimeZone(kickoff, userTz, 'yyyy-MM-dd');
    const todayStr = formatInTimeZone(now, userTz, 'yyyy-MM-dd');
    const tomorrowStr = formatInTimeZone(addDays(now, 1), userTz, 'yyyy-MM-dd');
    const yesterdayStr = formatInTimeZone(addDays(now, -1), userTz, 'yyyy-MM-dd');

    const time = formatInTimeZone(kickoff, userTz, 'HH:mm', { locale: dateLocale });

    if (kickoffDayStr === todayStr) return locale === 'tr' ? `Bugün ${time}` : `Today ${time}`;
    if (kickoffDayStr === tomorrowStr) return locale === 'tr' ? `Yarın ${time}` : `Tomorrow ${time}`;
    if (kickoffDayStr === yesterdayStr) return locale === 'tr' ? `Dün ${time}` : `Yesterday ${time}`;

    return formatInTimeZone(kickoff, userTz, 'd MMM, HH:mm', { locale: dateLocale });
  }

  return formatInTimeZone(kickoff, userTz, 'PPpp', { locale: dateLocale });
}

function formatRelative(minutesUntil: number, locale: string): string {
  const abs = Math.abs(minutesUntil);
  const past = minutesUntil < 0;

  const trFmt = (n: number, unit: string) => past ? `${n} ${unit} önce` : `${n} ${unit} sonra`;
  const enFmt = (n: number, unit: string) => past ? `${n} ${unit} ago` : `in ${n} ${unit}`;
  const fmt = locale === 'tr' ? trFmt : enFmt;

  if (abs < 60) return fmt(abs, locale === 'tr' ? 'dk' : 'min');
  if (abs < 60 * 24) return fmt(Math.round(abs / 60), locale === 'tr' ? 'sa' : 'h');
  return fmt(Math.round(abs / 60 / 24), locale === 'tr' ? 'gün' : 'd');
}
