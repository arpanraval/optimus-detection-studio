-- 20260518a_threat_research_phase_qa_planning.sql
--
-- Phase-constraint repair + hard-cutover for the threat-research orchestrator
-- redesign.
--
-- WHY:
--   1. The original 20260430c CHECK constraint never included 'qa'. The worker
--      and reaper both inserted/handled 'qa' phase rows; we suspect the prod
--      database was hand-patched to keep inserts succeeding. This migration
--      moves the constraint into source-controlled state so any environment
--      can be recreated from scratch.
--   2. PR2 adds an 'opportunity_planning' phase between attack_research and
--      detection. Including it here means PR2 is a pure code change, no
--      additional migration coordination.
--   3. The redesign changes how the tree is shaped (new qa_error state on
--      detections; opportunity-planner emits canonical opportunities). Old
--      in-flight sessions can't be migrated cleanly — they were never going
--      to recover from their current state anyway because the feature is
--      broken. Hard-cutover: cancel them on deploy, surface a UI message,
--      users re-run.
--
-- This migration is intentionally idempotent on the constraint rewrite so
-- it runs cleanly whether the prod constraint matches the original 20260430c
-- form or was already hand-patched to include 'qa'.

-- ── 1. Phase constraint ──────────────────────────────────────────────────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find whatever check-constraint name guards the phase column today. The
  -- default PostgreSQL-generated name is threat_research_jobs_phase_check,
  -- but environments where the constraint was hand-recreated may have a
  -- different name (or no constraint at all).
  SELECT con.conname
    INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class       rel ON rel.oid = con.conrelid
    JOIN pg_namespace   nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'threat_research_jobs'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%phase%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.threat_research_jobs DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.threat_research_jobs
  ADD CONSTRAINT threat_research_jobs_phase_check
  CHECK (phase IN (
    'preflight',
    'research',
    'attack_research',
    'opportunity_planning',  -- PR2: deduplicates behaviours into canonical opportunities before generation
    'detection',
    'qa',
    'finalise'
  ));

-- ── 2. Hard-cutover: cancel in-flight sessions and their pending jobs ────
-- The redesign changes both the phase topology and the tree shape on
-- detections (new qa_error state). Existing in-flight sessions can't reach a
-- coherent terminal state — fail them loudly so users know to retry.
UPDATE public.threat_research_jobs
   SET status         = 'failed',
       failure_reason = 'cancelled: orchestrator redesign deploy (2026-05-18)',
       completed_at   = now()
 WHERE status IN ('pending','running');

UPDATE public.threat_research_sessions
   SET status         = 'cancelled',
       failure_reason = 'cancelled: orchestrator redesign deploy (2026-05-18); re-run the session',
       completed_at   = now(),
       updated_at     = now()
 WHERE status IN ('pending','running');

-- ── 3. Document the new constraint ───────────────────────────────────────
COMMENT ON CONSTRAINT threat_research_jobs_phase_check ON public.threat_research_jobs IS
  'Phases: preflight -> research -> attack_research x N -> opportunity_planning -> detection x M -> qa x M -> finalise. opportunity_planning is reserved for the canonical-opportunity dedup phase shipped in PR2.';
