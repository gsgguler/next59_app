/*
  # Fix profiles RLS SELECT policy — remove recursive organization_members subquery

  ## Problem
  The existing auth_profiles_select_own policy had:
    USING ((id = auth.uid()) OR (EXISTS (SELECT 1 FROM organization_members WHERE ...)))
  
  The organization_members SELECT policy itself references organization_members recursively,
  causing infinite recursion whenever an authenticated user queries their own profile.
  This made loadProfile() return null silently, keeping isAdmin=false for all users.

  ## Fix
  Replace the policy with a simple self-access check: id = auth.uid()
  Users only ever need to read their own profile row; the org subquery was unnecessary.
*/

DROP POLICY IF EXISTS "auth_profiles_select_own" ON public.profiles;

CREATE POLICY "auth_profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
