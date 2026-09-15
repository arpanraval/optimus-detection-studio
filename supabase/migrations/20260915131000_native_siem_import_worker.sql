-- Executes a frozen import selection in bounded chunks. Adoption creates the detection,
-- binding, first local revision, remote snapshot and import event in one transaction -- the
-- same set siem_commit_chunk creates today -- but content always comes from the frozen catalog
-- snapshot recorded at submission (Task 7), never from what the worker reads live.

CREATE OR REPLACE FUNCTION public.siem_commit_import_chunk(p_run uuid, p_lease uuid, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; d detections; snap uuid;
  did text; qid text; c jsonb; frozen_hash text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'import_selection'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    IF NOT EXISTS (SELECT 1 FROM siem_sync_items
                    WHERE run_id = r.id AND vendor_rule_id = item->>'id' AND status = 'pending') THEN
      CONTINUE;
    END IF;

    IF item ? 'error' THEN
      UPDATE siem_sync_items SET status = 'failed', error_message = item->>'error'
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    SELECT frozen_content_hash INTO frozen_hash FROM siem_sync_items
     WHERE run_id = r.id AND vendor_rule_id = item->>'id';
    IF item->>'hash' IS DISTINCT FROM frozen_hash THEN
      UPDATE siem_sync_items SET status = 'changed_since_preview',
        error_message = 'Production changed after you reviewed this rule. Fetch rules again and reselect it.'
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    c := item->'content';

    -- A binding for this identity may have appeared since submission (another run, another
    -- actor). Adopting again would duplicate the detection.
    SELECT * INTO b FROM siem_rule_bindings
     WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
       AND vendor_rule_id = item->>'id' FOR UPDATE;
    IF FOUND THEN
      UPDATE siem_sync_items SET status = 'linked', detection_id = b.detection_id, binding_id = b.id,
        error_message = NULL WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    -- Adoption block copied verbatim from siem_commit_chunk (20260914153559, lines 233-247).
    -- Every literal here -- lifecycle defaults, 'CQL', the tags, the provenance shape -- is
    -- asserted by supabase/tests/native-siem.sql and read by SiemLibraryBadge / DetectionDetailPage.
    did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
    INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
      "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
      source,external_id,tags,native_provenance)
    VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,'CQL',c->>'query',now(),
      jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
      'production','none','none','crowdstrike',item->>'id',ARRAY['native-siem','crowdstrike'],
      jsonb_build_object('kind','native_siem','provider','crowdstrike','connection_name',
        (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()));
    SELECT * INTO d FROM detections WHERE id=did;
    INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
      VALUES(did,r.integration_id,'crowdstrike',r.provider_scope,item->>'id',qid,'CQL',c) RETURNING * INTO b;
    INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(did,to_jsonb(d),jsonb_build_object(b.id::text,c),r.actor_id);
    -- Unlike siem_commit_chunk (which derives outcome from prior state), a chunk that reaches
    -- this point has already established there is no existing binding, so the action is always
    -- 'imported'.
    INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,r.actor_id,'imported');

    INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(b.id,item->>'adapter',item->>'hash',item->>'raw_hash',c,item->'raw') ON CONFLICT DO NOTHING;
    SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=item->>'adapter'
      AND content_hash=item->>'hash' AND raw_hash=item->>'raw_hash';
    UPDATE siem_rule_bindings SET latest_remote_snapshot_id=snap, baseline_snapshot_id=coalesce(baseline_snapshot_id,snap),
      availability='present', observed_enabled=(c->>'enabled')::boolean, last_seen_at=now(), last_sync_run_id=r.id
     WHERE id=b.id;

    UPDATE siem_sync_items SET status = 'imported', detection_id = did, binding_id = b.id, error_message = NULL
     WHERE run_id = r.id AND vendor_rule_id = item->>'id';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id = r.id AND status = 'pending') THEN
    UPDATE siem_sync_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM siem_sync_items
        WHERE run_id = r.id AND status IN ('failed','changed_since_preview')) THEN 'partial' ELSE 'complete' END,
      completed_at = now() WHERE id = r.id;
  END IF;

  UPDATE siem_sync_runs SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(),
    attempts = 0, error_message = NULL WHERE id = r.id;
END $$;

-- Cancellation stops unclaimed work only; anything already adopted is left exactly as it is.
CREATE OR REPLACE FUNCTION public.siem_cancel_import(p_actor uuid, p_run uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'import_selection' THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT siem_can_import(p_actor, r.integration_id) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF r.status NOT IN ('queued','running') THEN RAISE EXCEPTION 'This import has already finished'; END IF;

  UPDATE siem_sync_items SET status = 'cancelled', error_message = NULL
   WHERE run_id = r.id AND status = 'pending';

  UPDATE siem_sync_runs SET status = 'cancelled', completed_at = now(),
    lease_token = NULL, lease_expires_at = NULL WHERE id = r.id;
END $$;

-- Retry resets only failed items. changed_since_preview needs a fresh inventory check and a
-- new selection; silently re-adopting it would import content the user never reviewed.
CREATE OR REPLACE FUNCTION public.siem_retry_import(p_actor uuid, p_run uuid)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; reset_count integer;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'import_selection' THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT siem_can_import(p_actor, r.integration_id) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;

  UPDATE siem_sync_items SET status = 'pending', error_message = NULL
   WHERE run_id = r.id AND status = 'failed';
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  IF reset_count = 0 THEN RAISE EXCEPTION 'No failed rules to retry'; END IF;

  -- A partial run no longer blocks a fresh import_selection start (siem_start_import's
  -- concurrency check only sees 'queued'/'running'), so a second import may already be live
  -- for this connection by the time this one is retried. Requeuing into that collision would
  -- otherwise surface the raw siem_sync_one_active unique-constraint error to the user.
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = r.integration_id
               AND kind = 'import_selection' AND status IN ('queued','running') AND id <> r.id) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  UPDATE siem_sync_runs SET status = 'queued', next_attempt_at = now(), attempts = 0,
    completed_at = NULL, error_message = NULL, lease_token = NULL, lease_expires_at = NULL
    WHERE id = r.id
    RETURNING * INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.siem_commit_import_chunk(uuid,uuid,jsonb),
  public.siem_cancel_import(uuid,uuid), public.siem_retry_import(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_commit_import_chunk(uuid,uuid,jsonb),
  public.siem_cancel_import(uuid,uuid), public.siem_retry_import(uuid,uuid) TO service_role;
