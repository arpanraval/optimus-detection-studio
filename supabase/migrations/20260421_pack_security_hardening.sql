-- Pack security hardening — addresses Supabase advisor findings.
-- 1. Views default to SECURITY DEFINER which bypasses the querying user's RLS.
--    Switch to SECURITY INVOKER so the view enforces the caller's RLS policies.
-- 2. Functions without a pinned search_path are vulnerable to search-path
--    hijacking. Pin to pg_catalog,public for all pack-related functions.

ALTER VIEW v_pack_deployment_status SET (security_invoker = on);
ALTER VIEW v_pack_totals SET (security_invoker = on);

ALTER FUNCTION public.publish_pack_version(uuid, text, text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.rollback_pack_to_version(uuid, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.sync_pack_rule_count()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.sync_affected_pack_mitre_ids()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.pack_update_with_lock(uuid, timestamptz, text, text, text, text[], text[])
  SET search_path = pg_catalog, public;
