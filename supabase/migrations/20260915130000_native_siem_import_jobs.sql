-- Import jobs. Selection is frozen at submission into siem_sync_items; the worker adopts
-- only what was frozen, and only if production still matches what the user reviewed.
ALTER TABLE public.siem_sync_items
  ADD COLUMN IF NOT EXISTS remote_rule_id uuid REFERENCES public.siem_remote_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frozen_content_hash text,
  ADD COLUMN IF NOT EXISTS detection_id text REFERENCES public.detections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS binding_id uuid REFERENCES public.siem_rule_bindings(id) ON DELETE SET NULL;

-- The pre-existing constraint allows ('pending','imported','linked','unchanged','changed',
-- 'ignored','unsupported','ambiguous','failed','observed'). Widen it to add 'skipped',
-- 'cancelled','changed_since_preview' while preserving every value already live in production,
-- including 'observed' (written by siem_commit_inventory_chunk for every successfully read rule).
ALTER TABLE public.siem_sync_items DROP CONSTRAINT siem_sync_items_status_check;
ALTER TABLE public.siem_sync_items ADD CONSTRAINT siem_sync_items_status_check
  CHECK (status IN ('pending','imported','linked','unchanged','changed','ignored','unsupported',
                    'ambiguous','failed','observed','skipped','cancelled','changed_since_preview'));

CREATE OR REPLACE FUNCTION public.siem_start_import(p_actor uuid, p_integration uuid, p_source_run uuid,
  p_ids text[], p_exclude text[], p_all_matching boolean, p_idempotency text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; source siem_sync_runs; frozen integer;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) = 0 THEN
    RAISE EXCEPTION 'An import request key is required';
  END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;

  -- Repeating a submitted request returns the same job.
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND idempotency_key = p_idempotency;
  IF FOUND THEN RETURN r; END IF;

  SELECT * INTO source FROM siem_sync_runs WHERE id = p_source_run AND integration_id = p_integration;
  IF NOT FOUND OR source.kind <> 'inventory' THEN
    RAISE EXCEPTION 'Fetch rules from CrowdStrike before importing';
  END IF;
  IF p_all_matching AND (source.status <> 'complete' OR NOT source.discovery_complete) THEN
    RAISE EXCEPTION 'Importing every matching rule needs a completed check. Select the rules you can see instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = p_integration
               AND kind = 'import_selection' AND status IN ('queued','running')) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version, phase,
    discovery_complete, source_run_id, idempotency_key)
    VALUES(p_integration, p_actor, source.provider_scope, 'import_selection', 2, 'hydration', true,
           source.id, p_idempotency)
    RETURNING * INTO r;

  -- Freeze the identities and the exact content the user reviewed.
  INSERT INTO siem_sync_items(run_id, vendor_rule_id, remote_rule_id, frozen_content_hash, status, error_message)
  SELECT r.id, v.vendor_rule_id, v.id, s.content_hash,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL
              THEN 'pending' ELSE 'skipped' END,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL THEN NULL
              WHEN v.relationship = 'already_in_library' THEN 'Already in library'
              WHEN v.relationship = 'archived_in_library' THEN 'Archived in library'
              WHEN v.relationship = 'match_needed' THEN 'Match needed'
              WHEN v.relationship = 'unsupported' THEN coalesce(v.normalization_error, 'Not supported')
              ELSE 'This rule has not been read from CrowdStrike yet' END
    FROM siem_inventory_rows v
    LEFT JOIN siem_remote_rule_snapshots s ON s.id = v.latest_snapshot_id
   WHERE v.integration_id = p_integration
     AND v.provider_scope = source.provider_scope
     AND (CASE WHEN p_all_matching
               THEN NOT (v.vendor_rule_id = ANY(coalesce(p_exclude, '{}')))
               ELSE v.vendor_rule_id = ANY(coalesce(p_ids, '{}')) END)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO frozen FROM siem_sync_items WHERE run_id = r.id AND status = 'pending';
  IF frozen = 0 THEN
    UPDATE siem_sync_runs SET status = 'complete', completed_at = now(),
      error_message = 'None of the selected rules can be imported right now' WHERE id = r.id
      RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text) TO service_role;
