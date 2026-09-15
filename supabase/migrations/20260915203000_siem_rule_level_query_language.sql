-- Fix 1 (2026-09-15 review, BLOCKING): siem_provider_query_language() maps each provider to
-- exactly ONE query language, which is correct for five providers but wrong for Elastic --
-- an Elastic rule's language is 'kuery', 'lucene', 'eql' or 'esql' depending on the individual
-- rule, carried on the rule's own payload (RuleContent.language), never on the connection.
-- Stamping every Elastic rule 'EQL' mislabeled most of them and collapsed the Kibana-kuery vs
-- Microsoft-Kusto-KQL distinction at the database layer.
--
-- siem_provider_query_language() is kept exactly as-is and is NOT wrong to keep: it is still the
-- right default for a rule whose payload carries no language, or an invalid one. This migration
-- adds siem_rule_query_language(), which prefers the per-rule value (validated against the same
-- QUERY_LANGUAGES set the app enforces -- src/constants.ts:5-20) and falls back to the provider
-- default otherwise, then swaps all four call sites (siem_commit_chunk, siem_commit_import_chunk,
-- siem_match_candidates, siem_link_existing) from the provider-only mapping to this rule-aware one.
-- No RPC signature changes: siem_commit_chunk and siem_commit_import_chunk already carry the
-- per-rule vendor payload in scope (`item`/`c`); siem_match_candidates and siem_link_existing look
-- the rule's own snapshot content up from the catalog they already read from.
--
-- Validating against QUERY_LANGUAGES here (not just trusting the payload) matters because the
-- column is CHECK-constrained: an unrecognised or malformed value from one bad rule must fall
-- back to the provider default rather than raising mid-batch and failing the whole import chunk.

-- Matched case-INSENSITIVELY, returning the canonical spelling. Vendors name their languages in
-- their own casing -- Elastic's rules carry 'kuery'/'lucene'/'eql'/'esql' lowercase -- while the
-- column is CHECK-constrained to the app's canonical set ('Kuery','Lucene','EQL','ESQL', see
-- src/constants.ts:5-20). An exact-match-only test silently failed every lowercase vendor value
-- through to the provider default, which is the very bug this migration exists to fix. Canonicalising
-- here keeps one authority for language identity, and a value that matches nothing still falls back.
CREATE OR REPLACE FUNCTION public.siem_rule_query_language(p_provider text, p_content jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    (SELECT canonical
       FROM unnest(ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL',
         'YARA','YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL']) AS canonical
      WHERE lower(canonical) = lower(p_content ->> 'language')
      LIMIT 1),
    siem_provider_query_language(p_provider));
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
      -- Per-rule language first (e.g. an Elastic rule's own 'kuery'/'lucene'/'eql'/'esql'),
      -- falling back to the provider default only when the payload has none or an invalid one.
      qlang := siem_rule_query_language(prov, c);
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

-- Task 12: resolve ambiguous match_needed rows. One row per (candidate detection, compatible
-- query). Evidence is restricted to a current successful deployment against this exact vendor
-- rule, or a legacy external_id match on a non-native detection -- a matching display name alone
-- is never evidence. The compatible query language now comes from the vendor rule's own latest
-- observed content (its catalog snapshot) rather than being assumed from the provider alone,
-- so an Elastic Kuery rule offers Kuery candidates and an Elastic ESQL rule offers ESQL ones.
CREATE OR REPLACE FUNCTION public.siem_match_candidates(p_actor uuid, p_integration uuid, p_vendor_rule_id text)
RETURNS TABLE(detection_id text, detection_name text, evidence text, query_id text, query_language text,
  query_text text, detection_version integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE prov text; qlang text; rule_content jsonb;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RETURN;
  END IF;
  SELECT provider INTO prov FROM integrations WHERE id = p_integration;
  SELECT s.content INTO rule_content
    FROM siem_remote_rules rr
    JOIN siem_remote_rule_snapshots s ON s.id = rr.latest_snapshot_id
   WHERE rr.integration_id = p_integration AND rr.vendor_rule_id = p_vendor_rule_id
   ORDER BY rr.last_seen_at DESC LIMIT 1;
  qlang := siem_rule_query_language(prov, coalesce(rule_content, '{}'::jsonb));
  RETURN QUERY
  WITH deployed AS (
    SELECT DISTINCT h.detection_id
      FROM deployment_history h
      JOIN detections x ON x.id = h.detection_id
     WHERE h.integration_id = p_integration AND h.vendor_rule_id = p_vendor_rule_id
       AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = p_actor
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ),
  legacy AS (
    SELECT d.id AS detection_id
      FROM detections d
     WHERE d.user_id = p_actor AND d.external_id = p_vendor_rule_id AND d.native_provenance IS NULL
       AND d.id NOT IN (SELECT deployed.detection_id FROM deployed)
  ),
  evidenced AS (
    SELECT deployed.detection_id, 'Deployed to this connection as this rule'::text AS evidence FROM deployed
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

-- Links an already-authored library detection to a rule from any supported provider as its native
-- binding, without rewriting the detection's own provenance. The adoption is recorded as a
-- siem_rule_events row, not as a change to source/external_id/user_id/native_provenance. The
-- compatible query language is now read from the exact snapshot being linked (p_snapshot), so an
-- Elastic Kuery rule requires (and records) a Kuery-language binding, not a blanket EQL one.
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
     WHERE h.integration_id = p_integration AND h.vendor_rule_id = p_vendor_rule_id
       AND h.detection_id = p_detection AND h.status = 'success' AND h.action <> 'delete'
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ) THEN
    evidence := 'Deployed to this connection as this rule';
  ELSIF d.external_id = p_vendor_rule_id AND d.native_provenance IS NULL THEN
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
