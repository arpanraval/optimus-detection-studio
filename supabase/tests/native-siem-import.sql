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
END $$;
ROLLBACK;
