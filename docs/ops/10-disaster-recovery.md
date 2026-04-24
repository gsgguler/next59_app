# Disaster Recovery Plan

> **Owner:** Infrastructure Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define disaster scenarios, recovery procedures, communication plans, and testing schedules for the Next59 platform.

---

## 10.1 Scenario Matrix

| Scenario | Probability | Impact | RTO | RPO | Method |
|:---|:---|:---|:---|:---|:---|
| Single table corruption | Medium | Medium | 2h | 1h | Point-in-time restore |
| Full DB loss | Low | Critical | 4h | 1h | Full backup restore |
| Supabase region outage | Low | Critical | 8h | 1h | Cross-region replica (if configured) |
| RLS mass misconfiguration | Medium | High | 1h | 0 | Policy re-apply from git |
| Auth system compromise | Low | Critical | 2h | 0 | Key rotation + force logout |
| App bug causing mass delete | Medium | High | 4h | 1h | Backup restore + audit |
| Service role key leak | Low | Critical | 30m | 0 | Immediate key rotation |
| DNS/CDN failure | Low | Medium | 1h | 0 | DNS failover |
| Edge Function failure | Medium | Medium | 30m | 0 | Redeploy from source |

---

## 10.2 Recovery Procedures

### Scenario A: Full Database Loss

**RTO: 4 hours | RPO: 1 hour**

1. **Assess:** Confirm database is unrecoverable.
2. **Communicate:** SEV-1 incident (Document 3).
3. **Create new Supabase project** (same region if available, otherwise nearest).
4. **Restore from latest logical backup:**
   ```bash
   pg_restore --clean --if-exists \
     --dbname=postgresql://postgres:[PASSWORD]@[NEW_HOST]:5432/postgres \
     /backups/latest/full_backup.sql
   ```
5. **Apply any migrations** created since the backup timestamp.
6. **Update application environment variables:**
   - `VITE_SUPABASE_URL` (new project URL)
   - `VITE_SUPABASE_ANON_KEY` (new anon key)
   - Edge Function secrets (service_role key)
7. **Run v1.4 SECTION 7 verification queries** (V1-V11).
8. **Verify data integrity:**
   ```sql
   -- Compare row counts against backup manifest
   SELECT tablename, n_live_tup
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```
9. **DNS/connection string update** to point to new project.
10. **Notify users** if downtime exceeded 1 hour.
11. **Post-incident review** within 72 hours.

### Scenario B: RLS Misconfiguration

**RTO: 1 hour | RPO: 0 (no data loss)**

1. **Detect:** Monitoring alert on policy count drift (Document 5).
2. **Assess:** Export current broken state:
   ```sql
   SELECT tablename, policyname, cmd, roles, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```
3. **Identify changes:** Diff against known-good baseline (319 policies).
4. **Re-apply policies** from version-controlled migration files:
   - Run step_5a through step_5g migrations.
   - Run step_7 remediation migration.
5. **Verify:** Run V1-V11 checks.
   ```sql
   SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
   -- Expected: 319
   ```
6. **Root cause:** Identify who applied unauthorized changes.
7. **Remediate:** Revoke access if unauthorized, update change management process.

### Scenario C: Auth System Compromise

**RTO: 2 hours | RPO: 0 (no data loss)**

1. **Immediate (0-15 minutes):**
   - Rotate ALL Supabase keys (Dashboard > Settings > API).
   - Force invalidate all sessions:
     ```sql
     -- Via Supabase Auth admin API
     -- All active sessions terminated
     ```
   - Revoke all API tokens:
     ```sql
     UPDATE public.api_access_tokens
     SET revoked_at = NOW()
     WHERE revoked_at IS NULL;
     ```

2. **Assessment (15-60 minutes):**
   - Audit auth logs for unauthorized access.
   - Check `security_audit` and `admin_audit_log`.
   - Identify compromised accounts.
   - Add attacker IPs to `ip_blocklist`.

3. **Recovery (1-2 hours):**
   - Update application with new keys.
   - Redeploy Edge Functions with new secrets.
   - Force password reset for affected users.
   - Re-enable normal operations.

4. **Post-incident (1-24 hours):**
   - Legal notification if PII exposed (GDPR: 72 hours).
   - User notification as required.
   - Full incident report.

### Scenario D: Single Table Corruption

**RTO: 2 hours | RPO: 1 hour**

1. **Identify** the corrupted table and extent of damage.
2. **If Class C (immutable):** Restore from critical table export (Document 2).
3. **If Class A/B:** Use PITR to restore to pre-corruption timestamp.
4. **Restore procedure:**
   ```sql
   ALTER TABLE public.{table} DISABLE TRIGGER ALL;
   -- Truncate corrupted data (if safe) or merge
   COPY public.{table} FROM '/tmp/{table}_restore.csv' WITH CSV;
   ALTER TABLE public.{table} ENABLE TRIGGER ALL;
   ```
5. **Verify** row counts and sample data.
6. **Check FK integrity:**
   ```sql
   -- Verify no orphaned references
   SELECT conname, conrelid::regclass, confrelid::regclass
   FROM pg_constraint
   WHERE contype = 'f'
     AND conrelid = 'public.{table}'::regclass;
   ```

### Scenario E: Edge Function Failure

**RTO: 30 minutes | RPO: 0**

1. **Identify** failing function via monitoring.
2. **Check logs** in Supabase Dashboard > Edge Functions > Logs.
3. **Redeploy** from source code using `mcp__supabase__deploy_edge_function`.
4. **Verify** function health via test request.
5. **If persistent:** Rollback to previous version.

---

## 10.3 Communication Plan

| Phase | Timing | Audience | Message Template |
|:---|:---|:---|:---|
| Detection | 0 min | Internal engineering | "Investigating potential issue with {component}" |
| Assessment | 30 min | Internal + stakeholders | "Issue confirmed: {description}. Recovery in progress. ETA: {time}" |
| Recovery | Per RTO | All users (if impact) | "Service is experiencing degraded performance. We are working to resolve this. ETA: {time}" |
| Resolution | On resolution | All users (if notified) | "Service has been restored. All systems operational." |
| Post-incident | 24 hours | All + public (if required) | "Post-mortem published: {link}" |

### Communication Channels

| Channel | Use |
|:---|:---|
| Slack `#incidents` | Real-time internal coordination |
| Slack `#status-updates` | Internal status broadcasts |
| Status page | External user-facing status |
| Email | User notifications for data breaches |
| Phone/SMS | SEV-1 escalation to executives |

---

## 10.4 Testing Schedule

| Test | Frequency | Scope | Owner |
|:---|:---|:---|:---|
| Full restore to staging | Quarterly | Complete database restore + verification | Infrastructure Lead |
| Single table restore | Monthly | Random table from daily export | DB Lead |
| RLS re-apply | Quarterly | Drop and re-apply all policies on staging | Security Lead |
| Auth key rotation | Semi-annually | Full key rotation drill | Infrastructure Lead |
| Cross-region failover | Annually (if multi-region) | Failover to secondary region | CTO + Infrastructure |
| Rollback test | After each major migration | Rollback most recent migration | DB Lead |
| Tabletop exercise | Semi-annually | Walk through SEV-1 scenario | All engineering |

### Test Documentation

Each test result stored in `/docs/ops/dr-tests/YYYY-MM-DD-test-type.md` with:
- Test date and participants
- Scenario tested
- Steps executed
- Results (pass/fail with details)
- Issues found
- Remediation actions

---

## 10.5 Dependencies & Contact Information

### External Dependencies

| Service | Purpose | Fallback |
|:---|:---|:---|
| Supabase | Database hosting, Auth, Edge Functions | Manual deployment to alternative PG host |
| AWS S3 | Backup storage | Azure Blob Storage |
| Stripe | Payment processing | Manual invoice processing |
| PagerDuty | Alerting | Slack + phone tree |

### Emergency Contacts

| Role | Name | Phone | Escalation |
|:---|:---|:---|:---|
| CTO | _{name}_ | _{number}_ | CEO |
| Infrastructure Lead | _{name}_ | _{number}_ | CTO |
| Security Lead | _{name}_ | _{number}_ | CTO + Legal |
| DB Lead | _{name}_ | _{number}_ | Infrastructure Lead |
| On-call engineer | _{rotation}_ | _{pager}_ | Infrastructure Lead |
| Supabase Support | - | support@supabase.io | - |

---

## 10.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| DR plan review | Semi-annually | Infrastructure Lead + CTO |
| Contact list update | Monthly | Infrastructure Lead |
| Dependency audit | Quarterly | Engineering Lead |
| Test result review | After each test | All engineering |
