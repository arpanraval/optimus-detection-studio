-- Lock down the SECURITY DEFINER RPC surface.
--
-- Supabase auto-grants EXECUTE to PUBLIC on every function. Advisor reports ~45
-- SECURITY DEFINER functions callable by anon and ~46 by authenticated via
-- /rest/v1/rpc/<name> -- the "authenticated user bypasses the UI and calls the
-- RPC directly" class (cleanup_user_data, update_targeting_intel, etc.).
--
-- Strategy:
--   * Revoke EXECUTE from PUBLIC and anon for EVERY SECURITY DEFINER function
--     in public (the app requires login; anon never legitimately calls these).
--   * Revoke EXECUTE from authenticated too, EXCEPT the allowlist of functions
--     the browser client provably calls (grep of src/** for supabase.rpc()).
--   * service_role is untouched -- every function has an explicit service_role
--     grant, so edge functions and cron (all run as postgres) keep working.
--
-- Verified safe (2026-05-22): no SECURITY INVOKER function calls a SECURITY
-- DEFINER function (no call-graph breakage); no SECURITY DEFINER function is
-- used in a column default; the only SECURITY DEFINER trigger function is
-- handle_new_user (trigger invocation does not check EXECUTE).
--
-- NOTE: any NEW SECURITY DEFINER function added later is auto-granted PUBLIC
-- EXECUTE by Supabase -- it must add its own REVOKE, or this block must be
-- re-run, or it must be added to keep_authenticated.
--
-- Precedent: 20260429c_ai_cost_center_grants_hardening.sql.

DO $$
DECLARE
  r RECORD;
  -- Browser-client-called SECURITY DEFINER functions (grep of src/** 2026-05-22).
  -- authenticated keeps EXECUTE on these; matched by proname (covers overloads).
  keep_authenticated text[] := ARRAY[
    'approve_promotion','check_detection_write_permission','check_promotion_eligibility',
    'complete_password_setup','find_similar_detections','fork_to_development',
    'get_current_spend','get_defensive_posture','get_filter_options',
    'get_mitigation_techniques','get_strategy_analytics','get_technique_strategies_by_mitre_id',
    'get_top_impact_mitigations','get_top_impact_strategies','populate_scoring_snapshot',
    'refresh_coverage_stats','rollback_bulk_import','submit_for_promotion','tr_patch_detection'
  ];
  -- RLS-policy infrastructure: referenced by {public}-role policies; leave as-is
  -- so anon policy evaluation does not fail with "permission denied for function".
  skip_entirely text[] := ARRAY['is_global_admin','is_global_admin_or_lead'];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proowner = 'postgres'::regrole
  LOOP
    IF r.proname = ANY(skip_entirely) THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;',
                   r.proname, r.args);
    IF NOT (r.proname = ANY(keep_authenticated)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated;',
                     r.proname, r.args);
    END IF;
  END LOOP;
END $$;
