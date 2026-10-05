-- Task 4: the commit paths that adopt content into the library hardcoded 'crowdstrike'/'CQL' and
-- the literal tag ARRAY['native-siem','crowdstrike']. They now read provider from the connection
-- (integrations.provider) and its query language from this new lookup, so an adopted rule carries
-- its own provider's identity rather than a borrowed CrowdStrike one. Every transactional property
-- -- one detection, primary query, binding, initial snapshots, provenance, event and result per
-- rule, and a per-rule failure that does not roll back the batch -- is unchanged.

-- The one query language each provider's adapter emits, for commit paths that adopt content into
-- the library without being told a language by the caller. Provider identity always comes from
-- the connection (integrations.provider), never from a vendor payload.
CREATE OR REPLACE FUNCTION public.siem_provider_query_language(p_provider text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_provider
    WHEN 'crowdstrike' THEN 'CQL'
    WHEN 'splunk' THEN 'SPL'
    WHEN 'sentinel' THEN 'KQL'
    WHEN 'elastic' THEN 'EQL'
    WHEN 'defender_xdr' THEN 'KQL'
    WHEN 'chronicle' THEN 'YARA-L'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.siem_commit_chunk(p_run uuid, p_lease uuid, p_ids text[], p_next integer,
  p_discovery_complete boolean, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; snap uuid; d detections;
  qid text; did text; candidates text[]; c jsonb; outcome text; old_hash text; prov text; qlang text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id,r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id=r.integration_id;
  qlang := siem_provider_query_language(prov);
  IF r.phase='discovery' THEN
    INSERT INTO siem_sync_items(run_id,vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset=p_next, discovery_complete=p_discovery_complete,
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
            source,external_id,tags,native_provenance)
          VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,qlang,c->>'query',now(),
            jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
            'production','none','none',prov,item->>'id',ARRAY['native-siem',prov],
            jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
              (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()));
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

CREATE OR REPLACE FUNCTION public.siem_commit_inventory_chunk(p_run uuid, p_lease uuid, p_ids text[],
  p_next integer, p_discovery_complete boolean, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; rr siem_remote_rules; snap uuid; cand integer; prov text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'inventory'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id = r.integration_id;

  IF r.phase = 'discovery' THEN
    INSERT INTO siem_sync_items(run_id, vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset = p_next, discovery_complete = p_discovery_complete,
      phase = CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id = r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items
                      WHERE run_id = r.id AND vendor_rule_id = item->>'id' AND status = 'pending') THEN
        CONTINUE;
      END IF;

      -- Reset per item: snap is only assigned inside the content branch below, and an item
      -- without content must not inherit the previous iteration's snapshot.
      snap := NULL;

      -- Candidate evidence is computed once here, not per page render.
      SELECT count(DISTINCT h.detection_id) INTO cand FROM deployment_history h
        JOIN detections x ON x.id = h.detection_id
       WHERE h.integration_id = r.integration_id AND h.vendor_rule_id = item->>'id'
         AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = r.actor_id
         AND NOT EXISTS (SELECT 1 FROM deployment_history later
                          WHERE later.integration_id = h.integration_id
                            AND later.vendor_rule_id = h.vendor_rule_id
                            AND later.status = 'success' AND later.action = 'delete'
                            AND later.created_at > h.created_at);
      IF cand = 0 AND EXISTS (SELECT 1 FROM detections
                               WHERE user_id = r.actor_id AND external_id = item->>'id'
                                 AND native_provenance IS NULL) THEN
        cand := 1;
      END IF;

      INSERT INTO siem_remote_rules(integration_id, provider, provider_scope, vendor_rule_id, rule_family,
        display_name, observed_enabled, availability, normalization_error, match_candidate_count, last_seen_at)
      VALUES(r.integration_id, prov, r.provider_scope, item->>'id',
        coalesce(item->>'family','correlation'), coalesce(item->>'name', item->>'id'),
        CASE WHEN item ? 'enabled' THEN (item->>'enabled')::boolean ELSE NULL END,
        'present', CASE WHEN item->>'status' = 'failed' THEN NULL ELSE item->>'error' END, cand, now())
      ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO UPDATE SET
        rule_family = excluded.rule_family,
        display_name = CASE WHEN item ? 'name' THEN excluded.display_name ELSE siem_remote_rules.display_name END,
        observed_enabled = excluded.observed_enabled,
        availability = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.availability ELSE 'present' END,
        normalization_error = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.normalization_error ELSE excluded.normalization_error END,
        match_candidate_count = excluded.match_candidate_count, last_seen_at = now()
      RETURNING * INTO rr;

      -- The same observation the catalog just recorded, applied to the tracked binding. Without
      -- this the inventory table and the rule's own comparison disagree about the rule the user
      -- is looking at. desired_content and baseline_snapshot_id are deliberately untouched:
      -- local edits and agreed baselines are decisions, not observations.
      IF item->>'status' IS DISTINCT FROM 'failed' THEN
        UPDATE siem_rule_bindings SET availability='present',
          observed_enabled=CASE WHEN item ? 'enabled' THEN (item->>'enabled')::boolean ELSE observed_enabled END,
          last_seen_at=now(), last_sync_run_id=r.id
         WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
           AND vendor_rule_id=item->>'id' AND binding_status='active';
      ELSE
        UPDATE siem_rule_bindings SET availability='unknown'
         WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
           AND vendor_rule_id=item->>'id' AND binding_status='active';
      END IF;

      IF item ? 'content' THEN
        INSERT INTO siem_remote_rule_snapshots(remote_rule_id, adapter_version, content_hash, raw_hash,
          content, raw_payload)
          VALUES(rr.id, item->>'adapter', item->>'hash', item->>'raw_hash', item->'content', item->'raw')
          ON CONFLICT DO NOTHING;
        SELECT id INTO snap FROM siem_remote_rule_snapshots
          WHERE remote_rule_id = rr.id AND adapter_version = item->>'adapter'
            AND content_hash = item->>'hash' AND raw_hash = item->>'raw_hash';
        UPDATE siem_remote_rules SET latest_snapshot_id = snap WHERE id = rr.id;
      END IF;

      -- 'observed' (not 'unchanged') keeps job-outcome vocabulary distinct from library
      -- membership: an inventory scan never claims something was imported.
      -- The worker distinguishes "we read it but cannot normalise it" ('unsupported', a
      -- permanent property of the rule) from "the SIEM did not return it" ('failed', a
      -- transient read outcome). Only the latter blocks absence inference, so the hint is
      -- allowlisted rather than trusted verbatim.
      -- remote_rule_id / observed_snapshot_id are what make a completed run a reviewable
      -- artifact: siem_start_import freezes content from the snapshot THIS run saw, never from
      -- whatever the catalog happens to hold at submit time.
      UPDATE siem_sync_items
         SET status = CASE
               WHEN item->>'status' IN ('failed','unsupported') THEN item->>'status'
               WHEN item ? 'error' THEN 'unsupported'
               ELSE 'observed' END,
             error_message = item->>'error',
             remote_rule_id = rr.id,
             observed_snapshot_id = coalesce(snap, siem_sync_items.observed_snapshot_id)
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id = r.id AND status = 'pending') THEN
      -- Status and absence-inference are two different questions. Status reflects whether
      -- every item got a definite answer of any kind (matches legacy siem_commit_chunk's
      -- status IN ('failed','unsupported','ambiguous') reading of "partial").
      UPDATE siem_sync_runs
         SET status = CASE WHEN EXISTS (SELECT 1 FROM siem_sync_items
                                         WHERE run_id = r.id AND status IN ('failed','unsupported'))
                            THEN 'partial' ELSE 'complete' END,
             completed_at = now()
       WHERE id = r.id;
      -- Absence is a separate question from status. A rule we read but could not normalise
      -- ('unsupported') is still a definite answer that it exists, so it must not block the
      -- inference -- otherwise one permanently unsupported rule family would stop this
      -- connection from ever noticing a deleted rule. A 'failed' item is not a definite
      -- answer, so it does block it.
      IF r.discovery_complete AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                                               WHERE run_id = r.id AND status = 'failed') THEN
        UPDATE siem_remote_rules SET availability = 'missing'
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
           AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                            WHERE run_id = r.id AND vendor_rule_id = siem_remote_rules.vendor_rule_id);
        UPDATE siem_remote_rules SET last_complete_run_id = r.id
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope;
        -- Absence is only knowable from a job that enumerates production. refresh_tracked probes
        -- known ids one by one and pre-queues an item for each, so it can never observe that
        -- something is gone; a complete, failure-free discovery can.
        UPDATE siem_rule_bindings SET availability = 'missing', pending_operation_id = NULL
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
           AND binding_status = 'active'
           AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                            WHERE run_id = r.id AND vendor_rule_id = siem_rule_bindings.vendor_rule_id);
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(),
    attempts = 0, error_message = NULL WHERE id = r.id;
END $$;

CREATE OR REPLACE FUNCTION public.siem_commit_import_chunk(p_run uuid, p_lease uuid, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; d detections; snap uuid;
  did text; qid text; c jsonb; frozen_hash text; prov text; qlang text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'import_selection'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id = r.integration_id;
  qlang := siem_provider_query_language(prov);

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

    -- Adoption block mirrors siem_commit_chunk. Every literal here -- lifecycle defaults, the
    -- provider-derived query language, the tags, the provenance shape -- is asserted by
    -- supabase/tests/native-siem.sql and read by SiemLibraryBadge / DetectionDetailPage.
    did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
    INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
      "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
      source,external_id,tags,native_provenance)
    VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,qlang,c->>'query',now(),
      jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
      'production','none','none',prov,item->>'id',ARRAY['native-siem',prov],
      jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
        (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()));
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
