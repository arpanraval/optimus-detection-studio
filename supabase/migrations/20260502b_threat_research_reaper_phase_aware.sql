-- 20260502b_threat_research_reaper_phase_aware.sql
--
-- Phase-aware reaper thresholds. The actor-critic loop wired into the qa
-- phase can legitimately consume up to ~12 model calls per opportunity
-- (3 critique × 2 iters + 2 revise × 3 iters = 12 calls × ~30-60s = up to
-- 7 minutes). The previous 4-minute reset threshold killed in-progress
-- legitimate qa workers, restarted them from scratch (no checkpoint
-- because handleQa runs the whole loop in one worker invocation), and
-- doubled the cost on the work that did get billed before the reset.
--
-- The Tier-1 hard kill stays at 6 minutes for non-qa phases and bumps to
-- 10 minutes for qa, both gated on attempt_count >= 3. So a legitimate
-- 7-minute qa worker that's actually making progress gets to finish on
-- attempt 1; only repeated failures hit the kill switch.
--
-- attack_research / detection / preflight / research / finalise all keep
-- the original 4-minute reset / 6-minute hard-kill thresholds — none of
-- them have an inner loop the size of qa's actor-critic.
--
-- This migration also keeps everything else from 20260501b intact and
-- supersedes its function definition.

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
  -- 1. Hard-kill exhausted-retry running jobs. qa phase gets a longer
  --    ceiling (10 min) because actor-critic worst-case wall time is
  --    ~7 min; other phases stay at 6 min.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase = 'qa' AND started_at < v_now - interval '10 minutes')
       OR (phase <> 'qa' AND started_at < v_now - interval '6 minutes')
     );

  -- 2. Reset still-retryable stuck running jobs back to pending. qa
  --    threshold raised to 8 min so legitimate worst-case actor-critic
  --    workers (up to ~7 min) finish on first attempt instead of being
  --    pre-emptively reset. Other phases stay at 4 min.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase = 'qa' AND started_at < v_now - interval '8 minutes')
       OR (phase <> 'qa' AND started_at < v_now - interval '4 minutes')
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
