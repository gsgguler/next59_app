/*
  # Fix infinite recursion in organization_members RLS

  1. Problem
    - The `org_members_read` SELECT policy on `organization_members` contains
      a self-referencing subquery: EXISTS (SELECT 1 FROM organization_members om ...)
    - This causes infinite recursion when Postgres evaluates the policy
    - The `profiles_shared_org_read` policy calls `user_organizations()` which
      queries `organization_members`, triggering the recursive RLS evaluation
    - Result: authenticated users get 500 Internal Server Error on profiles

  2. Fix
    - Replace the self-referencing `org_members_read` policy with a simpler one
      that only checks `user_id = auth.uid()` OR `is_super_admin()`
    - Also fix `org_members_admin_or_self_delete` and `org_members_admin_update`
      policies which have the same self-referencing pattern
    - Create a SECURITY DEFINER helper function `is_org_admin` to check org
      admin/owner status without triggering recursive RLS

  3. Security
    - Users can still only see their own org memberships or all if super admin
    - Org admins/owners can still manage members via the helper function
*/

-- Step 1: Create a SECURITY DEFINER helper to check org admin status
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
    AND organization_id = p_org_id
    AND role IN ('owner', 'org_admin')
  );
$$;

-- Step 2: Drop and recreate the problematic SELECT policy
DROP POLICY IF EXISTS "org_members_read" ON organization_members;
CREATE POLICY "org_members_read"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR is_org_admin(organization_id)
  );

-- Step 3: Fix the DELETE policy (also had self-reference)
DROP POLICY IF EXISTS "org_members_admin_or_self_delete" ON organization_members;
CREATE POLICY "org_members_admin_or_self_delete"
  ON organization_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR is_org_admin(organization_id)
  );

-- Step 4: Fix the UPDATE policy (also had self-reference)
DROP POLICY IF EXISTS "org_members_admin_update" ON organization_members;
CREATE POLICY "org_members_admin_update"
  ON organization_members
  FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    OR is_org_admin(organization_id)
  )
  WITH CHECK (
    is_super_admin()
    OR is_org_admin(organization_id)
  );
