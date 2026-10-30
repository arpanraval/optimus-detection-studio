-- Remove unsafe client grants. The sign-up trigger (handle_new_user) is defined once, in
-- 20261028190000_invite_only_account_provisioning.sql: roles come only from invitations.

-- Browser clients never need non-row privileges; RLS does not protect TRUNCATE.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated;

-- Invitation creation must go through manage-users, which checks the caller's role hierarchy.
-- The previous direct INSERT policy allowed a lead to issue an admin invitation.
REVOKE INSERT, UPDATE ON public.user_invitations FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Admins can create user invitations" ON public.user_invitations;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Materialized views do not enforce the underlying tables' RLS policies.
REVOKE ALL ON public.mv_threat_actor_weights, public.mv_technique_importance,
  public.mv_mitigation_impact, public.mv_strategy_impact, public.mv_coverage_stats FROM PUBLIC, anon;

-- Pin the search path for search RPCs that may have been replaced on an existing installation.
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('hybrid_search_detections', 'tr_find_actor_tagged_detections')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', fn);
  END LOOP;
END $$;
