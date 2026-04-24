# Performance Tuning Guide

> **Owner:** DB Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define index strategy, query optimization rules, partitioning strategy, connection pooling, and vacuum procedures.

---

## 8.1 Index Strategy

### Primary Indexes (created with schema)

| Table | Column(s) | Type | Rationale |
|:---|:---|:---|:---|
| predictions | `match_id`, `is_current` | B-tree | Match lookup, current version filter |
| predictions | `cassandra_code` | B-tree (unique) | Unique code search |
| predictions | `generated_at` | B-tree | Time-range queries |
| predictions | `access_level` | B-tree | Tier filtering |
| matches | `match_date`, `status` | B-tree | Upcoming matches query |
| matches | `home_team_id`, `away_team_id` | B-tree | Team history lookup |
| debate_rounds | `prediction_id` | B-tree | Debate chain traversal |
| persona_outputs | `debate_round_id` | B-tree | Round output lookup |
| admin_audit_log | `created_at` | B-tree | Time-based cleanup |
| admin_audit_log | `actor_id`, `created_at` | B-tree | User activity audit |
| notifications | `user_id`, `is_read` | B-tree | User inbox query |
| organization_members | `user_id`, `organization_id` | B-tree (unique) | RLS policy subqueries |
| article_translations | `article_id`, `locale`, `is_current` | B-tree | Translation lookup |
| prediction_translations | `prediction_id`, `locale`, `is_current` | B-tree | Translation lookup |
| user_events | `user_id`, `created_at` | B-tree | User activity trail |

### Index Monitoring

```sql
-- Unused indexes (candidates for removal)
SELECT schemaname, relname, indexrelname, idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Missing indexes (sequential scans on large tables)
SELECT relname, seq_scan, seq_tup_read,
  idx_scan, idx_tup_fetch,
  seq_scan - idx_scan AS too_many_seqscans
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND seq_scan > idx_scan
ORDER BY too_many_seqscans DESC
LIMIT 10;
```

---

## 8.2 Query Optimization Rules

### Mandatory Rules

1. **NEVER** `SELECT *` on tables with >10 columns. Explicitly list needed columns.
2. **ALWAYS** filter by `is_current = true` on versioned tables (predictions, articles, article_translations, prediction_translations, mea_culpa, post_match_reports).
3. **USE** `LIMIT` + `OFFSET` for pagination. Never unbounded result sets.
4. **PREFER** `EXISTS` over `IN` for correlated subqueries (RLS policies already follow this pattern).
5. **AVOID** functions on indexed columns in `WHERE` clauses (breaks index usage).
6. **USE** `.maybeSingle()` instead of `.single()` when expecting 0 or 1 rows.

### Query Examples

```typescript
// CORRECT: Explicit columns, filtered, paginated
const { data } = await supabase
  .from('predictions')
  .select('id, match_id, statement, probability, confidence_label, access_level')
  .eq('is_current', true)
  .eq('access_level', 'free')
  .order('generated_at', { ascending: false })
  .range(0, 19);

// WRONG: Select all, no filter, no limit
const { data } = await supabase
  .from('predictions')
  .select('*');
```

### RLS Performance Considerations

- RLS policies add subquery overhead to every query. Keep policy conditions simple.
- `public.is_super_admin()` is `SECURITY DEFINER` and cached per session.
- `public.user_organizations()` returns a small result set (typically <10 rows per user).
- Avoid policies that join >2 tables in their conditions.

---

## 8.3 Partitioning Strategy

### Candidates for Range Partitioning

| Table | Partition Key | Interval | Trigger |
|:---|:---|:---|:---|
| admin_audit_log | `created_at` | Monthly | When >1M rows |
| user_events | `created_at` | Monthly | When >1M rows |
| notifications | `created_at` | Monthly | When >500K rows |
| provider_costs_daily | `date` | Monthly | When >100K rows |
| organization_usage_daily | `date` | Monthly | When >100K rows |
| rate_limit_buckets | `window_start` | Weekly | When >1M rows |

### Implementation Template

```sql
-- Convert to partitioned table (requires migration window)
-- 1. Create new partitioned table
CREATE TABLE public.admin_audit_log_partitioned (
  LIKE public.admin_audit_log INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- 2. Create partitions
CREATE TABLE public.admin_audit_log_2026_04
  PARTITION OF public.admin_audit_log_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- 3. Migrate data, swap names
-- (detailed procedure in migration PR)
```

### Partition Maintenance

- Auto-create next month's partition via Edge Function cron (1st of each month).
- Drop partitions beyond retention period (Document 1).
- Monitor partition sizes monthly.

---

## 8.4 Connection Pooling

| Setting | Value | Notes |
|:---|:---|:---|
| Supabase max connections | 200 (default Pro plan) | Check plan limits |
| PgBouncer mode | Transaction | Default Supabase pooler |
| Application pool size | 20-50 connections | Via Supabase connection pooler |
| Admin reserve | 10% (20 connections) | For emergency admin access |
| Edge Function connections | Shared pool | Via Supabase client |

### Connection Best Practices

- Use Supabase connection pooler URL for application connections.
- Direct connections only for migrations and admin operations.
- Close connections promptly -- avoid long-held transactions.
- Monitor connection count (Document 5, metric: Connection count).

### Pooler URL Format

```
# Pooled connection (application use)
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct connection (admin/migrations only)
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

---

## 8.5 Vacuum & Analyze

### Autovacuum Configuration

Supabase manages autovacuum with sensible defaults. Monitor and tune if needed:

```sql
-- Check autovacuum settings
SHOW autovacuum;
SHOW autovacuum_vacuum_threshold;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_analyze_threshold;
SHOW autovacuum_analyze_scale_factor;
```

### Manual Vacuum for High-Churn Tables

Run weekly via Edge Function cron (Sunday 03:00 UTC):

```sql
-- High-churn tables that benefit from manual vacuum
VACUUM ANALYZE public.admin_audit_log;
VACUUM ANALYZE public.notifications;
VACUUM ANALYZE public.user_events;
VACUUM ANALYZE public.rate_limit_buckets;
VACUUM ANALYZE public.security_audit;
```

### Bloat Monitoring

```sql
-- Check table bloat (requires pgstattuple extension)
SELECT schemaname, relname,
  n_live_tup, n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / n_live_tup, 1)
    ELSE 0
  END AS dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC
LIMIT 10;
```

---

## 8.6 Query Plan Analysis

### Explain Analyze Template

```sql
-- Always use EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) for performance investigation
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, match_id, statement, probability
FROM public.predictions
WHERE is_current = true AND access_level = 'free'
ORDER BY generated_at DESC
LIMIT 20;
```

### Red Flags in Query Plans

| Pattern | Issue | Fix |
|:---|:---|:---|
| Seq Scan on large table | Missing index | Add appropriate index |
| Nested Loop with high row count | Inefficient join | Rewrite query or add index |
| Sort with high memory | Missing index for ORDER BY | Add index on sort column |
| Hash Join spilling to disk | Insufficient work_mem | Tune or restructure query |

---

## 8.7 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Index usage audit | Monthly | DB Lead |
| Slow query review | Weekly | Engineering Lead |
| Partition management | Monthly | Infrastructure Lead |
| Vacuum health check | Weekly | DB Lead |
