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

  -- A prior good read of the rule this run will fail to hydrate. The catalog upsert must
  -- preserve this display name and NULL normalization_error rather than overwrite them with
  -- the transient failure's bare vendor id / lack of an error.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability,normalization_error)
    VALUES(integration,'crowdstrike','scope-d','remote-inv-4','Known-good rule four',true,'present',NULL);

  r := public.siem_start_inventory(actor, integration, 'scope-d');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, ARRAY['remote-inv-4'], 1, true, '[]');

  -- The real path: the worker hints 'status':'failed' for a rule CrowdStrike did not return
  -- in the detail batch (an unreadable-this-time outcome), distinct from an item carrying
  -- only 'error' with no status hint, which lands as 'unsupported' (a permanent property of
  -- the rule). The allowlisted CASE in siem_commit_inventory_chunk must honour this hint.
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, '{}', 1, true,
    jsonb_build_array(jsonb_build_object('id','remote-inv-4','status','failed',
      'error','Rule detail was omitted; no deletion inferred')));

  PERFORM pg_temp.assert_true(
    (SELECT status FROM public.siem_sync_items WHERE run_id=r.id AND vendor_rule_id='remote-inv-4') = 'failed',
    'a worker-hinted failed read lands as failed, not unsupported');
  PERFORM pg_temp.assert_true((SELECT status='partial' FROM public.siem_sync_runs WHERE id=r.id),
    'a run with a failed item completes as partial');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FILTER (WHERE availability='missing') = 0 FROM public.siem_remote_rules
       WHERE integration_id=integration AND provider_scope='scope-d'),
    'a run with a failed item marks nothing missing, including rules it never even discovered');

  -- I1: the catalog upsert must not collapse a transient 'failed' read into the permanent
  -- 'unsupported' classification the display layer keys off normalization_error IS NOT NULL.
  PERFORM pg_temp.assert_true(
    (SELECT normalization_error IS NULL FROM public.siem_remote_rules
       WHERE integration_id=integration AND provider_scope='scope-d' AND vendor_rule_id='remote-inv-4'),
    'a failed read leaves normalization_error unchanged (NULL), not set from the transient error');
  PERFORM pg_temp.assert_true(
    (SELECT relationship <> 'unsupported' FROM public.siem_inventory_rows
       WHERE integration_id=integration AND provider_scope='scope-d' AND vendor_rule_id='remote-inv-4'),
    'a failed read does not classify the rule as unsupported');
  PERFORM pg_temp.assert_true(
    (SELECT display_name = 'Known-good rule four' FROM public.siem_remote_rules
       WHERE integration_id=integration AND provider_scope='scope-d' AND vendor_rule_id='remote-inv-4'),
    'a failed read preserves the prior display name instead of falling back to the bare vendor id');
END $$;

-- A worker-supplied status hint is only ever trusted from an allowlist. This RPC runs as
-- service_role on worker-supplied JSON; a malformed hint like 'imported' (a legal
-- siem_sync_items status, but library-membership vocabulary that must never leak into an
-- inventory-only job) must never be written verbatim -- it must fall back through the
-- 'error' branch instead. Its own connection/scope, isolated from every other block.
INSERT INTO auth.users(id,email) VALUES
  ('09000000-0000-0000-0000-000000000001','inventory-worker-malformed-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('09000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('10000000-0000-0000-0000-000000000001','09000000-0000-0000-0000-000000000001',
   'Falcon inventory worker malformed-hint fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '10000000-0000-0000-0000-000000000001';
  actor uuid := '09000000-0000-0000-0000-000000000001';
  r public.siem_sync_runs;
BEGIN
  UPDATE public.siem_sync_runs SET status='cancelled', completed_at=now(), lease_token=NULL, lease_expires_at=NULL
    WHERE status IN ('queued','running');

  r := public.siem_start_inventory(actor, integration, 'scope-e');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, ARRAY['remote-inv-5'], 1, true, '[]');
  SELECT * INTO r FROM public.siem_claim_sync();
  PERFORM public.siem_commit_inventory_chunk(r.id, r.lease_token, '{}', 1, true,
    jsonb_build_array(jsonb_build_object('id','remote-inv-5','status','imported',
      'error','forced malformed status hint')));

  PERFORM pg_temp.assert_true(
    (SELECT status FROM public.siem_sync_items WHERE run_id=r.id AND vendor_rule_id='remote-inv-5') = 'unsupported',
    'a malformed status hint is rejected and never written verbatim; only failed/unsupported pass the allowlist');
END $$;


-- Hardening milestone 2: observation and reconciliation.
-- One observation feeds both projections; a read that failed says 'unknown' rather than repeating
-- a stale 'present'; absence is only claimed by the job that enumerates production; and a
-- read-only refresh never manufactures the agreed baseline that siem_link_existing withheld.
INSERT INTO auth.users(id,email) VALUES
  ('22000000-0000-0000-0000-000000000001','observation-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('22000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('23000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001',
   'Falcon observation fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '23000000-0000-0000-0000-000000000001';
  actor uuid := '22000000-0000-0000-0000-000000000001';
  scope text := 'scope-observe-1';
  run public.siem_sync_runs;
  did text := 'observe-detection-1'; qid text := 'observe-query-1'; binding uuid;
  gone_did text := 'observe-detection-2'; gone_qid text := 'observe-query-2'; gone_binding uuid;
  snap uuid; b public.siem_rule_bindings;
BEGIN
  -- Two tracked rules. 'observe-rule-1' is still in production; 'observe-rule-gone' is not.
  INSERT INTO public.detections(id,user_id,version,name,description,status,"detectionType",severity,
    "logSource",technology,"testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,
    library_type,promotion_status,review_status,source)
  VALUES(did,actor,1,'Observed rule','Tracked','Draft','Detection','High','','',false,'CQL','#event_simpleName=A',
    now(),jsonb_build_array(jsonb_build_object('id',qid,'language','CQL','query','#event_simpleName=A',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),'production','none','none','github'),
   (gone_did,actor,1,'Deleted rule','Tracked','Draft','Detection','High','','',false,'CQL','#event_simpleName=B',
    now(),jsonb_build_array(jsonb_build_object('id',gone_qid,'language','CQL','query','#event_simpleName=B',
      'isPrimary',true,'createdDate',now(),'updatedDate',now())),'production','none','none','github');

  -- A link created the way siem_link_existing creates one when the queries differ: no baseline.
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content,availability,observed_enabled)
    VALUES(did,integration,'crowdstrike',scope,'observe-rule-1',qid,'CQL','{}'::jsonb,'present',true)
    RETURNING id INTO binding;
  INSERT INTO public.siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,
    selected_query_id,query_language,desired_content,availability,observed_enabled)
    VALUES(gone_did,integration,'crowdstrike',scope,'observe-rule-gone',gone_qid,'CQL','{}'::jsonb,'present',true)
    RETURNING id INTO gone_binding;
  PERFORM pg_temp.assert_true(
    (SELECT baseline_snapshot_id IS NULL FROM public.siem_rule_bindings WHERE id=binding),
    'sanity: the linked binding starts with no agreed baseline');

  -- === A complete inventory scan that sees only observe-rule-1 ===
  run := public.siem_start_inventory(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='running', phase='discovery',
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '45 seconds'
    WHERE id=run.id RETURNING * INTO run;
  PERFORM public.siem_commit_inventory_chunk(run.id, run.lease_token,
    ARRAY['observe-rule-1'], 1, true, '[]'::jsonb);
  UPDATE public.siem_sync_runs SET status='running',
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '45 seconds'
    WHERE id=run.id RETURNING * INTO run;
  PERFORM public.siem_commit_inventory_chunk(run.id, run.lease_token, '{}', 1, true,
    jsonb_build_array(jsonb_build_object('id','observe-rule-1','name','Observed rule','enabled',false,
      'adapter','test-v1','hash','observe-hash-1','raw_hash','observe-raw-1',
      'content','{"query":"#event_simpleName=A"}'::jsonb,'raw','{}'::jsonb)));

  SELECT * INTO b FROM public.siem_rule_bindings WHERE id=binding;
  -- One observation, both projections: the binding now agrees with the catalog row.
  PERFORM pg_temp.assert_true(b.availability='present' AND b.observed_enabled=false AND b.last_seen_at IS NOT NULL,
    'an inventory observation reaches the tracked binding, not only the catalog');
  -- ...but it is an observation, not a reconciliation decision.
  PERFORM pg_temp.assert_true(b.baseline_snapshot_id IS NULL,
    'observing a rule never manufactures the agreed baseline siem_link_existing withheld');
  PERFORM pg_temp.assert_true(b.desired_content = '{}'::jsonb,
    'observation never overwrites the local desired content');

  -- Absence: the scan enumerated production completely and never saw observe-rule-gone.
  PERFORM pg_temp.assert_true(
    (SELECT availability='missing' FROM public.siem_rule_bindings WHERE id=gone_binding),
    'a complete, failure-free scan marks a tracked rule it never enumerated as missing');

  -- === The refresh_tracked path is where a baseline could be manufactured ===
  -- siem_start_refresh pre-queues an item per tracked binding and hydration runs through the
  -- legacy siem_commit_chunk, whose binding update used to coalesce a baseline in on every read.
  run := public.siem_start_refresh(actor, integration, scope);
  UPDATE public.siem_sync_runs SET status='running', phase='hydration', discovery_complete=true,
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '45 seconds'
    WHERE id=run.id RETURNING * INTO run;
  PERFORM public.siem_commit_chunk(run.id, run.lease_token, '{}', 1, true,
    jsonb_build_array(
      jsonb_build_object('id','observe-rule-1','adapter','test-v1','hash','refresh-hash-1',
        'raw_hash','refresh-raw-1','content','{"query":"#event_simpleName=A","enabled":true}'::jsonb,
        'raw','{}'::jsonb),
      jsonb_build_object('id','observe-rule-gone','status','failed',
        'error','CrowdStrike did not return this rule.')));

  SELECT * INTO b FROM public.siem_rule_bindings WHERE id=binding;
  PERFORM pg_temp.assert_true(b.baseline_snapshot_id IS NULL,
    'a read-only refresh never establishes the baseline a reconciliation decision owns');
  PERFORM pg_temp.assert_true(b.latest_remote_snapshot_id IS NOT NULL,
    'the refresh still records what it observed');

  -- A read that did not complete is not evidence of anything about production.
  PERFORM pg_temp.assert_true(
    (SELECT availability='unknown' FROM public.siem_rule_bindings WHERE id=gone_binding),
    'a failed detail read reports unknown rather than repeating a confident stale answer');

  RAISE NOTICE 'observation/baseline assertions passed';
END $$;

-- siem_reconcile_baseline is the explicit decision: it establishes the baseline and changes nothing else.
DO $$
DECLARE integration uuid := '23000000-0000-0000-0000-000000000001';
  actor uuid := '22000000-0000-0000-0000-000000000001';
  binding uuid; snap uuid; before_version integer; before_content jsonb;
BEGIN
  SELECT id INTO binding FROM public.siem_rule_bindings
   WHERE integration_id=integration AND vendor_rule_id='observe-rule-1';

  INSERT INTO public.siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(binding,'test-v1','reconcile-hash','reconcile-raw','{"query":"#event_simpleName=A"}'::jsonb,'{}'::jsonb)
    RETURNING id INTO snap;
  UPDATE public.siem_rule_bindings SET latest_remote_snapshot_id=snap, availability='present' WHERE id=binding;

  SELECT version INTO before_version FROM public.detections WHERE id='observe-detection-1';
  SELECT desired_content INTO before_content FROM public.siem_rule_bindings WHERE id=binding;

  PERFORM public.siem_reconcile_baseline(actor, binding, snap, before_version, 'reconcile-hash');

  PERFORM pg_temp.assert_true(
    (SELECT baseline_snapshot_id = snap FROM public.siem_rule_bindings WHERE id=binding),
    'reconciling establishes the agreed baseline at the reviewed production revision');
  PERFORM pg_temp.assert_true(
    (SELECT version = before_version FROM public.detections WHERE id='observe-detection-1'),
    'reconciling keeps the library version untouched -- it is not accept_remote');
  PERFORM pg_temp.assert_true(
    (SELECT desired_content = before_content FROM public.siem_rule_bindings WHERE id=binding),
    'reconciling does not rewrite the desired content');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.siem_rule_events
      WHERE binding_id=binding AND action='reconciled_baseline') = 1,
    'the decision is recorded as an auditable event');

  -- A stale review cannot slip a baseline in behind the user.
  BEGIN
    PERFORM public.siem_reconcile_baseline(actor, binding, snap, before_version + 5, 'reconcile-hash');
    RAISE EXCEPTION 'reconcile against a stale detection version was accepted';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.assert_true(SQLERRM = 'Review is stale',
      'reconcile refuses a stale review with the same guard as accept_remote');
  END;

  RAISE NOTICE 'reconcile-baseline assertions passed';
END $$;


-- Milestone 3: siem_inventory_counts emits an 'importable' row alongside the relationship counts.
-- The chips need membership; the selection bar needs a number the import can actually honour, and
-- a rule that was never read or has since been deleted is not_in_library but not importable.
INSERT INTO auth.users(id,email) VALUES
  ('24000000-0000-0000-0000-000000000001','counts-owner@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('24000000-0000-0000-0000-000000000001','admin','active')
  ON CONFLICT(id) DO UPDATE SET role='admin',status='active';
INSERT INTO public.integrations(id,user_id,name,provider,category,status,config,auth_type) VALUES
  ('25000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001',
   'Falcon counts fixture','crowdstrike','siem','connected','{}','oauth2_client_credentials');

DO $$
DECLARE integration uuid := '25000000-0000-0000-0000-000000000001';
  actor uuid := '24000000-0000-0000-0000-000000000001';
  scope text := 'scope-counts-1';
  rule_id uuid; snap_id uuid; importable bigint; not_in_library bigint;
BEGIN
  -- Three rules that are all 'not_in_library', but only one is importable.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'count-readable','Countable readable',true,'present')
    RETURNING id INTO rule_id;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_id,'test-v1','count-hash','count-raw','{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;

  -- Never read: discovery listed it but hydration never returned content.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'count-unread','Countable unread',NULL,'present');

  -- Read once, but confirmed gone since.
  INSERT INTO public.siem_remote_rules(integration_id,provider,provider_scope,vendor_rule_id,display_name,
    observed_enabled,availability)
    VALUES(integration,'crowdstrike',scope,'count-gone','Countable gone',true,'missing')
    RETURNING id INTO rule_id;
  INSERT INTO public.siem_remote_rule_snapshots(remote_rule_id,adapter_version,content_hash,raw_hash,content,raw_payload)
    VALUES(rule_id,'test-v1','gone-hash','gone-raw','{}'::jsonb,'{}'::jsonb) RETURNING id INTO snap_id;
  UPDATE public.siem_remote_rules SET latest_snapshot_id=snap_id WHERE id=rule_id;

  SELECT rules INTO not_in_library FROM public.siem_inventory_counts(integration, NULL)
   WHERE relationship = 'not_in_library';
  SELECT rules INTO importable FROM public.siem_inventory_counts(integration, NULL)
   WHERE relationship = 'importable';

  PERFORM pg_temp.assert_true(not_in_library = 3,
    'all three rules are not_in_library: membership is what the chips count');
  PERFORM pg_temp.assert_true(importable = 1,
    'only the read, still-present rule is importable: the number the selection bar must show');

  -- The search narrows both, so "Select all N matching" stays honest under a filter.
  SELECT rules INTO importable FROM public.siem_inventory_counts(integration, 'readable')
   WHERE relationship = 'importable';
  PERFORM pg_temp.assert_true(importable = 1, 'the importable count respects the search');
  SELECT rules INTO importable FROM public.siem_inventory_counts(integration, 'gone')
   WHERE relationship = 'importable';
  PERFORM pg_temp.assert_true(coalesce(importable, 0) = 0,
    'a search matching only an unimportable rule reports nothing to select');

  RAISE NOTICE 'importable-count assertions passed';
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
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
