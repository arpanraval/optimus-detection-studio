-- Prune superseded catalog observations. Never touches a snapshot the catalog still points at,
-- and never touches binding snapshots, which baselines and deployment history reference.
CREATE OR REPLACE FUNCTION public.siem_prune_remote_snapshots(p_integration uuid, p_keep integer DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE removed integer;
BEGIN
  IF p_keep < 1 THEN RAISE EXCEPTION 'Keep at least one observation per rule'; END IF;
  WITH ranked AS (
    SELECT s.id, row_number() OVER (PARTITION BY s.remote_rule_id ORDER BY s.observed_at DESC) AS position
      FROM siem_remote_rule_snapshots s
      JOIN siem_remote_rules r ON r.id = s.remote_rule_id
     WHERE r.integration_id = p_integration
       AND s.id IS DISTINCT FROM r.latest_snapshot_id
       AND NOT EXISTS (SELECT 1 FROM siem_sync_items i
                        WHERE i.remote_rule_id = r.id AND i.status = 'pending')
  )
  DELETE FROM siem_remote_rule_snapshots s USING ranked
   WHERE s.id = ranked.id AND ranked.position > p_keep;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.siem_prune_remote_snapshots(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_prune_remote_snapshots(uuid,integer) TO service_role;
