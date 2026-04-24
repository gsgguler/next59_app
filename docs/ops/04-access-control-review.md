# Access Control & Privilege Review

> **Owner:** Security Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define role-based access controls, privilege escalation procedures, and periodic review requirements.

---

## 4.1 Role Matrix

| Role | DB Role | Table Access | Function Access | Notes |
|:---|:---|:---|:---|:---|
| App Server | `service_role` | All (bypasses RLS) | All | Backend API only, never exposed to client |
| Analytics | `authenticated` + claim | Read-only Class B, C | Read-only | BI dashboards, no write access |
| Support | `authenticated` + claim | Read Class A (own org), Read Class B | None | Customer support portal |
| Super Admin | `super_admin` claim in `app_metadata` | All (via `public.is_super_admin()`) | All | 2-person activation required |
| DB Admin | `postgres` | All | All | Infrastructure emergencies only |

### Application-Level Roles (organization_members.role)

| Role | Scope | Capabilities |
|:---|:---|:---|
| `owner` | Organization | Full org management, billing, member management |
| `org_admin` | Organization | Member management, settings, conditional billing |
| `content_editor` | Organization | Article/prediction content creation, review queue |
| `analyst` | Organization | Read-only org usage data and metrics |
| `billing_viewer` | Organization | Read-only billing/invoice data |
| `member` | Organization | Basic read access to org data |
| `super_admin_member` | Global | Platform-wide administrative access |

---

## 4.2 Quarterly Access Review (Every 90 days)

### Procedure

1. **Export super_admin list:**
   ```sql
   SELECT id, email, raw_app_meta_data->>'role' AS role,
     last_sign_in_at, created_at
   FROM auth.users
   WHERE raw_app_meta_data->>'role' = 'super_admin'
   ORDER BY last_sign_in_at DESC;
   ```

2. **Verify each super_admin** is still employed and authorized.

3. **Check unused API tokens (>90 days):**
   ```sql
   SELECT id, organization_id, name, created_at, last_used_at
   FROM public.api_access_tokens
   WHERE revoked_at IS NULL
     AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '90 days')
   ORDER BY last_used_at ASC;
   ```

4. **Review orphaned memberships:**
   ```sql
   SELECT om.user_id, om.organization_id, om.role
   FROM public.organization_members om
   LEFT JOIN auth.users u ON u.id = om.user_id
   WHERE u.id IS NULL;
   ```

5. **Document results** in `/docs/ops/access-reviews/YYYY-QX.md`

### Sign-off

- Reviewer: Security Lead
- Approver: CTO
- Deadline: 15th of the review month (January, April, July, October)

---

## 4.3 Super Admin Activation (Two-Person Rule)

### Process

| Step | Actor | Action | Timeframe |
|:---|:---|:---|:---|
| 1. Request | Engineering Lead | Submit ticket with written justification | - |
| 2. Approve | CTO or CEO | Written approval (Slack/email with timestamp) | Within 4 hours |
| 3. Execute | DB Admin | Apply `UPDATE` to `auth.users.raw_app_meta_data` | Within 1 hour of approval |
| 4. Audit | Security Lead | Verify activation in `admin_audit_log` | Within 24 hours |
| 5. Auto-revoke | System | Revert after 72 hours unless explicitly renewed | Automated |

### Activation SQL

```sql
-- Grant (executed by DB Admin)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "super_admin"}'::jsonb
WHERE id = '{user_uuid}';

-- Revoke (automated or manual)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE id = '{user_uuid}';
```

### Restrictions

- Maximum 3 concurrent super_admins at any time.
- No self-activation (requester cannot be executor).
- All activations logged to `admin_audit_log` with full context.
- Emergency activation: CTO can activate with post-hoc CEO approval (must be documented within 24 hours).

---

## 4.4 Token Rotation

| Token | Frequency | Method | Owner |
|:---|:---|:---|:---|
| `service_role` (Supabase) | 90 days | Supabase Dashboard > Settings > API > Regenerate | Infrastructure Lead |
| `api_access_tokens` (app) | 180 days or on team exit | `UPDATE SET revoked_at = NOW()` | Org Admin / Super Admin |
| JWT signing key | 365 days | Supabase project settings (causes brief downtime) | CTO + Infrastructure Lead |
| Anon key | On compromise only | Supabase Dashboard regenerate | Infrastructure Lead |

### On Employee Exit

1. Revoke all `api_access_tokens` associated with user.
2. Remove from all `organization_members`.
3. Revoke super_admin if applicable.
4. Rotate any shared credentials the employee had access to.
5. Document in access review log.

---

## 4.5 Principle of Least Privilege

### Rules

- Default role for new organization members: `member` (read-only).
- Promotion requires org `owner` or `org_admin` approval.
- `service_role` key used ONLY in server-side code, NEVER in client bundles.
- `anon` key is the only key exposed to client-side code.
- Database `postgres` role used only for infrastructure emergencies with full audit trail.

### Verification

```sql
-- Ensure no user has unexpected super_admin access
SELECT COUNT(*) FROM auth.users
WHERE raw_app_meta_data->>'role' = 'super_admin';
-- Should match authorized count (max 3)
```

---

## 4.6 Review Schedule

| Review | Frequency | Owner |
|:---|:---|:---|
| Access review (full) | Quarterly | Security Lead |
| Token expiry check | Monthly | Infrastructure Lead |
| Super admin audit | Monthly | Security Lead |
| Role matrix update | Per schema change | DB Lead |
