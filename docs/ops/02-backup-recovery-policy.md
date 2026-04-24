# Backup & Recovery Policy

> **Owner:** Infrastructure Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define backup schedules, recovery objectives, and restore procedures for the Next59 production database.

---

## 2.1 Backup Schedule

| Type | Frequency | Retention | Scope |
|:---|:---|:---|:---|
| Full logical (`pg_dump`) | Daily 02:00 UTC | 30 days | Entire database |
| WAL archival | Continuous | 7 days | Point-in-time recovery |
| Schema-only | Weekly (Sunday 01:00 UTC) | 90 days | DDL only |
| Critical table export | Daily 03:00 UTC | 90 days | predictions, match_seals, billing_history |

### Critical Table Priority

These tables receive dedicated exports due to their immutable, compliance-critical nature:

1. `predictions` -- Core business data, sealed with content hashes
2. `match_seals` -- Integrity verification chain
3. `billing_history` -- Financial audit trail
4. `actual_outcomes` -- Ground truth for prediction accuracy

---

## 2.2 Recovery Objectives

| Metric | Target | Justification |
|:---|:---|:---|
| **RPO** (Recovery Point Objective) | 1 hour | WAL archival provides continuous protection |
| **RTO** (Recovery Time Objective) | 4 hours (full restore) | Full logical restore + verification |
| **RTO** (single table) | 1 hour | Targeted restore from daily export |

---

## 2.3 Restore Procedures

### Full Database Restore

```bash
# 1. Stop application traffic (maintenance mode)

# 2. Restore from latest logical backup
pg_restore --clean --if-exists \
  --dbname=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres \
  backup_file.sql

# 3. Verify schema integrity
# Run v1.4 SECTION 7 verification queries (V1-V11)

# 4. Verify data integrity
# Compare row counts against backup manifest

# 5. Re-enable application traffic
```

### Single Table Restore

```sql
-- 1. Disable triggers to prevent side effects
ALTER TABLE public.predictions DISABLE TRIGGER ALL;

-- 2. Restore data
COPY public.predictions FROM '/tmp/predictions_restore.csv' WITH CSV;

-- 3. Re-enable triggers
ALTER TABLE public.predictions ENABLE TRIGGER ALL;

-- 4. Verify row count and sample data
SELECT COUNT(*) FROM public.predictions;
SELECT * FROM public.predictions ORDER BY created_at DESC LIMIT 5;
```

### Point-in-Time Recovery (PITR)

```bash
# Restore to specific timestamp using Supabase PITR
# Available for Pro plan and above
# Navigate: Supabase Dashboard > Database > Backups > Point in Time

# Target: Latest known-good timestamp before incident
# Verify: Run V1-V11 checks immediately after restore
```

---

## 2.4 Backup Verification

### Monthly Automated Restore Test

Checklist:

- [ ] Row counts match production (within 0.1% tolerance)
- [ ] RLS policies active (`SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public'` returns 319)
- [ ] All 24 functions return expected results
- [ ] Auth flow end-to-end works (signup, login, token refresh)
- [ ] Views return data (`public_predictions`, `pro_predictions`, `elite_predictions`, `profiles_public`, `profiles_private`)
- [ ] `match_seals` hash verification passes on random 10-record sample
- [ ] Foreign key constraints intact (no orphaned records)

### Verification Queries

```sql
-- Quick integrity check post-restore
SELECT 'tables' AS check, COUNT(*) AS result
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'policies', COUNT(*) FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'functions', COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'views', COUNT(*) FROM pg_views WHERE schemaname = 'public';
-- Expected: tables=63, policies=319, functions=24, views=5
```

---

## 2.5 Offsite / Cold Storage

| Item | Encryption | Destination | Retention | Access |
|:---|:---|:---|:---|:---|
| Daily backups | AES-256 | S3 Glacier | 1 year | Infrastructure Lead + CEO (2-person rule) |
| Weekly schema | AES-256 | S3 Standard | 90 days | Infrastructure Lead |
| Critical exports | AES-256 | S3 Glacier | 1 year | Infrastructure Lead + CEO (2-person rule) |

### Encryption Key Management

- Encryption keys stored in AWS KMS, separate account from data.
- Key rotation: Every 365 days.
- Emergency key access requires 2-person authorization.

---

## 2.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Backup job health | Daily (automated) | Infrastructure |
| Restore test | Monthly | Infrastructure + DB Lead |
| Full DR exercise | Quarterly | All engineering |
| Policy review | Annually (January) | Infrastructure Lead + CTO |
