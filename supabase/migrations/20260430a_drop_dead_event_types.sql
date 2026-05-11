-- 20260430a_drop_dead_event_types.sql
-- Drop two event types from auto_digest_run_events that were never emitted
-- by the orchestrator. Keeping them in the CHECK constraint left dead
-- branches in JobTranscript and confused future readers about what the
-- pipeline can actually produce.
--
-- - 'article_relevance_dropped' — never emitted; rankAndSelect only
--                                  surfaces overflow ('article_skipped_daily_limit').
-- - 'article_duplicate'         — never emitted; harvester upsert with
--                                  ignoreDuplicates returns no row, so we
--                                  have nothing useful to write per-duplicate.
--
-- Code mirrors live in:
--   - supabase/functions/auto-digest-orchestrator/lib/events.ts (EventType)
--   - src/hooks/useAutoDigestEvents.ts (DigestEventType)
--   - src/components/threatintel/JobTranscript.tsx (EVENT_STAGE)

DELETE FROM auto_digest_run_events
WHERE event_type IN ('article_relevance_dropped', 'article_duplicate');

ALTER TABLE auto_digest_run_events
  DROP CONSTRAINT IF EXISTS auto_digest_run_events_event_type_check;

ALTER TABLE auto_digest_run_events
  ADD CONSTRAINT auto_digest_run_events_event_type_check
  CHECK (event_type IN (
    'feed_fetched',
    'feed_failed',
    'article_seen',
    'article_classified',
    'article_classify_failed',
    'article_skipped_daily_limit',
    'article_digested',
    'article_digest_failed'
  ));
