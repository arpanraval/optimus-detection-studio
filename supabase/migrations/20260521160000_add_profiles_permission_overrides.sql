-- Add permission_overrides to profiles
--
-- The integration-ops edge function's checkPermission() reads
-- profiles.permission_overrides to compute per-user RBAC grant/revoke
-- adjustments, but the column was never created. Every checkPermission()
-- query failed with "column profiles.permission_overrides does not exist",
-- the error was swallowed, and the user silently fell back to the 'viewer'
-- role — returning 403 on every integration configure/sync action for all
-- users, including owners.
--
-- Shape consumed by the edge function:
--   { "granted": string[], "revoked": string[] }  (or NULL for no overrides)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permission_overrides jsonb;

-- permission_overrides is RBAC-controlling, so it must be locked against
-- self-service changes the same way role and status already are. The
-- "Users can update own profile" policy is row-level: without this clause
-- any authenticated user could UPDATE their own permission_overrides and
-- self-grant permissions. Legitimate writes go through edge functions on
-- the service-role client, which bypasses this policy.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = id))
  WITH CHECK (
    (auth.uid() = id)
    AND (role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()))
    AND (status = (SELECT p.status FROM profiles p WHERE p.id = auth.uid()))
    AND (permission_overrides IS NOT DISTINCT FROM
         (SELECT p.permission_overrides FROM profiles p WHERE p.id = auth.uid()))
  );
