/**
 * Shared API-Football v3 client for WC2026 automation.
 *
 * SECURITY: API key is ONLY read from Deno.env — never hardcoded, never logged.
 * WC-SCOPE GUARD: assertWc2026FixtureScope() must be called before processing
 *   any fixture data to ensure only WC2026 fixtures are handled.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Env ─────────────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function getEnvOpt(key: string, fallback = ""): string {
  return Deno.env.get(key) ?? fallback;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string> | string[];
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  requests: number | null;
}

export interface ApiGetResult<T> {
  data: T[];
  results: number;
  rateLimit: RateLimitInfo;
  errors: Record<string, string> | string[];
}

export interface WcScopeGuardResult {
  isWc2026: boolean;
  reason: string;
}

// ─── Supabase client (service role for logging) ───────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;
  _supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  return _supabase;
}

// ─── WC2026 fixture ID cache (lazy-loaded once per invocation) ────────────────

let _wc2026FixtureIds: Set<number> | null = null;

export async function loadWc2026FixtureIds(): Promise<Set<number>> {
  if (_wc2026FixtureIds) return _wc2026FixtureIds;

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("wc2026_fixtures")
    .select("api_football_fixture_id")
    .not("api_football_fixture_id", "is", null);

  if (error) {
    console.error("[WcGuard] Failed to load WC2026 fixture ids:", error.message);
    return new Set();
  }

  _wc2026FixtureIds = new Set(
    (data ?? [])
      .map((r: { api_football_fixture_id: number | null }) => r.api_football_fixture_id)
      .filter((id): id is number => id != null),
  );
  return _wc2026FixtureIds;
}

// ─── WC2026 scope guard ───────────────────────────────────────────────────────

export async function assertWc2026FixtureScope(
  apiFootballFixtureId: number,
): Promise<WcScopeGuardResult> {
  const ids = await loadWc2026FixtureIds();

  if (ids.size === 0) {
    return { isWc2026: false, reason: "WC2026 fixture id list is empty or could not be loaded" };
  }

  if (ids.has(apiFootballFixtureId)) {
    return { isWc2026: true, reason: "matched wc2026_fixtures.api_football_fixture_id" };
  }

  return {
    isWc2026: false,
    reason: `fixture ${apiFootballFixtureId} not in known WC2026 fixture list`,
  };
}

// ─── Rate limit helpers ───────────────────────────────────────────────────────

export function extractRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    remaining: parseIntHeader(headers, "x-ratelimit-requests-remaining"),
    limit:     parseIntHeader(headers, "x-ratelimit-requests-limit"),
    requests:  parseIntHeader(headers, "x-ratelimit-requests-remaining"),
  };
}

function parseIntHeader(headers: Headers, name: string): number | null {
  const v = headers.get(name);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

export function isRateLimitLow(rateLimit: RateLimitInfo, threshold = 5): boolean {
  if (rateLimit.remaining == null) return false;
  return rateLimit.remaining <= threshold;
}

// ─── Request logging ──────────────────────────────────────────────────────────

export interface LogApiRequestParams {
  jobName: string;
  endpoint: string;
  params: Record<string, string | number | boolean | undefined>;
  apiFootballFixtureId?: number | null;
  isWc2026Scope: boolean;
  statusCode: number | null;
  success: boolean;
  rateLimitRemaining: number | null;
  responseResults: number | null;
  error?: string | null;
}

export async function logApiRequest(p: LogApiRequestParams): Promise<void> {
  try {
    const sb = getSupabaseClient();
    await sb.from("wc_api_request_log").insert({
      job_name:                p.jobName,
      endpoint:                p.endpoint,
      params:                  p.params,
      api_football_fixture_id: p.apiFootballFixtureId ?? null,
      is_wc2026_scope:         p.isWc2026Scope,
      status_code:             p.statusCode,
      success:                 p.success,
      rate_limit_remaining:    p.rateLimitRemaining,
      response_results:        p.responseResults,
      error:                   p.error ?? null,
    });
  } catch (err) {
    console.error("[apiFootballClient] logApiRequest failed:", err);
  }
}

// ─── Sync run helpers ─────────────────────────────────────────────────────────

export async function createSyncRun(jobName: string): Promise<string | null> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("wc_api_sync_runs")
      .insert({ job_name: jobName, status: "running" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (err) {
    console.error("[apiFootballClient] createSyncRun failed:", err);
    return null;
  }
}

export async function finishSyncRun(
  runId: string | null,
  status: "completed" | "error" | "skipped",
  opts: { fixturesProcessed?: number; apiCalls?: number; error?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  if (!runId) return;
  try {
    const sb = getSupabaseClient();
    await sb.from("wc_api_sync_runs").update({
      status,
      finished_at:        new Date().toISOString(),
      fixtures_processed: opts.fixturesProcessed ?? 0,
      api_calls:          opts.apiCalls ?? 0,
      error:              opts.error ?? null,
      meta:               opts.meta ?? {},
    }).eq("id", runId);
  } catch (err) {
    console.error("[apiFootballClient] finishSyncRun failed:", err);
  }
}

// ─── URL builder ──────────────────────────────────────────────────────────────

export function buildApiUrl(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const base = getEnvOpt("API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io");
  const url = new URL(`${base.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// ─── Core GET function ────────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 499, 500, 502, 503]);

export async function apiFootballGet<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
  opts: {
    jobName?: string;
    apiFootballFixtureId?: number | null;
    isWc2026Scope?: boolean;
    maxRetries?: number;
  } = {},
): Promise<ApiGetResult<T>> {
  const apiKey    = getEnv("API_FOOTBALL_KEY");
  const url       = buildApiUrl(endpoint, params);
  const jobName   = opts.jobName ?? "unknown";
  const maxRetries = opts.maxRetries ?? 2;

  let lastError: string | null = null;
  let statusCode: number | null = null;
  let rateLimit: RateLimitInfo = { remaining: null, limit: null, requests: null };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt - 1) * 1500);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "x-apisports-key": apiKey,
          "Accept": "application/json",
        },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) continue;
      await logApiRequest({
        jobName, endpoint, params,
        apiFootballFixtureId: opts.apiFootballFixtureId ?? null,
        isWc2026Scope: opts.isWc2026Scope ?? false,
        statusCode: null, success: false,
        rateLimitRemaining: null, responseResults: null,
        error: lastError,
      });
      throw new Error(`API-Football fetch failed: ${lastError}`);
    }

    statusCode  = res.status;
    rateLimit   = extractRateLimitInfo(res.headers);

    if (statusCode === 204) {
      await logApiRequest({
        jobName, endpoint, params,
        apiFootballFixtureId: opts.apiFootballFixtureId ?? null,
        isWc2026Scope: opts.isWc2026Scope ?? false,
        statusCode, success: true,
        rateLimitRemaining: rateLimit.remaining, responseResults: 0,
        error: null,
      });
      return { data: [], results: 0, rateLimit, errors: [] };
    }

    if (RETRYABLE_STATUS.has(statusCode) && attempt < maxRetries) {
      lastError = `HTTP ${statusCode}`;
      if (statusCode === 429) {
        const retryAfter = res.headers.get("Retry-After");
        await sleep(retryAfter ? parseRetryAfterHeader(retryAfter) : 5000);
      }
      continue;
    }

    let body: ApiFootballResponse<T>;
    try {
      body = await res.json() as ApiFootballResponse<T>;
    } catch {
      lastError = `Non-JSON response (status ${statusCode})`;
      await logApiRequest({
        jobName, endpoint, params,
        apiFootballFixtureId: opts.apiFootballFixtureId ?? null,
        isWc2026Scope: opts.isWc2026Scope ?? false,
        statusCode, success: false,
        rateLimitRemaining: rateLimit.remaining, responseResults: null,
        error: lastError,
      });
      throw new Error(lastError);
    }

    const hasErrors = Array.isArray(body.errors)
      ? body.errors.length > 0
      : Object.keys(body.errors ?? {}).length > 0;

    if (hasErrors) console.error("[apiFootballClient] API errors:", JSON.stringify(body.errors));

    const success   = statusCode >= 200 && statusCode < 300 && !hasErrors;
    const errorStr  = hasErrors ? JSON.stringify(body.errors) : (statusCode >= 400 ? `HTTP ${statusCode}` : null);

    await logApiRequest({
      jobName, endpoint, params,
      apiFootballFixtureId: opts.apiFootballFixtureId ?? null,
      isWc2026Scope: opts.isWc2026Scope ?? false,
      statusCode, success,
      rateLimitRemaining: rateLimit.remaining,
      responseResults: body.results ?? 0,
      error: errorStr,
    });

    return { data: body.response ?? [], results: body.results ?? 0, rateLimit, errors: body.errors ?? [] };
  }

  await logApiRequest({
    jobName, endpoint, params,
    apiFootballFixtureId: opts.apiFootballFixtureId ?? null,
    isWc2026Scope: opts.isWc2026Scope ?? false,
    statusCode, success: false,
    rateLimitRemaining: rateLimit.remaining, responseResults: null,
    error: lastError ?? "max retries exceeded",
  });

  throw new Error(`API-Football ${endpoint} failed after ${maxRetries + 1} attempts: ${lastError ?? "unknown error"}`);
}

// ─── Name normalization ───────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterHeader(header: string): number {
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return Math.max(1000, seconds * 1000);
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(1000, date.getTime() - Date.now());
  return 5000;
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export function isLiveOddsSyncEnabled(): boolean {
  return getEnvOpt("ENABLE_LIVE_ODDS_SYNC", "false").toLowerCase() === "true";
}

export function isPlayerEnrichmentEnabled(): boolean {
  return getEnvOpt("ENABLE_PLAYER_ENRICHMENT", "true").toLowerCase() === "true";
}

export function isRefereeEnrichmentEnabled(): boolean {
  return getEnvOpt("ENABLE_REFEREE_ENRICHMENT", "true").toLowerCase() === "true";
}
