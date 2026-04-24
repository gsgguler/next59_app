# API & Integration Standards

> **Owner:** Engineering Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define Supabase client configuration, RLS-aware query patterns, error handling, rate limiting, and webhook standards.

---

## 9.1 Supabase Client Configuration

### Client-Side (Browser / React)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);
```

### Server-Side (Edge Functions / Backend)

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

### Rules

- **NEVER** use `service_role` key in client-side code.
- **NEVER** expose `service_role` key in environment variables prefixed with `VITE_`.
- **ALWAYS** use `anon` key for client-side Supabase client.
- **ALWAYS** use `service_role` key only in Edge Functions or server-side code.
- Singleton pattern: One client instance per context (browser tab, Edge Function invocation).

---

## 9.2 RLS-Aware Query Patterns

### Correct: Let RLS Filter

```typescript
// RLS handles access control -- no manual filtering needed
const { data, error } = await supabase
  .from('predictions')
  .select('id, match_id, statement, probability, confidence_label, access_level')
  .eq('is_current', true)
  .order('generated_at', { ascending: false })
  .range(0, 19);
```

### Correct: Single Row Lookup

```typescript
// Use maybeSingle() for 0-or-1 results
const { data, error } = await supabase
  .from('profiles')
  .select('id, display_name, avatar_url')
  .eq('id', userId)
  .maybeSingle();
```

### Wrong: Bypassing RLS

```typescript
// NEVER use service_role for user-facing queries
// This bypasses all access controls
const { data } = await supabaseAdmin.from('predictions').select('*');
```

### Wrong: Client-Side Access Control

```typescript
// NEVER filter access client-side -- RLS handles this
const { data } = await supabase
  .from('predictions')
  .select('*')
  .in('access_level', userCanAccess); // Wrong: trust RLS instead
```

### Auth State Handling

```typescript
// Safe async pattern for onAuthStateChange
supabase.auth.onAuthStateChange((event, session) => {
  // Never use async directly -- wrap in IIFE to avoid deadlocks
  (async () => {
    if (event === 'SIGNED_IN' && session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, preferred_locale')
        .eq('id', session.user.id)
        .maybeSingle();
      // Update app state
    }
  })();
});
```

---

## 9.3 Error Handling

### PostgreSQL Error Codes

| Code | Meaning | User Message | Action |
|:---|:---|:---|:---|
| `42501` | RLS violation (insufficient privilege) | "Access denied" | Log, return 403 |
| `23505` | Unique constraint violation | "This item already exists" | Check for duplicates, retry with new ID |
| `23503` | Foreign key violation | "Referenced item not found" | Validate referenced entity exists |
| `28P01` | Authentication failed | "Session expired" | Refresh token, redirect to login |
| `53300` | Too many connections | "Service busy, try again" | Backoff + retry with jitter |
| `57014` | Query cancelled (timeout) | "Request timed out" | Optimize query, retry |
| `PGRST` | PostgREST error | Varies | Check Supabase docs |

### Error Handling Template

```typescript
async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  const { data, error } = await queryFn();

  if (error) {
    if (error.code === '42501') {
      // RLS violation -- user lacks access
      console.error('Access denied:', error.message);
      throw new Error('ACCESS_DENIED');
    }
    if (error.code === '23505') {
      // Unique violation -- duplicate
      console.error('Duplicate:', error.message);
      throw new Error('DUPLICATE_ENTRY');
    }
    if (error.code === '28P01' || error.message?.includes('JWT')) {
      // Auth error -- refresh session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error('SESSION_EXPIRED');
      return safeQuery(queryFn); // Retry once
    }
    console.error('Database error:', error);
    throw new Error('DATABASE_ERROR');
  }

  return data;
}
```

---

## 9.4 Rate Limiting

### Endpoint Limits

| Endpoint | Limit | Window | Enforcement |
|:---|:---|:---|:---|
| Auth (login/register) | 5 requests | 1 minute | Supabase Auth built-in |
| Predictions read | 100 requests | 1 minute | Edge Function middleware |
| Predictions create | 10 requests | 1 minute | Edge Function middleware |
| Debate trigger | 2 requests | 1 minute | Edge Function middleware |
| API token validation | 1000 requests | 1 minute | Edge Function middleware |
| General API | 60 requests | 1 minute | Edge Function middleware |

### Rate Limit Response

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Try again in {retry_after} seconds.",
  "retry_after": 30
}
```

HTTP Status: `429 Too Many Requests`
Headers: `Retry-After: 30`

### Implementation

Rate limiting uses `public.rate_limit_buckets` for persistence and `public.stable_hash_bucket()` for consistent bucketing. Primary enforcement should be at the Edge Function layer with database as audit fallback.

---

## 9.5 Webhook Standards

### Outgoing Webhooks

| Header | Purpose | Required |
|:---|:---|:---|
| `X-Webhook-Signature` | HMAC-SHA256 of body with shared secret | Yes |
| `X-Idempotency-Key` | UUID for deduplication | Yes |
| `Content-Type` | `application/json` | Yes |
| `User-Agent` | `Next59-Webhook/1.0` | Yes |

### Signature Verification

```typescript
import { createHmac } from 'node:crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === `sha256=${expected}`;
}
```

### Retry Policy

| Attempt | Delay | Total Elapsed |
|:---|:---|:---|
| 1 (initial) | 0s | 0s |
| 2 | 10s | 10s |
| 3 | 30s | 40s |
| 4 | 120s | 160s |
| 5 | 600s | 760s |

- Maximum 5 attempts with exponential backoff.
- Timeout: 30s per attempt, expected 200 OK within 5s.
- After 5 failures: Log to `admin_audit_log`, alert `#webhook-failures`.

### Incoming Webhooks (e.g., Stripe)

- Verify signature using provider's SDK.
- Store raw event in `stripe_events_log` before processing.
- Process idempotently (check `stripe_event_id` for duplicates).
- Return 200 immediately, process asynchronously.

---

## 9.6 API Versioning

- Current API version: v1 (implicit in schema v1.4).
- No explicit versioning in URL paths (Supabase PostgREST).
- Breaking changes require new views or Edge Functions, not schema changes.
- Deprecation notice: 90 days before removing any public endpoint.

---

## 9.7 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| API pattern audit | Monthly | Engineering Lead |
| Rate limit tuning | Quarterly | Infrastructure Lead |
| Webhook health check | Weekly | Infrastructure Lead |
| Error rate review | Daily (automated) | Monitoring system |
