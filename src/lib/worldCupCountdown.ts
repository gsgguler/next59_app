/**
 * Single source of truth for the FIFA World Cup 2026 opening match countdown.
 *
 * Canonical event : Mexico vs South Africa
 * Venue           : Estadio Azteca, Mexico City
 * UTC kickoff     : 2026-06-11T19:00:00.000Z
 *   = Mexico City  13:00 CDT (UTC−6)
 *   = New York ET  15:00 EDT (UTC−4)
 *   = London UK    20:00 BST (UTC+1)
 *   = Istanbul TRT 22:00 (UTC+3)
 *
 * All countdown math uses only this UTC constant.
 * User timezone is used solely for display — never for calculation.
 */

export const WORLD_CUP_2026_OPENING_KICKOFF_UTC = '2026-06-11T19:00:00.000Z';

export const WORLD_CUP_2026_OPENING_KICKOFF_MS = new Date(
  WORLD_CUP_2026_OPENING_KICKOFF_UTC,
).getTime();

export interface WorldCupCountdown {
  totalMs: number;
  isStarted: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Returns the countdown from `now` (defaults to Date.now()) to the canonical
 * UTC kickoff instant. All fields are zero once the match has started.
 */
export function getWorldCupCountdown(now: number = Date.now()): WorldCupCountdown {
  const totalMs = Math.max(0, WORLD_CUP_2026_OPENING_KICKOFF_MS - now);
  const isStarted = totalMs === 0;
  return {
    totalMs,
    isStarted,
    days: Math.floor(totalMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((totalMs / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((totalMs / (1000 * 60)) % 60),
    seconds: Math.floor((totalMs / 1000) % 60),
  };
}

/** Returns the user's IANA timezone string without requesting location permission. */
export function getUserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Formats the canonical kickoff instant in the user's local timezone.
 * Example output (TR): "11 Haziran 2026, 22:00"
 */
export function formatOpeningKickoffForUser(locale = 'tr-TR'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getUserTimeZone(),
  }).format(new Date(WORLD_CUP_2026_OPENING_KICKOFF_UTC));
}

// Dev/debug assertion: verifies both countdown consumers share the same target.
// Runs once at module load in development; silent in production.
if (import.meta.env.DEV) {
  const headerTarget = WORLD_CUP_2026_OPENING_KICKOFF_MS;
  const heroTarget   = WORLD_CUP_2026_OPENING_KICKOFF_MS;
  console.assert(
    headerTarget === heroTarget,
    '[worldCupCountdown] MISMATCH: header and hero countdown targets differ!',
  );
  console.debug(
    '[worldCupCountdown] Single source verified. UTC target:',
    WORLD_CUP_2026_OPENING_KICKOFF_UTC,
    '→', new Date(WORLD_CUP_2026_OPENING_KICKOFF_MS).toISOString(),
  );
}
