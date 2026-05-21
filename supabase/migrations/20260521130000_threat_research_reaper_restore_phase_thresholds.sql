-- 20260521130000_threat_research_reaper_restore_phase_thresholds.sql
--
-- Reverts `threat_research_reaper_aggressive_single_pass` (applied
-- 2026-05-19 outside this migration tree) which collapsed all phase
-- thresholds to a uniform 4-min reset / 10-min hard-kill.
--
-- That change made the wrong assumption: "single-pass jobs finish in
-- 30-150 sec; 4 min idle means worker is dead." Research's final
-- synthesis call alone can legitimately take 100-180s (5625 tokens =
-- 104s observed in bc5804b3; 8391 tokens = 134s observed in d62c4ba5
-- after the prompt strip). With iter 1, tool execution, iter 2, more
-- tools, and iter 3 synthesis stacked, total research time can run
-- 3-5+ minutes — which the 4-min reaper treats as a dead worker and
-- restarts. The original worker is still alive doing the Anthropic
-- call; the new worker races; the loop appears stuck.
--
-- This migration restores the phase-aware thresholds from
-- 20260519120200_threat_research_qa_budget_reaper_fix.sql, which is
-- the last committed-to-repo state before the out-of-tree change.

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
  -- 1. Hard-kill exhausted-retry running jobs. Per-phase thresholds:
  --    research/attack_research/opp_planning/detection: 15 min
  --      (final synthesis can take 3 min; with tool execution stacked
  --       and a retry-on-failure inside the agent loop, legitimate
  --       phases reach 8-12 min in worst case. 15 min covers it.)
  --    qa: 35 min (actor-critic loop = critique + opus revision +
  --      critique + opus revision + critique. Each step is up to 4
  --      minutes; 35 min is the realistic ceiling).
  --    preflight/finalise: 6 min (one short call, but allow margin).
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

  -- 2. Reset still-retryable stuck running jobs. Phase-aware: a long
  --    research call is not the same as a stuck preflight.
  --    research/attack_research:        10 min reset
  --    opportunity_planning/detection:  12 min reset
  --    qa:                              25 min reset (longest actor-critic path)
  --    preflight/finalise:               4 min reset
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
  'Safety-net dispatcher/reaper. 2026-05-21: reverts aggressive 4-min unified threshold from threat_research_reaper_aggressive_single_pass. Phase-aware thresholds restored — research/attack_research reset at 10 min (synthesis call legitimately takes 100-180s), qa reset at 25 min (actor-critic loop), opportunity_planning/detection at 12 min.';
