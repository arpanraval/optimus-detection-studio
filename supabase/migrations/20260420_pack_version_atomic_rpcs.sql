-- Atomic RPCs for pack versioning
--
-- Addresses race conditions in publishPackVersion (two concurrent calls
-- both compute the same next version number) and rollbackToVersion (non-
-- transactional delete+insert that can leave a pack with zero detections
-- if the insert fails).

-- ========================================================================
-- Function: publish_pack_version
-- ========================================================================
--
-- Takes an advisory lock on the pack, computes the next version number,
-- snapshots the pack + detections, and inserts the version row atomically.
-- Concurrent callers for the same pack serialize on the lock.

CREATE OR REPLACE FUNCTION publish_pack_version(
  p_pack_id uuid,
  p_label text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS pack_versions AS $$
DECLARE
  v_pack detection_packs;
  v_next_number int;
  v_snapshot jsonb;
  v_detections jsonb;
  v_version pack_versions;
  v_user_id uuid := auth.uid();
BEGIN
  -- Serialize concurrent publish_pack_version / rollback_pack_to_version RPC
  -- calls for the same pack to prevent the MAX(version_number) TOCTOU race.
  -- Note: this does NOT block concurrent pack_detections INSERT/DELETE from
  -- other code paths — the snapshot reflects whatever rows exist at SELECT time.
  -- Acceptable because pack_versions is append-only history; any point-in-time
  -- snapshot is valid.
  -- hashtext(uuid::text) produces a stable int key for pg_advisory_xact_lock.
  -- Collisions across unrelated pack_ids can cause benign transient serialization
  -- of different packs' publishes; no correctness impact.
  PERFORM pg_advisory_xact_lock(hashtext(p_pack_id::text));

  -- Load pack (inside the lock so version numbering is consistent)
  SELECT * INTO v_pack FROM detection_packs WHERE id = p_pack_id;
  IF v_pack.id IS NULL THEN
    RAISE EXCEPTION 'Pack not found' USING ERRCODE = 'P0002';
  END IF;

  -- Compute next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_number
  FROM pack_versions
  WHERE pack_id = p_pack_id;

  -- Snapshot detections as a JSON array (whatever the detections row looks like
  -- at snapshot time — future schema changes won't retroactively mutate history)
  SELECT COALESCE(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb)
    INTO v_detections
  FROM pack_detections pd
  JOIN detections d ON d.id = pd.detection_id
  WHERE pd.pack_id = p_pack_id;

  v_snapshot := jsonb_build_object(
    'pack', jsonb_build_object(
      'name', v_pack.name,
      'description', v_pack.description,
      'icon', v_pack.icon,
      'tags', v_pack.tags,
      'platforms', v_pack.platforms,
      'mitre_technique_ids', v_pack.mitre_technique_ids,
      'pack_type', v_pack.pack_type,
      'source', v_pack.source,
      'auto_generated', v_pack.auto_generated,
      'generation_criteria', v_pack.generation_criteria
    ),
    'detections', v_detections,
    'published_at', now()
  );

  INSERT INTO pack_versions (
    pack_id, pack_name, version_number, label, notes, snapshot, created_by
  )
  VALUES (
    p_pack_id,
    v_pack.name,
    v_next_number,
    COALESCE(p_label, 'v' || v_next_number),
    p_notes,
    v_snapshot,
    v_user_id
  )
  RETURNING * INTO v_version;

  UPDATE detection_packs
  SET current_version_number = v_next_number
  WHERE id = p_pack_id;

  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION publish_pack_version TO authenticated;

-- ========================================================================
-- Function: rollback_pack_to_version
-- ========================================================================
--
-- Atomically: (1) publishes a pre-rollback snapshot, (2) deletes current
-- pack_detections, (3) re-inserts from the target version's snapshot.
-- All three run in a single transaction so partial failures leave the pack
-- untouched instead of empty.

CREATE OR REPLACE FUNCTION rollback_pack_to_version(
  p_pack_id uuid,
  p_version_id uuid
)
RETURNS void AS $$
DECLARE
  v_snapshot jsonb;
  v_detection_ids text[];  -- detections.id is text in this schema
BEGIN
  -- Serialize vs. concurrent publish/rollback calls for the same pack.
  -- pg_advisory_xact_lock is re-entrant within the same transaction, so the
  -- nested publish_pack_version call below reacquires the same key safely.
  PERFORM pg_advisory_xact_lock(hashtext(p_pack_id::text));

  -- 1. Auto-publish pre-rollback snapshot. Errors bubble up and the txn aborts.
  PERFORM publish_pack_version(
    p_pack_id,
    'Pre-rollback snapshot',
    'Auto-saved before rollback'
  );

  -- 2. Load the target version's snapshot
  SELECT snapshot INTO v_snapshot
  FROM pack_versions
  WHERE id = p_version_id AND pack_id = p_pack_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Version not found for pack' USING ERRCODE = 'P0002';
  END IF;

  -- Extract detection IDs from snapshot. Type must match detections.id (text).
  SELECT COALESCE(array_agg(d->>'id'), ARRAY[]::text[])
    INTO v_detection_ids
  FROM jsonb_array_elements(v_snapshot->'detections') AS d
  WHERE d->>'id' IS NOT NULL;

  -- 3. Replace current junction rows. Both run in this transaction —
  --    failure of the insert aborts the delete too.
  DELETE FROM pack_detections WHERE pack_id = p_pack_id;

  IF array_length(v_detection_ids, 1) IS NOT NULL THEN
    INSERT INTO pack_detections (pack_id, detection_id)
    SELECT p_pack_id, did
    FROM unnest(v_detection_ids) AS did
    WHERE EXISTS (SELECT 1 FROM detections WHERE id = did)
    ON CONFLICT (pack_id, detection_id) DO NOTHING;
  END IF;

  -- rule_count is updated automatically by trg_sync_pack_rule_count.
  -- mitre_technique_ids is updated by the client after calling this RPC
  -- (trigger only fires on detection.mitreAttackIds change, not on
  -- pack_detections membership change).
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION rollback_pack_to_version TO authenticated;
