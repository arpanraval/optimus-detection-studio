-- 20260519120000_threat_research_planner_agent.sql
--
-- Add 'planner' to the threat_research_events.agent CHECK constraint.
--
-- WHY: The Opportunity Planner has been emitting events under agent:
-- 'detection-engineer' since PR2, because the original CHECK constraint
-- didn't include 'planner' and we hadn't carved out a slot for it. That
-- causes a real usability problem in the activity console: when the
-- planner fails (e.g. 2026-05-19 trace: temperature deprecation on Opus
-- 4.7), the failure shows up as "Engineer agent failed" — followed by
-- N additional engineer_failed events from the actual Detection Engineer
-- fan-out. Operators can't distinguish "1 planner + N engineer" from
-- "N+1 engineer".
--
-- Add 'planner' so the planner can emit under its own label. Idempotent
-- on re-run because we drop the existing constraint by name before
-- adding the new one.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname
    INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class       rel ON rel.oid = con.conrelid
    JOIN pg_namespace   nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'threat_research_events'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%agent%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.threat_research_events DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END $$;

ALTER TABLE public.threat_research_events
  ADD CONSTRAINT threat_research_events_agent_check
  CHECK (agent IN (
    'orchestrator',
    'preflight',
    'research',
    'attack-researcher',
    'planner',
    'detection-engineer',
    'qa'
  ));

COMMENT ON CONSTRAINT threat_research_events_agent_check ON public.threat_research_events IS
  'Agent label for event emission. Planner is separate from detection-engineer so the activity console can distinguish planner failures from engineer failures.';
