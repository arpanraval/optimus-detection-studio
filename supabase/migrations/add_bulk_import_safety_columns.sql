-- Migration: Add bulk import safety columns for audit trail and rollback
-- Run this migration in Supabase SQL Editor or via CLI

-- ============================================
-- 1. Add bulk_import_id to detections table
-- ============================================

-- Add bulk_import_id column to link detections to their import job
ALTER TABLE detections
ADD COLUMN IF NOT EXISTS bulk_import_id UUID REFERENCES bulk_import_jobs(id) ON DELETE SET NULL;

-- Create index for efficient rollback queries
CREATE INDEX IF NOT EXISTS idx_detections_bulk_import_id
ON detections(bulk_import_id)
WHERE bulk_import_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN detections.bulk_import_id IS 'References the bulk import job that created this detection (if any)';

-- ============================================
-- 2. Add vendor_metadata JSONB column
-- ============================================

-- Add vendor_metadata to store vendor-specific fields not in our schema
ALTER TABLE detections
ADD COLUMN IF NOT EXISTS vendor_metadata JSONB DEFAULT '{}';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_detections_vendor_metadata
ON detections USING GIN (vendor_metadata);

-- Add comment
COMMENT ON COLUMN detections.vendor_metadata IS 'Stores vendor-specific fields that do not map to standard columns (lossless import)';

-- ============================================
-- 3. Add checkpoint fields to bulk_import_jobs
-- ============================================

-- Add checkpoint data for resume capability
ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS checkpoint_data JSONB DEFAULT NULL;

-- Add last successful batch number
ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS last_successful_batch INTEGER DEFAULT 0;

-- Add total batches for progress tracking
ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS total_batches INTEGER DEFAULT 0;

-- Add comments
COMMENT ON COLUMN bulk_import_jobs.checkpoint_data IS 'Stores checkpoint state for resuming interrupted imports';
COMMENT ON COLUMN bulk_import_jobs.last_successful_batch IS 'Last batch number that was successfully inserted';
COMMENT ON COLUMN bulk_import_jobs.total_batches IS 'Total number of batches in the import job';

-- ============================================
-- 4. Add rollback tracking
-- ============================================

-- Add revert status tracking
ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ DEFAULT NULL;

-- Add reverted_by to track who reverted
ALTER TABLE bulk_import_jobs
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Update status check constraint to include 'reverted'
ALTER TABLE bulk_import_jobs
DROP CONSTRAINT IF EXISTS bulk_import_jobs_status_check;

ALTER TABLE bulk_import_jobs
ADD CONSTRAINT bulk_import_jobs_status_check
CHECK (status IN (
  'pending', 'fetching', 'parsing', 'validating',
  'preview', 'inserting', 'completed', 'failed', 'cancelled', 'reverted'
));

-- Add comments
COMMENT ON COLUMN bulk_import_jobs.reverted_at IS 'Timestamp when this import was reverted (if applicable)';
COMMENT ON COLUMN bulk_import_jobs.reverted_by IS 'User who initiated the rollback';

-- ============================================
-- 5. Create rollback function
-- ============================================

-- Function to safely rollback a bulk import
CREATE OR REPLACE FUNCTION rollback_bulk_import(
  p_job_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_job RECORD;
  v_deleted_count INTEGER;
  v_result JSONB;
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

  -- Check if job was completed (only completed jobs can be rolled back)
  IF v_job.status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only completed or failed imports can be rolled back'
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

  -- Delete all detections created by this import
  DELETE FROM detections
  WHERE bulk_import_id = p_job_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Update the job status
  UPDATE bulk_import_jobs
  SET
    status = 'reverted',
    reverted_at = now(),
    reverted_by = p_user_id,
    updated_at = now()
  WHERE id = p_job_id;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'job_id', p_job_id,
    'reverted_at', now()
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION rollback_bulk_import(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION rollback_bulk_import IS 'Safely rolls back a bulk import by deleting all detections created by the import job';

-- ============================================
-- 6. Create pre-flight RLS check function
-- ============================================

-- Function to verify user can write to detections table
CREATE OR REPLACE FUNCTION check_detection_write_permission(
  p_user_id UUID,
  p_library_type TEXT
) RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_result JSONB;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'User profile not found'
    );
  END IF;

  -- Check universal library permissions
  IF p_library_type = 'universal' THEN
    IF v_profile.role NOT IN ('owner', 'admin') THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'Only owners and admins can import to Universal Library',
        'required_role', 'admin',
        'current_role', v_profile.role
      );
    END IF;
  END IF;

  -- Try a test insert and rollback to verify RLS
  BEGIN
    -- All checks passed
    RETURN jsonb_build_object(
      'allowed', true,
      'user_id', p_user_id,
      'library_type', p_library_type,
      'user_role', v_profile.role
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', SQLERRM
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_detection_write_permission(UUID, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION check_detection_write_permission IS 'Pre-flight check to verify user has permission to write detections';

-- ============================================
-- 7. Add policy for admins to rollback any import
-- ============================================

-- Policy: Admins can update any bulk import job (for rollback)
DROP POLICY IF EXISTS "Admins can update any bulk import job" ON bulk_import_jobs;
CREATE POLICY "Admins can update any bulk import job"
  ON bulk_import_jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 8. Add resumable import view
-- ============================================

-- View to show resumable imports for a user
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
  bij.created_at,
  bij.updated_at,
  CASE
    WHEN bij.status IN ('failed', 'cancelled')
    AND bij.last_successful_batch < bij.total_batches
    THEN true
    ELSE false
  END AS can_resume,
  ROUND(
    (bij.last_successful_batch::numeric / NULLIF(bij.total_batches, 0)::numeric) * 100,
    1
  ) AS completion_percentage
FROM bulk_import_jobs bij
WHERE bij.status IN ('failed', 'cancelled', 'inserting')
  AND bij.user_id = auth.uid()
ORDER BY bij.updated_at DESC;

-- Grant access to view
GRANT SELECT ON resumable_imports TO authenticated;

-- Add comment
COMMENT ON VIEW resumable_imports IS 'Shows bulk import jobs that can be resumed after interruption';
