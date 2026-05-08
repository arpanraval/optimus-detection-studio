-- Reaper threshold update: 90s was too tight. The activity log proved the
-- killed worker on session 69d6edda was alive and making forward progress at
-- the 90s mark; per-behaviour actor-critic genuinely needs 120-200s for a
-- multi-opportunity behaviour.
--
-- New thresholds:
--   Tier 1 (hard kill):  attempt_count >= 3 AND started_at < now - 6 minutes
--                         → status = 'failed'
--   Tier 2 (retry-eligible): attempt_count < 3 AND started_at < now - 4 minutes
--                            → status = 'pending', started_at = NULL
--
-- 4 minutes is longer than worst-case in-flight detection job (initial gen
-- + actor-critic on 5 opportunities at ~40s each ≈ 230s).
-- 6 minutes is past edge-function lifetime (~150-250s) — anything still
-- 'running' at 6 minutes is definitively dead at the platform level.

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
  -- 1. Hard-kill exhausted-retry running jobs at 6 minutes.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND started_at < v_now - interval '6 minutes';

  -- 2. Reset still-retryable stuck running jobs back to pending at 4 minutes.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND started_at < v_now - interval '4 minutes';

  -- 3. Mark sessions failed when all their jobs have terminated AND at least
  --    one failed (i.e. nothing left to dispatch and we didn't reach finalise).
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

  -- 4. For every (session, phase) with stranded pendings, ask
  --    dispatch_next_in_phase to fire one — it's cap-aware.
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
