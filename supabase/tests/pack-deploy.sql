-- Isolated test database only. Fixtures and transitions are rolled back.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES('71000000-0000-0000-0000-000000000001','pack-fixture@example.test');
INSERT INTO public.profiles(id,role,status) VALUES('71000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Pack fixture','splunk','siem','connected','{}','token');
INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
  "testedAndValidated","queryLanguage","detectionQuery","updatedDate",library_type,promotion_status,review_status,source)
SELECT 'pack-fixture-'||n,'71000000-0000-0000-0000-000000000001',1,'Rule '||n,'Test rule','Production','Detection','High','','',false,
  'SPL','index=security',now(),'production','none','none','manual' FROM generate_series(1,60) n;

SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.pack_deploy_jobs','UPDATE'),'clients cannot forge job state');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.pack_deploy_job_items','INSERT'),'clients cannot add unreviewed items');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.pack_deploy_claim(uuid)','EXECUTE'),'clients cannot lease jobs');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.pack_deploy_dispatch()','EXECUTE'),'dispatcher is private');

-- Historical create events survive deletion/recreation with distinct vendor identities.
INSERT INTO deployment_history(user_id,integration_id,detection_id,action,status,vendor_rule_id) VALUES
  ('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','pack-fixture-60','create','success','deleted-rule'),
  ('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','pack-fixture-60','create','success','recreated-rule');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM deployment_history WHERE detection_id='pack-fixture-60'),'recreation preserves both successful events');
DO $$ BEGIN
  BEGIN
    INSERT INTO deployment_history(user_id,integration_id,detection_id,action,status,vendor_rule_id) VALUES
      ('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','pack-fixture-60','create','success','recreated-rule');
    RAISE EXCEPTION 'Duplicate successful remote identity was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
DELETE FROM deployment_history WHERE detection_id='pack-fixture-60';

DO $$
DECLARE actor uuid := '71000000-0000-0000-0000-000000000001'; integration uuid := '72000000-0000-0000-0000-000000000001';
  jid uuid; same uuid; request uuid := gen_random_uuid(); claimed jsonb; item uuid; lease uuid; failed boolean;
  payload jsonb := '[{"detection_id":"pack-fixture-1","detection_name":"Rule 1","payload":{"query":"index=security"}},
    {"detection_id":"pack-fixture-2","detection_name":"Rule 2","reason":"No matching query"}]';
BEGIN
  jid := pack_deploy_create(actor,integration,NULL,request,'{}',payload);
  same := pack_deploy_create(actor,integration,NULL,request,'{}',payload);
  PERFORM pg_temp.assert_true(jid=same,'same request returns same job');
  PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM pack_deploy_job_items WHERE job_id=jid),'items deduplicated by request');
  failed := false;
  BEGIN PERFORM pack_deploy_control(gen_random_uuid(),jid,'cancel'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'foreign actor cannot cancel');
  claimed := pack_deploy_claim(jid); item := (claimed->'item'->>'id')::uuid; lease := (claimed->'job'->>'lease_token')::uuid;
  PERFORM pg_temp.assert_true(pack_deploy_claim(jid) IS NULL,'second worker cannot claim live lease');
  PERFORM pack_deploy_begin_write(jid,item,lease);
  failed:=false;
  BEGIN PERFORM pack_deploy_begin_write(jid,item,lease); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'duplicate dispatch refused');
  PERFORM pack_deploy_control(actor,jid,'cancel');
  PERFORM pg_temp.assert_true((SELECT current_detection_id IS NULL AND status='cancelled' FROM pack_deploy_jobs WHERE id=jid),'cancel clears current rule');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pack_deploy_job_items WHERE job_id=jid AND status='running'),'cancel leaves no running item');
  PERFORM pack_deploy_finish(jid,item,lease,'{"status":"succeeded","vendorRuleId":"remote-1"}');
  PERFORM pg_temp.assert_true((SELECT status='cancelled' AND succeeded_count=1 AND skipped_count=1 FROM pack_deploy_jobs WHERE id=jid),'late success recorded without undoing cancellation');
  PERFORM pg_temp.assert_true(pack_deploy_claim(jid) IS NULL,'cancelled job cannot restart');

  -- Create + item insertion is one transaction, even if a later item violates uniqueness.
  failed:=false;
  BEGIN PERFORM pack_deploy_create(actor,integration,NULL,gen_random_uuid(),'{}',
    '[{"detection_id":"pack-fixture-1"},{"detection_id":"pack-fixture-1"}]');
  EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed AND (SELECT count(*)=1 FROM pack_deploy_jobs WHERE integration_id=integration),'no orphan job on item failure');

  jid := pack_deploy_create(actor,integration,NULL,gen_random_uuid(),'{}',
    '[{"detection_id":"pack-fixture-1","payload":{"query":"index=security"}}]');
  claimed:=pack_deploy_claim(jid); item:=(claimed->'item'->>'id')::uuid; lease:=(claimed->'job'->>'lease_token')::uuid;
  PERFORM pack_deploy_finish(jid,item,lease,'{"status":"failed","error":"Throttled","retryable":true,"retryAfter":60}');
  PERFORM pg_temp.assert_true(pack_deploy_claim(jid) IS NULL,'honor retry delay');
  UPDATE pack_deploy_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=jid;
  claimed:=pack_deploy_claim(jid); lease:=(claimed->'job'->>'lease_token')::uuid;
  PERFORM pack_deploy_begin_write(jid,item,lease);
  UPDATE pack_deploy_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=jid;
  PERFORM pack_deploy_claim(jid);
  PERFORM pg_temp.assert_true((SELECT status='failed' AND needs_reconciliation FROM pack_deploy_job_items WHERE id=item),'expired dispatched writes are not replayed');
  failed:=false;
  BEGIN PERFORM pack_deploy_control(actor,jid,'retry'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_true(failed,'uncertain writes cannot be retried');
  PERFORM pg_temp.assert_true(NOT pack_deploy_finish(jid,item,lease,'{"status":"succeeded","vendorRuleId":"stale"}'),'stale completion fenced out');

  jid := pack_deploy_create(actor,integration,NULL,gen_random_uuid(),'{}',
    '[{"detection_id":"pack-fixture-3","payload":{"query":"index=security"}}]');
  claimed:=pack_deploy_claim(jid); item:=(claimed->'item'->>'id')::uuid;
  UPDATE pack_deploy_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=jid;
  claimed:=pack_deploy_claim(jid);
  PERFORM pg_temp.assert_true((claimed->'item'->>'id')::uuid=item,'expired undispatched item safely reclaimed');
END $$;

-- Coverage includes rules with no history; enable/disable preserves remote presence.
INSERT INTO public.detection_packs(id,name,created_by) VALUES('73000000-0000-0000-0000-000000000001','Pack fixture','71000000-0000-0000-0000-000000000001');
INSERT INTO public.pack_detections(pack_id,detection_id) SELECT '73000000-0000-0000-0000-000000000001','pack-fixture-'||n FROM generate_series(1,3)n;
INSERT INTO public.deployment_history(user_id,integration_id,detection_id,action,status,vendor_rule_id)
VALUES('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','pack-fixture-1','disable','success','remote');
SELECT pg_temp.assert_true((SELECT total_detections=3 AND deployed_count=1 FROM public.v_pack_deployment_status
  WHERE pack_id='73000000-0000-0000-0000-000000000001'),'partial coverage and toggle lifecycle');
-- A pack larger than the interactive quota progresses through 60 independent item leases.
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('72000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','Large pack fixture','splunk','siem','connected','{}','token');
DO $$
DECLARE jid uuid; payload jsonb; claimed jsonb; item uuid; lease uuid;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('detection_id','pack-fixture-'||n,'payload',jsonb_build_object('query','index=security')))
    INTO payload FROM generate_series(1,60)n;
  jid:=pack_deploy_create('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',NULL,gen_random_uuid(),'{}',payload);
  FOR n IN 1..60 LOOP
    claimed:=pack_deploy_claim(jid); item:=(claimed->'item'->>'id')::uuid; lease:=(claimed->'job'->>'lease_token')::uuid;
    PERFORM pg_temp.assert_true(item IS NOT NULL,'large pack item claimed');
    PERFORM pack_deploy_begin_write(jid,item,lease);
    PERFORM pack_deploy_finish(jid,item,lease,jsonb_build_object('status','succeeded','vendorRuleId','remote-'||n));
  END LOOP;
  PERFORM pg_temp.assert_true((SELECT status='succeeded' AND succeeded_count=60 AND total_items=60 FROM pack_deploy_jobs WHERE id=jid),'60-rule pack completed');
  -- The vendor write was recorded, but the worker died before checkpointing its item.
  jid:=pack_deploy_create('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',NULL,gen_random_uuid(),'{}',
    '[{"detection_id":"pack-fixture-1","payload":{"query":"index=security"}}]');
  claimed:=pack_deploy_claim(jid); item:=(claimed->'item'->>'id')::uuid; lease:=(claimed->'job'->>'lease_token')::uuid;
  PERFORM pack_deploy_begin_write(jid,item,lease);
  INSERT INTO deployment_history(user_id,integration_id,detection_id,action,status,vendor_rule_id,pack_item_id)
    VALUES('71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002','pack-fixture-1','create','success','recovered-remote',item);
  UPDATE pack_deploy_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=jid;
  PERFORM pg_temp.assert_true(pack_deploy_claim(jid) IS NULL,'recorded success must not be replayed');
  PERFORM pg_temp.assert_true((SELECT status='succeeded' AND succeeded_count=1 FROM pack_deploy_jobs WHERE id=jid),'recorded success recovered');
END $$;
ROLLBACK;
