-- Inventory jobs observe production. They never create a detection or a binding.
CREATE OR REPLACE FUNCTION public.siem_start_inventory(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope)
     OR EXISTS (SELECT 1 FROM siem_remote_rules WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND kind = 'inventory' AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version)
    VALUES(p_integration, p_actor, p_scope, 'inventory', 2) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.siem_commit_inventory_chunk(p_run uuid, p_lease uuid, p_ids text[],
  p_next integer, p_discovery_complete boolean, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; rr siem_remote_rules; snap uuid; cand integer;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'inventory'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;

  IF r.phase = 'discovery' THEN
    INSERT INTO siem_sync_items(run_id, vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset = p_next, discovery_complete = p_discovery_complete,
      phase = CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id = r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items
                      WHERE run_id = r.id AND vendor_rule_id = item->>'id' AND status = 'pending') THEN
        CONTINUE;
      END IF;

      -- Candidate evidence is computed once here, not per page render.
      SELECT count(DISTINCT h.detection_id) INTO cand FROM deployment_history h
        JOIN detections x ON x.id = h.detection_id
       WHERE h.integration_id = r.integration_id AND h.vendor_rule_id = item->>'id'
         AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = r.actor_id
         AND NOT EXISTS (SELECT 1 FROM deployment_history later
                          WHERE later.integration_id = h.integration_id
                            AND later.vendor_rule_id = h.vendor_rule_id
                            AND later.status = 'success' AND later.action = 'delete'
                            AND later.created_at > h.created_at);
      IF cand = 0 AND EXISTS (SELECT 1 FROM detections
                               WHERE user_id = r.actor_id AND external_id = item->>'id'
                                 AND native_provenance IS NULL) THEN
        cand := 1;
      END IF;

      INSERT INTO siem_remote_rules(integration_id, provider, provider_scope, vendor_rule_id, rule_family,
        display_name, observed_enabled, availability, normalization_error, match_candidate_count, last_seen_at)
      VALUES(r.integration_id, 'crowdstrike', r.provider_scope, item->>'id',
        coalesce(item->>'family','correlation'), coalesce(item->>'name', item->>'id'),
        CASE WHEN item ? 'enabled' THEN (item->>'enabled')::boolean ELSE NULL END,
        'present', item->>'error', cand, now())
      ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO UPDATE SET
        rule_family = excluded.rule_family, display_name = excluded.display_name,
        observed_enabled = excluded.observed_enabled, availability = 'present',
        normalization_error = excluded.normalization_error,
        match_candidate_count = excluded.match_candidate_count, last_seen_at = now()
      RETURNING * INTO rr;

      IF item ? 'content' THEN
        INSERT INTO siem_remote_rule_snapshots(remote_rule_id, adapter_version, content_hash, raw_hash,
          content, raw_payload)
          VALUES(rr.id, item->>'adapter', item->>'hash', item->>'raw_hash', item->'content', item->'raw')
          ON CONFLICT DO NOTHING;
        SELECT id INTO snap FROM siem_remote_rule_snapshots
          WHERE remote_rule_id = rr.id AND adapter_version = item->>'adapter'
            AND content_hash = item->>'hash' AND raw_hash = item->>'raw_hash';
        UPDATE siem_remote_rules SET latest_snapshot_id = snap WHERE id = rr.id;
      END IF;

      -- 'observed' (not 'unchanged') keeps job-outcome vocabulary distinct from library
      -- membership: an inventory scan never claims something was imported.
      UPDATE siem_sync_items
         SET status = CASE WHEN item ? 'error' THEN 'unsupported' ELSE 'observed' END,
             error_message = item->>'error'
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id = r.id AND status = 'pending') THEN
      -- Status and absence-inference are two different questions. Status reflects whether
      -- every item got a definite answer of any kind (matches legacy siem_commit_chunk's
      -- status IN ('failed','unsupported','ambiguous') reading of "partial").
      UPDATE siem_sync_runs
         SET status = CASE WHEN EXISTS (SELECT 1 FROM siem_sync_items
                                         WHERE run_id = r.id AND status IN ('failed','unsupported'))
                            THEN 'partial' ELSE 'complete' END,
             completed_at = now()
       WHERE id = r.id;
      -- Absence is a separate question from status. A rule we read but could not normalise
      -- ('unsupported') is still a definite answer that it exists, so it must not block the
      -- inference -- otherwise one permanently unsupported rule family would stop this
      -- connection from ever noticing a deleted rule. A 'failed' item is not a definite
      -- answer, so it does block it.
      IF r.discovery_complete AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                                               WHERE run_id = r.id AND status = 'failed') THEN
        UPDATE siem_remote_rules SET availability = 'missing'
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
           AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                            WHERE run_id = r.id AND vendor_rule_id = siem_remote_rules.vendor_rule_id);
        UPDATE siem_remote_rules SET last_complete_run_id = r.id
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope;
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(),
    attempts = 0, error_message = NULL WHERE id = r.id;
END $$;

REVOKE ALL ON FUNCTION public.siem_start_inventory(uuid,uuid,text),
  public.siem_commit_inventory_chunk(uuid,uuid,text[],integer,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_inventory(uuid,uuid,text),
  public.siem_commit_inventory_chunk(uuid,uuid,text[],integer,boolean,jsonb) TO service_role;
