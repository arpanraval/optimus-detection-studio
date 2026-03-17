-- ============================================
-- Migrate detection.auditLog JSONB → audit_events rows
-- ============================================
-- One-time migration extracting entries from the JSONB array
-- into the new immutable audit_events table.

INSERT INTO audit_events (
  user_id,
  user_email,
  action,
  entity_type,
  entity_id,
  entity_name,
  details,
  source,
  created_at
)
SELECT
  -- Try to resolve userId to a UUID; skip if not valid
  CASE
    WHEN entry->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (entry->>'userId')::UUID
    ELSE NULL
  END AS user_id,
  entry->>'userName' AS user_email,
  -- Map old action names to dot-notation
  CASE entry->>'action'
    WHEN 'created' THEN 'detection.created'
    WHEN 'updated' THEN 'detection.updated'
    WHEN 'status_changed' THEN 'detection.status_changed'
    WHEN 'published' THEN 'detection.published'
    WHEN 'copied_from_universal' THEN 'detection.copied'
    WHEN 'assigned' THEN 'detection.assigned'
    WHEN 'unassigned' THEN 'detection.unassigned'
    WHEN 'review_requested' THEN 'review.requested'
    WHEN 'review_approved' THEN 'review.approved'
    WHEN 'review_rejected' THEN 'review.rejected'
    WHEN 'comment_added' THEN 'comment.created'
    WHEN 'moved_to_team' THEN 'detection.moved'
    ELSE 'detection.' || COALESCE(entry->>'action', 'unknown')
  END AS action,
  'detection' AS entity_type,
  d.id::TEXT AS entity_id,
  d.name AS entity_name,
  jsonb_build_object('details', entry->>'details', 'migrated_from', 'detection.auditLog') AS details,
  'migration' AS source,
  COALESCE(
    (entry->>'timestamp')::TIMESTAMPTZ,
    d."createdDate"::TIMESTAMPTZ
  ) AS created_at
FROM
  detections d,
  jsonb_array_elements(d."auditLog") AS entry
WHERE
  d."auditLog" IS NOT NULL
  AND jsonb_array_length(d."auditLog") > 0;
