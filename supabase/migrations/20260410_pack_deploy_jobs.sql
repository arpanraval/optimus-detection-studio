-- Pack Deploy Jobs
--
-- Persistent deploy job queue so pack deploys survive tab close / page refresh.
-- Worker edge function processes jobs in the background. Client subscribes via
-- Supabase Realtime for live progress updates.

CREATE TABLE IF NOT EXISTS pack_deploy_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid REFERENCES detection_packs(id) ON DELETE SET NULL,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','partial','failed','cancelled')),
  total_items integer NOT NULL DEFAULT 0,
  succeeded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  current_detection_id text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_deploy_jobs_status ON pack_deploy_jobs(status) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_pack_deploy_jobs_created_by ON pack_deploy_jobs(created_by, created_at DESC);

-- Per-detection item status so we can resume and report granular state
CREATE TABLE IF NOT EXISTS pack_deploy_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES pack_deploy_jobs(id) ON DELETE CASCADE,
  detection_id text NOT NULL,
  detection_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  vendor_rule_id text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  UNIQUE (job_id, detection_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_deploy_job_items_job ON pack_deploy_job_items(job_id, status);

-- RLS
ALTER TABLE pack_deploy_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_deploy_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own deploy jobs" ON pack_deploy_jobs;
CREATE POLICY "Users can view their own deploy jobs"
  ON pack_deploy_jobs FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create deploy jobs" ON pack_deploy_jobs;
CREATE POLICY "Users can create deploy jobs"
  ON pack_deploy_jobs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update their own deploy jobs" ON pack_deploy_jobs;
CREATE POLICY "Users can update their own deploy jobs"
  ON pack_deploy_jobs FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can view their own deploy job items" ON pack_deploy_job_items;
CREATE POLICY "Users can view their own deploy job items"
  ON pack_deploy_job_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pack_deploy_jobs j WHERE j.id = job_id AND j.created_by = auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own deploy job items" ON pack_deploy_job_items;
CREATE POLICY "Users can insert their own deploy job items"
  ON pack_deploy_job_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pack_deploy_jobs j WHERE j.id = job_id AND j.created_by = auth.uid()));

-- Service role bypasses RLS (edge function uses service role)
GRANT ALL ON pack_deploy_jobs TO service_role;
GRANT ALL ON pack_deploy_job_items TO service_role;

-- Enable Realtime for live progress updates (idempotent — skip if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pack_deploy_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pack_deploy_jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pack_deploy_job_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pack_deploy_job_items;
  END IF;
END $$;
