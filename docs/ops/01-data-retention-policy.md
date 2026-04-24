# Data Retention Policy

> **Owner:** DB Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define retention rules for all Next59 data classes to ensure compliance, auditability, and storage efficiency.

---

## 1.1 Classification System

| Class | Tables | Retention Rule | Rationale |
|:---|:---|:---|:---|
| C Terminal | predictions, match_seals, actual_outcomes, debate_rounds, persona_outputs, billing_history, stripe_events_log, organization_usage_daily, provider_costs_daily | INDEFINITE | Immutable audit records, legal/compliance |
| C Editorial | articles, article_translations | 7 YEARS | Content archive, legal liability |
| C Append-Only | mea_culpa, post_match_reports | 5 YEARS | Post-match analysis archive |
| B | matches, competitions, teams, coaches, stadiums, competition_seasons, referees, team_aliases, team_participations | 3 YEARS after season end | Sports data historical reference |
| A | profiles, organizations, organization_settings, invites, invoices, api_access_tokens, feature_flags, prediction_access_levels | ENTITY LIFETIME + 2 YEARS | User/entity data, GDPR/CCPA |
| A Transient | notifications, notification_send_log, security_audit, admin_audit_log, user_events, rate_limit_buckets | 90 DAYS | Operational data, high volume |

---

## 1.2 Hard Delete vs Soft Delete

| Class | Strategy | Physical Deletion Timing |
|:---|:---|:---|
| C Terminal | **NO DELETE.** Physical deletion FORBIDDEN. | Never |
| C Editorial | Soft delete via `is_active=false`. | After 7 years from soft-delete date |
| C Append-Only | Soft delete via `is_active=false`. | After 5 years from soft-delete date |
| B | Soft delete via `is_active=false`. | 3 years after season end |
| A | Soft delete via `deleted_at` timestamp. | 2 years after entity deletion |
| A Transient | Hard delete after retention period. No soft delete. | Immediately upon expiry |

### Rules

- Class C Terminal rows must NEVER be deleted under any circumstance (including database migrations).
- Soft-deleted rows remain queryable via service_role but are excluded from user-facing queries by RLS or application logic.
- Physical deletion jobs run only via service_role with explicit audit logging.
- Any deviation requires written CTO + Legal approval.

---

## 1.3 Automated Cleanup

### Daily Cron (04:00 UTC)

```sql
-- Notifications cleanup (90 days)
DELETE FROM public.notifications
WHERE created_at < NOW() - INTERVAL '90 days';

-- Notification send log cleanup (90 days)
DELETE FROM public.notification_send_log
WHERE sent_at < NOW() - INTERVAL '90 days';

-- Security audit cleanup (90 days)
DELETE FROM public.security_audit
WHERE created_at < NOW() - INTERVAL '90 days';

-- Admin audit log cleanup (90 days)
DELETE FROM public.admin_audit_log
WHERE created_at < NOW() - INTERVAL '90 days';

-- User events cleanup (90 days)
DELETE FROM public.user_events
WHERE created_at < NOW() - INTERVAL '90 days';

-- Rate limit buckets cleanup (expired entries)
DELETE FROM public.rate_limit_buckets
WHERE window_end < NOW() - INTERVAL '7 days';

-- Expired invites cleanup
DELETE FROM public.invites
WHERE expires_at < NOW() - INTERVAL '30 days'
  AND status = 'expired';
```

### Implementation

- All cleanup jobs run as Supabase Edge Functions using `service_role` key.
- Each job logs rows deleted to `admin_audit_log` before execution.
- Jobs are idempotent and safe to re-run.
- Failure alerts route to `#db-alerts` Slack channel.

---

## 1.4 Legal Hold Override

- Any table with `legal_hold=true` (future column) bypasses ALL retention rules until cleared by legal counsel.
- Legal holds are applied via `admin_audit_log` entry with action `LEGAL_HOLD_APPLY`.
- Only super_admin + Legal can apply or remove holds.
- Holds survive backup/restore cycles (stored as row-level metadata).

---

## 1.5 GDPR / CCPA Right to Deletion

- User deletion requests processed within 30 days.
- Class A data: Set `deleted_at`, anonymize PII fields.
- Class C data containing user references: Anonymize `user_id` to a tombstone UUID, retain record structure.
- Class B data: No user PII, no action required.
- Deletion confirmation logged in `admin_audit_log`.

---

## 1.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Retention policy review | Annually (January) | DB Lead + Legal |
| Cleanup job audit | Monthly | Infrastructure |
| Storage usage report | Weekly | DB Lead |
