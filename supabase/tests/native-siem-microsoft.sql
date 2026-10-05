-- Isolated database only. No vendor requests; all fixture writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES ('91000000-0000-0000-0000-000000000001','microsoft-fixture@example.test');
INSERT INTO public.profiles(id,role,status) VALUES ('91000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';

DO $$
DECLARE actor uuid := '91000000-0000-0000-0000-000000000001'; integration uuid;
  prov text; run public.siem_sync_runs; binding public.siem_rule_bindings; content jsonb; op uuid; failed boolean;
BEGIN
  FOREACH prov IN ARRAY ARRAY['defender_xdr','sentinel'] LOOP
    INSERT INTO public.integrations(user_id,name,provider,category,status,config,auth_type)
      VALUES(actor,prov||' fixture',prov,'siem','connected','{}','oauth2_client_credentials') RETURNING id INTO integration;
    content := jsonb_build_object('name','Microsoft fixture','description','Imported rule','query','SecurityEvent | take 5',
      'language','KQL','severity','High','enabled',true,'config',jsonb_build_object('techniques',jsonb_build_array('T1059')));
    run := public.siem_start_sync(actor,integration,'scope-a');
    SELECT * INTO run FROM public.siem_claim_sync();
    PERFORM public.siem_commit_chunk(run.id,run.lease_token,ARRAY['remote-1'],1,true,'[]');
    SELECT * INTO run FROM public.siem_claim_sync();
    PERFORM public.siem_commit_chunk(run.id,run.lease_token,'{}',1,true,jsonb_build_array(jsonb_build_object(
      'id','remote-1','content',content,'raw','{}'::jsonb,'adapter','test-v1','hash','hash1','raw_hash','raw1')));
    SELECT * INTO binding FROM public.siem_rule_bindings WHERE integration_id=integration;
    PERFORM pg_temp.assert_true(binding.query_language='KQL','native import retains KQL');
    PERFORM pg_temp.assert_true((SELECT source='native_siem' AND "mitreAttackIds"=ARRAY['T1059']
      FROM public.detections WHERE id=binding.detection_id),'import preserves provenance and ATT&CK evidence');
    UPDATE public.detections SET status='Review' WHERE id=binding.detection_id;
    op := public.siem_begin_deployment(actor,binding.id,
      (SELECT version FROM public.detections WHERE id=binding.detection_id),'hash1',content,'update');
    PERFORM pg_temp.assert_true((SELECT query_language='KQL' AND vendor_rule_id='remote-1'
      FROM public.deployment_history WHERE id=op),'redeploy history uses the binding language and original remote ID');
    PERFORM public.siem_finish_deployment(op,actor,content,'{}','hash1','raw1','test-v1');
    failed := false;
    BEGIN
      PERFORM public.siem_begin_deployment(actor,binding.id,
        (SELECT version FROM public.detections WHERE id=binding.detection_id),'hash1',
        jsonb_set(content,'{query}','"UnrelatedTable"'),'update');
    EXCEPTION WHEN OTHERS THEN failed := true;
    END;
    PERFORM pg_temp.assert_true(failed,'an unrelated query cannot bypass the selected query guard');
  END LOOP;
  PERFORM pg_temp.assert_true(public.siem_native_attack_metadata(
    '{"query":"T1111 in query text","config":{"techniques":["T1059","T1059"]}}')->'ids'='["T1059"]',
    'ATT&CK IDs are deduplicated and never inferred from query text');
  PERFORM pg_temp.assert_true(public.siem_legacy_rule_id('elastic','{"id":"object-1","rule_id":"stable-1"}')='object-1',
    'legacy Elastic history retains its saved-object locator');
  PERFORM pg_temp.assert_true(public.siem_legacy_rule_id('splunk','{"name":"search-1","acl":{"owner":"alice"}}')='search-1',
    'legacy Splunk history retains its search name');
END $$;
ROLLBACK;
