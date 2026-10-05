-- Initial native import status follows observed vendor state. No existing rows are changed.
-- CREATE OR REPLACE preserves the existing service-role-only grants and authorization checks.

CREATE OR REPLACE FUNCTION public.siem_commit_chunk(p_run uuid, p_lease uuid, p_ids text[], p_next integer,
  p_discovery_complete boolean, p_results jsonb, p_next_token text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; snap uuid; d detections;
  qid text; did text; candidates text[]; c jsonb; outcome text; old_hash text; prov text; qlang text; attack jsonb;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id,r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id=r.integration_id;
  IF r.phase='discovery' THEN
    INSERT INTO siem_sync_items(run_id,vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset=p_next, cursor_token=p_next_token, discovery_complete=p_discovery_complete,
      phase=CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id=r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=item->>'id' AND status='pending') THEN CONTINUE; END IF;
      IF item ? 'error' THEN
        UPDATE siem_sync_items SET status=coalesce(item->>'status','failed'), error_message=item->>'error'
          WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        -- A read that did not complete says nothing about production. Keeping the last
        -- 'present' shows a confident, stale answer; 'missing' would be a lie. Only a failed
        -- READ gets 'unknown' -- a rule we read but could not normalise ('unsupported') is
        -- still present, and last_seen_at is deliberately not advanced either way.
        IF coalesce(item->>'status','failed') = 'failed' THEN
          UPDATE siem_rule_bindings SET availability='unknown'
           WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
             AND vendor_rule_id=item->>'id' AND binding_status='active';
        END IF;
        CONTINUE;
      END IF;
      c := item->'content';
      -- Per-rule language first (e.g. an Elastic rule's own 'kuery'/'lucene'/'eql'/'esql'),
      -- falling back to the provider default only when the payload has none or an invalid one.
      qlang := siem_rule_query_language(prov, c);
    attack := siem_native_attack_metadata(c);
      SELECT * INTO b FROM siem_rule_bindings WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope AND vendor_rule_id=item->>'id' FOR UPDATE;
      outcome := 'unchanged';
      IF FOUND AND b.binding_status <> 'active' THEN
        UPDATE siem_sync_items SET status='ignored' WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        CONTINUE;
      END IF;
      IF b.id IS NULL THEN
        -- A real, current deployment establishes scope. Legacy external_id alone does not.
        SELECT array_agg(DISTINCT h.detection_id) INTO candidates FROM deployment_history h
          JOIN detections x ON x.id=h.detection_id
          WHERE h.integration_id=r.integration_id AND h.vendor_rule_id=item->>'id' AND h.status='success'
          AND x.user_id=r.actor_id AND h.action <> 'delete'
          AND NOT EXISTS (SELECT 1 FROM deployment_history later WHERE later.integration_id=h.integration_id
            AND later.vendor_rule_id=h.vendor_rule_id AND later.status='success' AND later.created_at>h.created_at AND later.action='delete');
        IF cardinality(candidates)>1 OR (coalesce(cardinality(candidates),0)=0 AND EXISTS
          (SELECT 1 FROM detections WHERE user_id=r.actor_id AND external_id=item->>'id' AND native_provenance IS NULL)) THEN
          UPDATE siem_sync_items SET status='ambiguous',error_message='Existing library rule needs explicit connection matching'
            WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
        END IF;
        did := candidates[1]; qid := NULL;
        IF did IS NOT NULL THEN
          SELECT * INTO d FROM detections WHERE id=did FOR UPDATE;
          SELECT q->>'id' INTO qid FROM jsonb_array_elements(d.queries) q WHERE q->>'language'=qlang
            AND q->>'query'=c->>'query' LIMIT 1;
          IF qid IS NULL THEN
            UPDATE siem_sync_items SET status='ambiguous',error_message='Existing deployment query differs; review linkage before importing'
              WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
          END IF;
          outcome := 'linked';
        ELSE
          did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
          INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
            "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
            source,external_id,tags,native_provenance,"mitreAttackIds","mitreTechniques","mitreTactics")
          VALUES(did,r.actor_id,1,c->>'name',c->>'description',CASE WHEN c->>'enabled'='true' THEN 'Production' ELSE 'Draft' END,'Detection',c->>'severity','','',false,qlang,c->>'query',now(),
            jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
            'production','none','none','native_siem',item->>'id',ARRAY['native-siem',prov],
            jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
              (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()), ARRAY(SELECT jsonb_array_elements_text(attack->'ids')),
      ARRAY(SELECT jsonb_array_elements_text(attack->'techniques')), ARRAY(SELECT jsonb_array_elements_text(attack->'tactics')));
          SELECT * INTO d FROM detections WHERE id=did;
          outcome := 'imported';
        END IF;
        INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
          VALUES(did,r.integration_id,prov,r.provider_scope,item->>'id',qid,qlang,c) RETURNING * INTO b;
        INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(did,to_jsonb(d),jsonb_build_object(b.id::text,c),r.actor_id);
        INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,r.actor_id,outcome);
      END IF;
      SELECT content_hash INTO old_hash FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id;
      INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
        VALUES(b.id,item->>'adapter',item->>'hash',item->>'raw_hash',c,item->'raw') ON CONFLICT DO NOTHING;
      SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=item->>'adapter'
        AND content_hash=item->>'hash' AND raw_hash=item->>'raw_hash';
      -- Only adoption establishes a baseline. For a binding that already existed, this run is an
      -- observation, and an observation is not a reconciliation decision.
      UPDATE siem_rule_bindings SET latest_remote_snapshot_id=snap,
        baseline_snapshot_id=CASE WHEN outcome IN ('imported','linked')
                                  THEN coalesce(baseline_snapshot_id,snap) ELSE baseline_snapshot_id END,
        availability='present', observed_enabled=(c->>'enabled')::boolean,last_seen_at=now(),last_sync_run_id=r.id,
        pending_operation_id=NULL WHERE id=b.id;
      IF outcome='unchanged' AND old_hash IS DISTINCT FROM item->>'hash' THEN outcome:='changed'; END IF;
      UPDATE siem_sync_items SET status=outcome,error_message=NULL WHERE run_id=r.id AND vendor_rule_id=item->>'id';
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status='pending') THEN
      IF EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status IN ('failed','unsupported','ambiguous')) THEN
        UPDATE siem_sync_runs SET status='partial',completed_at=now() WHERE id=r.id;
      ELSE
        UPDATE siem_sync_runs SET status='complete',completed_at=now() WHERE id=r.id;
        UPDATE siem_rule_bindings SET availability='missing',pending_operation_id=NULL WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
          AND binding_status='active' AND NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=siem_rule_bindings.vendor_rule_id);
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token=NULL,lease_expires_at=NULL,heartbeat_at=now(),attempts=0,error_message=NULL WHERE id=r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.siem_commit_import_chunk(p_run uuid, p_lease uuid, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; d detections; snap uuid;
  did text; qid text; c jsonb; frozen_hash text; prov text; qlang text; attack jsonb;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'import_selection'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id = r.integration_id;

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
    -- Per-rule language first, falling back to the provider default only when the payload has
    -- none or an invalid one -- see siem_rule_query_language.
    qlang := siem_rule_query_language(prov, c);
    attack := siem_native_attack_metadata(c);

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

    -- Set initial lifecycle from the observed vendor state; unknown/disabled stays Draft.
    -- Subsequent refreshes update the binding, not local workflow status or pending edits.
    did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
    INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
      "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
      source,external_id,tags,native_provenance,"mitreAttackIds","mitreTechniques","mitreTactics")
    VALUES(did,r.actor_id,1,c->>'name',c->>'description',CASE WHEN c->>'enabled'='true' THEN 'Production' ELSE 'Draft' END,'Detection',c->>'severity','','',false,qlang,c->>'query',now(),
      jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
      'production','none','none','native_siem',item->>'id',ARRAY['native-siem',prov],
      jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
        (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()), ARRAY(SELECT jsonb_array_elements_text(attack->'ids')),
      ARRAY(SELECT jsonb_array_elements_text(attack->'techniques')), ARRAY(SELECT jsonb_array_elements_text(attack->'tactics')));
    SELECT * INTO d FROM detections WHERE id=did;
    INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
      VALUES(did,r.integration_id,prov,r.provider_scope,item->>'id',qid,qlang,c) RETURNING * INTO b;
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
