# Change Management & Migration Procedure

> **Owner:** DB Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define migration types, approval workflows, deployment pipelines, and forbidden operations for the Next59 database.

---

## 6.1 Migration Types

| Type | Definition | Approval Required | Downtime |
|:---|:---|:---|:---|
| Schema | `CREATE/ALTER TABLE`, `ADD COLUMN` | CTO + DB Lead | Zero |
| RLS | `CREATE/DROP POLICY` | Security Lead | Zero |
| Function | `CREATE OR REPLACE FUNCTION` | Engineering Lead | Zero |
| Data | `UPDATE/DELETE` on mass data | Engineering Lead + QA | Maintenance window |
| Destructive | `DROP TABLE`, `DROP COLUMN` | CTO + CEO (2-person) | Maintenance window |

### Risk Classification

| Risk Level | Criteria | Additional Requirements |
|:---|:---|:---|
| Low | Additive schema (new table, new column with default) | Standard review |
| Medium | ALTER existing column, new RLS policy, new function | Staging test required |
| High | Data migration, column type change, FK changes | Rollback script + staging test |
| Critical | Destructive operations, auth changes | 2-person approval + maintenance window |

---

## 6.2 Migration Script Template

```sql
/*
  # {Short descriptive title}

  Migration: YYYY-MM-DD-description.sql
  Author: {name}
  Ticket: {issue URL}
  Type: {schema | RLS | function | data | destructive}
  Risk: {low | medium | high | critical}
  Rollback: {description or N/A}

  ## Changes
  1. {Plain English description of change 1}
  2. {Plain English description of change 2}

  ## New Tables
  - `table_name`
    - `column_name` (type) - description

  ## Modified Tables
  - `table_name` - {what changed}

  ## Security Changes
  - {RLS policy changes}

  ## Notes
  - {Important considerations}
*/

-- [1] Pre-check: Verify current state
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- [2] Apply change
-- {SQL statements with IF EXISTS / IF NOT EXISTS guards}

-- [3] Post-check: Verify change applied correctly
-- {Verification queries}

-- [4] Update baseline counts if needed
-- tables: {new count}, policies: {new count}, functions: {new count}
```

### Rollback Script (save separately)

```sql
-- ROLLBACK: YYYY-MM-DD-description-rollback.sql
-- {Reverse operations}
-- WARNING: Data migrations may not be fully reversible
```

---

## 6.3 Deployment Pipeline

| Stage | Environment | Actions | Gate |
|:---|:---|:---|:---|
| 1. Local | Local Supabase | Test against local instance | All tests pass |
| 2. Staging | Staging Supabase | Apply migration, run full test suite | QA sign-off |
| 3. Review | Git PR | Script + verification results + rollback plan | Peer review + approval per 6.1 |
| 4. Production | Production Supabase | Apply via `mcp__supabase__apply_migration` | Approval obtained |
| 5. Verify | Production | Run v1.4 SECTION 7 queries + smoke tests | All checks pass |
| 6. Rollback | Production | If any check fails, execute rollback immediately | Automatic |

### Pre-Deployment Checklist

- [ ] Migration tested on local Supabase
- [ ] Migration tested on staging Supabase
- [ ] Rollback script prepared and tested
- [ ] PR approved by required reviewers (per 6.1)
- [ ] Maintenance window scheduled (if needed)
- [ ] Team notified in `#deployments`
- [ ] Backup taken before production apply

### Post-Deployment Checklist

- [ ] V1-V11 verification queries pass
- [ ] Application smoke tests pass
- [ ] No error spike in monitoring (Document 5)
- [ ] Deployment logged in `#deployments`

---

## 6.4 Forbidden Operations

The following operations are **NEVER** permitted without explicit CEO written approval:

| Operation | Reason | Alternative |
|:---|:---|:---|
| `TRUNCATE` on Class C tables | Immutable audit records | No alternative; data is permanent |
| `UPDATE` on `predictions`, `match_seals` | Immutable sealed data | Create new version (append-only) |
| `DROP POLICY` without replacement | Security regression | Replace policy in same migration |
| `ALTER TABLE ... DISABLE TRIGGER ALL` | Bypasses audit trail | Only during Document 2 restore procedure |
| Direct `DELETE` from `auth.users` | Bypasses cleanup cascade | Use Supabase Auth API |
| `DROP TABLE` on any production table | Data loss risk | Rename + deprecate, then archive |
| `ALTER COLUMN ... TYPE` on populated table | Data corruption risk | Add new column, backfill, swap |

---

## 6.5 Emergency Changes

For SEV-1/SEV-2 incidents requiring immediate schema changes:

1. CTO verbal approval (documented post-hoc within 4 hours).
2. Apply change with full audit logging.
3. Create PR with change documentation within 24 hours.
4. Post-incident review covers the emergency change.

---

## 6.6 Version Tracking

| Item | Current Value | Last Updated |
|:---|:---|:---|
| Schema version | v1.4 | 2026-04-24 |
| Table count | 63 | 2026-04-24 |
| Policy count | 319 | 2026-04-24 |
| Function count | 24 | 2026-04-24 |
| View count | 5 | 2026-04-24 |
| Migration count | 17 | 2026-04-24 |

Update this table with every production migration.

---

## 6.7 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Migration backlog triage | Weekly | DB Lead |
| Deployment process review | Quarterly | Engineering Lead |
| Rollback procedure test | Semi-annually | Infrastructure Lead |
