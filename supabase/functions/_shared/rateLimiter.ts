/**
 * Shared fetch utility with exponential backoff and 429 / Retry-After handling.
 *
 * Usage in any edge function:
 *   import { fetchWithRetry } from "../_shared/rateLimiter.ts";
 *   const res = await fetchWithRetry(url, { headers: { ... } });
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Wraps fetch with automatic retry logic:
 * - 429 Too Many Requests: respects Retry-After header, otherwise exponential backoff
 * - 5xx server errors: exponential backoff
 * - Network errors: exponential backoff
 * - 4xx client errors (except 429): thrown immediately, no retry
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  { maxRetries = 3, baseDelayMs = 1000 }: RetryOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      // 429 — rate limited
      if (res.status === 429) {
        if (attempt >= maxRetries) return res;
        const retryAfterHeader = res.headers.get("Retry-After");
        const waitMs = retryAfterHeader
          ? parseRetryAfter(retryAfterHeader)
          : Math.pow(2, attempt) * baseDelayMs;
        await sleep(waitMs);
        continue;
      }

      // 5xx — transient server error, retry with backoff
      if (res.status >= 500 && attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * baseDelayMs);
        continue;
      }

      // All other responses (including 4xx except 429) — return as-is
      return res;

    } catch (err) {
      // Network-level failure (DNS, timeout, connection refused)
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * baseDelayMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error(`fetchWithRetry: max retries exceeded for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry-After can be either a number of seconds or an HTTP-date string
function parseRetryAfter(header: string): number {
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return 1000;
}
