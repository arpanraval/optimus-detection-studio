-- Migration: Add import pipeline robustness (pause/resume, snapshot rollback, pre-check, tags)
-- Depends on: add_bulk_import_safety_columns.sql

-- ============================================
-- 1. Add new columns to bulk_import_jobs
-- ============================================

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS rollback_snapshot JSONB DEFAULT NULL;

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS pause_reason TEXT DEFAULT NULL;

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS pre_check_results JSONB DEFAULT NULL;

ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS import_tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN bulk_import_jobs.rollback_snapshot IS 'Stores previous field values for update-based rollback (keyed by detection id)';
COMMENT ON COLUMN bulk_import_jobs.paused_at IS 'Timestamp when the import was paused';
COMMENT ON COLUMN bulk_import_jobs.pause_reason IS 'Reason for pause: network_error, user_paused, or rate_limited';
COMMENT ON COLUMN bulk_import_jobs.retry_count IS 'Number of consecutive failed retry attempts';
COMMENT ON COLUMN bulk_import_jobs.pre_check_results IS 'Results of duplicate/pre-check analysis before import';
COMMENT ON COLUMN bulk_import_jobs.import_tags IS 'Tags applied to detections from this import';

-- ============================================
-- 2. Update status constraint to add "paused"
-- ============================================

ALTER TABLE bulk_import_jobs
DROP CONSTRAINT IF EXISTS bulk_import_jobs_status_check;

ALTER TABLE bulk_import_jobs
ADD CONSTRAINT bulk_import_jobs_status_check
CHECK (status IN (
  'pending', 'fetching', 'parsing', 'validating',
  'preview', 'inserting', 'completed', 'failed',
  'cancelled', 'reverted', 'paused'
));

-- Add constraint for pause_reason values
ALTER TABLE bulk_import_jobs
DROP CONSTRAINT IF EXISTS bulk_import_jobs_pause_reason_check;

ALTER TABLE bulk_import_jobs
ADD CONSTRAINT bulk_import_jobs_pause_reason_check
CHECK (pause_reason IS NULL OR pause_reason IN ('network_error', 'user_paused', 'rate_limited'));

-- ============================================
-- 3. Replace rollback_bulk_import() function
--    Bug fix: returns success:false when 0 deleted but success_count > 0
--    New: snapshot-based rollback for updated detections
-- ============================================

CREATE OR REPLACE FUNCTION rollback_bulk_import(
  p_job_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_job RECORD;
  v_deleted_count INTEGER;
  v_reverted_count INTEGER := 0;
  v_snapshot JSONB;
  v_detection_id TEXT;
  v_prev_values JSONB;
BEGIN
  -- Get the job and verify ownership/permissions
  SELECT * INTO v_job
  FROM bulk_import_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Import job not found'
    );
  END IF;

  -- Check if already reverted
  IF v_job.status = 'reverted' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Import has already been reverted'
    );
  END IF;

  -- Allow rollback of completed, failed, paused, and inserting jobs
  IF v_job.status NOT IN ('completed', 'failed', 'paused', 'inserting') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only completed, failed, paused, or in-progress imports can be rolled back'
    );
  END IF;

  -- Verify user has permission (owner of job or admin)
  IF v_job.user_id != p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = p_user_id
      AND role IN ('owner', 'admin')
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Permission denied: you can only rollback your own imports'
      );
    END IF;
  END IF;

  -- Step 1: Delete all net-new detections created by this import
  DELETE FROM detections
  WHERE bulk_import_id = p_job_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Step 2: Revert updated detections using snapshot
  v_snapshot := v_job.rollback_snapshot;

  IF v_snapshot IS NOT NULL AND jsonb_typeof(v_snapshot) = 'object' THEN
    FOR v_detection_id, v_prev_values IN
      SELECT key, value FROM jsonb_each(v_snapshot)
    LOOP
      UPDATE detections
      SET
        "detectionQuery" = COALESCE(v_prev_values->>'detectionQuery', "detectionQuery"),
        severity = COALESCE(v_prev_values->>'severity', severity),
        description = COALESCE(v_prev_values->>'description', description),
        tags = CASE
          WHEN v_prev_values ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(v_prev_values->'tags'))
          ELSE tags
        END,
        "mitreTactics" = CASE
          WHEN v_prev_values ? 'mitreTactics' THEN ARRAY(SELECT jsonb_array_elements_text(v_prev_values->'mitreTactics'))
          ELSE "mitreTactics"
        END,
        "mitreTechniques" = CASE
          WHEN v_prev_values ? 'mitreTechniques' THEN ARRAY(SELECT jsonb_array_elements_text(v_prev_values->'mitreTechniques'))
          ELSE "mitreTechniques"
        END,
        "updatedDate" = now()
      WHERE id = v_detection_id::UUID;

      IF FOUND THEN
        v_reverted_count := v_reverted_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Bug fix: if the job recorded success_count > 0 but we deleted 0 rows
  -- and reverted 0 rows, something went wrong
  IF v_deleted_count = 0 AND v_reverted_count = 0 AND v_job.success_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rollback found no detections to delete or revert despite success_count > 0. Detections may have been manually removed.',
      'job_id', p_job_id,
      'expected_count', v_job.success_count,
      'deleted_count', v_deleted_count,
      'reverted_count', v_reverted_count
    );
  END IF;

  -- Only mark as reverted AFTER confirmed deletion/reversion
  UPDATE bulk_import_jobs
  SET
    status = 'reverted',
    reverted_at = now(),
    reverted_by = p_user_id,
    updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'reverted_count', v_reverted_count,
    'job_id', p_job_id,
    'reverted_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION rollback_bulk_import(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION rollback_bulk_import IS 'Rolls back a bulk import by deleting net-new detections and reverting updated detections via snapshot';

-- ============================================
-- 4. Update resumable_imports view
--    Now includes paused status and new columns
-- ============================================

CREATE OR REPLACE VIEW resumable_imports AS
SELECT
  bij.id,
  bij.user_id,
  bij.source_type,
  bij.source_url,
  bij.source_vendor,
  bij.target_library,
  bij.status,
  bij.total_files,
  bij.processed_files,
  bij.success_count,
  bij.failure_count,
  bij.last_successful_batch,
  bij.total_batches,
  bij.paused_at,
  bij.pause_reason,
  bij.retry_count,
  bij.pre_check_results,
  bij.import_tags,
  bij.created_at,
  bij.updated_at,
  CASE
    WHEN bij.status IN ('failed', 'cancelled', 'paused')
    AND bij.last_successful_batch < bij.total_batches
    THEN true
    ELSE false
  END AS can_resume,
  ROUND(
    (bij.last_successful_batch::numeric / NULLIF(bij.total_batches, 0)::numeric) * 100,
    1
  ) AS completion_percentage
FROM bulk_import_jobs bij
WHERE bij.status IN ('failed', 'cancelled', 'inserting', 'paused')
  AND bij.user_id = auth.uid()
ORDER BY bij.updated_at DESC;

-- Grant access to view
GRANT SELECT ON resumable_imports TO authenticated;

COMMENT ON VIEW resumable_imports IS 'Shows bulk import jobs that can be resumed after interruption, including paused imports';
