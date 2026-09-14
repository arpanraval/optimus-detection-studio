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
