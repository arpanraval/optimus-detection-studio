-- Allow 'partial' as a session outcome.
--
-- The pipeline could previously only say completed or failed, and that binary
-- is why it lied in both directions:
--
--   bc5804b3  wrote ten queries, hit six QA errors, and was reported as a
--             total failure -- "no usable detections" -- while holding ten
--             usable queries.
--   793cafab  had its real work killed by credit exhaustion and was reported
--             as completed because five library look-ups survived. Corrected
--             to failed by hand.
--
-- Neither run was completed and neither was a failure. 'partial' is the
-- missing state: work was preserved, and some of it needs a human before it
-- can ship.
--
-- This migration must land BEFORE the code that writes the value. A CHECK
-- constraint rejects the UPDATE silently from the application's point of view
-- -- the same failure mode as the events.agent constraint, which rejected
-- every event from one agent and left an entire phase running with no trace.

ALTER TABLE public.threat_research_sessions
  DROP CONSTRAINT IF EXISTS threat_research_sessions_status_check;

ALTER TABLE public.threat_research_sessions
  ADD CONSTRAINT threat_research_sessions_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'running'::text,
    'completed'::text,
    'partial'::text,
    'failed'::text,
    'cancelled'::text
  ]));

COMMENT ON COLUMN public.threat_research_sessions.status IS
  'pending | running | completed | partial | failed | cancelled. "completed" means everything the session produced is ready to act on; "partial" means work was preserved but some of it needs a human verdict; "failed" means nothing was preserved.';
