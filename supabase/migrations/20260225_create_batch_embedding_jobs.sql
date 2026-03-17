-- Batch Embedding Jobs: track async Gemini Batch API jobs for bulk embedding generation
-- These jobs run at 50% cost vs real-time embedding API

CREATE TABLE IF NOT EXISTS batch_embedding_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gemini_batch_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'running', 'succeeded', 'processing', 'completed', 'failed', 'cancelled')),
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  request_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

-- Index for looking up active jobs
CREATE INDEX idx_batch_embedding_jobs_status ON batch_embedding_jobs(status);

-- RLS
ALTER TABLE batch_embedding_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view batch jobs"
  ON batch_embedding_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert batch jobs"
  ON batch_embedding_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update own batch jobs"
  ON batch_embedding_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Grant service role full access (edge functions use service role)
GRANT ALL ON batch_embedding_jobs TO service_role;
