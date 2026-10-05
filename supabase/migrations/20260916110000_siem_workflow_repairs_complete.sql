-- Restore provider-neutral local editing and deployment; preserve existing authorization and fencing.

-- Native ATT&CK IDs are evidence from provider configuration, never inferred from query text.
CREATE OR REPLACE FUNCTION public.siem_native_attack_metadata(p_content jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH ids AS (
    SELECT DISTINCT match[1] AS id FROM regexp_matches(
      jsonb_build_array(p_content#>'{config,technique}', p_content#>'{config,techniques}',
        p_content#>'{config,mitreTechniques}', p_content#>'{config,threat}',
        p_content#>'{config,action.correlationsearch.annotations}', p_content#>'{config,fields,mitre_attack}')::text,
      '(T[0-9]{4}(?:\.[0-9]{3})?)', 'g') AS match
  ), techniques AS (
    SELECT o.stix_id,o.name FROM mitre_objects o JOIN ids ON ids.id=o.mitre_id
      WHERE o.type='attack-pattern'
  ), tactics AS (
    SELECT DISTINCT o.name FROM mitre_objects o
      WHERE o.type='x-mitre-tactic' AND (
        o.stix_id IN (SELECT mt.tactic_stix_id FROM mitre_technique_tactics mt JOIN techniques t ON t.stix_id=mt.technique_stix_id)
        OR o.mitre_id=p_content#>>'{config,tactic}'
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p_content#>'{config,tactics}')='array' THEN p_content#>'{config,tactics}' ELSE '[]'::jsonb END) AS x
          WHERE regexp_replace(lower(o.name),'[^a-z]','','g')=regexp_replace(lower(x),'[^a-z]','','g')))
  )
  SELECT jsonb_build_object('ids',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM ids),'[]'::jsonb),
    'techniques',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM techniques),'[]'::jsonb),
    'tactics',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM tactics),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.siem_native_attack_metadata(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_native_attack_metadata(jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.siem_begin_deployment(p_actor uuid,p_binding uuid,p_version integer,p_hash text,p_content jsonb,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections; p profiles; op uuid;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding;
  IF NOT FOUND THEN RAISE EXCEPTION 'Binding not found'; END IF;
  PERFORM 1 FROM integrations WHERE id=b.integration_id FOR UPDATE;
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' OR b.availability<>'present' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO p FROM profiles WHERE id=p_actor;
  IF coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:sync' OR
    NOT (p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:sync') THEN RAISE EXCEPTION 'Deploy permission denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Authorized detection owner required'; END IF;
  IF d.library_type<>'production' OR d.status NOT IN ('Review','Testing','Production') THEN RAISE EXCEPTION 'Review this detection before deploying'; END IF;
  IF b.pending_operation_id IS NOT NULL OR EXISTS(SELECT 1 FROM siem_sync_runs WHERE integration_id=b.integration_id AND status IN ('queued','running')) THEN RAISE EXCEPTION 'Sync or production operation in progress'; END IF;
  IF d.version IS DISTINCT FROM p_version OR NOT EXISTS(SELECT 1 FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id AND content_hash=p_hash)
    OR (p_action='update' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.queries) q WHERE q->>'id'=b.selected_query_id AND q->>'query'=p_content->>'query' AND q->>'language'=b.query_language)) THEN RAISE EXCEPTION 'Review is stale'; END IF;
  IF p_action NOT IN ('update','enable','disable','delete') THEN RAISE EXCEPTION 'Unsupported operation'; END IF;
  INSERT INTO deployment_history(user_id,integration_id,detection_id,native_binding_id,action,status,vendor_rule_id,query_language,deployed_query,rule_config,detection_version,started_at,response)
    VALUES(p_actor,b.integration_id,d.id,b.id,p_action,'in_progress',b.vendor_rule_id,b.query_language,p_content->>'query',p_content,p_version,now(),jsonb_build_object('verification','pending')) RETURNING id INTO op;
  UPDATE siem_rule_bindings SET pending_operation_id=op WHERE id=b.id;
  RETURN op;
END $$;

CREATE OR REPLACE FUNCTION public.siem_save_local(p_actor uuid,p_binding uuid,p_version integer,p_content jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) OR d.version IS DISTINCT FROM p_version OR b.pending_operation_id IS NOT NULL THEN RAISE EXCEPTION 'Local revision changed or access denied'; END IF;
  IF p_content->>'language' <> b.query_language OR length(trim(p_content->>'query'))=0 OR length(trim(p_content->>'name'))=0
    OR p_content->>'severity' NOT IN ('Critical','High','Medium','Low','Informational','Unknown') THEN RAISE EXCEPTION 'Invalid local rule'; END IF;
  UPDATE siem_rule_bindings SET desired_content=p_content WHERE id=b.id;
  UPDATE detections SET name=p_content->>'name',description=p_content->>'description',severity=p_content->>'severity',
    version=version+1,"updatedDate"=now(),
    queries=(SELECT jsonb_agg(CASE WHEN q->>'id'=b.selected_query_id THEN q || jsonb_build_object('query',p_content->>'query','updatedDate',now()) ELSE q END)
      FROM jsonb_array_elements(queries) q),
    "detectionQuery"=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(queries) q WHERE q->>'id'=b.selected_query_id AND (q->>'isPrimary')::boolean)
      THEN p_content->>'query' ELSE "detectionQuery" END WHERE id=d.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,p_actor,'saved_local_revision');
END $$;

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
          VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,qlang,c->>'query',now(),
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

CREATE SCHEMA IF NOT EXISTS siem_private;
REVOKE ALL ON SCHEMA siem_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION siem_private.guard_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM (SELECT provider FROM integrations WHERE id=NEW.integration_id) OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id
      AND q->>'id'=NEW.selected_query_id) <> 1 OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id AND d.library_type='production'
      AND q->>'id'=NEW.selected_query_id AND q->>'language'=NEW.query_language AND length(trim(q->>'query'))>0) <> 1 THEN
    RAISE EXCEPTION 'Invalid SIEM query binding';
  END IF;
  RETURN NEW;
END $$;

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

    -- Adoption block copied verbatim from siem_commit_chunk (20260914153559, lines 233-247).
    -- Every literal here -- lifecycle defaults, the tags, the provenance shape -- is
    -- asserted by supabase/tests/native-siem.sql and read by SiemLibraryBadge / DetectionDetailPage.
    did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
    INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
      "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
      source,external_id,tags,native_provenance,"mitreAttackIds","mitreTechniques","mitreTactics")
    VALUES(did,r.actor_id,1,c->>'name',c->>'description','Draft','Detection',c->>'severity','','',false,qlang,c->>'query',now(),
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

ALTER FUNCTION public.siem_provider_query_language(text) SET search_path=public;

ALTER FUNCTION public.siem_rule_query_language(text,jsonb) SET search_path=public;

ALTER TABLE public.detection_preflight_runs DROP CONSTRAINT detection_preflight_runs_provider_check;
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_provider_check
  CHECK (provider IN ('defender_xdr','crowdstrike','sentinel'));
-- Provenance was only set on native adoption, never on an authored rule linked to its deployment.
UPDATE public.detections SET source='native_siem'
 WHERE native_provenance->>'kind'='native_siem'
   AND source=native_provenance->>'provider';

-- Legacy projections used Splunk saved-search names and Elastic saved-object IDs.
-- These aliases are candidate evidence only: linking still requires explicit selection,
-- detection ownership, a compatible selected query and the reviewed catalog snapshot.
CREATE OR REPLACE FUNCTION public.siem_legacy_rule_id(p_provider text,p_raw jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_provider WHEN 'splunk' THEN p_raw->>'name' WHEN 'elastic' THEN p_raw->>'id' ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.siem_legacy_rule_id(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_legacy_rule_id(text,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.siem_match_candidates(p_actor uuid, p_integration uuid, p_vendor_rule_id text)
RETURNS TABLE(detection_id text, detection_name text, evidence text, query_id text, query_language text,
  query_text text, detection_version integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE prov text; qlang text; rule_content jsonb; rule_raw jsonb; legacy_id text;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RETURN;
  END IF;
  SELECT provider INTO prov FROM integrations WHERE id = p_integration;
  SELECT s.content,s.raw_payload INTO rule_content,rule_raw
    FROM siem_remote_rules rr
    JOIN siem_remote_rule_snapshots s ON s.id = rr.latest_snapshot_id
   WHERE rr.integration_id = p_integration AND rr.vendor_rule_id = p_vendor_rule_id
   ORDER BY rr.last_seen_at DESC LIMIT 1;
  qlang := siem_rule_query_language(prov, coalesce(rule_content, '{}'::jsonb));
  legacy_id := siem_legacy_rule_id(prov,rule_raw);
  RETURN QUERY
  WITH deployed AS (
    SELECT DISTINCT h.detection_id
      FROM deployment_history h
      JOIN detections x ON x.id = h.detection_id
     WHERE h.integration_id = p_integration AND h.vendor_rule_id IN (p_vendor_rule_id,legacy_id)
       AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = p_actor
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ),
  legacy AS (
    SELECT d.id AS detection_id
      FROM detections d
     WHERE d.user_id = p_actor AND (d.external_id = p_vendor_rule_id OR (d.external_id=legacy_id AND d.source=prov)) AND d.native_provenance IS NULL
       AND d.id NOT IN (SELECT deployed.detection_id FROM deployed)
  ),
  evidenced AS (
    SELECT deployed.detection_id, 'Deployment history matches this connection; verify the remote scope'::text AS evidence FROM deployed
    UNION ALL
    SELECT legacy.detection_id, 'Legacy external ID matches'::text FROM legacy
  )
  SELECT d.id, d.name, e.evidence, q ->> 'id', q ->> 'language', q ->> 'query', d.version
    FROM evidenced e
    JOIN detections d ON d.id = e.detection_id AND d.user_id = p_actor AND d.library_type = 'production'
    CROSS JOIN LATERAL jsonb_array_elements(d.queries) q
   WHERE q ->> 'language' = qlang AND length(trim(q ->> 'query')) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.siem_link_existing(
  p_actor uuid, p_integration uuid, p_vendor_rule_id text, p_detection text,
  p_query_id text, p_detection_version integer, p_snapshot uuid)
RETURNS public.siem_rule_bindings
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  d detections;
  rr siem_remote_rules;
  rrs siem_remote_rule_snapshots;
  qtext text;
  qcount integer;
  b siem_rule_bindings;
  new_snap uuid;
  evidence text;
  prov text;
  qlang text;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RAISE EXCEPTION 'Linking this rule needs permission to import from this connection and edit the target rule';
  END IF;

  SELECT provider INTO prov FROM integrations WHERE id = p_integration FOR UPDATE;

  -- Pinned to the exact catalog row the snapshot belongs to, not just (integration, vendor_rule_id):
  -- the table's real uniqueness is (integration_id, provider_scope, vendor_rule_id), and this
  -- avoids needing provider_scope as a separate input. Fetched up front (not just before the
  -- insert) because the rule's own snapshot content is now also what determines qlang.
  SELECT * INTO rr FROM siem_remote_rules
   WHERE integration_id = p_integration AND vendor_rule_id = p_vendor_rule_id
     AND id = (SELECT remote_rule_id FROM siem_remote_rule_snapshots WHERE id = p_snapshot)
   FOR UPDATE;
  IF NOT FOUND OR rr.latest_snapshot_id IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'The rule changed in the SIEM. Fetch rules again.';
  END IF;
  SELECT * INTO rrs FROM siem_remote_rule_snapshots WHERE id = p_snapshot AND remote_rule_id = rr.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rule changed in the SIEM. Fetch rules again.';
  END IF;
  qlang := siem_rule_query_language(prov, rrs.content);

  SELECT * INTO d FROM detections WHERE id = p_detection FOR UPDATE;
  IF NOT FOUND OR d.user_id <> p_actor OR d.version <> p_detection_version THEN
    RAISE EXCEPTION 'The library rule changed. Reopen the match and try again.';
  END IF;

  SELECT count(*), max(q ->> 'query') INTO qcount, qtext
    FROM jsonb_array_elements(d.queries) q
   WHERE q ->> 'id' = p_query_id AND q ->> 'language' = qlang AND length(trim(q ->> 'query')) > 0;
  IF qcount <> 1 THEN
    RAISE EXCEPTION 'Choose the query this rule corresponds to';
  END IF;

  -- A matching name alone never authorises a link: re-derive evidence server-side rather than
  -- trusting that the caller only offers detections siem_match_candidates actually returned.
  IF EXISTS (
    SELECT 1 FROM deployment_history h
     WHERE h.integration_id = p_integration AND h.vendor_rule_id IN (p_vendor_rule_id,siem_legacy_rule_id(prov,rrs.raw_payload))
       AND h.detection_id = p_detection AND h.status = 'success' AND h.action <> 'delete'
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ) THEN
    evidence := 'Deployed to this connection as this rule';
  ELSIF (d.external_id = p_vendor_rule_id OR (d.external_id=siem_legacy_rule_id(prov,rrs.raw_payload) AND d.source=prov)) AND d.native_provenance IS NULL THEN
    evidence := 'Legacy external ID matches';
  END IF;
  IF evidence IS NULL THEN
    RAISE EXCEPTION 'This rule is not an eligible match for the selected library rule';
  END IF;

  BEGIN
    INSERT INTO siem_rule_bindings(
      detection_id, integration_id, provider, provider_scope, vendor_rule_id,
      selected_query_id, query_language, desired_content)
    VALUES(p_detection, p_integration, prov, rr.provider_scope, p_vendor_rule_id,
      p_query_id, qlang, rrs.content)
    RETURNING * INTO b;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This rule is already linked to a library rule.';
  END;

  -- Insert the copied snapshot after the binding exists, then point both snapshot FKs at it in
  -- one UPDATE — the binding's snapshot FKs are DEFERRABLE INITIALLY DEFERRED, so this ordering
  -- is safe within the transaction.
  INSERT INTO siem_rule_snapshots(binding_id, adapter_version, content_hash, raw_hash, content, raw_payload)
    VALUES(b.id, rrs.adapter_version, rrs.content_hash, rrs.raw_hash, rrs.content, rrs.raw_payload)
  RETURNING id INTO new_snap;

  UPDATE siem_rule_bindings
     SET latest_remote_snapshot_id = new_snap,
         -- No agreed baseline is invented: only set when the chosen query already matches the
         -- observed remote query. Otherwise NULL, surfaced by the UI as "Baseline not established".
         baseline_snapshot_id = CASE WHEN qtext = (rrs.content ->> 'query') THEN new_snap ELSE NULL END,
         observed_enabled = rr.observed_enabled, availability = rr.availability, last_seen_at = now()
   WHERE id = b.id
  RETURNING * INTO b;

  -- The existing rule's identity is untouched: no update to detections.source, external_id,
  -- user_id or native_provenance. The adoption is recorded only as this event.
  INSERT INTO siem_rule_events(binding_id, actor_id, action, detail)
  VALUES(b.id, p_actor, 'linked_existing',
    jsonb_build_object('evidence', evidence, 'source', d.source, 'vendor_rule_id', p_vendor_rule_id));

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.siem_commit_inventory_chunk(p_run uuid, p_lease uuid, p_ids text[],
  p_next integer, p_discovery_complete boolean, p_results jsonb, p_next_token text DEFAULT NULL)
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
    UPDATE siem_sync_runs SET cursor_offset = p_next, cursor_token = p_next_token, discovery_complete = p_discovery_complete,
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
       WHERE h.integration_id = r.integration_id AND h.vendor_rule_id IN (item->>'id',siem_legacy_rule_id(prov,item->'raw'))
         AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = r.actor_id
         AND NOT EXISTS (SELECT 1 FROM deployment_history later
                          WHERE later.integration_id = h.integration_id
                            AND later.vendor_rule_id = h.vendor_rule_id
                            AND later.status = 'success' AND later.action = 'delete'
                            AND later.created_at > h.created_at);
      IF cand = 0 AND EXISTS (SELECT 1 FROM detections
                               WHERE user_id = r.actor_id AND (external_id = item->>'id' OR (external_id=siem_legacy_rule_id(prov,item->'raw') AND source=prov))
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
      -- permanent property of the rule) from "CrowdStrike did not return it" ('failed', a
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

ALTER TABLE public.detection_finetune_runs DROP CONSTRAINT detection_finetune_runs_provider_check;
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_provider_check CHECK (provider IN ('defender_xdr','sentinel'));
