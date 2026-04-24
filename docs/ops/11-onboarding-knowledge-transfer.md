# Onboarding & Knowledge Transfer

> **Owner:** Engineering Lead | **Last Updated:** 2026-04-24 | **Version:** 1.0
> **Purpose:** Define new engineer onboarding procedures, specialization tracks, knowledge transfer sessions, and documentation maintenance.

---

## 11.1 New Engineer Onboarding (Week 1)

### Day 1-2: Environment Setup

- [ ] Supabase project access (read-only development environment)
- [ ] Local Supabase CLI installed and configured
- [ ] Git repository cloned and dependencies installed
- [ ] Local test suite runs with 100% pass rate
- [ ] Read Documents 1-3 (Data Retention, Backup & Recovery, Incident Response)
- [ ] Verify local `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Run `npm run build` successfully

### Day 3-4: Schema Deep Dive

- [ ] Study v1.4 schema architecture (63 tables, 6 access tiers)
- [ ] Understand Class A (mutable) vs Class C (append-only immutable) data discipline
- [ ] Trace FK chains: `profiles` -> `organization_members` -> `organizations`
- [ ] Trace prediction flow: `matches` -> `predictions` -> `debate_rounds` -> `persona_outputs` -> `match_seals`
- [ ] Trace editorial flow: `articles` -> `article_translations` (versioned with `is_current`)
- [ ] Understand the append-only versioning pattern: `is_current`, `superseded_at`, `superseded_by`
- [ ] Run V1-V11 verification queries manually and understand each result:

```sql
-- V1: Table count (expect 63)
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- V3: Policy count (expect 319)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- V4: Central auth functions (expect 11)
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN ('is_super_admin','user_organizations','user_role_in_org',
  'has_org_permission','personal_subscription_tier','can_access_global_tier',
  'can_access_org_tier','validate_api_token','stable_hash_bucket',
  'is_feature_enabled','can_perform_admin_action');
```

### Day 5: RLS & Security

- [ ] Read Document 7 (Security Hardening Checklist)
- [ ] Understand the 6 access tiers:
  1. Public metadata (teams, competitions, stadiums)
  2. Public rate-limited (free predictions)
  3. Tiered content (pro/elite predictions, articles)
  4. Org-scoped (organization settings, billing)
  5. Self-scoped (profiles, notifications, watchlists)
  6. Internal/privileged (audit logs, system config)
- [ ] Test RLS: Attempt `SELECT` from `profiles` as `anon` role (should return empty)
- [ ] Test RLS: Attempt `UPDATE` on `predictions` as `authenticated` role (should fail)
- [ ] Understand `service_role` vs `authenticated` vs `anon` access patterns
- [ ] Review `public.is_super_admin()` function (was `auth.is_super_admin()` in spec, moved to `public` schema due to Supabase limitation)
- [ ] Review billing isolation pattern: `owner` + `billing_viewer` always; `org_admin` conditional via `admin_billing_visibility`

---

## 11.2 Week 2-4: Specialization Tracks

### Backend Track

| Week | Focus | Deliverables |
|:---|:---|:---|
| 2 | Documents 6, 9 (Change Management, API Standards) | Understand migration pipeline |
| 3 | Write 3 practice migrations, peer-reviewed | Migrations applied to dev environment |
| 4 | Implement 1 feature end-to-end | Feature PR merged to staging |

**Key concepts:**
- Migration template and approval workflow (Document 6)
- Supabase client configuration (Document 9, Section 9.1)
- RLS-aware query patterns (Document 9, Section 9.2)
- Error handling patterns (Document 9, Section 9.3)
- Edge Function deployment

### Frontend Track

| Week | Focus | Deliverables |
|:---|:---|:---|
| 2 | Document 9 (client config, query patterns) | Working Supabase client integration |
| 3 | Document 5 (dashboard metrics) | Build 1 monitoring widget with real data |
| 4 | RLS-aware error handling | User-friendly error states for 403, 429 |

**Key concepts:**
- `supabase.auth.onAuthStateChange` safe async pattern
- `.maybeSingle()` vs `.single()` usage
- Handling RLS violations gracefully in UI
- Optimistic updates with conflict resolution

### DevOps Track

| Week | Focus | Deliverables |
|:---|:---|:---|
| 2 | Documents 1-4, 10 (Retention, Backup, Incident, Access, DR) | Understand all operational procedures |
| 3 | Local backup/restore test | Successful restore documented |
| 4 | Monitoring setup + simulated incident | Alert routing verified, incident response practiced |

**Key concepts:**
- Backup verification procedure (Document 2, Section 2.4)
- Monitoring dashboards (Document 5, Section 5.3)
- Incident severity classification (Document 3, Section 3.1)
- Disaster recovery scenarios (Document 10, Section 10.2)

---

## 11.3 Knowledge Transfer Sessions

| Topic | Frequency | Owner | Audience |
|:---|:---|:---|:---|
| Schema changes review | Per migration | Migration author | All engineers |
| Security review debrief | Quarterly | Security Lead | All + management |
| Incident post-mortem | Per SEV-1/2 incident | Incident Commander | All + stakeholders |
| Performance review | Monthly | DB Lead | Backend + DevOps |
| Architecture decisions | As needed | CTO | All engineers |
| Onboarding buddy session | Weekly (first month) | Assigned buddy | New engineer |

### Session Format

1. **15 min:** Context and what changed
2. **20 min:** Technical walkthrough
3. **10 min:** Q&A
4. **5 min:** Action items

### Recording Policy

- All sessions recorded and stored in shared drive.
- Slides/notes published within 24 hours.
- Action items tracked in project management tool.

---

## 11.4 Documentation Maintenance

### Standards

- Every document has `Last Updated` and `Owner` fields in the header.
- Updates require PR with peer review.
- Annual full review in January.
- Critical updates (process changes, incident findings) within 24 hours.

### Document Map

| # | Document | Owner | Review Cycle |
|:---|:---|:---|:---|
| 01 | Data Retention Policy | DB Lead | Annually |
| 02 | Backup & Recovery Policy | Infrastructure Lead | Annually |
| 03 | Incident Response Runbook | Security Lead | Quarterly |
| 04 | Access Control & Privilege Review | Security Lead | Quarterly |
| 05 | Database Monitoring & Alerting | Infrastructure Lead | Semi-annually |
| 06 | Change Management & Migration Procedure | DB Lead | Quarterly |
| 07 | Security Hardening Checklist | Security Lead | Quarterly |
| 08 | Performance Tuning Guide | DB Lead | Semi-annually |
| 09 | API & Integration Standards | Engineering Lead | Quarterly |
| 10 | Disaster Recovery Plan | Infrastructure Lead | Semi-annually |
| 11 | Onboarding & Knowledge Transfer | Engineering Lead | Annually |

### Change Log

| Date | Document | Change | Author |
|:---|:---|:---|:---|
| 2026-04-24 | All (01-11) | Initial creation, v1.0 | _{author}_ |

---

## 11.5 Key Contacts

| Role | Name | Slack | Escalation Path |
|:---|:---|:---|:---|
| CTO | _{name}_ | @cto | CEO |
| DB Lead | _{name}_ | @db-lead | CTO |
| Security Lead | _{name}_ | @security | CTO + Legal |
| Infrastructure Lead | _{name}_ | @infra | DB Lead |
| Engineering Lead | _{name}_ | @eng-lead | CTO |
| On-call rotation | _{rotation}_ | @oncall | Infrastructure Lead |

### Updating Contacts

- Contact list reviewed monthly by Infrastructure Lead.
- Changes published to `#team-updates` Slack channel.
- Emergency contact card printed and posted in office (if applicable).

---

## 11.6 Key Technical References

### Schema Quick Reference

| Count | Item |
|:---|:---|
| 63 | Public tables |
| 319 | RLS policies |
| 24 | Functions (11 auth-equivalent in public schema + 13 trigger utilities) |
| 5 | Views (public_predictions, pro_predictions, elite_predictions, profiles_public, profiles_private) |
| 17 | Applied migrations |
| 7 | Organization roles (owner, org_admin, content_editor, analyst, billing_viewer, member, super_admin_member) |

### Important Schema Decisions

1. **Auth functions in `public` schema:** Supabase does not allow creating functions in the `auth` schema. All 11 auth-equivalent functions (e.g., `is_super_admin`, `user_organizations`) live in `public` schema with `SECURITY DEFINER`. `auth.uid()` remains as-is (built-in).

2. **Append-only versioning:** Tables like `predictions`, `articles`, `article_translations` use `is_current` + `superseded_at` + `superseded_by` columns. Never update existing rows; create new versions.

3. **Content sealing:** `match_seals` stores SHA-256 hashes of prediction content for integrity verification. Once sealed, predictions are cryptographically immutable.

4. **Billing isolation:** Invoice and billing data uses a conditional access pattern. `owner` and `billing_viewer` always have access. `org_admin` access depends on `organization_settings.admin_billing_visibility`.

5. **Feature flags:** Authenticated users can read all flags. Anon access is via `public.is_feature_enabled()` SECURITY DEFINER function that bypasses RLS.
