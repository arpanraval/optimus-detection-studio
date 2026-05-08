-- 20260430b_threat_research_current_phase.sql
-- Add current_phase column to threat_research_sessions to support the
-- continuation-pattern orchestrator (each phase / sub-batch runs in a fresh
-- edge worker, with phase progression tracked in the row).
--
-- Nullable, no default — legacy rows stay null and aren't picked up by
-- continuation logic. The orchestrator writes this column when it hands
-- off to the next phase via a self-invoke HTTP fetch.

ALTER TABLE public.threat_research_sessions
  ADD COLUMN IF NOT EXISTS current_phase text;

COMMENT ON COLUMN public.threat_research_sessions.current_phase IS
  'Continuation-pattern phase tracker. Values: preflight, research, '
  'attack_research:N (sub-batch start index), detection:N, finalise. '
  'Null for legacy rows. Updated transactionally before each continuation '
  'fetch so the next worker can verify it''s running the expected phase.';
