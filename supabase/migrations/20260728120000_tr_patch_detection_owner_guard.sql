-- Bind caller identity in tr_patch_detection.
--
-- BEFORE: tr_patch_detection is SECURITY DEFINER, carries no auth.uid() check
-- in its body, and `authenticated` holds EXECUTE by design (it is on the
-- keep_authenticated allowlist in 20260522120100_lock_down_rpc_execute.sql --
-- the browser calls it from saveDetectionFromLeaf / archiveLeaf /
-- unarchiveLeaf). Any authenticated user could therefore pass ANY p_session_id
-- to /rest/v1/rpc/tr_patch_detection and archive or overwrite another user's
-- detections.
--
-- The comment block in 20260501a_threat_research_atomic_patches.sql asserted
-- that "RLS on threat_research_sessions still applies to row visibility" for
-- authenticated callers. That reasoning is wrong: SECURITY DEFINER runs as the
-- function owner (postgres), so RLS on threat_research_sessions is bypassed
-- for every statement in the body, including the SELECTs that locate the node.
--
-- AFTER: end-user callers must own the session. Service-role callers (the
-- orchestrator's patchDetection) present no JWT subject, so auth.uid() is NULL
-- and the check is skipped -- background workers are unaffected.
--
-- Body is verbatim from the live definition (pg_get_functiondef, mirrored in
-- supabase/schema.sql) with exactly two changes: SET search_path added to the
-- header, and the HARDENING block inserted immediately after BEGIN. Same
-- treatment as 20260522120200_harden_caller_identity_rpcs.sql.
--
-- Returning false (rather than RAISE) matches the function's existing
-- not-found contract; src/lib/threatResearchService.ts already treats a false
-- return as a real failure at all three call sites.

CREATE OR REPLACE FUNCTION public.tr_patch_detection(p_session_id uuid, p_behaviour_id text, p_opportunity_id text, p_detection_id text, p_patch jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_b_idx int;
  v_o_idx int;
  v_existing_det_id text;
BEGIN
  -- HARDENING: end-user callers must own the session. Service-role
  -- (orchestrator) calls carry no JWT subject, so auth.uid() is NULL and the
  -- check is skipped. SECURITY DEFINER bypasses RLS, so this is the only
  -- thing standing between an authenticated caller and another user's tree.
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.threat_research_sessions s
        WHERE s.id = p_session_id AND s.user_id = (SELECT auth.uid())
     ) THEN
    RETURN false;
  END IF;

  SELECT (idx - 1)::int INTO v_b_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id AND arr.item->>'id' = p_behaviour_id LIMIT 1;
  IF v_b_idx IS NULL THEN RETURN false; END IF;

  SELECT (idx - 1)::int INTO v_o_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours'->v_b_idx->'opportunities') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id AND arr.item->>'id' = p_opportunity_id LIMIT 1;
  IF v_o_idx IS NULL THEN RETURN false; END IF;

  SELECT (tree->'behaviours'->v_b_idx->'opportunities'->v_o_idx->'detection'->>'id')
    INTO v_existing_det_id
    FROM public.threat_research_sessions WHERE id = p_session_id;
  IF v_existing_det_id IS DISTINCT FROM p_detection_id THEN
    RETURN false;
  END IF;

  UPDATE public.threat_research_sessions
     SET tree = jsonb_set(
                  tree,
                  ARRAY['behaviours', v_b_idx::text, 'opportunities', v_o_idx::text, 'detection'],
                  (tree->'behaviours'->v_b_idx->'opportunities'->v_o_idx->'detection') || p_patch,
                  false
                ),
         updated_at = now()
   WHERE id = p_session_id;
  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) IS
  'Atomically merge a JSONB patch into one detection by full path. Concurrent-safe. SECURITY DEFINER: end-user callers are checked against threat_research_sessions.user_id in-body (RLS does not apply); service-role callers (auth.uid() IS NULL) skip the check.';

-- Already true after 20260522120100_lock_down_rpc_execute.sql; restated so this
-- migration is self-sufficient and the NULL-auth.uid() branch of the guard can
-- never be reached by an anonymous caller.
REVOKE EXECUTE ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) TO authenticated, service_role;

-- tr_patch_behaviour is deliberately NOT given the same treatment: it is absent
-- from 20260522120100's keep_authenticated allowlist, so `authenticated` holds
-- no EXECUTE on it and only the service-role worker can call it. Audited
-- 2026-07-28; no in-body check needed while that remains true.
COMMENT ON FUNCTION public.tr_patch_behaviour(uuid, text, jsonb) IS
  'Atomically merge a JSONB patch into one behaviour by id. Concurrent-safe. SECURITY DEFINER, service_role only (no authenticated EXECUTE) -- if that grant ever changes, this function needs the same auth.uid() ownership guard as tr_patch_detection.';
