-- 20260502d_digest_status_check.sql
--
-- Add CHECK constraint on threat_intel_feed_entries.digest_status. Without
-- this, typos at any of the eight write sites silently created zombie
-- states the rest of the pipeline never reads from. 'classify_failed' is
-- new — the classifier (after the H1 fix) sets it when JSON-repair gives
-- up on a truncated AI response, so the entry doesn't cycle forever in
-- 'harvested' on every run.

ALTER TABLE public.threat_intel_feed_entries
  DROP CONSTRAINT IF EXISTS threat_intel_feed_entries_digest_status_check;

ALTER TABLE public.threat_intel_feed_entries
  ADD CONSTRAINT threat_intel_feed_entries_digest_status_check
  CHECK (digest_status IN (
    'harvested',
    'classified',
    'queued',
    'digesting',
    'ready',
    'skipped',
    'classify_failed',
    'digest_failed',
    'extract_failed'
  ));

COMMENT ON CONSTRAINT threat_intel_feed_entries_digest_status_check
  ON public.threat_intel_feed_entries IS
  'Enum guard for digest_status. Update this list AND the orchestrator code together when adding new states.';
