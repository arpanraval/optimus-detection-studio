-- 20260430c_threat_research_jobs.sql
-- Queue table for the Threat Research orchestrator. Replaces the
-- continuation-pattern hack that crammed multi-minute LLM orchestration
-- into Supabase Edge's ~150-250s background-worker lifetime cap.
--
-- Each job is one piece of work that runs to completion in its own fresh
-- edge-function invocation. Phases fan out through job rows:
--   preflight  → research  → attack_research × N  → detection × N  → finalise
--
-- A worker, on completing its job, inserts the next-phase job(s) and
-- dispatches them directly via pg_net.http_post (zero-latency hand-off).
-- pg_cron acts only as a safety net for jobs that pg_net failed to
-- deliver or workers that died mid-job (see 20260430d).

CREATE TABLE IF NOT EXISTS public.threat_research_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE,
  phase           text NOT NULL CHECK (phase IN ('preflight','research','attack_research','detection','finalise')),
  -- Only set for attack_research and detection (one job per behaviour);
  -- null for the singleton phases (preflight, research, finalise).
  behaviour_id    text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed')),
  attempt_count   int  NOT NULL DEFAULT 0,
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Prevents the same logical job from being inserted twice (e.g. a duplicate
  -- fan-out from a retried worker). The unique tuple uses a sentinel for
  -- behaviour_id-null because Postgres treats NULL as distinct in unique
  -- indexes by default; using COALESCE keeps the singleton-phase guarantee.
  UNIQUE (session_id, phase, behaviour_id)
);

COMMENT ON TABLE public.threat_research_jobs IS
  'One row per unit of orchestration work. Workers self-dispatch via pg_net; pg_cron handles recovery.';

-- Cheap scan for the dispatcher when picking the next pending job.
CREATE INDEX IF NOT EXISTS threat_research_jobs_pending_idx
  ON public.threat_research_jobs (created_at)
  WHERE status = 'pending';

-- Used by the fan-in guard ("are all my-phase peers done?") and by the
-- session-repair pass.
CREATE INDEX IF NOT EXISTS threat_research_jobs_session_phase_idx
  ON public.threat_research_jobs (session_id, phase, status);

-- Stuck-running detection — reaper picks rows whose started_at is too old.
CREATE INDEX IF NOT EXISTS threat_research_jobs_running_started_at_idx
  ON public.threat_research_jobs (started_at)
  WHERE status = 'running';

-- RLS: jobs are server-side coordination state. Only service-role writes;
-- end users see them via the parent session's policies (we don't expose
-- them on the API surface today).
ALTER TABLE public.threat_research_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.threat_research_jobs;
CREATE POLICY "service role only"
  ON public.threat_research_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
