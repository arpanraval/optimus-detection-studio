ALTER TABLE public.detection_preflight_runs
  DROP CONSTRAINT IF EXISTS detection_preflight_runs_provider_check;

ALTER TABLE public.detection_preflight_runs
  ADD CONSTRAINT detection_preflight_runs_provider_check
  CHECK (provider = ANY (ARRAY['defender_xdr'::text, 'crowdstrike'::text]));

ALTER TABLE public.detection_preflight_runs
  DROP CONSTRAINT IF EXISTS detection_preflight_runs_status_check;

ALTER TABLE public.detection_preflight_runs
  ADD CONSTRAINT detection_preflight_runs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'running'::text,
    'success'::text,
    'query_error'::text,
    'connection_error'::text,
    'timeout'::text,
    'permission_denied'::text,
    'cancelled'::text
  ]));

ALTER TABLE public.detection_preflight_runs
  ADD COLUMN IF NOT EXISTS provider_job_state jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

COMMENT ON COLUMN public.detection_preflight_runs.provider_job_state IS
  'Non-secret provider job identifiers and polling state for asynchronous pre-flight execution.';
