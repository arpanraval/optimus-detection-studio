-- Task 5: siem_match_candidates and siem_link_existing hardcoded 'CQL' (and, for linking,
-- 'crowdstrike') so a candidate could only ever be offered -- and a link only ever recorded -- as
-- a CrowdStrike/CQL pair. Both now derive the compatible query language from the connection's
-- provider via siem_provider_query_language(), generalizing the existing machinery rather than
-- rewriting it. A candidate still matches on evidence plus a compatible query language for that
-- provider, never on name alone; the linked detection's own source/external_id/user_id/
-- native_provenance remain untouched.

CREATE OR REPLACE FUNCTION public.siem_match_candidates(p_actor uuid, p_integration uuid, p_vendor_rule_id text)
RETURNS TABLE(detection_id text, detection_name text, evidence text, query_id text, query_language text,
  query_text text, detection_version integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE prov text; qlang text;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RETURN;
  END IF;
  SELECT provider INTO prov FROM integrations WHERE id = p_integration;
  qlang := siem_provider_query_language(prov);
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
-- siem_rule_events row, not as a change to source/external_id/user_id/native_provenance.
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
  qlang := siem_provider_query_language(prov);

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

  -- Pinned to the exact catalog row the snapshot belongs to, not just (integration, vendor_rule_id):
  -- the table's real uniqueness is (integration_id, provider_scope, vendor_rule_id), and this
  -- avoids needing provider_scope as a separate input.
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
