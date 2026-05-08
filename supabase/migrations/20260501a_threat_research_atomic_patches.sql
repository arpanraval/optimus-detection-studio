-- 20260501a_threat_research_atomic_patches.sql
-- Atomic JSONB patch RPCs for the threat-research tree.
--
-- WHY: parallel workers (attack_research × N, detection × N) each load tree,
-- mutate one leaf, and write the whole tree back. Last-writer-wins → other
-- workers' work is lost. The frontend has the same pattern when a user
-- saves/archives a leaf while a worker is still writing.
--
-- These RPCs use jsonb_set in a single statement so concurrent calls are
-- serialized at the row level by Postgres. Each call merges a patch object
-- into the target node — keys present in the patch overwrite, keys not
-- present are preserved.

-- ────────────────────────────────────────────────────────────────────────
-- tr_patch_behaviour — for backend per-leaf phase handlers
-- ────────────────────────────────────────────────────────────────────────
-- Used by attack_research and detection workers to write the deep_dive,
-- detectability, opportunities, etc. for ONE behaviour without trampling
-- siblings. Call shape:
--   PERFORM tr_patch_behaviour(
--     p_session_id,
--     'b1',
--     jsonb_build_object('deep_dive', <jsonb>)
--   );
CREATE OR REPLACE FUNCTION public.tr_patch_behaviour(
  p_session_id   uuid,
  p_behaviour_id text,
  p_patch        jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_idx int;
BEGIN
  -- Locate the behaviour's array index. ORDINALITY is 1-based; jsonb path
  -- indices are 0-based, so subtract 1.
  SELECT (idx - 1)::int INTO v_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id
     AND arr.item->>'id' = p_behaviour_id
   LIMIT 1;
  IF v_idx IS NULL THEN
    RETURN false;
  END IF;

  -- Atomic merge. The || jsonb operator does shallow key merge — top-level
  -- keys in p_patch overwrite, others preserved. Use the create_missing=false
  -- arg so we never accidentally extend the path beyond the existing element.
  UPDATE public.threat_research_sessions
     SET tree = jsonb_set(
                  tree,
                  ARRAY['behaviours', v_idx::text],
                  (tree->'behaviours'->v_idx) || p_patch,
                  false
                ),
         updated_at = now()
   WHERE id = p_session_id;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.tr_patch_behaviour(uuid, text, jsonb) IS
  'Atomically merge a JSONB patch into one behaviour by id. Concurrent-safe.';

-- ────────────────────────────────────────────────────────────────────────
-- tr_patch_detection — for frontend save/archive of one specific detection
-- ────────────────────────────────────────────────────────────────────────
-- Used when the user saves a detection to library or archives a leaf.
-- Patches a deeper path: behaviours[].opportunities[].detection.
-- Call shape:
--   tr_patch_detection(
--     p_session_id, 'b1', 'o1', 'd1',
--     jsonb_build_object('saved_detection_id', <uuid>)
--   );
CREATE OR REPLACE FUNCTION public.tr_patch_detection(
  p_session_id     uuid,
  p_behaviour_id   text,
  p_opportunity_id text,
  p_detection_id   text,
  p_patch          jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_b_idx int;
  v_o_idx int;
  v_existing_det_id text;
BEGIN
  SELECT (idx - 1)::int INTO v_b_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id
     AND arr.item->>'id' = p_behaviour_id
   LIMIT 1;
  IF v_b_idx IS NULL THEN RETURN false; END IF;

  SELECT (idx - 1)::int INTO v_o_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours'->v_b_idx->'opportunities') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id
     AND arr.item->>'id' = p_opportunity_id
   LIMIT 1;
  IF v_o_idx IS NULL THEN RETURN false; END IF;

  -- Defensive: confirm the detection_id at the located path actually matches.
  -- Guards against a structural shift (rare, but caught here is far better
  -- than silently patching the wrong detection).
  SELECT (tree->'behaviours'->v_b_idx->'opportunities'->v_o_idx->'detection'->>'id')
    INTO v_existing_det_id
    FROM public.threat_research_sessions
   WHERE id = p_session_id;
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
$$;

COMMENT ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) IS
  'Atomically merge a JSONB patch into one detection by full path. Concurrent-safe.';

-- ────────────────────────────────────────────────────────────────────────
-- Permissions: service-role and authenticated users can both invoke.
-- The functions are SECURITY DEFINER so they run as the function owner,
-- but RLS on threat_research_sessions still applies to row visibility
-- (a user can only patch their own sessions because the SELECT in the body
-- only sees rows their RLS allows when called from authenticated context).
-- For service-role calls (backend workers) RLS is bypassed naturally.
-- ────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.tr_patch_behaviour(uuid, text, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb)
  TO authenticated, service_role;
