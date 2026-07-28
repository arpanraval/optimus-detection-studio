-- Align the reaper's thresholds with the Supabase edge-function ceiling.
--
-- Supabase kills an edge worker at 400 s. Every threat-research phase runs as
-- one edge invocation, so 400 s is a hard ceiling: past it the worker is
-- provably gone, and the job row is simply lying about being 'running'.
--
-- The thresholds predate that observation. They were tuned in 20260521130000
-- against how long a phase can legitimately *take* (research synthesis at
-- 100-180 s, a stacked agent loop at 3-5 min) rather than how long a worker
-- can legitimately *live*. The result is dead time on every failure:
--
--   phase                          reset was   hard-kill was   dead time
--   detection / opportunity_planning   12 min        15 min      ~5-12 min
--   research / attack_research         10 min        15 min      ~4-12 min
--   qa                                 25 min        35 min     ~19-29 min
--
-- Measured over all threat_research_jobs to date, detection p95 is 384 s and
-- research p95 611 s -- both at or past the ceiling, i.e. reaper-stamped
-- rather than genuinely slow. 28/182 detection jobs and 5/25 research jobs
-- failed, and each one burned ~12 min of wall clock doing nothing before the
-- retry even started.
--
-- New thresholds:
--   reset (attempt_count < 3):   450 s non-trivial, 240 s preflight/finalise
--   hard-kill (attempt_count>=3):480 s non-trivial, 240 s preflight/finalise
--
-- 450 s gives 50 s of headroom over the ceiling for clock skew and for the
-- gap between the platform's kill and the cron tick. 480 s > 450 s keeps the
-- ordering unambiguous: a job is always eligible for reset before hard-kill,
-- so the retry budget is never skipped. Moving the hard-kill block matters as
-- much as the reset block -- leaving it at 15 min would mean the FINAL attempt
-- still idles a quarter of an hour before the session is marked failed, which
-- is exactly the path a user is sitting and watching.
--
-- This does NOT change the detection-phase failure RATE (~15%); it only
-- shortens the dead time per failure. The underlying agent caps and timeouts
-- in lib/llm/model-routing.ts and lib/agents/agent-loop.ts are deliberately
-- untouched here.
--
-- Body is verbatim from the live definition (mirrored in supabase/schema.sql).
-- The only executable change is the interval constants; every statement in
-- step 3 (session failure roll-up) and step 4 (stranded-pending dispatch) is
-- unchanged -- diffed against the deployed definition, the sole textual
-- difference in that range is a restored section comment. SET search_path is
-- added to the header: the live function acquires it from the security-
-- hardening sweep, and restating it keeps the property under CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.threat_research_dispatcher()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_now timestamptz := now();
  v_grp RECORD;
  v_dispatched uuid;
BEGIN
  -- 1. Hard-kill exhausted-retry running jobs. The Supabase edge worker is
  --    killed at 400 s, so nothing legitimate is still alive at 480 s.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '240 seconds')
       OR (phase IN ('research','attack_research','opportunity_planning','detection') AND started_at < v_now - interval '480 seconds')
       OR (phase = 'qa'                                                     AND started_at < v_now - interval '480 seconds')
     );

  -- 2. Reset still-retryable stuck running jobs. 450 s = the 400 s platform
  --    ceiling plus headroom for clock skew and cron granularity. Kept below
  --    the hard-kill threshold so a job always gets its retries first.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '240 seconds')
       OR (phase IN ('research','attack_research')                         AND started_at < v_now - interval '450 seconds')
       OR (phase IN ('opportunity_planning','detection')                   AND started_at < v_now - interval '450 seconds')
       OR (phase = 'qa'                                                    AND started_at < v_now - interval '450 seconds')
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

  -- 4. Dispatch stranded pending jobs.
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
  'Safety-net dispatcher/reaper. 2026-07-28: thresholds pinned to the 400 s Supabase edge-function ceiling rather than to expected phase duration -- reset at 450 s (240 s for preflight/finalise), hard-kill at 480 s. Past 400 s the worker is provably dead, so the previous 10-25 min waits were pure dead time on every failure. Steps 3 and 4 unchanged from 20260521130000.';
