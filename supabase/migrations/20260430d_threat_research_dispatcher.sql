-- 20260430d_threat_research_dispatcher.sql
-- Dispatcher SQL for the threat-research job queue (see 20260430c).
--
-- Two functions:
--   threat_research_dispatch_job(job_id)   one-shot HTTP-post a job to the
--                                          worker edge function. Used both
--                                          by workers (insert-next-then-
--                                          dispatch) and by the cron.
--   threat_research_dispatcher()           cron-driven safety net. Reaps
--                                          stuck running jobs, picks up
--                                          orphaned pendings, marks sessions
--                                          failed when all retries exhaust.
--
-- Vault secrets required (set via vault.create_secret out of band):
--   tr_supabase_url        e.g. 'https://<ref>.supabase.co'
--   tr_service_role_key    full service-role JWT
-- Without these the dispatcher errors out — fail loud beats silent stalls.

-- ----------------------------------------------------------
-- Single-job HTTP dispatch
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_research_dispatch_job(p_job_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url        text;
  v_key        text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'tr_supabase_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'threat_research_dispatch_job: missing vault secrets tr_supabase_url or tr_service_role_key';
  END IF;

  SELECT net.http_post(
    url     := v_url || '/functions/v1/threat-research-orchestrator?action=run_job',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('job_id', p_job_id)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.threat_research_dispatch_job(uuid) IS
  'Dispatches one threat-research job to the worker edge function via pg_net. Idempotent at the worker side.';

-- ----------------------------------------------------------
-- Cron-driven safety net: reap, retry, mark-failed, dispatch
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.threat_research_dispatcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_job RECORD;
BEGIN
  -- 1. Mark exhausted-retry running jobs as failed.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: attempt count exceeded'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND started_at < v_now - interval '10 minutes';

  -- 2. Reset still-retryable stuck running jobs to pending.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND started_at < v_now - interval '10 minutes';

  -- 3. Mark sessions failed when all their jobs have terminated AND at least
  --    one failed (i.e. nothing left to dispatch and we didn't reach finalise).
  UPDATE public.threat_research_sessions s
     SET status         = 'failed',
         failure_reason = 'job worker exhausted retries',
         completed_at   = v_now,
         updated_at     = v_now
   WHERE s.status = 'running'
     AND EXISTS (
       SELECT 1 FROM public.threat_research_jobs j
        WHERE j.session_id = s.id AND j.status = 'failed'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.threat_research_jobs j
        WHERE j.session_id = s.id AND j.status IN ('pending','running')
     );

  -- 4. Pick up pendings that didn't get a direct hand-off (created >30s ago
  --    and no worker has claimed them). Cap at 5 per tick to stay polite to
  --    Anthropic TPM; pg_net itself queues if more arrive simultaneously.
  FOR v_job IN
      SELECT id
        FROM public.threat_research_jobs
       WHERE status     = 'pending'
         AND created_at < v_now - interval '30 seconds'
       ORDER BY created_at ASC
       LIMIT 5
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.threat_research_jobs
       SET status        = 'running',
           started_at    = v_now,
           attempt_count = attempt_count + 1
     WHERE id = v_job.id;

    PERFORM public.threat_research_dispatch_job(v_job.id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.threat_research_dispatcher() IS
  'Safety-net: dispatches orphaned pendings, reaps stuck runnings, marks dead sessions failed.';

-- ----------------------------------------------------------
-- pg_cron: every minute. Replaces any prior schedule with the same name.
-- ----------------------------------------------------------
SELECT cron.unschedule('threat-research-dispatcher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'threat-research-dispatcher');

SELECT cron.schedule(
  'threat-research-dispatcher',
  '* * * * *',
  $$SELECT public.threat_research_dispatcher()$$
);
