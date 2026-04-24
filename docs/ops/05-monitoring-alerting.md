# Database Monitoring & Alerting

> **Owner:** Infrastructure Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define key metrics, thresholds, alert routing, and dashboard queries for production database health.

---

## 5.1 Key Metrics

| Metric | Warning Threshold | Critical Threshold | Query |
|:---|:---|:---|:---|
| Connection count | >80% of max | >95% of max | `SELECT count(*) FROM pg_stat_activity` |
| Slow queries | >500ms p95 | >2000ms p99 | `pg_stat_statements` |
| Dead tuples | >20% of table | >50% of table | `pg_stat_user_tables` |
| Table bloat | >30% | >50% | `pgstattuple` |
| RLS policy count | 319 +/- 2 | 319 +/- 5 | `SELECT count(*) FROM pg_policies WHERE schemaname = 'public'` |
| Failed auth attempts | >10/min | >50/min | Supabase Auth logs |
| Disk usage | >70% | >85% | Supabase Dashboard |
| Replication lag | >30s | >120s | `pg_stat_replication` |
| Cache hit ratio | <95% | <90% | `pg_stat_user_tables` |
| Index hit ratio | <98% | <95% | `pg_statio_user_indexes` |

---

## 5.2 Alert Routing

| Severity | Channel | Response SLA |
|:---|:---|:---|
| Warning | Slack `#db-alerts` | Next business day |
| Critical | Slack `#db-alerts` + PagerDuty + SMS | Immediate (15 min) |
| Info | Slack `#db-metrics` (daily digest) | No response required |

### Escalation

- Warning unresolved >24h: Escalate to Critical.
- Critical unresolved >1h: Escalate to CTO.
- Multiple simultaneous Critical: Declare incident (Document 3).

---

## 5.3 Dashboard Queries

### Daily Health Check (09:00 UTC)

```sql
-- Table statistics
SELECT schemaname, relname AS tablename,
  n_tup_ins AS inserts,
  n_tup_upd AS updates,
  n_tup_del AS deletes,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC
LIMIT 20;
```

### RLS Policy Verification

```sql
-- Policy count per table (run daily)
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count ASC;
-- All tables should have >= 4 policies
-- Total should be 319
```

### Connection Monitoring

```sql
-- Active connections by state
SELECT state, COUNT(*) AS count,
  MAX(NOW() - state_change) AS longest_duration
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count DESC;
```

### Slow Query Detection

```sql
-- Top 10 slowest queries (requires pg_stat_statements)
SELECT query, calls, mean_exec_time, total_exec_time,
  rows, shared_blks_hit, shared_blks_read
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Cache Hit Ratio

```sql
-- Should be >99% for healthy system
SELECT
  'index' AS type,
  sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table',
  sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0)
FROM pg_statio_user_tables;
```

### Table Size Report

```sql
-- Largest tables
SELECT relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

---

## 5.4 Performance Baselines

Document after 30 days of production traffic:

| Metric | Baseline | Measured Date |
|:---|:---|:---|
| Average query time (predictions) | _TBD_ | _TBD_ |
| Average query time (matches) | _TBD_ | _TBD_ |
| Peak connection usage | _TBD_ | _TBD_ |
| Autovacuum frequency | _TBD_ | _TBD_ |
| Index hit ratio | _TBD_ (target >99%) | _TBD_ |
| Cache hit ratio | _TBD_ (target >99%) | _TBD_ |
| Daily insert volume | _TBD_ | _TBD_ |
| Peak concurrent users | _TBD_ | _TBD_ |

### Baseline Update Procedure

1. Run all dashboard queries during peak traffic window.
2. Record results in this table.
3. Set alert thresholds at 2x baseline for warning, 5x for critical.
4. Review and update baselines quarterly.

---

## 5.5 Automated Monitoring Setup

### Edge Function: `db-health-check` (runs every 5 minutes)

Checks:
- RLS policy count (alert if not 319)
- Table count (alert if not 63)
- Connection count (alert if >80% max)
- Failed auth attempts (alert if >10/min)

### Edge Function: `db-daily-report` (runs daily 09:00 UTC)

Generates:
- Table statistics summary
- Slow query report
- Cache hit ratios
- Storage usage
- Posts to Slack `#db-metrics`

---

## 5.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Alert threshold tuning | Monthly | Infrastructure Lead |
| Baseline update | Quarterly | DB Lead |
| Dashboard review | Weekly | Engineering Lead |
| Monitoring coverage audit | Semi-annually | CTO |
