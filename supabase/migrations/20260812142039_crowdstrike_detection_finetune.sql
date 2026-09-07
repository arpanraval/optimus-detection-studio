-- CrowdStrike-only AI finetuning. Separate from the Defender/KQL flow.

CREATE TABLE IF NOT EXISTS public.crowdstrike_finetune_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text NOT NULL,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  preflight_run_id uuid REFERENCES public.detection_preflight_runs(id) ON DELETE SET NULL,
  anthropic_session_id text,
  status text NOT NULL DEFAULT 'running',
  repository text NOT NULL,
  window_days integer NOT NULL,
  original_query text NOT NULL,
  baseline_hit_count bigint,
  query_count integer NOT NULL DEFAULT 0,
  nudged boolean NOT NULL DEFAULT false,
  result jsonb,
  error_message text,
  usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT crowdstrike_finetune_runs_repository_check CHECK (
    repository = ANY (ARRAY['search-all', 'investigate_view', 'third-party', 'falcon_for_it_view', 'forensics_view'])
  ),
  CONSTRAINT crowdstrike_finetune_runs_window_days_check CHECK (window_days BETWEEN 1 AND 90),
  CONSTRAINT crowdstrike_finetune_runs_status_check CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS crowdstrike_finetune_runs_detection_idx
  ON public.crowdstrike_finetune_runs (detection_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_crowdstrike_finetune_run
  ON public.crowdstrike_finetune_runs (detection_id, user_id)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.crowdstrike_finetune_query_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.crowdstrike_finetune_runs(id) ON DELETE CASCADE,
  tool_use_id text NOT NULL,
  purpose text NOT NULL,
  query_text text NOT NULL,
  repository text NOT NULL,
  provider_job_id text,
  status text NOT NULL DEFAULT 'queued',
  row_count integer,
  result_sample jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT crowdstrike_finetune_query_jobs_repository_check CHECK (
    repository = ANY (ARRAY['search-all', 'investigate_view', 'third-party', 'falcon_for_it_view', 'forensics_view'])
  ),
  CONSTRAINT crowdstrike_finetune_query_jobs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT crowdstrike_finetune_query_jobs_tool_unique UNIQUE (run_id, tool_use_id)
);

CREATE INDEX IF NOT EXISTS crowdstrike_finetune_query_jobs_run_idx
  ON public.crowdstrike_finetune_query_jobs (run_id, created_at);

ALTER TABLE public.crowdstrike_finetune_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crowdstrike_finetune_query_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY crowdstrike_finetune_runs_select
  ON public.crowdstrike_finetune_runs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY crowdstrike_finetune_query_jobs_select
  ON public.crowdstrike_finetune_query_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.crowdstrike_finetune_runs run
    WHERE run.id = crowdstrike_finetune_query_jobs.run_id
      AND run.user_id = (SELECT auth.uid())
  ));

GRANT SELECT ON public.crowdstrike_finetune_runs TO authenticated, service_role;
GRANT SELECT ON public.crowdstrike_finetune_query_jobs TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.crowdstrike_finetune_runs TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.crowdstrike_finetune_query_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_crowdstrike_finetune_query_slot(
  p_run_id uuid,
  p_budget integer
)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS '
  UPDATE public.crowdstrike_finetune_runs
     SET query_count = query_count + 1,
         updated_at = now()
   WHERE id = p_run_id
     AND status = ''running''
     AND query_count < p_budget
  RETURNING query_count;
';

REVOKE ALL ON FUNCTION public.reserve_crowdstrike_finetune_query_slot(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_crowdstrike_finetune_query_slot(uuid, integer)
  TO service_role;
