-- Run only against an isolated test database after schema.sql. All fixture writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES
  ('11000000-0000-0000-0000-000000000001','import-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('11000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('12000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'Falcon import fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

-- Submitting explicit ids out of a larger catalog freezes only the requested, eligible rows;
-- an id that is already bound is recorded skipped with a reason, not imported; re-submitting
-- the same idempotency key returns the same run and creates nothing new; and only one active
-- import_selection run may exist per connection at a time.
DO $$
DECLARE integration uuid := '12000000-0000-0000-0000-000000000001';
  actor uuid := '11000000-0000-0000-0000-000000000001';
  scope text := 'scope-import-1';
  inventory_run public.siem_sync_runs; import_run public.siem_sync_runs; repeat_run public.siem_sync_runs;
  bound_rule uuid; did text := 'import-fixture-detection-1'; qid text := 'import-fixture-query-1'; binding uuid;
  requested text[]; item_count integer; rule_id uuid; snap_id uuid;
BEGIN
  -- 20-row catalog, all normalisable and unbound except one, which is actively bound. Each
  -- rule gets a snapshot with a content hash, as a real inventory hydration would leave behind.
  FOR i IN 1..20 LOOP
    INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
      observed_enabled,availability)
      VALUES(integration,'crowdstrike',scope,'import-rule-'||i,'Import rule '||i,true,'present')
      RETURNING id INTO rule_id;
    INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(rule_id,'test-v1','hash-'||i,'raw-'||i,'{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
    UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;
  END LOOP;

  SELECT id INTO bound_rule FROM public.siem_remote_rules
    WHERE integration_id=integration AND provider_scope=scope AND vendor_rule_id='import-rule-1';

  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES(did,actor,1,'Import fixture rule','Imported','Draft','Detection','High','','',false,'CQL',
    '#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query','#event_simpleName=ProcessRollup2',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','crowdstrike');
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content)
    VALUES(did,integration,'crowdstrike',scope,'import-rule-1',qid,'CQL','{}'::jsonb)
    RETURNING id INTO binding;

  -- A completed, fully-discovered inventory run for this connection and scope.
  inventory_run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='complete', discovery_complete=true, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=inventory_run.id
    RETURNING * INTO inventory_run;

  -- 12 explicit ids: 11 eligible (import-rule-2..12) plus the one that is already bound (import-rule-1).
  requested := ARRAY['import-rule-1','import-rule-2','import-rule-3','import-rule-4','import-rule-5',
    'import-rule-6','import-rule-7','import-rule-8','import-rule-9','import-rule-10','import-rule-11','import-rule-12'];
  PERFORM pg_temp.assert_true(array_length(requested,1) = 12, 'sanity: 12 explicit ids requested');

  import_run := public.siem_start_import(actor, integration, inventory_run.id, requested, '{}', false, 'idem-key-1');

  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id AND status='pending';
  PERFORM pg_temp.assert_true(item_count = 11, 'submitting 12 explicit ids freezes exactly 11 eligible pending items');

  PERFORM pg_temp.assert_true(
    (SELECT status='skipped' AND error_message='Already in library' FROM public.siem_sync_items
       WHERE run_id=import_run.id AND vendor_rule_id='import-rule-1'),
    'an id that is already bound freezes as skipped with the already-in-library reason');

  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id;
  PERFORM pg_temp.assert_true(item_count = 12, 'client counts are never trusted: exactly the 12 requested rows were frozen, not more');

  -- Re-submitting the same idempotency key returns the same run and adds no items.
  repeat_run := public.siem_start_import(actor, integration, inventory_run.id, requested, '{}', false, 'idem-key-1');
  PERFORM pg_temp.assert_true(repeat_run.id = import_run.id, 'repeating the same idempotency key returns the same run');
  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id;
  PERFORM pg_temp.assert_true(item_count = 12, 'repeating the same idempotency key creates no new items');

  -- A second concurrent import_selection run for the same connection is rejected.
  BEGIN
    PERFORM public.siem_start_import(actor, integration, inventory_run.id,
      ARRAY['import-rule-13'], '{}', false, 'idem-key-2');
    RAISE EXCEPTION 'a second concurrent import_selection run was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.assert_true(SQLERRM = 'An import is already running for this connection',
      'the concurrency error names the reason');
  END;

  -- Retire the running job so later blocks in this file are not blocked by it.
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=import_run.id;
END $$;

-- all_matching resolves against the catalog rows for the source run's connection and scope,
-- respects exclusions, and is refused against an inventory run that is not complete.
INSERT INTO auth.users(id,email) VALUES
  ('13000000-0000-0000-0000-000000000001','import-all-matching-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('13000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('14000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',
   'Falcon all-matching fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '14000000-0000-0000-0000-000000000001';
  actor uuid := '13000000-0000-0000-0000-000000000001';
  scope text := 'scope-import-2';
  partial_run public.siem_sync_runs; complete_run public.siem_sync_runs; import_run public.siem_sync_runs;
  item_count integer; rule_id uuid; snap_id uuid;
BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
      observed_enabled,availability)
      VALUES(integration,'crowdstrike',scope,'am-rule-'||i,'All-matching rule '||i,true,'present')
      RETURNING id INTO rule_id;
    INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(rule_id,'test-v1','am-hash-'||i,'am-raw-'||i,'{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
    UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;
  END LOOP;

  -- A partial (incomplete-discovery) inventory run rejects all_matching.
  partial_run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='partial', discovery_complete=false, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=partial_run.id RETURNING * INTO partial_run;

  BEGIN
    PERFORM public.siem_start_import(actor, integration, partial_run.id, '{}', '{}', true, 'idem-key-3');
    RAISE EXCEPTION 'all_matching against a partial inventory run was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.assert_true(
      SQLERRM = 'Importing every matching rule needs a completed check. Select the rules you can see instead.',
      'all_matching against an incomplete run is rejected with product-copy error');
  END;

  -- Explicit ids from that same partial run ARE allowed.
  import_run := public.siem_start_import(actor, integration, partial_run.id,
    ARRAY['am-rule-1','am-rule-2'], '{}', false, 'idem-key-4');
  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id AND status='pending';
  PERFORM pg_temp.assert_true(item_count = 2, 'explicit ids from a partial inventory run are allowed');
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=import_run.id;

  -- A completed, fully-discovered run. all_matching with 3 exclusions freezes catalog_eligible - 3.
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=partial_run.id;
  complete_run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='complete', discovery_complete=true, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=complete_run.id RETURNING * INTO complete_run;

  import_run := public.siem_start_import(actor, integration, complete_run.id, '{}',
    ARRAY['am-rule-1','am-rule-2','am-rule-3'], true, 'idem-key-5');
  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id AND status='pending';
  PERFORM pg_temp.assert_true(item_count = 7, 'all_matching with 3 exclusions freezes catalog_eligible (10) minus 3 = 7');

  -- Retire this run so it cannot be mistaken for eligible work by siem_claim_sync's
  -- whole-table scan in later blocks of this file (every run in this transaction shares the
  -- same created_at, so a leftover queued run is a live hazard, not just untidy state).
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now() WHERE id=import_run.id;
END $$;

-- Adoption: siem_commit_import_chunk creates exactly one detection/binding/revision/'imported'
-- event per adopted item and zero deployment_history rows (an import is not a deployment);
-- an item whose observed hash drifted from the frozen hash adopts nothing; replaying an
-- already-adopted item links to the existing binding instead of duplicating; cancellation
-- stops only unclaimed work; and retry resets only 'failed' items, never 'changed_since_preview'.
INSERT INTO auth.users(id,email) VALUES
  ('15000000-0000-0000-0000-000000000001','import-adopt-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('15000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('16000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001',
   'Falcon adopt fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '16000000-0000-0000-0000-000000000001';
  actor uuid := '15000000-0000-0000-0000-000000000001';
  scope text := 'scope-import-3';
  inventory_run public.siem_sync_runs; import_run public.siem_sync_runs;
  cancel_run public.siem_sync_runs; retry_run public.siem_sync_runs; r public.siem_sync_runs;
  rule_id uuid; snap_id uuid; item_count integer; results jsonb; requested text[];
BEGIN
  -- 17-row catalog: 1..11 cleanly adopted, 12 drifts since submission, 13..15 exercise
  -- cancellation, 16..17 exercise retry.
  FOR i IN 1..17 LOOP
    INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
      observed_enabled,availability)
      VALUES(integration,'crowdstrike',scope,'adopt-rule-'||i,'Adopt rule '||i,true,'present')
      RETURNING id INTO rule_id;
    INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(rule_id,'test-v1','adopt-hash-'||i,'adopt-raw-'||i,
        jsonb_build_object('name','Adopt rule '||i,'description','d','severity','High',
          'query','#event_simpleName=X'||i,'enabled',true),
        '{}'::jsonb) RETURNING id INTO snap_id;
    UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;
  END LOOP;

  inventory_run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='complete', discovery_complete=true, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=inventory_run.id RETURNING * INTO inventory_run;

  -- === Adoption of rules 1..12 (11 clean, 1 drifted) ===
  requested := ARRAY['adopt-rule-1','adopt-rule-2','adopt-rule-3','adopt-rule-4','adopt-rule-5',
    'adopt-rule-6','adopt-rule-7','adopt-rule-8','adopt-rule-9','adopt-rule-10','adopt-rule-11','adopt-rule-12'];
  import_run := public.siem_start_import(actor, integration, inventory_run.id, requested, '{}', false, 'idem-adopt-1');
  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id AND status='pending';
  PERFORM pg_temp.assert_true(item_count = 12, 'sanity: all 12 requested rules froze as pending');

  SELECT jsonb_agg(jsonb_build_object('id',i.vendor_rule_id,'content',s.content,'raw',s.raw_payload,
      'adapter','test-v1', 'hash', CASE WHEN i.vendor_rule_id='adopt-rule-12' THEN 'drifted-hash' ELSE i.frozen_content_hash END,
      'raw_hash', s.raw_hash))
    INTO results
    FROM public.siem_sync_items i
    JOIN public.siem_remote_rules rr ON rr.integration_id=integration AND rr.provider_scope=scope AND rr.vendor_rule_id=i.vendor_rule_id
    JOIN public.siem_remote_rule_snapshots s ON s.id=rr.latest_snapshot_id
   WHERE i.run_id=import_run.id AND i.status='pending';

  UPDATE public.siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds' WHERE id=import_run.id RETURNING * INTO r;
  PERFORM public.siem_commit_import_chunk(r.id, r.lease_token, results);

  SELECT count(*) INTO item_count FROM public.siem_sync_items WHERE run_id=import_run.id AND status='imported';
  PERFORM pg_temp.assert_true(item_count = 11, 'adopting 11 frozen items (1 drifted) marks exactly 11 items imported');

  SELECT count(DISTINCT detection_id) INTO item_count FROM public.siem_sync_items
    WHERE run_id=import_run.id AND status='imported';
  PERFORM pg_temp.assert_true(item_count = 11, 'adopting 11 frozen items creates exactly 11 detections');

  SELECT count(DISTINCT binding_id) INTO item_count FROM public.siem_sync_items
    WHERE run_id=import_run.id AND status='imported';
  PERFORM pg_temp.assert_true(item_count = 11, 'adopting 11 frozen items creates exactly 11 bindings');

  SELECT count(*) INTO item_count FROM public.siem_local_revisions
    WHERE detection_id IN (SELECT detection_id FROM public.siem_sync_items WHERE run_id=import_run.id AND status='imported');
  PERFORM pg_temp.assert_true(item_count = 11, 'adopting 11 frozen items creates exactly 11 local revisions');

  SELECT count(*) INTO item_count FROM public.siem_rule_events
    WHERE action='imported' AND binding_id IN
      (SELECT binding_id FROM public.siem_sync_items WHERE run_id=import_run.id AND status='imported');
  PERFORM pg_temp.assert_true(item_count = 11, 'adopting 11 frozen items creates exactly 11 imported events');

  SELECT count(*) INTO item_count FROM public.deployment_history
    WHERE detection_id IN (SELECT detection_id FROM public.siem_sync_items WHERE run_id=import_run.id AND status='imported');
  PERFORM pg_temp.assert_true(item_count = 0, 'an import is an observation, not a deployment: zero deployment_history rows');

  PERFORM pg_temp.assert_true((SELECT d.status='Draft' AND d.review_status='none' AND d."testedAndValidated"=false
      AND d.library_type='production' AND d."queryLanguage"='CQL'
      FROM public.detections d JOIN public.siem_sync_items i ON i.detection_id=d.id
      WHERE i.run_id=import_run.id AND i.vendor_rule_id='adopt-rule-1'),
    'adopted detections carry the lifecycle defaults');

  PERFORM pg_temp.assert_true(
    (SELECT status='changed_since_preview' AND detection_id IS NULL AND binding_id IS NULL
       FROM public.siem_sync_items WHERE run_id=import_run.id AND vendor_rule_id='adopt-rule-12'),
    'a hash that drifted since submission adopts nothing and is marked changed_since_preview');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.siem_rule_bindings
      WHERE integration_id=integration AND provider_scope=scope AND vendor_rule_id='adopt-rule-12'),
    'a drifted item creates no binding');

  -- === Committing the same chunk twice creates no duplicate detection ===
  UPDATE public.siem_sync_items SET status='pending' WHERE run_id=import_run.id AND vendor_rule_id='adopt-rule-1';
  UPDATE public.siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds' WHERE id=import_run.id RETURNING * INTO r;

  SELECT jsonb_build_array(jsonb_build_object('id','adopt-rule-1','content',s.content,'raw',s.raw_payload,
      'adapter','test-v1','hash',i.frozen_content_hash,'raw_hash',s.raw_hash))
    INTO results
    FROM public.siem_sync_items i
    JOIN public.siem_remote_rules rr ON rr.integration_id=integration AND rr.provider_scope=scope AND rr.vendor_rule_id=i.vendor_rule_id
    JOIN public.siem_remote_rule_snapshots s ON s.id=rr.latest_snapshot_id
   WHERE i.run_id=import_run.id AND i.vendor_rule_id='adopt-rule-1';
  PERFORM public.siem_commit_import_chunk(r.id, r.lease_token, results);

  PERFORM pg_temp.assert_true(
    (SELECT status='linked' FROM public.siem_sync_items WHERE run_id=import_run.id AND vendor_rule_id='adopt-rule-1'),
    're-committing an already-adopted rule links to the existing binding rather than duplicating');
  SELECT count(DISTINCT detection_id) INTO item_count FROM public.siem_sync_items
    WHERE run_id=import_run.id AND status IN ('imported','linked');
  PERFORM pg_temp.assert_true(item_count = 11, 'replaying a committed chunk creates no additional detection');

  -- === Cancellation stops unclaimed work only ===
  cancel_run := public.siem_start_import(actor, integration, inventory_run.id,
    ARRAY['adopt-rule-13','adopt-rule-14','adopt-rule-15'], '{}', false, 'idem-adopt-cancel');
  SELECT jsonb_build_array(jsonb_build_object('id','adopt-rule-13','content',s.content,'raw',s.raw_payload,
      'adapter','test-v1','hash',i.frozen_content_hash,'raw_hash',s.raw_hash))
    INTO results
    FROM public.siem_sync_items i
    JOIN public.siem_remote_rules rr ON rr.integration_id=integration AND rr.provider_scope=scope AND rr.vendor_rule_id=i.vendor_rule_id
    JOIN public.siem_remote_rule_snapshots s ON s.id=rr.latest_snapshot_id
   WHERE i.run_id=cancel_run.id AND i.vendor_rule_id='adopt-rule-13';
  UPDATE public.siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds' WHERE id=cancel_run.id RETURNING * INTO r;
  PERFORM public.siem_commit_import_chunk(r.id, r.lease_token, results);

  PERFORM public.siem_cancel_import(actor, cancel_run.id);
  PERFORM pg_temp.assert_true(
    (SELECT status='imported' FROM public.siem_sync_items WHERE run_id=cancel_run.id AND vendor_rule_id='adopt-rule-13'),
    'cancellation leaves an already-adopted item untouched');
  PERFORM pg_temp.assert_true(
    (SELECT bool_and(status='cancelled') FROM public.siem_sync_items
       WHERE run_id=cancel_run.id AND vendor_rule_id IN ('adopt-rule-14','adopt-rule-15')),
    'cancellation marks unclaimed pending items cancelled');
  PERFORM pg_temp.assert_true(
    (SELECT status='cancelled' AND lease_token IS NULL FROM public.siem_sync_runs WHERE id=cancel_run.id),
    'cancellation marks the run cancelled and clears the lease');

  -- === Retry resets only 'failed' items, never 'changed_since_preview' ===
  BEGIN
    PERFORM public.siem_retry_import(actor, import_run.id);
    RAISE EXCEPTION 'retry against a run with only changed_since_preview items was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.assert_true(SQLERRM = 'No failed rules to retry',
      'retry leaves changed_since_preview alone: nothing failed, so retry refuses with product copy');
  END;

  retry_run := public.siem_start_import(actor, integration, inventory_run.id,
    ARRAY['adopt-rule-16','adopt-rule-17'], '{}', false, 'idem-adopt-retry');
  UPDATE public.siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds' WHERE id=retry_run.id RETURNING * INTO r;
  PERFORM public.siem_commit_import_chunk(r.id, r.lease_token,
    '[{"id":"adopt-rule-16","error":"CrowdStrike request failed (500); retry the sync after checking access"}]'::jsonb);
  PERFORM pg_temp.assert_true(
    (SELECT status='failed' FROM public.siem_sync_items WHERE run_id=retry_run.id AND vendor_rule_id='adopt-rule-16'),
    'sanity: rule-16 recorded as failed');
  PERFORM pg_temp.assert_true(
    (SELECT status='pending' FROM public.siem_sync_items WHERE run_id=retry_run.id AND vendor_rule_id='adopt-rule-17'),
    'sanity: rule-17 still pending (chunk only covered rule-16)');

  r := public.siem_retry_import(actor, retry_run.id);
  PERFORM pg_temp.assert_true(r.status = 'queued', 'retry requeues the run');
  PERFORM pg_temp.assert_true(
    (SELECT status='pending' AND error_message IS NULL FROM public.siem_sync_items
       WHERE run_id=retry_run.id AND vendor_rule_id='adopt-rule-16'),
    'retry resets the failed item to pending and clears its error');

  BEGIN
    PERFORM public.siem_retry_import(actor, retry_run.id);
    RAISE EXCEPTION 'retry with nothing failed was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.assert_true(SQLERRM = 'No failed rules to retry',
      'retry with no failed items refuses with product copy');
  END;
END $$;

-- Deleting a library copy frees the remote identity for re-import; archiving one suppresses
-- it from adoption instead, and a subsequent import attempt records why.
INSERT INTO auth.users(id,email) VALUES
  ('17000000-0000-0000-0000-000000000001','import-retention-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('17000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('18000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001',
   'Falcon retention fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '18000000-0000-0000-0000-000000000001';
  actor uuid := '17000000-0000-0000-0000-000000000001';
  scope text := 'scope-retention-1';
  inventory_run public.siem_sync_runs; import_run public.siem_sync_runs; r public.siem_sync_runs;
  did text := 'import-retention-detection-1'; qid text := 'import-retention-query-1'; b uuid;
  did2 text := 'import-retention-detection-2'; qid2 text := 'import-retention-query-2'; b2 uuid;
  rule_id uuid; snap_id uuid;
BEGIN
  -- Two catalog rows, each with a hydrated snapshot, each bound to its own library copy.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'rule-1','Retention rule 1',true,'present') RETURNING id INTO rule_id;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_id,'test-v1','hash-r1','raw-r1','{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;

  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'rule-2','Retention rule 2',true,'present') RETURNING id INTO rule_id;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_id,'test-v1','hash-r2','raw-r2','{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;

  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES(did,actor,1,'Retention fixture rule 1','Imported','Draft','Detection','High','','',false,'CQL',
    '#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query','#event_simpleName=ProcessRollup2',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','crowdstrike');
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content)
    VALUES(did,integration,'crowdstrike',scope,'rule-1',qid,'CQL','{}'::jsonb) RETURNING id INTO b;

  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES(did2,actor,1,'Retention fixture rule 2','Imported','Draft','Detection','High','','',false,'CQL',
    '#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(jsonb_build_object('id',qid2,'language','CQL','query','#event_simpleName=ProcessRollup2',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','crowdstrike');
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content)
    VALUES(did2,integration,'crowdstrike',scope,'rule-2',qid2,'CQL','{}'::jsonb) RETURNING id INTO b2;

  inventory_run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='complete', discovery_complete=true, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=inventory_run.id RETURNING * INTO inventory_run;

  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows
      WHERE integration_id=integration AND vendor_rule_id='rule-1') = 'already_in_library',
    'sanity: rule-1 starts already in library');

  -- Deleting the library copy frees the remote identity for a fresh import.
  DELETE FROM public.siem_rule_bindings WHERE id = b;
  DELETE FROM public.detections WHERE id = did;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows
      WHERE integration_id=integration AND vendor_rule_id='rule-1') = 'not_in_library',
    'a deleted library copy makes the remote rule importable again');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rules
      WHERE integration_id=integration AND vendor_rule_id='rule-1') = 1,
    'deleting the library copy does not delete the observation');

  -- Archiving the library copy tombstones the binding instead of deleting it.
  UPDATE public.detections SET status='Archived' WHERE id = did2;
  PERFORM pg_temp.assert_true(
    (SELECT binding_status FROM public.siem_rule_bindings WHERE id = b2) = 'tombstone',
    'sanity: archiving the detection tombstones its active binding');
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows
      WHERE integration_id=integration AND vendor_rule_id='rule-2') = 'archived_in_library',
    'an archived library copy reports as archived, not importable');

  import_run := public.siem_start_import(actor, integration, inventory_run.id,
    ARRAY['rule-2'], '{}', false, 'idem-retention-archive-1');
  PERFORM pg_temp.assert_true(
    (SELECT status='skipped' AND error_message='Archived in library' FROM public.siem_sync_items
       WHERE run_id=import_run.id AND vendor_rule_id='rule-2'),
    'importing an archived rule freezes it as skipped with the archived-in-library reason');

  -- Retire the run so no later block in this file trips over it.
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=import_run.id;
END $$;

-- siem_prune_remote_snapshots' safety contract: the current snapshot always survives (by
-- identity, not recency), a pending import blocks pruning for that rule, the keep floor is
-- enforced, and binding snapshots (siem_rule_snapshots) are never touched.
INSERT INTO auth.users(id,email) VALUES
  ('19000000-0000-0000-0000-000000000001','import-prune-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('19000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('19100000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001',
   'Falcon prune fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '19100000-0000-0000-0000-000000000001';
  actor uuid := '19000000-0000-0000-0000-000000000001';
  scope text := 'scope-prune-1';
  rule_a uuid; rule_b uuid; snap_id uuid; keep_snap uuid; run public.siem_sync_runs;
  before_count integer; after_count integer; removed integer; failed boolean := false;
BEGIN
  -- Rule A: 8 snapshots at distinct observed_at, latest pinned to one that is NOT the newest,
  -- so survival proves identity-based exclusion rather than a recency shortcut.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'prune-rule-a','Prune rule A',true,'present') RETURNING id INTO rule_a;
  FOR i IN 1..8 LOOP
    INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,
      raw_payload,observed_at)
      VALUES(rule_a,'test-v1','hash-a-'||i,'raw-a-'||i,'{}'::jsonb,'{}'::jsonb,now() - (i || ' days')::interval)
      RETURNING id INTO snap_id;
    IF i = 3 THEN keep_snap := snap_id; END IF;
  END LOOP;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=keep_snap WHERE id=rule_a;

  -- Rule B: same surplus, but a pending import item references it, so pruning must skip it entirely.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'prune-rule-b','Prune rule B',true,'present') RETURNING id INTO rule_b;
  FOR i IN 1..8 LOOP
    INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,
      raw_payload,observed_at)
      VALUES(rule_b,'test-v1','hash-b-'||i,'raw-b-'||i,'{}'::jsonb,'{}'::jsonb,now() - (i || ' days')::interval)
      RETURNING id INTO snap_id;
  END LOOP;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_b;

  run := public.siem_start_inventory(actor, integration, scope);
  INSERT INTO public.siem_sync_items(run_id,vendor_rule_id,status,remote_rule_id)
    VALUES(run.id,'prune-rule-b','pending',rule_b);

  SELECT count(*) INTO before_count FROM public.siem_rule_snapshots;

  removed := public.siem_prune_remote_snapshots(integration, 2);

  PERFORM pg_temp.assert_true(removed = 5,
    'pruning rule A to keep 2 surplus snapshots (8 total, 1 excluded as latest, 5 over the keep floor) removes exactly 5');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rule_snapshots WHERE id = keep_snap) = 1,
    'the snapshot the catalog points at survives even though it is not the newest by observed_at');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rule_snapshots WHERE remote_rule_id = rule_b) = 8,
    'a rule with a pending import item is left untouched entirely');

  SELECT count(*) INTO after_count FROM public.siem_rule_snapshots;
  PERFORM pg_temp.assert_true(before_count = after_count,
    'pruning remote catalog snapshots never deletes a binding snapshot (siem_rule_snapshots)');

  BEGIN
    PERFORM public.siem_prune_remote_snapshots(integration, 0);
  EXCEPTION WHEN OTHERS THEN
    failed := true;
    PERFORM pg_temp.assert_true(SQLERRM = 'Keep at least one observation per rule',
      'a keep of zero is refused with product copy');
  END;
  PERFORM pg_temp.assert_true(failed, 'a keep floor below 1 raises rather than pruning everything');

  -- Retire the inventory run so no later block trips over it.
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=run.id;
END $$;

-- Task 12: siem_match_candidates / siem_link_existing resolve a match_needed catalog row
-- without rewriting the target detection's own identity.
INSERT INTO auth.users(id,email) VALUES
  ('20000000-0000-0000-0000-000000000001','match-resolution-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('20000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('20100000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
   'Falcon match-resolution fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials'),
  ('20100000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',
   'Falcon other connection fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE actor uuid := '20000000-0000-0000-0000-000000000001';
  integration uuid := '20100000-0000-0000-0000-000000000001';
  other_integration uuid := '20100000-0000-0000-0000-000000000002';
  rule_a uuid; rule_b uuid; rule_c uuid; snap_a uuid; snap_b uuid; snap_c uuid;
  candidate_ids text[]; binding_a public.siem_rule_bindings; binding_b public.siem_rule_bindings;
  events_count integer; queries_after jsonb; src_after text; user_after uuid; failed boolean := false;
  inventory_run public.siem_sync_runs; import_run public.siem_sync_runs;
  relationship_before text; relationship_after text; item_status text;
BEGIN
  -- Detection A: a GitHub-sourced production rule with two CQL queries, adoptable via its
  -- legacy external_id (no deployment_history row -- exercises the fallback evidence path).
  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source,external_id)
  VALUES('link-detection-a',actor,1,'Match resolution rule A','Existing library rule','Draft','Detection','High',
    '','',false,'CQL','#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(
      jsonb_build_object('id','qa1','language','CQL','query','#event_simpleName=ProcessRollup2',
        'isPrimary',true,'createdDate',now(),'updatedDate',now()),
      jsonb_build_object('id','qa2','language','CQL','query','#event_simpleName=NetworkConnectIP4',
        'isPrimary',false,'createdDate',now(),'updatedDate',now())),
    'production','none','none','github','link-rule-1');

  -- Detection B: a second production rule whose only query differs from the observed remote
  -- query text, to exercise the "baseline not established" path.
  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source,external_id)
  VALUES('link-detection-b',actor,1,'Match resolution rule B','Existing library rule','Draft','Detection','High',
    '','',false,'CQL','local query text',now(),
    jsonb_build_array(jsonb_build_object('id','qb1','language','CQL','query','local query text',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','custom','link-rule-2');

  -- Detection C: coincidentally named like a plausible match, but its only evidence is a
  -- deployment_history row against a DIFFERENT connection -- must never be offered here.
  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES('link-detection-c',actor,1,'Match resolution rule A','Existing library rule','Draft','Detection','High',
    '','',false,'CQL','#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(jsonb_build_object('id','qc1','language','CQL','query','#event_simpleName=ProcessRollup2',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','custom');
  INSERT INTO public.deployment_history(user_id,integration_id,detection_id,action,status,vendor_rule_id)
    VALUES(actor,other_integration,'link-detection-c','create','success','link-rule-1');

  -- Catalog row + snapshot for link-rule-1: the query text matches detection A's qa1 exactly.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike','scope-link-1','link-rule-1','Match resolution rule A',true,'present')
    RETURNING id INTO rule_a;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_a,'test-v1','hash-link-a','raw-link-a',
      jsonb_build_object('name','Match resolution rule A','description','','query','#event_simpleName=ProcessRollup2',
        'language','CQL','severity','High','enabled',true,'config','{}'::jsonb),
      '{}'::jsonb)
    RETURNING id INTO snap_a;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_a WHERE id=rule_a;

  -- Catalog row + snapshot for link-rule-2: the query text differs from detection B's qb1.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike','scope-link-1','link-rule-2','Match resolution rule B',true,'present')
    RETURNING id INTO rule_b;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_b,'test-v1','hash-link-b','raw-link-b',
      jsonb_build_object('name','Match resolution rule B','description','','query','remote query text differs',
        'language','CQL','severity','High','enabled',true,'config','{}'::jsonb),
      '{}'::jsonb)
    RETURNING id INTO snap_b;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_b WHERE id=rule_b;

  -- siem_match_candidates: detection A is offered on its legacy external_id; detection C,
  -- whose only evidence belongs to a different connection, is never returned.
  SELECT array_agg(detection_id) INTO candidate_ids FROM public.siem_match_candidates(actor,integration,'link-rule-1');
  PERFORM pg_temp.assert_true('link-detection-a' = ANY(candidate_ids),
    'the legacy external_id match is offered as a candidate');
  PERFORM pg_temp.assert_true(NOT ('link-detection-c' = ANY(coalesce(candidate_ids,'{}'::text[]))),
    'a name-alike detection whose only evidence is against another connection is never returned');

  -- siem_link_existing: link detection A's qa1 query to link-rule-1.
  SELECT * INTO binding_a FROM public.siem_link_existing(actor,integration,'link-rule-1','link-detection-a','qa1',1,snap_a);
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_rule_bindings WHERE integration_id=integration AND vendor_rule_id='link-rule-1') = 1,
    'linking creates exactly one binding');
  PERFORM pg_temp.assert_true(binding_a.selected_query_id = 'qa1', 'the binding is pinned to the explicit query id');
  PERFORM pg_temp.assert_true(binding_a.baseline_snapshot_id IS NOT NULL,
    'a matching local and remote query establishes a baseline');

  SELECT source, user_id INTO src_after, user_after FROM public.detections WHERE id='link-detection-a';
  PERFORM pg_temp.assert_true(src_after = 'github', 'linking never rewrites the detection''s source');
  PERFORM pg_temp.assert_true(user_after = actor, 'linking never rewrites the detection''s user_id');
  PERFORM pg_temp.assert_true(
    (SELECT external_id = 'link-rule-1' AND native_provenance IS NULL FROM public.detections WHERE id='link-detection-a'),
    'linking never rewrites external_id or native_provenance');

  SELECT queries INTO queries_after FROM public.detections WHERE id='link-detection-a';
  PERFORM pg_temp.assert_true(jsonb_array_length(queries_after) = 2, 'no query was added or removed');
  PERFORM pg_temp.assert_true(
    (SELECT q->>'query' FROM jsonb_array_elements(queries_after) q WHERE q->>'id'='qa1')
      = '#event_simpleName=ProcessRollup2',
    'linking leaves the bound query''s text exactly unchanged');
  PERFORM pg_temp.assert_true(
    (SELECT q->>'query' FROM jsonb_array_elements(queries_after) q WHERE q->>'id'='qa2')
      = '#event_simpleName=NetworkConnectIP4',
    'linking leaves the OTHER (unselected) query''s text exactly unchanged too');

  SELECT count(*) INTO events_count FROM public.siem_rule_events
    WHERE binding_id=binding_a.id AND action='linked_existing';
  PERFORM pg_temp.assert_true(events_count = 1, 'linking records exactly one linked_existing event');

  -- A second, concurrent link attempt for the same identity is rejected, not silently duplicated.
  BEGIN
    PERFORM public.siem_link_existing(actor,integration,'link-rule-1','link-detection-a','qa1',1,snap_a);
    failed := false;
  EXCEPTION WHEN OTHERS THEN
    failed := true;
    PERFORM pg_temp.assert_true(SQLERRM = 'This rule is already linked to a library rule.',
      'a concurrent second link names the conflict rather than raising a raw constraint error');
  END;
  PERFORM pg_temp.assert_true(failed, 'a second concurrent link for the same identity is rejected');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_rule_bindings WHERE integration_id=integration AND vendor_rule_id='link-rule-1') = 1,
    'the rejected concurrent attempt did not create a second binding');

  -- siem_link_existing: link detection B, whose query text differs from the observed remote query.
  SELECT * INTO binding_b FROM public.siem_link_existing(actor,integration,'link-rule-2','link-detection-b','qb1',1,snap_b);
  PERFORM pg_temp.assert_true(binding_b.baseline_snapshot_id IS NULL,
    'a local/remote query mismatch at first link leaves baseline_snapshot_id NULL rather than inventing one');
  PERFORM pg_temp.assert_true(binding_b.latest_remote_snapshot_id IS NOT NULL,
    'the observed remote snapshot is still recorded even without a baseline');

  -- siem_dismiss_match_candidates + siem_start_import: "Import as a separate rule" must be a
  -- live path, not a dead one. link-rule-3 simulates a match_needed catalog row (a candidate
  -- count with no binding). Before dismissal the ordinary import path freezes it 'skipped'
  -- ('Match needed'); after dismissal it must read as not_in_library and freeze 'pending'.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability,match_candidate_count)
    VALUES(integration,'crowdstrike','scope-link-1','link-rule-3','Match resolution rule C',true,'present',1)
    RETURNING id INTO rule_c;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_c,'test-v1','hash-link-c','raw-link-c',
      jsonb_build_object('name','Match resolution rule C','description','','query','#event_simpleName=DnsRequest',
        'language','CQL','severity','High','enabled',true,'config','{}'::jsonb),
      '{}'::jsonb)
    RETURNING id INTO snap_c;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_c WHERE id=rule_c;

  SELECT relationship INTO relationship_before FROM public.siem_inventory_rows
    WHERE integration_id=integration AND vendor_rule_id='link-rule-3';
  PERFORM pg_temp.assert_true(relationship_before = 'match_needed',
    'sanity: the fixture starts as match_needed, the state this whole task exists to resolve');

  inventory_run := public.siem_start_inventory(actor, integration, 'scope-link-1');
  UPDATE public.siem_sync_runs SET status='complete', discovery_complete=true, completed_at=now(),
    lease_token=NULL, lease_expires_at=NULL WHERE id=inventory_run.id RETURNING * INTO inventory_run;

  -- Requesting only this one match_needed id freezes zero pending items, and siem_start_import
  -- completes the run instantly with the no-eligible-rules message -- this is the dead path
  -- the fix addresses: none of the three dialog choices should silently do nothing.
  import_run := public.siem_start_import(actor, integration, inventory_run.id,
    ARRAY['link-rule-3'], '{}', false, 'idem-dismiss-before-1');
  PERFORM pg_temp.assert_true(import_run.status = 'complete'
      AND import_run.error_message = 'None of the selected rules can be imported right now',
    'before dismissal, importing only a match_needed rule completes with nothing frozen');
  SELECT status INTO item_status FROM public.siem_sync_items
    WHERE run_id=import_run.id AND vendor_rule_id='link-rule-3';
  PERFORM pg_temp.assert_true(item_status = 'skipped',
    'before dismissal, the item itself freezes skipped with the Match needed reason');

  PERFORM public.siem_dismiss_match_candidates(actor, integration, 'link-rule-3');

  SELECT relationship INTO relationship_after FROM public.siem_inventory_rows
    WHERE integration_id=integration AND vendor_rule_id='link-rule-3';
  PERFORM pg_temp.assert_true(relationship_after = 'not_in_library',
    'dismissing candidates clears match_candidate_count, so the row reads as not_in_library');

  import_run := public.siem_start_import(actor, integration, inventory_run.id,
    ARRAY['link-rule-3'], '{}', false, 'idem-dismiss-after-1');
  SELECT status INTO item_status FROM public.siem_sync_items
    WHERE run_id=import_run.id AND vendor_rule_id='link-rule-3';
  PERFORM pg_temp.assert_true(item_status = 'pending',
    'after dismissal, siem_start_import freezes the same rule as pending -- the "Import as a separate rule" path is live');
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=import_run.id;

  -- Dismissing a rule that is already bound is refused, not silently accepted.
  BEGIN
    PERFORM public.siem_dismiss_match_candidates(actor, integration, 'link-rule-1');
    failed := false;
  EXCEPTION WHEN OTHERS THEN
    failed := true;
    PERFORM pg_temp.assert_true(SQLERRM = 'This rule is already linked to a library rule.',
      'dismissing an already-linked rule names the conflict');
  END;
  PERFORM pg_temp.assert_true(failed, 'dismissing an already-bound rule is refused');

  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE id=inventory_run.id;
END $$;
ROLLBACK;
