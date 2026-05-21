-- 20260520a_auto_digest_campaign_events.sql
-- Adds the five event types the subject-linker emits when deciding whether a
-- newly-digested article belongs to an existing campaign:
--
--   campaign_link_evaluated  — Always emitted after the AI subject-equivalence
--                              call; payload carries the AI's matches + rationale.
--                              Useful even when no link is made because it shows
--                              the user *that* the check ran.
--   campaign_link_skipped    — Convenience event for "nothing to compare against"
--                              or "AI returned no matches" — keeps the transcript
--                              honest without forcing the UI to interpret the
--                              evaluated event's empty matches list.
--   campaign_link_ambiguous  — Emitted when the AI says the new article matches
--                              reports that live in multiple distinct existing
--                              campaigns. The linker picks one (largest article
--                              count wins) and surfaces the conflict here so a
--                              human can review.
--   campaign_created         — A new campaign was created with at least 2 reports.
--   campaign_updated         — An existing campaign gained one or more reports.
--
-- The previous design (actor-based detectAndMergeCampaign) emitted no events at
-- all when deciding not to form a campaign — so the dead-on-arrival behaviour was
-- invisible. These events are how we make sure that never happens again.
--
-- Code mirrors live in:
--   - supabase/functions/auto-digest-orchestrator/lib/events.ts (EventType)
--   - supabase/functions/auto-digest-orchestrator/lib/subject-linker.ts (emit calls)
--   - src/hooks/useAutoDigestEvents.ts (DigestEventType)
--   - src/components/threatintel/JobTranscript.tsx (EVENT_STAGE)

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
    'article_ranked',
    'article_digested',
    'article_digest_failed',
    'campaign_link_evaluated',
    'campaign_link_skipped',
    'campaign_link_ambiguous',
    'campaign_created',
    'campaign_updated'
  ));
