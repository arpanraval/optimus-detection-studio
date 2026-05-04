-- 20260504a_detection_fk_indexes.sql
-- Add missing indexes on FK columns that reference detections.id.
-- Without these, DELETE on detections forces seq-scans of every referencing
-- table to validate FK constraints, which times out for bulk rollbacks.
--
-- Refs: BatchInserter.rollbackImport, public.rollback_bulk_import RPC.

BEGIN;

-- 1. Self-FK: detections.promoted_to_id -> detections.id (NO ACTION).
--    Largest cost driver: 14k row table seq-scanned per parent delete.
--    Most rows are NULL, so a partial index keeps the index small.
CREATE INDEX IF NOT EXISTS idx_detections_promoted_to_id
  ON public.detections (promoted_to_id)
  WHERE promoted_to_id IS NOT NULL;

-- 2. user_notifications.detection_id -> detections.id (NO ACTION).
CREATE INDEX IF NOT EXISTS idx_user_notifications_detection_id
  ON public.user_notifications (detection_id);

-- 3. promotion_requests.result_rule_id -> detections.id (NO ACTION).
CREATE INDEX IF NOT EXISTS idx_promotion_requests_result_rule_id
  ON public.promotion_requests (result_rule_id)
  WHERE result_rule_id IS NOT NULL;

-- 4. promotion_requests.target_rule_id -> detections.id (NO ACTION).
CREATE INDEX IF NOT EXISTS idx_promotion_requests_target_rule_id
  ON public.promotion_requests (target_rule_id)
  WHERE target_rule_id IS NOT NULL;

-- 5. detection_patterns.detection_id -> detections.id (CASCADE).
--    Empty today, but the cascade fires per parent delete and would
--    time out once populated.
CREATE INDEX IF NOT EXISTS idx_detection_patterns_detection_id
  ON public.detection_patterns (detection_id);

-- Refresh planner stats so library tab estimates also improve.
ANALYZE public.detections;

COMMIT;
