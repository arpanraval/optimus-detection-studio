-- Migration: Create bulk_import_jobs table for tracking import history
-- Run this migration in Supabase SQL Editor or via CLI

-- Create bulk_import_jobs table
CREATE TABLE IF NOT EXISTS bulk_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source configuration
  source_type TEXT NOT NULL CHECK (source_type IN ('github', 'zip', 'files')),
  source_url TEXT,
  source_vendor TEXT CHECK (source_vendor IN ('sigma', 'splunk_escu', 'elastic', 'kql', 'chronicle', 'mixed')),

  -- Target configuration
  target_library TEXT NOT NULL CHECK (target_library IN ('universal', 'user')),
  duplicate_strategy TEXT DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'update', 'create_new')),

  -- Progress tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'fetching', 'parsing', 'validating',
    'preview', 'inserting', 'completed', 'failed', 'cancelled'
  )),
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,

  -- Results
  imported_detection_ids TEXT[] DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  warnings JSONB DEFAULT '[]',

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_user_id ON bulk_import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_status ON bulk_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_created_at ON bulk_import_jobs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE bulk_import_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own bulk import jobs
CREATE POLICY "Users can view their own bulk import jobs"
  ON bulk_import_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create bulk import jobs
CREATE POLICY "Users can create bulk import jobs"
  ON bulk_import_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own bulk import jobs
CREATE POLICY "Users can update their own bulk import jobs"
  ON bulk_import_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Admins can view all bulk import jobs
CREATE POLICY "Admins can view all bulk import jobs"
  ON bulk_import_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_bulk_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bulk_import_jobs_updated_at ON bulk_import_jobs;
CREATE TRIGGER bulk_import_jobs_updated_at
  BEFORE UPDATE ON bulk_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_bulk_import_jobs_updated_at();

-- Add comment to table
COMMENT ON TABLE bulk_import_jobs IS 'Tracks bulk import operations for detection rules from external sources';
