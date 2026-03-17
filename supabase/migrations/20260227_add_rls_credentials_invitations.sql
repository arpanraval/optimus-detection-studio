-- Migration: Add RLS policies for integration_credentials and team_invitations
-- Date: 2026-02-27
--
-- integration_credentials: service_role-only access (no authenticated user policies)
-- team_invitations: granular policies for admins, owners, and invited users

-- ============================================================================
-- INTEGRATION_CREDENTIALS
-- ============================================================================
-- RLS is already enabled. No authenticated-user policies are needed because
-- all credential operations go through the integration-ops edge function
-- which uses the service_role key (bypasses RLS automatically).
-- We add an explicit deny-all policy comment for clarity. With RLS enabled
-- and zero permissive policies, authenticated users are already blocked.

-- Double-ensure RLS is on (idempotent)
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents bypass by the postgres role
-- used in migrations; service_role still bypasses via supabase_admin)
ALTER TABLE public.integration_credentials FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- TEAM_INVITATIONS
-- ============================================================================
-- RLS is already enabled with policies for admin SELECT, INSERT, DELETE.
-- We need to add:
--   1. SELECT for regular users to see invitations addressed to their email
--   2. UPDATE for admins/owners
--   3. Ensure service_role has full access (automatic in Supabase)

-- Double-ensure RLS is on (idempotent)
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- 1. Let invited users see their own pending invitations
--    Uses auth.jwt() to get the user's email from the JWT token
CREATE POLICY "Users can view their own invitations"
  ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (
    email = (auth.jwt() ->> 'email')
  );

-- 2. Admins/owners can update invitations (e.g., change role, resend)
CREATE POLICY "Admins can update invitations"
  ON public.team_invitations
  FOR UPDATE
  TO authenticated
  USING (
    has_team_role(team_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    has_team_role(team_id, ARRAY['owner', 'admin'])
  );
