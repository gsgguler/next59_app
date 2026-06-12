/**
 * World Cup 2026 countdown utilities.
 *
 * Single source of truth for countdown target selection.
 * Selection priority:
 *   1. Any currently-live fixture (earliest kickoff wins if multiple)
 *   2. Next upcoming fixture (earliest kickoff_utc in the future)
 *   3. Tournament-over fallback
 */

import type { WC2026Fixture } from '../data/worldCup2026Fixtures';

// Kept for backwards-compat in Countdown.tsx (WorldCup2026Page still uses it)
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

// ---------------------------------------------------------------------------
// Live statuses used by the DB / API-Football feed
// ---------------------------------------------------------------------------

const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'completed']);

/** Approximate live-match duration: 90 min + 15 min stoppage buffer */
const LIVE_MATCH_DURATION_MS = (90 + 15) * 60 * 1000;

// ---------------------------------------------------------------------------
// Active fixture selection
// ---------------------------------------------------------------------------

export type CountdownMode = 'pre' | 'live' | 'over';

export interface ActiveCountdownResult {
  mode: CountdownMode;
  fixture: WC2026Fixture | null;
  /** UTC milliseconds the countdown ticks toward */
  targetMs: number;
  /** Badge label to display on the fixture card */
  badgeLabel: string;
  /** Whether this is the tournament opening match */
  isOpeningMatch: boolean;
}

/**
 * Selects the most relevant fixture for the countdown display.
 *
 * @param fixtures   Full static fixture list (ALL_WC2026_FIXTURES)
 * @param liveDbStatuses  Map of fixture_id → live status string from
 *                        wc2026_live_match_state_public (may be empty)
 * @param now        Current timestamp in ms (defaults to Date.now())
 */
export function getActiveCountdownFixture(
  fixtures: WC2026Fixture[],
  liveDbStatuses: Map<string, string> = new Map(),
  now: number = Date.now(),
): ActiveCountdownResult {
  // 1. Check for any currently-live fixture (by DB status or within live window)
  const liveFixtures = fixtures.filter((f) => {
    const dbStatus = liveDbStatuses.get(f.id);
    if (dbStatus && LIVE_STATUSES.has(dbStatus)) return true;
    // Fallback: fixture kickoff is in the past but within LIVE_MATCH_DURATION_MS
    const kickoffMs = new Date(f.kickoff_utc).getTime();
    return kickoffMs <= now && now < kickoffMs + LIVE_MATCH_DURATION_MS;
  });

  if (liveFixtures.length > 0) {
    // Pick earliest kickoff among concurrent live matches
    const fixture = liveFixtures.sort(
      (a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime(),
    )[0];
    const kickoffMs = new Date(fixture.kickoff_utc).getTime();
    const targetMs = kickoffMs + LIVE_MATCH_DURATION_MS;
    return {
      mode: 'live',
      fixture,
      targetMs,
      badgeLabel: 'Canlı Maç',
      isOpeningMatch: fixture.id === 'wc2026-001',
    };
  }

  // 2. Find next upcoming fixture
  const upcoming = fixtures
    .filter((f) => {
      const dbStatus = liveDbStatuses.get(f.id);
      if (dbStatus && FINISHED_STATUSES.has(dbStatus)) return false;
      if (f.status === 'completed') return false;
      return new Date(f.kickoff_utc).getTime() > now;
    })
    .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());

  if (upcoming.length > 0) {
    const fixture = upcoming[0];
    const targetMs = new Date(fixture.kickoff_utc).getTime();
    const isOpeningMatch = fixture.id === 'wc2026-001';
    return {
      mode: 'pre',
      fixture,
      targetMs,
      badgeLabel: isOpeningMatch ? 'Açılış Maçı' : 'Sıradaki Maç',
      isOpeningMatch,
    };
  }

  // 3. Tournament over
  return {
    mode: 'over',
    fixture: null,
    targetMs: 0,
    badgeLabel: 'Turnuva Bitti',
    isOpeningMatch: false,
  };
}

/**
 * Derives countdown blocks from an arbitrary future target (ms).
 * Returns all-zeros when target is in the past.
 */
export function getCountdownFromTarget(targetMs: number, now: number = Date.now()): WorldCupCountdown {
  const totalMs = Math.max(0, targetMs - now);
  return {
    totalMs,
    isStarted: totalMs === 0,
    days: Math.floor(totalMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((totalMs / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((totalMs / (1000 * 60)) % 60),
    seconds: Math.floor((totalMs / 1000) % 60),
  };
}

if (import.meta.env.DEV) {
  console.debug(
    '[worldCupCountdown] UTC target:',
    WORLD_CUP_2026_OPENING_KICKOFF_UTC,
  );
}
