-- Re-observe rules already tracked in the library. Creates no detections: every queued id
-- already has an active binding.
CREATE OR REPLACE FUNCTION public.siem_start_refresh(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND kind = 'refresh_tracked' AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version, phase,
    discovery_complete)
    VALUES(p_integration, p_actor, p_scope, 'refresh_tracked', 2, 'hydration', true) RETURNING * INTO r;
  INSERT INTO siem_sync_items(run_id, vendor_rule_id)
    SELECT r.id, b.vendor_rule_id FROM siem_rule_bindings b
     WHERE b.integration_id = p_integration AND b.provider_scope = p_scope AND b.binding_status = 'active';
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_start_refresh(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_refresh(uuid,uuid,text) TO service_role;
