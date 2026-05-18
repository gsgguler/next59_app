/*
  # Security Hardening — Phase 1: Auth Function search_path Isolation

  Applies SET search_path = public, pg_temp to all Tier 1 SECURITY DEFINER
  functions used in RLS policies and authentication flows.

  ## What this does
  Prevents search_path injection attacks where a malicious schema object
  could shadow a public function called inside a SECURITY DEFINER context.

  ## What this does NOT do
  - Does not change any function body or logic
  - Does not recreate any function
  - Does not modify any RLS policy
  - Does not affect any data

  ## Functions altered (11)
  1.  public.is_admin()
  2.  public.is_super_admin()
  3.  public.can_access_global_tier(text)
  4.  public.can_access_org_tier(uuid, text)
  5.  public.can_perform_admin_action(text)
  6.  public.has_org_permission(uuid, text)
  7.  public.is_org_admin(uuid)
  8.  public.validate_api_token(text, uuid)
  9.  public.personal_subscription_tier()
  10. public.user_organizations()
  11. public.user_role_in_org(uuid)
*/

ALTER FUNCTION public.is_admin()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.is_super_admin()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.can_access_global_tier(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.can_access_org_tier(uuid, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.can_perform_admin_action(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.has_org_permission(uuid, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.is_org_admin(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.validate_api_token(text, uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.personal_subscription_tier()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.user_organizations()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.user_role_in_org(uuid)
  SET search_path = public, pg_temp;
