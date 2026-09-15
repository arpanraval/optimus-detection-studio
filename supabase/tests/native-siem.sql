-- Run only against an isolated test database after schema.sql. All fixture writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES
  ('01000000-0000-0000-0000-000000000001','siem-owner@example.test'),
  ('01000000-0000-0000-0000-000000000002','siem-other@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('01000000-0000-0000-0000-000000000001','admin','active'),
  ('01000000-0000-0000-0000-000000000002','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('02000000-0000-0000-0000-000000000001','01000000-0000-0000-0000-000000000001','Falcon fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials'),
  ('02000000-0000-0000-0000-000000000002','01000000-0000-0000-0000-000000000001','Splunk fixture','splunk','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE actor uuid := '01000000-0000-0000-0000-000000000001'; integration uuid := '02000000-0000-0000-0000-000000000001';
  r public.siem_sync_runs; b public.siem_rule_bindings; content jsonb; result jsonb; did text; op uuid; failed boolean;
BEGIN
  content := '{"name":"Fixture rule","description":"Imported","query":"#event_simpleName=ProcessRollup2","language":"CQL","severity":"High","enabled":true,"config":{"search":{"outcome":"detection","lookback":"1h0m"},"operation":{"schedule":{"definition":"@every 1h0m"}}}}';
  result := jsonb_build_array(jsonb_build_object('id','rule-1','content',content,'raw','{}'::jsonb,'adapter','test-v1','hash','h1','raw_hash','r1'));
  r := public.siem_start_sync(actor,integration,'scope-a');
  PERFORM pg_temp.assert_true((public.siem_start_sync(actor,integration,'scope-a')).id=r.id,'concurrent start is idempotent');
  SELECT * INTO r FROM public.siem_claim_sync();
  failed:=false;
  BEGIN PERFORM public.siem_commit_chunk(r.id,gen_random_uuid(),ARRAY['rule-1'],1,true,'[]'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'wrong lease cannot commit');
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['rule-1','rule-1'],1,true,'[]');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,result);
  SELECT * INTO b FROM public.siem_rule_bindings WHERE integration_id=integration;
  did:=b.detection_id;
  PERFORM set_config('test.siem_detection',did,true);
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.siem_rule_bindings WHERE integration_id=integration),'one binding');
  PERFORM pg_temp.assert_true((SELECT library_type='production' AND status='Draft' AND review_status='none' AND NOT "testedAndValidated"
    AND native_provenance->>'kind'='native_siem' FROM public.detections WHERE id=did),'safe import defaults');
  PERFORM pg_temp.assert_true((SELECT status='complete' FROM public.siem_sync_runs WHERE id=r.id),'complete run');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.deployment_history WHERE detection_id=did),'import is not a deployment');

  -- A second fetch reuses the binding and content-addressed snapshot.
  r:=public.siem_start_sync(actor,integration,'scope-a'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['rule-1'],1,true,'[]'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,result);
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.siem_rule_snapshots WHERE binding_id=b.id),'unchanged sync deduplicates snapshots');
  PERFORM pg_temp.assert_true((SELECT detection_id=did FROM public.siem_rule_bindings WHERE id=b.id),'detection identity survives refresh');

  -- The shared library editor must not be able to invalidate a bound query.
  failed:=false;
  BEGIN UPDATE public.detections SET queries='[]' WHERE id=did; EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'bound query removal is rejected');
  UPDATE public.detections SET queries=jsonb_set(queries,'{0,query}','"local edit"'),version=version+1 WHERE id=did;
  PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.siem_local_revisions WHERE detection_id=did),'local edit creates immutable revision');
  r:=public.siem_start_sync(actor,integration,'scope-a'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['rule-1'],1,true,'[]'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,result);
  PERFORM pg_temp.assert_true((SELECT queries->0->>'query'='local edit' FROM public.detections WHERE id=did),'sync preserves local edit');
  failed:=false;
  BEGIN PERFORM public.siem_accept_remote(actor,b.id,b.latest_remote_snapshot_id,1,'h1'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'stale accept rejected');
  PERFORM public.siem_accept_remote(actor,b.id,b.latest_remote_snapshot_id,(SELECT version FROM public.detections WHERE id=did),'h1');
  PERFORM pg_temp.assert_true((SELECT queries->0->>'query'=content->>'query' FROM public.detections WHERE id=did),'accept restores observed query');
  failed:=false;
  BEGIN PERFORM public.siem_start_sync('01000000-0000-0000-0000-000000000002',integration,'scope-a'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'other admin cannot use private connection');

  -- Operation identity and verification, without a vendor network call.
  UPDATE public.detections SET status='Review' WHERE id=did;
  op:=public.siem_begin_deployment(actor,b.id,(SELECT version FROM public.detections WHERE id=did),'h1',content,'update');
  failed:=false;
  BEGIN PERFORM public.siem_start_sync(actor,integration,'scope-a'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'sync and deployment cannot race');
  PERFORM public.siem_finish_deployment(op,actor,content,'{}','h1','r1','test-v1');
  PERFORM pg_temp.assert_true((SELECT status='success' AND vendor_rule_id='rule-1' AND response->>'verification'='verified' FROM public.deployment_history WHERE id=op),'update keeps original vendor ID');

  -- Failed scan must not imply removal.
  r:=public.siem_start_sync(actor,integration,'scope-a'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['other-rule'],1,true,'[]'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,'[{"id":"other-rule","status":"failed","error":"detail missing"}]');
  PERFORM pg_temp.assert_true((SELECT availability='present' FROM public.siem_rule_bindings WHERE id=b.id),'partial scan does not mark missing');
  failed:=false;
  BEGIN DELETE FROM public.integrations WHERE id=integration; EXCEPTION WHEN integrity_constraint_violation THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'connection deletion preserves history');

  UPDATE public.detections SET status='Archived' WHERE id=did;
  -- Deletion works through the normal table endpoint, cleans imports and permits a fresh fetch.
  r:=public.siem_start_sync(actor,integration,'scope-a');
  failed:=false;
  BEGIN DELETE FROM public.detections WHERE id=did; EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'deletion cannot race an active fetch');
  UPDATE public.siem_sync_runs SET status='cancelled',completed_at=now() WHERE id=r.id;
  DELETE FROM public.detections WHERE id=did;
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.siem_rule_bindings WHERE detection_id=did),'delete removes bindings');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.siem_local_revisions WHERE detection_id=did),'delete removes local versions');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.siem_rule_snapshots WHERE binding_id=b.id),'delete removes imported snapshots');
  PERFORM pg_temp.assert_true((SELECT native_binding_id IS NULL AND vendor_rule_id='rule-1' FROM public.deployment_history WHERE id=op),'delete retains deployment history');
  r:=public.siem_start_sync(actor,integration,'scope-a'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['rule-1'],1,true,'[]'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,result);
  SELECT * INTO b FROM public.siem_rule_bindings WHERE integration_id=integration AND vendor_rule_id='rule-1';
  PERFORM pg_temp.assert_true(b.detection_id IS DISTINCT FROM did,'fetch creates a fresh library copy after deletion');
  did:=b.detection_id;
  UPDATE public.detections SET status='Archived' WHERE id=did;
  r:=public.siem_start_sync(actor,integration,'scope-a'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,ARRAY['rule-1'],1,true,'[]'); SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_chunk(r.id,r.lease_token,'{}',1,true,result);
  PERFORM pg_temp.assert_true((SELECT binding_status='tombstone' FROM public.siem_rule_bindings WHERE id=b.id),'archive suppresses reimport');
  UPDATE public.profiles SET permission_overrides='{"revoked":["detection:edit_own","detection:edit_any"]}' WHERE id=actor;
  PERFORM pg_temp.assert_true(NOT public.siem_can_edit(actor),'explicit edit revocations are respected');
  UPDATE public.profiles SET permission_overrides='{}' WHERE id=actor;
  r:=public.siem_start_sync(actor,integration,'scope-a');
  PERFORM public.siem_disconnect(actor,integration);
  PERFORM pg_temp.assert_true((SELECT archived_at IS NOT NULL FROM public.integrations WHERE id=integration),'disconnect archives connection');
  PERFORM pg_temp.assert_true((SELECT status='cancelled' FROM public.siem_sync_runs WHERE id=r.id),'disconnect cancels pending sync');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.siem_rule_bindings WHERE id=b.id),'disconnect retains binding history');
  PERFORM pg_temp.assert_true(NOT public.siem_can_import(actor,integration),'disconnected integration cannot sync');
END $$;

-- Multi-provider constraints: the six-provider list is admitted; anything outside it still fails.
DO $$
DECLARE actor uuid := '01000000-0000-0000-0000-000000000001'; splunk_integration uuid := '02000000-0000-0000-0000-000000000002';
  splunk_binding_id uuid; did text; failed boolean;
BEGIN
  SELECT detection_id INTO did FROM public.siem_rule_bindings WHERE integration_id='02000000-0000-0000-0000-000000000001' LIMIT 1;
  UPDATE public.detections SET queries = queries || jsonb_build_array(jsonb_build_object(
    'id','q-s1','language','SPL','query','search index=main','isPrimary',false,
    'createdDate',now(),'updatedDate',now())) WHERE id=did;

  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
    VALUES(did,splunk_integration,'splunk','scope-splunk','rule-s1','q-s1','SPL','{}'::jsonb)
    RETURNING id INTO splunk_binding_id;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.siem_rule_bindings WHERE id=splunk_binding_id),'splunk/SPL binding is accepted');

  failed:=false;
  BEGIN
    INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
      VALUES(did,splunk_integration,'jira','scope-jira','rule-j1','q-j1','SPL','{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'a provider outside the six is still rejected');

  PERFORM pg_temp.assert_true(public.siem_can_import(actor,splunk_integration),'authorized owner can import from a Splunk connection');
END $$;

SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.siem_commit_chunk(uuid,uuid,text[],integer,boolean,jsonb)','execute'),'client cannot forge import');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.siem_rule_snapshots','truncate'),'client cannot truncate snapshots');
SELECT pg_temp.assert_true(NOT has_table_privilege('anon','public.siem_rule_snapshots','select'),'anon cannot read snapshots');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.siem_rule_snapshots),'other admin cannot read private snapshots');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.siem_rule_bindings),'other admin cannot read bindings');
SELECT set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.siem_rule_bindings),'owner can read persisted bindings');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
