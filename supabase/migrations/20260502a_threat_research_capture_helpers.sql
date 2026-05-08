-- 20260502a_threat_research_capture_helpers.sql
--
-- Captures three orchestration RPCs that were created live but never written
-- into a committed migration:
--   - tr_claim_job
--   - threat_research_promote_phase
--   - threat_research_dispatch_next_in_phase
--
-- ALSO fixes the attempt_count double-increment bug. Previously both the
-- dispatcher SQL (promote_phase / dispatch_next_in_phase) AND the worker
-- (tr_claim_job) bumped attempt_count by 1, so a single successful first
-- run finished with attempt_count=2. The reaper's hard-kill threshold
-- (attempt_count >= 3) then fired after one real failure instead of two,
-- collapsing the "3 attempts" budget down to 1.5 attempts in practice.
--
-- New invariant: attempt_count ratchets only when a worker actually claims
-- the job. The dispatcher just marks status='running' + started_at=now()
-- and lets the worker bump on claim. If pg_net delivery fails before the
-- worker arrives, the reaper resets the row at 4min — no bump, clean retry.

-- ────────────────────────────────────────────────────────────────────────
-- tr_claim_job — worker-side, atomic claim. ONLY place attempt_count++.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tr_claim_job(p_job_id uuid)
RETURNS TABLE(
  id uuid,
  session_id uuid,
  phase text,
  behaviour_id text,
  status text,
  attempt_count integer,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.threat_research_jobs j
     SET status        = 'running',
         started_at    = now(),
         attempt_count = COALESCE(j.attempt_count, 0) + 1
   WHERE j.id = p_job_id
     AND j.status IN ('pending', 'running')
   RETURNING j.id, j.session_id, j.phase, j.behaviour_id, j.status, j.attempt_count, j.failure_reason;
END;
$function$;

COMMENT ON FUNCTION public.tr_claim_job(uuid) IS
  'Worker-side atomic claim. ONLY caller that bumps attempt_count. Idempotent on already-terminal rows (returns 0 rows).';

-- ────────────────────────────────────────────────────────────────────────
-- threat_research_promote_phase — fan-in + fan-out promoter
-- ────────────────────────────────────────────────────────────────────────
-- Called by workers when their phase completes. Verifies all sibling jobs
-- in the completing phase are terminal, then inserts next-phase rows
-- (one per behaviour for fan-out, one row for singletons) and dispatches
-- up to v_max_concurrent of them. Acquires a session-scoped advisory lock
-- so concurrent fan-in attempts serialise.
--
-- FIX: dispatcher no longer bumps attempt_count. Worker bumps on claim
-- via tr_claim_job. Dispatcher just sets status='running' + started_at.
CREATE OR REPLACE FUNCTION public.threat_research_promote_phase(
  p_session_id      uuid,
  p_completed_phase text,
  p_next_phase      text,
  p_behaviour_ids   text[] DEFAULT NULL::text[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_remaining      int;
  v_new_ids        uuid[] := '{}';
  v_id             uuid;
  v_bid            text;
  v_dispatched     int := 0;
  v_max_concurrent constant int := 2;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tr-session-' || p_session_id::text));

  SELECT count(*) INTO v_remaining
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_completed_phase
     AND status NOT IN ('completed','failed');
  IF v_remaining > 0 THEN
    RETURN v_new_ids;
  END IF;

  -- Idempotency guard: don't re-create next-phase jobs if they already exist.
  IF EXISTS (
    SELECT 1 FROM public.threat_research_jobs
     WHERE session_id = p_session_id
       AND phase      = p_next_phase
  ) THEN
    RETURN v_new_ids;
  END IF;

  IF p_behaviour_ids IS NULL OR array_length(p_behaviour_ids, 1) IS NULL THEN
    -- Singleton phase (preflight, research, finalise).
    INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
    VALUES (p_session_id, p_next_phase, NULL)
    RETURNING id INTO v_id;
    v_new_ids := array_append(v_new_ids, v_id);

    -- Mark running + dispatch. attempt_count NOT bumped here — worker bumps
    -- via tr_claim_job. See migration header for rationale.
    UPDATE public.threat_research_jobs
       SET status = 'running', started_at = now()
     WHERE id = v_id;
    PERFORM public.threat_research_dispatch_job(v_id);
  ELSE
    -- Fan-out (attack_research × N, detection × N).
    FOREACH v_bid IN ARRAY p_behaviour_ids LOOP
      INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
      VALUES (p_session_id, p_next_phase, v_bid)
      RETURNING id INTO v_id;
      v_new_ids := array_append(v_new_ids, v_id);

      IF v_dispatched < v_max_concurrent THEN
        -- attempt_count NOT bumped — worker handles it via tr_claim_job.
        UPDATE public.threat_research_jobs
           SET status = 'running', started_at = now()
         WHERE id = v_id;
        PERFORM public.threat_research_dispatch_job(v_id);
        v_dispatched := v_dispatched + 1;
      END IF;
      -- Else leave 'pending'; will be claimed by a completing sibling
      -- via dispatch_next_in_phase OR by the cron after 30s.
    END LOOP;
  END IF;

  RETURN v_new_ids;
END;
$function$;

COMMENT ON FUNCTION public.threat_research_promote_phase(uuid, text, text, text[]) IS
  'Fan-in + fan-out promoter. Inserts next-phase rows and dispatches up to 2 concurrently. Worker bumps attempt_count via tr_claim_job.';

-- ────────────────────────────────────────────────────────────────────────
-- threat_research_dispatch_next_in_phase — sibling promoter
-- ────────────────────────────────────────────────────────────────────────
-- When a fan-out worker completes, it asks for the next pending sibling
-- to be dispatched. Cap-aware: bails if running siblings already at
-- v_max_concurrent. Returns the dispatched job_id or NULL.
--
-- FIX: dispatcher no longer bumps attempt_count. Worker bumps on claim.
CREATE OR REPLACE FUNCTION public.threat_research_dispatch_next_in_phase(
  p_session_id uuid,
  p_phase      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_running        int;
  v_job_id         uuid;
  v_max_concurrent constant int := 2;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tr-phase-' || p_session_id::text || '-' || p_phase));

  SELECT count(*) INTO v_running
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_phase
     AND status     = 'running';
  IF v_running >= v_max_concurrent THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_job_id
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_phase
     AND status     = 'pending'
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mark running + dispatch. attempt_count NOT bumped here — see header.
  UPDATE public.threat_research_jobs
     SET status     = 'running',
         started_at = now()
   WHERE id = v_job_id;

  PERFORM public.threat_research_dispatch_job(v_job_id);
  RETURN v_job_id;
END;
$function$;

COMMENT ON FUNCTION public.threat_research_dispatch_next_in_phase(uuid, text) IS
  'Cap-aware sibling promoter. Worker bumps attempt_count via tr_claim_job, not here.';

-- ────────────────────────────────────────────────────────────────────────
-- Permissions: service role only. End users never call these.
-- ────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.tr_claim_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.threat_research_promote_phase(uuid, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.threat_research_dispatch_next_in_phase(uuid, text) TO service_role;
