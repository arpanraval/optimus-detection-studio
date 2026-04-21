-- Pack Data Consistency Triggers
--
-- Addresses F8: stale rule_count when detection deleted/added
-- Addresses F10: stale mitre_technique_ids when detection mitreAttackIds change
-- Addresses F14: optimistic locking via updated_at check (enforced via trigger)

-- ========================================================================
-- Trigger 1: Auto-update pack.rule_count on pack_detections changes
-- ========================================================================

CREATE OR REPLACE FUNCTION sync_pack_rule_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Recompute rule_count for the affected pack
  IF TG_OP = 'DELETE' THEN
    UPDATE detection_packs
    SET rule_count = (
      SELECT COUNT(*) FROM pack_detections WHERE pack_id = OLD.pack_id
    ),
    updated_at = now()
    WHERE id = OLD.pack_id;
    RETURN OLD;
  ELSE
    UPDATE detection_packs
    SET rule_count = (
      SELECT COUNT(*) FROM pack_detections WHERE pack_id = NEW.pack_id
    ),
    updated_at = now()
    WHERE id = NEW.pack_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pack_rule_count ON pack_detections;
CREATE TRIGGER trg_sync_pack_rule_count
  AFTER INSERT OR DELETE ON pack_detections
  FOR EACH ROW EXECUTE FUNCTION sync_pack_rule_count();

-- ========================================================================
-- Trigger 2: Auto-update pack.mitre_technique_ids when detection mitreAttackIds change
-- ========================================================================
--
-- When a detection's mitreAttackIds change, every pack containing that detection
-- needs its mitre_technique_ids aggregate recomputed.

CREATE OR REPLACE FUNCTION sync_affected_pack_mitre_ids()
RETURNS TRIGGER AS $$
DECLARE
  affected_pack_id uuid;
BEGIN
  -- Only care if mitreAttackIds actually changed
  IF OLD."mitreAttackIds" IS NOT DISTINCT FROM NEW."mitreAttackIds" THEN
    RETURN NEW;
  END IF;

  -- For each pack containing this detection, recompute aggregate technique IDs
  FOR affected_pack_id IN
    SELECT DISTINCT pack_id FROM pack_detections WHERE detection_id = NEW.id
  LOOP
    UPDATE detection_packs
    SET mitre_technique_ids = (
      SELECT COALESCE(
        array_agg(DISTINCT tid ORDER BY tid),
        ARRAY[]::text[]
      )
      FROM pack_detections pd
      JOIN detections d ON d.id = pd.detection_id
      CROSS JOIN LATERAL unnest(COALESCE(d."mitreAttackIds", ARRAY[]::text[])) AS tid
      WHERE pd.pack_id = affected_pack_id
    ),
    updated_at = now()
    WHERE id = affected_pack_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_affected_pack_mitre_ids ON detections;
CREATE TRIGGER trg_sync_affected_pack_mitre_ids
  AFTER UPDATE ON detections
  FOR EACH ROW EXECUTE FUNCTION sync_affected_pack_mitre_ids();

-- ========================================================================
-- Function: pack_update_with_lock — optimistic locking via updated_at check
-- ========================================================================
--
-- Client passes the updated_at they loaded. If it still matches, update succeeds
-- and a new updated_at is set. If another user modified in the meantime, throws.

CREATE OR REPLACE FUNCTION pack_update_with_lock(
  p_pack_id uuid,
  p_expected_updated_at timestamptz,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_platforms text[] DEFAULT NULL
)
RETURNS detection_packs AS $$
DECLARE
  current_updated timestamptz;
  updated_row detection_packs;
BEGIN
  SELECT updated_at INTO current_updated FROM detection_packs WHERE id = p_pack_id;

  IF current_updated IS NULL THEN
    RAISE EXCEPTION 'Pack not found' USING ERRCODE = 'P0002';
  END IF;

  -- Compare as epoch milliseconds to avoid microsecond precision issues
  IF EXTRACT(EPOCH FROM current_updated) * 1000 <> EXTRACT(EPOCH FROM p_expected_updated_at) * 1000 THEN
    RAISE EXCEPTION 'Pack was modified by another user. Reload and try again.'
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE detection_packs
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    icon = COALESCE(p_icon, icon),
    tags = COALESCE(p_tags, tags),
    platforms = COALESCE(p_platforms, platforms),
    updated_at = now()
  WHERE id = p_pack_id
  RETURNING * INTO updated_row;

  RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION pack_update_with_lock TO authenticated;
