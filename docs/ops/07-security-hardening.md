# Security Hardening Checklist

> **Owner:** Security Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define pre-production security requirements, quarterly review procedures, encryption standards, and vulnerability disclosure protocols.

---

## 7.1 Pre-Production Checklist

### Database Security

- [ ] RLS **enabled** on ALL 63 public tables
- [ ] RLS **forced** on ALL 63 public tables (`relforcerowsecurity = true`)
- [ ] No `anon` SELECT on sensitive tables (`profiles`, `organizations`, `invoices`, `billing_history`, `security_audit`, `admin_audit_log`)
- [ ] All 319 RLS policies in place and verified
- [ ] `service_role` keys rotated within 30 days of deploy
- [ ] `api_access_tokens.ip_allowlist` populated for all production tokens
- [ ] `feature_flags` has no `rollout_percentage > 0` for unfinished features
- [ ] `pg_stat_statements` enabled for query monitoring
- [ ] `pgcrypto` extension enabled (required for content hashing)
- [ ] `pg_trgm` extension enabled (required for text search)

### Authentication Security

- [ ] SSL/TLS enforced on all connections (Supabase default, verify)
- [ ] Database password meets policy: minimum 16 characters, mixed case + numbers + symbols
- [ ] MFA enabled on all Supabase Dashboard accounts
- [ ] JWT signing key unique to this project
- [ ] No hardcoded credentials in application code or environment files committed to git
- [ ] `anon` key is the ONLY key exposed to client-side code

### Application Security

- [ ] `service_role` key used only in server-side code (Edge Functions, backend)
- [ ] All user input validated before database operations
- [ ] No raw SQL exposed to client -- all queries via Supabase client library
- [ ] CORS configured correctly on all Edge Functions
- [ ] Content Security Policy headers set

### Verification Query

```sql
-- One-shot security verification
SELECT
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relrowsecurity = true AND c.relforcerowsecurity = true) AS tables_with_rls,
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r') AS total_tables,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS policy_count,
  (SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
   AND proname = 'is_super_admin') AS super_admin_fn_exists;
-- Expected: tables_with_rls=63, total_tables=63, policy_count=319, super_admin_fn_exists=1
```

---

## 7.2 Quarterly Security Review

### Checklist (Every 90 days)

- [ ] Re-run entire 7.1 pre-production checklist
- [ ] Review `auth.users` for suspicious patterns:
  ```sql
  SELECT id, email, created_at, last_sign_in_at,
    raw_app_meta_data->>'role' AS role
  FROM auth.users
  WHERE raw_app_meta_data->>'role' = 'super_admin'
  ORDER BY last_sign_in_at DESC;
  ```
- [ ] Check `admin_audit_log` for unauthorized access patterns:
  ```sql
  SELECT action, actor_id, COUNT(*) AS occurrences
  FROM public.admin_audit_log
  WHERE created_at > NOW() - INTERVAL '90 days'
  GROUP BY action, actor_id
  ORDER BY occurrences DESC;
  ```
- [ ] Verify `match_seals` hash integrity (random 10-record sample):
  ```sql
  SELECT id, match_id, sealed_hash, hash_algorithm
  FROM public.match_seals
  ORDER BY RANDOM()
  LIMIT 10;
  -- Manually verify hashes against prediction content
  ```
- [ ] Penetration test: Attempt RLS bypass via crafted queries
- [ ] Review third-party access (Supabase team members, contractors)
- [ ] Verify no new `USING (true)` policies added (except `service_role` and `feature_flags` authenticated read)
- [ ] Check for unused or expired `api_access_tokens`
- [ ] Review Edge Function secrets for unnecessary entries

### Sign-off

- Reviewer: Security Lead
- Approver: CTO
- Report stored in: `/docs/ops/security-reviews/YYYY-QX.md`

---

## 7.3 Encryption Standards

| Layer | Method | Key Management |
|:---|:---|:---|
| Data at rest | AES-256 | Supabase / AWS KMS |
| Data in transit | TLS 1.3 | Automatic (Supabase enforced) |
| Sensitive columns | `pgcrypto` SHA-256 hashing | Application layer |
| Content seals | SHA-256 (`match_seals`) | Deterministic, verifiable |
| Backups | AES-256 | S3 KMS, 2-person access |
| API tokens | SHA-256 hash stored, plaintext never persisted | Generated once, shown once |

### Column-Level Encryption Rules

| Column | Table | Method |
|:---|:---|:---|
| `content_hash` | predictions | SHA-256 via `pgcrypto` |
| `sealed_hash` | match_seals | SHA-256 via `pgcrypto` |
| `token_hash` | api_access_tokens | SHA-256 (plaintext never stored) |

---

## 7.4 Vulnerability Disclosure

### Contact

- **Email:** security@next59.com
- **PGP Key:** _{to be generated and published}_
- **Response SLA:** 48-hour acknowledgment, 7-day initial assessment

### Process

1. Reporter submits via email with PGP encryption.
2. Security Lead acknowledges within 48 hours.
3. Assessment and severity classification within 7 days.
4. Fix timeline communicated to reporter.
5. Public disclosure coordinated with reporter after fix deployed.

### Bug Bounty (Future)

- Scope: RLS bypass, auth bypass, data exfiltration
- Exclusions: DoS, social engineering, physical access
- Rewards: Based on severity (details TBD)

---

## 7.5 Security Monitoring Rules

| Rule | Trigger | Action |
|:---|:---|:---|
| Policy count drift | `policy_count != 319` | SEV-2 alert |
| Table RLS disabled | Any `relrowsecurity = false` | SEV-1 alert |
| Mass auth failures | >50 failures in 5 minutes | Block IP, SEV-2 alert |
| Super admin activation | New super_admin in `auth.users` | Security Lead notification |
| Service role key usage from unexpected IP | IP not in allowlist | SEV-1 alert |

---

## 7.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Security review (full) | Quarterly | Security Lead |
| Pre-production checklist | Per deployment | DB Lead |
| Penetration test | Semi-annually | External vendor |
| Encryption key rotation | Annually | Infrastructure Lead |
