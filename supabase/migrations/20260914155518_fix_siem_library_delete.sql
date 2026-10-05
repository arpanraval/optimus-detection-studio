-- Library deletion is local only. Existing detection DELETE RLS authorizes the row;
-- private trigger cleanup handles operational tables unavailable to ordinary editors.
CREATE OR REPLACE FUNCTION siem_private.delete_library_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE connection_id uuid;
BEGIN
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('service_role','none') THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  FOR connection_id IN SELECT DISTINCT integration_id FROM siem_rule_bindings WHERE detection_id=OLD.id ORDER BY integration_id LOOP
    PERFORM 1 FROM integrations WHERE id=connection_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM siem_sync_runs WHERE integration_id=connection_id AND status IN ('queued','running')) THEN
      RAISE EXCEPTION 'Rules are being fetched from this SIEM. Wait for the fetch to finish, then delete the library copy.';
    END IF;
  END LOOP;
  PERFORM 1 FROM siem_rule_bindings WHERE detection_id=OLD.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM siem_rule_bindings WHERE detection_id=OLD.id AND pending_operation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This rule has an unfinished SIEM operation. Fetch its latest SIEM state before deleting the library copy.';
  END IF;
  -- Keep actual deployment records (including remote identity), but unlink import tracking.
  UPDATE deployment_history SET native_binding_id=NULL WHERE native_binding_id IN
    (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  UPDATE siem_rule_bindings SET baseline_snapshot_id=NULL,latest_remote_snapshot_id=NULL WHERE detection_id=OLD.id;
  DELETE FROM siem_rule_events WHERE binding_id IN (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  DELETE FROM siem_rule_snapshots WHERE binding_id IN (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  DELETE FROM siem_local_revisions WHERE detection_id=OLD.id;
  DELETE FROM siem_rule_bindings WHERE detection_id=OLD.id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION siem_private.delete_library_rule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER siem_delete_library_rule BEFORE DELETE ON public.detections
  FOR EACH ROW EXECUTE FUNCTION siem_private.delete_library_rule();
