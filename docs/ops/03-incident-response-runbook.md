# Incident Response Runbook

> **Owner:** Security Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define severity levels, response procedures, and communication protocols for all database and security incidents.

---

## 3.1 Severity Levels

| Level | Definition | Response Time | Escalation |
|:---|:---|:---|:---|
| **SEV-1** | Data breach, RLS bypass, unauthorized super_admin access | 15 min | CEO + Legal immediately |
| **SEV-2** | Schema corruption, mass data loss, auth system down | 30 min | CTO + Infrastructure Lead |
| **SEV-3** | Performance degradation, single table issue, partial outage | 2 hours | Engineering Lead |
| **SEV-4** | Minor bug, cosmetic issue, non-production | 24 hours | Assigned engineer |

---

## 3.2 RLS Bypass Detection

### Automated Alert (every 5 minutes)

```sql
-- Baseline: 319 policies on 63 tables
-- Alert if count drops unexpectedly

SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public';
-- If result < 315: trigger SEV-2
-- If result < 300: trigger SEV-1

-- Check for tables missing RLS
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false);
-- If any rows returned: trigger SEV-1
```

### Manual Verification

```sql
-- Full RLS audit
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count ASC;
-- Every table should have >= 4 policies
```

---

## 3.3 Auth Leak Response (SEV-1)

**Timeline: 0-15 minutes**

1. **Rotate ALL service_role keys** in Supabase Dashboard immediately
2. **Revoke affected API tokens:**
   ```sql
   UPDATE public.api_access_tokens
   SET revoked_at = NOW()
   WHERE revoked_at IS NULL;
   ```
3. **Audit recent activity:**
   ```sql
   SELECT * FROM public.admin_audit_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;

   SELECT * FROM public.security_audit
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```
4. **Force password reset** for affected users via Supabase Auth API
5. **Legal notification** within 24 hours if PII involved (GDPR Article 33)

**Timeline: 15-60 minutes**

6. Identify attack vector and close it
7. Review `user_events` for suspicious patterns
8. Check `ip_blocklist` and add attacker IPs
9. Enable enhanced logging

**Timeline: 1-24 hours**

10. Comprehensive audit of all data access during breach window
11. User notification if required by law
12. Begin post-incident review

---

## 3.4 Schema Corruption Response (SEV-2)

1. **Stop all writes** -- Enable maintenance mode
2. **Assess damage:**
   ```sql
   -- Run full verification suite
   SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
   -- Expected: 63
   ```
3. **Restore from last verified backup** (see Document 2)
4. **Run v1.4 SECTION 7 verification queries** (V1-V11)
5. **Verify prediction integrity** using `match_seals`:
   ```sql
   SELECT ms.match_id, ms.sealed_hash,
     encode(digest(p.content_hash || ms.salt, 'sha256'), 'hex') AS computed
   FROM public.match_seals ms
   JOIN public.predictions p ON p.match_id = ms.match_id AND p.is_current = true
   LIMIT 10;
   ```
6. **Root cause analysis** within 48 hours

---

## 3.5 Communication Template

```
[NEXT59 INCIDENT] SEV-{level}: {brief description}

Time:    {ISO 8601 timestamp}
Impact:  {affected tables/users/features}
Action:  {immediate action taken}
Status:  {investigating | mitigating | resolved | monitoring}
Next update: {ISO 8601 timestamp}

-- Incident Commander: {name}
-- Channel: #incident-{date}
```

### Notification Matrix

| Audience | SEV-1 | SEV-2 | SEV-3 | SEV-4 |
|:---|:---|:---|:---|:---|
| Engineering | Immediate | Immediate | 2h | Daily standup |
| Management | Immediate | 30 min | Daily | Weekly |
| Users | If PII affected | If downtime >1h | No | No |
| Legal | Immediate | If data loss | No | No |

---

## 3.6 Post-Incident Review

**Required for:** All SEV-1 and SEV-2 incidents.
**Timeline:** Within 72 hours of resolution.

### Template

1. **Timeline reconstruction** -- Minute-by-minute account
2. **Root cause analysis** -- 5 Whys method
3. **Impact assessment** -- Data affected, users affected, duration
4. **Remediation actions** -- What was done to fix
5. **Process improvements** -- What changes prevent recurrence
6. **Action items** -- Assigned, with deadlines

### Storage

All post-incident reviews stored in `/docs/ops/incidents/YYYY-MM-DD-brief-description.md`

---

## 3.7 Escalation Chain

```
Engineer on-call
    |
    v (15 min no response)
Engineering Lead
    |
    v (15 min no response for SEV-1/2)
CTO
    |
    v (SEV-1 only, immediate)
CEO + Legal
```

---

## 3.8 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Runbook walkthrough | Quarterly | Security Lead |
| Tabletop exercise | Semi-annually | All engineering |
| Contact list update | Monthly | Infrastructure Lead |
