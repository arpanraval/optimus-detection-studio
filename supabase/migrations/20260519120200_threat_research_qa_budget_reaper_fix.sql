-- 20260519120200_threat_research_qa_budget_reaper_fix.sql
--
-- Live trace bc5804b3-4d87-4ce6-896d-2f9fd36e14f7 showed QA jobs being
-- reset/hard-killed while the actor-critic path was still making progress.
-- The duplicate workers then spent the remaining session budget and the
-- final leaves failed with model_budget_exhausted/tool_budget_exhausted.
--
-- Reaper policy after the code fix:
--   - QA no longer has tools, so normal QA should be faster.
--   - Still, a complex QA leaf can involve critique -> Opus revision ->
--     critique -> Opus revision -> final critique. Do not duplicate that
--     worker unless it has been quiet for a genuinely abnormal interval.
--   - Keep research/attack/detection thresholds as-is; only QA gets the
--     longer grace window because failed QA is recoverable but duplicate QA
--     burns the shared session budget.

CREATE OR REPLACE FUNCTION public.threat_research_dispatcher()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_now timestamptz := now();
  v_grp RECORD;
  v_dispatched uuid;
BEGIN
  -- 1. Hard-kill exhausted-retry running jobs. QA gets 35 minutes because
  -- the actor-critic loop can legitimately span several model calls; the
  -- cost of premature duplication is worse than waiting.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '6 minutes')
       OR (phase IN ('research','attack_research','opportunity_planning','detection') AND started_at < v_now - interval '15 minutes')
       OR (phase = 'qa'                                                     AND started_at < v_now - interval '35 minutes')
     );

  -- 2. Reset still-retryable stuck running jobs. QA gets a longer reset
  -- window to avoid the duplicate-live-worker race observed in production.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '4 minutes')
       OR (phase IN ('research','attack_research')                         AND started_at < v_now - interval '10 minutes')
       OR (phase IN ('opportunity_planning','detection')                   AND started_at < v_now - interval '12 minutes')
       OR (phase = 'qa'                                                    AND started_at < v_now - interval '25 minutes')
     );

  -- 3. Mark sessions failed when all their jobs have terminated AND at
  --    least one failed.
  UPDATE public.threat_research_sessions s
     SET status         = 'failed',
         failure_reason = COALESCE(
           (SELECT j.failure_reason
              FROM public.threat_research_jobs j
             WHERE j.session_id = s.id AND j.status = 'failed'
             ORDER BY j.completed_at DESC NULLS LAST
             LIMIT 1),
           'job worker exhausted retries'
         ),
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

  -- 4. Dispatch stranded pending jobs. dispatch_next_in_phase is
  --    concurrency-aware, so this loop is safe even when cron races a
  --    completing worker.
  FOR v_grp IN
      SELECT DISTINCT session_id, phase
        FROM public.threat_research_jobs
       WHERE status     = 'pending'
         AND created_at < v_now - interval '30 seconds'
  LOOP
    LOOP
      SELECT public.threat_research_dispatch_next_in_phase(v_grp.session_id, v_grp.phase) INTO v_dispatched;
      EXIT WHEN v_dispatched IS NULL;
    END LOOP;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.threat_research_dispatcher() IS
  'Safety-net dispatcher/reaper. 2026-05-19 update: QA reset/hard-kill thresholds are 25/35 min to avoid duplicate actor-critic workers exhausting shared session budget.';
