-- 20260518120300_threat_research_finalise_gate.sql
--
-- Fix finalise gating: previously, both the detection worker and the qa
-- worker called threat_research_promote_phase(<phase>, 'finalise'). The
-- generic promoter only verifies the COMPLETED phase's jobs are terminal,
-- not sibling phases. So the last detection job could complete (with qa
-- jobs still pending/running, just enqueued), promote_phase saw all
-- detection terminal, and INSERTED + dispatched the finalise job.
-- Finalise then ran cross-opportunity dedup and marked the session
-- completed while QA was still writing verdicts to the tree.
--
-- Symptom: a session shows status='completed' but several opportunities
-- have qa=null in the tree (because finalise ran before those qa workers
-- finished patching). The flagCrossBehaviourDuplicates pass also runs
-- against an incomplete tree, so semantic-duplicate flags can be missing.
--
-- Fix: a dedicated tr_promote_finalise_if_ready RPC that checks ALL
-- "blocking" phases (detection AND qa) are terminal before inserting
-- finalise. Both the detection worker and the qa worker call this RPC;
-- whichever phase completes last fires the promotion. Idempotent — the
-- second caller sees a finalise row already exists and bails.
--
-- This RPC sits alongside threat_research_promote_phase (which stays for
-- the simpler single-phase fan-in transitions like attack_research ->
-- opportunity_planning). The orchestrator code uses the new RPC only for
-- the finalise transition.

CREATE OR REPLACE FUNCTION public.tr_promote_finalise_if_ready(
  p_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_detection_pending int;
  v_qa_pending        int;
  v_finalise_id       uuid;
BEGIN
  -- Session-scoped advisory lock so concurrent finalise-promote attempts
  -- (one from the last detection worker, one from the last qa worker)
  -- serialise. The lock is xact-scoped — released on commit.
  PERFORM pg_advisory_xact_lock(hashtext('tr-finalise-' || p_session_id::text));

  -- Detection must be fully terminal. We don't require detection jobs to
  -- exist at all — an edge case where research produced zero behaviours
  -- leaves zero detection jobs, in which case finalise should still fire
  -- (so the session can complete with empty trees).
  SELECT count(*) INTO v_detection_pending
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = 'detection'
     AND status NOT IN ('completed','failed');
  IF v_detection_pending > 0 THEN
    RETURN NULL;
  END IF;

  -- QA must be fully terminal. Same edge case for empty QA — if no qa
  -- jobs were ever enqueued (e.g. every opportunity hit a library_match
  -- short-circuit), v_qa_pending=0 and finalise can fire.
  SELECT count(*) INTO v_qa_pending
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = 'qa'
     AND status NOT IN ('completed','failed');
  IF v_qa_pending > 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotency: don't re-create finalise if it's already been queued.
  -- This also handles the race where two workers (the last detection
  -- worker and the last qa worker) both observe the gate clear and try
  -- to promote — the advisory lock serialises them, and the second
  -- caller sees the existing row here and bails.
  SELECT id INTO v_finalise_id
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = 'finalise'
   LIMIT 1;
  IF v_finalise_id IS NOT NULL THEN
    RETURN v_finalise_id;
  END IF;

  -- Both phases terminal, no existing finalise row — insert it and
  -- dispatch immediately. attempt_count is NOT bumped here; tr_claim_job
  -- handles that when the worker picks the job up.
  INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
  VALUES (p_session_id, 'finalise', NULL)
  RETURNING id INTO v_finalise_id;

  UPDATE public.threat_research_jobs
     SET status = 'running', started_at = now()
   WHERE id = v_finalise_id;

  PERFORM public.threat_research_dispatch_job(v_finalise_id);
  RETURN v_finalise_id;
END;
$function$;

COMMENT ON FUNCTION public.tr_promote_finalise_if_ready(uuid) IS
  'Atomically gates the detection+qa -> finalise transition. Both detection and qa phases must be fully terminal before finalise is inserted. Idempotent under concurrent callers via session-scoped advisory lock.';

GRANT EXECUTE ON FUNCTION public.tr_promote_finalise_if_ready(uuid) TO service_role;
