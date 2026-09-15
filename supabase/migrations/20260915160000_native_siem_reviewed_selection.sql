-- Milestone 1 of the hardening plan: an import must adopt the exact rule revision the user
-- reviewed, drawn from the scan they were looking at.
--
-- Before this migration siem_start_import froze content_hash from siem_remote_rules.latest_snapshot_id
-- -- the CURRENT catalog -- and its predicate ranged over the whole catalog rather than the supplied
-- source run. Two consequences: (a) a scan completing between review and submit silently replaced the
-- content, and the worker's frozen-hash guard then agreed with the unseen revision; (b) "select all
-- matching" could enqueue identities that were never in the reviewed scan, including ones already
-- marked missing, and ignored the search/relationship filter its count was computed under.

-- Which snapshot a run actually observed, per item. Without this a run has no record of the
-- revision it showed the user.
ALTER TABLE public.siem_sync_items
  ADD COLUMN IF NOT EXISTS observed_snapshot_id uuid
    REFERENCES public.siem_remote_rule_snapshots(id) ON DELETE SET NULL;

-- Same signature (uuid, uuid, text[], integer, boolean, jsonb): CREATE OR REPLACE, no ACL loss.
-- Only the item UPDATE changes -- it now records which catalog row and which snapshot this run saw.
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

      -- Reset per item: snap is only assigned inside the content branch below, and an item
      -- without content must not inherit the previous iteration's snapshot.
      snap := NULL;

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
        'present', CASE WHEN item->>'status' = 'failed' THEN NULL ELSE item->>'error' END, cand, now())
      ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO UPDATE SET
        rule_family = excluded.rule_family,
        display_name = CASE WHEN item ? 'name' THEN excluded.display_name ELSE siem_remote_rules.display_name END,
        observed_enabled = excluded.observed_enabled,
        availability = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.availability ELSE 'present' END,
        normalization_error = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.normalization_error ELSE excluded.normalization_error END,
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
      -- The worker distinguishes "we read it but cannot normalise it" ('unsupported', a
      -- permanent property of the rule) from "CrowdStrike did not return it" ('failed', a
      -- transient read outcome). Only the latter blocks absence inference, so the hint is
      -- allowlisted rather than trusted verbatim.
      --
      -- remote_rule_id / observed_snapshot_id are what make a completed run a reviewable
      -- artifact: siem_start_import freezes content from the snapshot THIS run saw, never from
      -- whatever the catalog happens to hold at submit time.
      UPDATE siem_sync_items
         SET status = CASE
               WHEN item->>'status' IN ('failed','unsupported') THEN item->>'status'
               WHEN item ? 'error' THEN 'unsupported'
               ELSE 'observed' END,
             error_message = item->>'error',
             remote_rule_id = rr.id,
             observed_snapshot_id = coalesce(snap, siem_sync_items.observed_snapshot_id)
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

-- Best-effort backfill for runs that completed before this migration: they carry no recorded
-- observation, so the current catalog row and its latest snapshot are the closest truth
-- available. Only touches rows that are still NULL, and only successful observations.
UPDATE public.siem_sync_items i SET remote_rule_id = rr.id
  FROM public.siem_sync_runs run, public.siem_remote_rules rr
 WHERE i.run_id = run.id AND run.kind = 'inventory'
   AND rr.integration_id = run.integration_id AND rr.provider_scope = run.provider_scope
   AND rr.vendor_rule_id = i.vendor_rule_id AND i.remote_rule_id IS NULL;
UPDATE public.siem_sync_items i SET observed_snapshot_id = rr.latest_snapshot_id
  FROM public.siem_remote_rules rr
 WHERE rr.id = i.remote_rule_id AND i.observed_snapshot_id IS NULL AND i.status = 'observed';

-- Signature change (adds p_search / p_relationship), so the old function must go rather than
-- become an overload PostgREST cannot disambiguate. DROP discards the ACL, hence the explicit
-- REVOKE/GRANT below -- verified post-apply, not assumed.
DROP FUNCTION IF EXISTS public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text);

CREATE FUNCTION public.siem_start_import(p_actor uuid, p_integration uuid, p_source_run uuid,
  p_ids text[], p_exclude text[], p_all_matching boolean, p_idempotency text,
  p_search text DEFAULT NULL, p_relationship text DEFAULT NULL)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; source siem_sync_runs; frozen integer;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) = 0 THEN
    RAISE EXCEPTION 'An import request key is required';
  END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;

  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND idempotency_key = p_idempotency;
  IF FOUND THEN RETURN r; END IF;

  SELECT * INTO source FROM siem_sync_runs WHERE id = p_source_run AND integration_id = p_integration;
  IF NOT FOUND OR source.kind <> 'inventory' THEN
    RAISE EXCEPTION 'Fetch rules from CrowdStrike before importing';
  END IF;
  IF p_all_matching AND (source.status <> 'complete' OR NOT source.discovery_complete) THEN
    RAISE EXCEPTION 'Importing every matching rule needs a completed check. Select the rules you can see instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = p_integration
               AND kind = 'import_selection' AND status IN ('queued','running')) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version, phase,
    discovery_complete, source_run_id, idempotency_key)
    VALUES(p_integration, p_actor, source.provider_scope, 'import_selection', 2, 'hydration', true,
           source.id, p_idempotency)
    RETURNING * INTO r;

  -- Freeze the identities and the exact content the user reviewed. Driving off the SOURCE RUN's
  -- items (not the catalog) is what binds the import to that scan: an identity the run never
  -- observed cannot be selected at all, by explicit id or by "all matching".
  --
  -- Relationship is deliberately read live from siem_inventory_rows rather than frozen: whether a
  -- rule is already in the library is a question about NOW, and re-importing something adopted
  -- since the scan would duplicate it. Content is the opposite -- it must be the reviewed
  -- revision -- so the hash comes from src.observed_snapshot_id.
  INSERT INTO siem_sync_items(run_id, vendor_rule_id, remote_rule_id, observed_snapshot_id,
    frozen_content_hash, status, error_message)
  SELECT r.id, v.vendor_rule_id, v.id, src.observed_snapshot_id, s.content_hash,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL
                   AND v.availability = 'present' AND src.status = 'observed'
              THEN 'pending' ELSE 'skipped' END,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL
                   AND v.availability = 'present' AND src.status = 'observed' THEN NULL
              WHEN v.relationship = 'already_in_library' THEN 'Already in library'
              WHEN v.relationship = 'archived_in_library' THEN 'Archived in library'
              WHEN v.relationship = 'match_needed' THEN 'Match needed'
              WHEN v.relationship = 'unsupported' THEN coalesce(v.normalization_error, 'Not supported')
              WHEN v.availability <> 'present' THEN 'No longer in CrowdStrike'
              ELSE 'This rule has not been read from CrowdStrike yet' END
    FROM siem_sync_items src
    JOIN siem_inventory_rows v ON v.id = src.remote_rule_id
    LEFT JOIN siem_remote_rule_snapshots s ON s.id = src.observed_snapshot_id
   WHERE src.run_id = source.id
     AND v.integration_id = p_integration
     AND v.provider_scope = source.provider_scope
     -- The same predicate the table and the counts use, so "all N matching" imports exactly the
     -- N the user was shown.
     AND (p_relationship IS NULL OR p_relationship = 'all' OR v.relationship = p_relationship)
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
     AND (CASE WHEN p_all_matching
               THEN NOT (v.vendor_rule_id = ANY(coalesce(p_exclude, '{}')))
               ELSE v.vendor_rule_id = ANY(coalesce(p_ids, '{}')) END)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO frozen FROM siem_sync_items WHERE run_id = r.id AND status = 'pending';
  IF frozen = 0 THEN
    UPDATE siem_sync_runs SET status = 'complete', completed_at = now(),
      error_message = 'None of the selected rules can be imported right now' WHERE id = r.id
      RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text,text,text)
  TO service_role;

-- A run that exhausted its transient retries is marked 'failed' with its unprocessed items still
-- 'pending'. Resetting only 'failed' items therefore reported "No failed rules to retry" and
-- stranded the whole remaining selection, which is exactly the case the results panel offers
-- Retry for. Pending work is resumable work.
CREATE OR REPLACE FUNCTION public.siem_retry_import(p_actor uuid, p_run uuid)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; resumable integer;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'import_selection' THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT siem_can_import(p_actor, r.integration_id) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;

  -- changed_since_preview is deliberately NOT reset: it needs a fresh check and a new selection,
  -- because silently re-adopting it would import content the user never reviewed.
  UPDATE siem_sync_items SET status = 'pending', error_message = NULL
   WHERE run_id = r.id AND status = 'failed';
  SELECT count(*) INTO resumable FROM siem_sync_items WHERE run_id = r.id AND status = 'pending';
  IF resumable = 0 THEN RAISE EXCEPTION 'No rules left to retry'; END IF;

  -- A partial run no longer blocks a fresh import_selection start (siem_start_import's
  -- concurrency check only sees 'queued'/'running'), so a second import may already be live
  -- for this connection by the time this one is retried. Requeuing into that collision would
  -- otherwise surface the raw siem_sync_one_active unique-constraint error to the user.
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = r.integration_id
               AND kind = 'import_selection' AND status IN ('queued','running') AND id <> r.id) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  UPDATE siem_sync_runs SET status = 'queued', next_attempt_at = now(), attempts = 0,
    completed_at = NULL, error_message = NULL, lease_token = NULL, lease_expires_at = NULL
    WHERE id = r.id
    RETURNING * INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_retry_import(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_retry_import(uuid,uuid) TO service_role;
