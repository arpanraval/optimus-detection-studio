-- 20260518120200_threat_research_reaper_qa_thresholds.sql
--
-- Bump QA-phase reaper thresholds for the Sonnet/Opus model routing.
--
-- Supersedes the function definition shipped in 20260502b. Non-qa phases keep
-- the same 4 min reset / 6 min hard-kill thresholds. QA goes from 8/10 min
-- (sized for Haiku at ~30s/call) to 12/15 min (Sonnet 4.6 at ~50-90s/call,
-- worst-case actor-critic loop ~10-12 min).
--
-- WHY:
--   Each QA job runs a full actor-critic loop on one opportunity: up to 3
--   critique rounds × 2 iters/round + up to 2 revisions × 3 iters/revision =
--   ~12 model calls. At Sonnet 4.6 latency (~50-90s/call, longer for the
--   first call which writes the prompt cache), worst-case wall time is
--   8-12 minutes. The previous 8 min reset threshold was sized for Haiku
--   calls at ~30s/call and is essentially guaranteed to reset legitimate
--   in-progress Sonnet QA workers under load — duplicating work, doubling
--   cost, and inflating perceived failure rate.
--
--   The new ceilings:
--     reset (Tier 2):     12 min for qa, 4 min for non-qa
--     hard-kill (Tier 1): 15 min for qa, 6 min for non-qa
--
--   Non-qa phases (preflight, research, attack_research, opportunity_planning,
--   detection, finalise) all complete in well under 4 min even at Opus pace,
--   so their thresholds stay tight — they're caps on stuck workers, not on
--   normal completion latency.
--
-- This is a normal CREATE OR REPLACE FUNCTION migration so the dispatcher
-- diff stays visible in source control. Do not patch this via pg_proc UPDATEs
-- or dashboard edits; drift between this file and the live function is a bug
-- the reviewer should catch.

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
  --    ceiling (15 min) to fit Sonnet 4.6 actor-critic worst-case wall
  --    time of ~10-12 min plus headroom. Non-qa phases stay at 6 min.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase = 'qa' AND started_at < v_now - interval '15 minutes')
       OR (phase <> 'qa' AND started_at < v_now - interval '6 minutes')
     );

  -- 2. Reset still-retryable stuck running jobs back to pending. qa
  --    threshold raised to 12 min so legitimate worst-case actor-critic
  --    workers (up to ~10-12 min on Sonnet/Opus calls) finish on first
  --    attempt instead of being pre-emptively reset. Other phases stay
  --    at 4 min.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase = 'qa' AND started_at < v_now - interval '12 minutes')
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

COMMENT ON FUNCTION public.threat_research_dispatcher() IS
  'Safety-net: dispatches orphaned pendings, reaps stuck runnings, marks dead sessions failed. QA thresholds bumped to 12/15 min for Sonnet/Opus latencies (2026-05-18).';
