-- 20260519120100_threat_research_reaper_phase_specific.sql
--
-- Replace the dispatcher's reaper thresholds with PHASE-SPECIFIC ceilings
-- sized to the worst-case wall time of each phase's agent loop. The
-- previous design used two buckets (qa vs everything-else) which was
-- sized for Haiku/Sonnet QA but is fatally too tight for Opus-driven
-- phases (opportunity_planning, detection) and for the longer Sonnet
-- workflows (research, attack_research) after the model-routing upgrade.
--
-- EVIDENCE: 2026-05-19 trace shows session cdef87e4-0fd3-48dd-8252-
-- cfe6e8910694 marked failed with reason "reaper: worker exceeded
-- edge-function lifetime" — a phase worker was reaped mid-run, attempts
-- accumulated, hard-kill fired. The reaper killed a legitimate worker
-- that was making progress.
--
-- Phase budget math (per-call timeout × iteration cap):
--   preflight             — 90s × 2  = 3 min        → reset 4/  hard 6   (keep)
--   research              — 240s × 5 = 20 min worst → reset 10/ hard 15
--   attack_research       — 180s × 6 = 18 min worst → reset 10/ hard 15
--   opportunity_planning  — 300s × 6 = 30 min worst → reset 12/ hard 15
--   detection             — 300s × 6 = 30 min worst → reset 12/ hard 15
--   qa                    — 120s × 6 = 12 min worst → reset 12/ hard 15 (already there)
--   finalise              — ~10s     = 10 s         → reset 4/  hard 6   (keep)
--
-- In practice most iterations complete in 30-90s on Sonnet and 60-120s
-- on Opus, so the typical path is well under these ceilings. The
-- ceilings exist for worst-case tail runs where strict-tools validation
-- needs an extra iteration or two. Reaping should fire ONLY when a
-- worker is genuinely stuck (network hang, isolate frozen), not on
-- normal slow paths.
--
-- The platform's underlying edge-function lifetime is the harder bound;
-- if it's shorter than these reaper thresholds, workers will die without
-- the reaper firing first. We've observed background workers running
-- 5-6 minutes successfully in production traces, so 15 min hard-kill is
-- a sanity net rather than a primary control. The reset threshold is
-- what we tune to avoid killing live workers prematurely.

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
  -- 1. Hard-kill exhausted-retry running jobs. Phase-specific ceilings
  --    sized to the agent loop's worst-case wall time. preflight and
  --    finalise stay tight (they're trivial); research, attack, planning,
  --    detection, qa get 15 min to accommodate worst-case Opus tails.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase IN ('preflight','finalise')                                                AND started_at < v_now - interval '6 minutes')
       OR (phase IN ('research','attack_research','opportunity_planning','detection','qa') AND started_at < v_now - interval '15 minutes')
     );

  -- 2. Reset still-retryable stuck running jobs back to pending. Reset
  --    thresholds are tuned to be just above the agent loop's typical
  --    upper bound so a legitimate slow worker doesn't get duplicated.
  --    The doubled-worker race (one row in 'pending' claimed by a fresh
  --    worker while the original is still mid-call) was a real cost
  --    multiplier on the 2026-05-19 trace.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase IN ('preflight','finalise')                                                AND started_at < v_now - interval '4 minutes')
       OR (phase IN ('research','attack_research')                                       AND started_at < v_now - interval '10 minutes')
       OR (phase IN ('opportunity_planning','detection','qa')                            AND started_at < v_now - interval '12 minutes')
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
  'Safety-net: dispatches orphaned pendings, reaps stuck runnings, marks dead sessions failed. Phase-specific thresholds (2026-05-19): preflight/finalise 4/6 min; research/attack 10/15 min; planning/detection/qa 12/15 min. Replaces the qa-vs-everything-else split that mis-killed Opus workers on 2026-05-19 trace.';
