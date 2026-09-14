-- Run only against an isolated test database after schema.sql. All fixture writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES
  ('03000000-0000-0000-0000-000000000001','inventory-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('03000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('04000000-0000-0000-0000-000000000001','03000000-0000-0000-0000-000000000001',
   'Falcon inventory fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '04000000-0000-0000-0000-000000000001';
  actor uuid := '03000000-0000-0000-0000-000000000001'; rule uuid; detections_before bigint;
  did text := 'inv-fixture-detection-1'; qid text := 'inv-fixture-query-1'; binding uuid;
BEGIN
  SELECT count(*) INTO detections_before FROM public.detections;

  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike','scope-a','remote-1','Discovered rule',true,'present')
    RETURNING id INTO rule;

  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.detections) = detections_before,
    'recording a remote rule creates no library detection');
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id = rule) = 'not_in_library',
    'an unbound, normalisable rule is eligible for import');

  UPDATE public.siem_remote_rules SET normalization_error='Unsupported rule: no CQL query' WHERE id=rule;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'unsupported',
    'a rule that cannot be normalised is not offered for import');

  UPDATE public.siem_remote_rules SET normalization_error=NULL, match_candidate_count=2 WHERE id=rule;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'match_needed',
    'candidate library rules require explicit matching');
  UPDATE public.siem_remote_rules SET match_candidate_count=0 WHERE id=rule;

  -- The binding-status branches of siem_inventory_relationship, and their ordering against
  -- normalization_error / match_candidate_count, are the part of the CASE that matters.
  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES(did,actor,1,'Inventory fixture rule','Imported','Draft','Detection','High','','',false,'CQL',
    '#event_simpleName=ProcessRollup2',now(),
    jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query','#event_simpleName=ProcessRollup2',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),
    'production','none','none','crowdstrike');
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content)
    VALUES(did,integration,'crowdstrike','scope-a','remote-1',qid,'CQL','{}'::jsonb)
    RETURNING id INTO binding;

  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'already_in_library',
    'an actively bound rule is already in the library');

  UPDATE public.siem_remote_rules SET normalization_error='Unsupported rule: no CQL query' WHERE id=rule;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'already_in_library',
    'binding status wins over a later normalisation error: an adopted rule stays already_in_library');

  UPDATE public.siem_rule_bindings SET binding_status='tombstone' WHERE id=binding;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'archived_in_library',
    'a tombstoned binding reads as archived_in_library');

  UPDATE public.siem_remote_rules SET normalization_error=NULL, match_candidate_count=2 WHERE id=rule;
  PERFORM pg_temp.assert_true(
    (SELECT relationship FROM public.siem_inventory_rows WHERE id=rule) = 'archived_in_library',
    'an archived rule is not re-offered as a match even with match candidates present');

  UPDATE public.siem_remote_rules SET normalization_error=NULL, match_candidate_count=0 WHERE id=rule;

  -- The backfill must leave an already-adopted rule visible and correctly classified.
  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.siem_rule_bindings b
                 WHERE NOT EXISTS (SELECT 1 FROM public.siem_remote_rules r
                                    WHERE r.integration_id = b.integration_id
                                      AND r.provider_scope = b.provider_scope
                                      AND r.vendor_rule_id = b.vendor_rule_id)),
    'every existing binding has a catalog identity after backfill');

  -- Identity is per connection and scope, never the rule name.
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rules WHERE vendor_rule_id='remote-1') = 1,
    'one catalog row per remote identity');
  BEGIN
    INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id)
      VALUES(integration,'crowdstrike','scope-a','remote-1');
    RAISE EXCEPTION 'duplicate remote identity was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name)
    VALUES(integration,'crowdstrike','scope-b','remote-1','Same id, other scope');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rules WHERE vendor_rule_id='remote-1') = 2,
    'the same vendor id in another scope is a distinct rule');

  -- An inventory job and an import job may be active at the same time.
  INSERT INTO public.siem_sync_runs(integration_id,actor_id,provider_scope,kind,status)
    VALUES(integration,actor,'scope-a','inventory','running');
  INSERT INTO public.siem_sync_runs(integration_id,actor_id,provider_scope,kind,status)
    VALUES(integration,actor,'scope-a','import_selection','running');
  BEGIN
    INSERT INTO public.siem_sync_runs(integration_id,actor_id,provider_scope,kind,status)
      VALUES(integration,actor,'scope-a','inventory','queued');
    RAISE EXCEPTION 'a second active inventory job was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- A full inventory run (discovery + hydration, one normalisable rule, one unsupported rule)
-- must create zero library rows and never infer absence from a partial scan.
INSERT INTO auth.users(id,email) VALUES
  ('05000000-0000-0000-0000-000000000001','inventory-worker-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('05000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('06000000-0000-0000-0000-000000000001','05000000-0000-0000-0000-000000000001',
   'Falcon inventory worker fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '06000000-0000-0000-0000-000000000001';
  actor uuid := '05000000-0000-0000-0000-000000000001';
  r public.siem_sync_runs; content jsonb; results jsonb; rule_ok uuid; rule_bad uuid;
  detections_before bigint; bindings_before bigint; revisions_before bigint;
BEGIN
  -- Other fixtures in this file leave 'running' runs behind with no lease; clear them so
  -- siem_claim_sync() below claims the run this block starts, not an older dangling one.
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE status IN ('queued','running');

  SELECT count(*) INTO detections_before FROM public.detections;
  SELECT count(*) INTO bindings_before FROM public.siem_rule_bindings;
  SELECT count(*) INTO revisions_before FROM public.siem_local_revisions;

  -- A rule already in the catalog from an earlier scope-c scan, but absent from this run's
  -- discovery. Proves the missing-inference still fires despite the unsupported item below
  -- and the resulting 'partial' status.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike','scope-c','remote-inv-stale','Stale rule',true,'present');

  r := public.siem_start_inventory(actor, integration, 'scope-c');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, ARRAY['remote-inv-1','remote-inv-2'], 2, true, '[]');

  content := '{"name":"Inventory rule ok","description":"","query":"#event_simpleName=ProcessRollup2","language":"CQL","severity":"High","enabled":true,"config":{"search":{"outcome":"detection","lookback":"1h0m"},"operation":{"schedule":{"definition":"@every 1h0m"}}}}';
  results := jsonb_build_array(
    jsonb_build_object('id','remote-inv-1','name','Inventory rule ok','content',content,'raw','{}'::jsonb,
      'adapter','test-v1','hash','h1','raw_hash','r1','enabled',true,'family','correlation'),
    jsonb_build_object('id','remote-inv-2','name','Inventory rule bad','family','correlation',
      'error','Unsupported rule: no CQL query'));

  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, '{}', 2, true, results);

  PERFORM pg_temp.assert_true((SELECT count(*) FROM public.detections) = detections_before,
    'an inventory run creates no library detection');
  PERFORM pg_temp.assert_true((SELECT count(*) FROM public.siem_rule_bindings) = bindings_before,
    'an inventory run creates no binding');
  PERFORM pg_temp.assert_true((SELECT count(*) FROM public.siem_local_revisions) = revisions_before,
    'an inventory run creates no local revision');

  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_remote_rules WHERE integration_id=integration AND provider_scope='scope-c'
       AND vendor_rule_id IN ('remote-inv-1','remote-inv-2')) = 2,
    'two catalog rows exist for this connection and scope');

  SELECT id INTO rule_ok FROM public.siem_remote_rules
    WHERE integration_id=integration AND provider_scope='scope-c' AND vendor_rule_id='remote-inv-1';
  SELECT id INTO rule_bad FROM public.siem_remote_rules
    WHERE integration_id=integration AND provider_scope='scope-c' AND vendor_rule_id='remote-inv-2';

  PERFORM pg_temp.assert_true(
    (SELECT status FROM public.siem_sync_items WHERE run_id=r.id AND vendor_rule_id='remote-inv-1') = 'observed',
    'a normalisable rule is recorded as observed, distinct from an import outcome');
  PERFORM pg_temp.assert_true(
    (SELECT status='unsupported' AND error_message='Unsupported rule: no CQL query' FROM public.siem_sync_items
       WHERE run_id=r.id AND vendor_rule_id='remote-inv-2'),
    'an unsupported rule is recorded with its error message instead of failing the job');

  PERFORM pg_temp.assert_true(
    (SELECT display_name FROM public.siem_remote_rules WHERE id=rule_bad) = 'Inventory rule bad',
    'an unsupported rule keeps its display name, not its vendor id, so it stays identifiable in the UI');

  PERFORM pg_temp.assert_true(
    (SELECT latest_snapshot_id IS NOT NULL FROM public.siem_remote_rules WHERE id=rule_ok),
    'a normalisable rule has a stored snapshot');
  PERFORM pg_temp.assert_true(
    (SELECT latest_snapshot_id IS NULL FROM public.siem_remote_rules WHERE id=rule_bad),
    'an unsupported rule has no snapshot');

  PERFORM pg_temp.assert_true((SELECT status='partial' FROM public.siem_sync_runs WHERE id=r.id),
    'a run with an unsupported item completes as partial, not complete');

  -- Status and absence-inference are separate: a partial scan (one unsupported item) CAN
  -- still infer absence for a rule it never even saw in discovery.
  PERFORM pg_temp.assert_true(
    (SELECT availability='missing' FROM public.siem_remote_rules
       WHERE integration_id=integration AND provider_scope='scope-c' AND vendor_rule_id='remote-inv-stale'),
    'a rule absent from a completed discovery is inferred missing even though the run is only partial');
  PERFORM pg_temp.assert_true(
    (SELECT availability<>'missing' FROM public.siem_remote_rules WHERE id=rule_bad),
    'a rule that was read but could not be normalised is never treated as absent');
END $$;

-- A run containing a 'failed' item (a definite non-answer, unlike 'unsupported') must mark
-- nothing missing at all, even for rules never seen in this run's discovery -- a failed read
-- means the scan cannot be trusted to have proven anything absent. Separate connection/scope
-- from the block above so the two cannot interfere.
INSERT INTO auth.users(id,email) VALUES
  ('07000000-0000-0000-0000-000000000001','inventory-worker-failed-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('07000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('08000000-0000-0000-0000-000000000001','07000000-0000-0000-0000-000000000001',
   'Falcon inventory worker failed-read fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '08000000-0000-0000-0000-000000000001';
  actor uuid := '07000000-0000-0000-0000-000000000001';
  r public.siem_sync_runs;
BEGIN
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE status IN ('queued','running');

  -- A catalog rule from an earlier scan of this same scope, absent from this run's discovery.
  -- If the failed item below did not block inference, this would be wrongly marked missing.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike','scope-d','remote-inv-stale-2','Stale rule two',true,'present');

  r := public.siem_start_inventory(actor, integration, 'scope-d');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, ARRAY['remote-inv-4'], 1, true, '[]');

  -- Simulate an item that a worker gave up on (e.g. after repeated lease-expiry retries): a
  -- 'failed' status, not the 'unsupported' this migration's own commit RPC produces for an
  -- error-carrying result. Nothing in this task's worker code sets 'failed' on a
  -- siem_sync_items row; this directly exercises the terminal block's own guard.
  UPDATE public.siem_sync_items SET status='failed', error_message='fixture: forced failed read'
    WHERE run_id=r.id AND vendor_rule_id='remote-inv-4';

  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, '{}', 1, true, '[]');

  PERFORM pg_temp.assert_true((SELECT status='partial' FROM public.siem_sync_runs WHERE id=r.id),
    'a run with a failed item completes as partial');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FILTER (WHERE availability='missing') = 0 FROM public.siem_remote_rules
       WHERE integration_id=integration AND provider_scope='scope-d'),
    'a run with a failed item marks nothing missing, including rules it never even discovered');
END $$;

-- The catalog is owner scoped. Another authenticated user sees nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '03000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.siem_inventory_rows) <> 0 THEN
    RAISE EXCEPTION 'Assertion failed: another user can read this connection''s inventory';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
