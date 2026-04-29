-- 20260429d_auto_digest_run_events.sql
-- Per-event audit trail for auto-digest runs. One row per decision the
-- orchestrator makes (feed fetched, article seen, classified, dropped,
-- digested, failed, etc.). Replaces the lossy result_summary counters
-- with a queryable timeline.

CREATE TABLE IF NOT EXISTS auto_digest_run_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES auto_digest_jobs(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  event_type      text NOT NULL CHECK (event_type IN (
    'feed_fetched',
    'feed_failed',
    'article_seen',
    'article_duplicate',
    'article_classified',
    'article_classify_failed',
    'article_relevance_dropped',
    'article_skipped_daily_limit',
    'article_digested',
    'article_digest_failed'
  )),
  -- Hoisted commonly-filtered/displayed fields (kept out of payload jsonb so
  -- they're indexable and free of JSONB extraction overhead in the UI).
  feed_id         uuid,
  feed_name       text,
  article_id      uuid,
  article_title   text,
  article_url     text,
  -- Decision results (only set for relevant event types).
  passed          boolean,    -- article_classified: true if passed gate
  reason          text,       -- classifier reason / drop reason / error message
  duration_ms     int,        -- article_digested: how long the digest took
  -- Type-specific extras the UI doesn't filter on.
  payload         jsonb
);

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────────────────────

-- Per-run timeline: the live-stream poll uses (job_id, created_at) for
-- "events since last seen". Covers the most common query.
CREATE INDEX IF NOT EXISTS auto_digest_run_events_job_created_idx
  ON auto_digest_run_events (job_id, created_at);

-- Cross-run failure analytics: "show me all classifier/digest/feed failures
-- in the last 7 days". Partial index keeps it small (failures are rare in
-- a healthy pipeline) and the other event types don't pay the maintenance.
CREATE INDEX IF NOT EXISTS auto_digest_run_events_failures_idx
  ON auto_digest_run_events (user_id, event_type, created_at DESC)
  WHERE event_type IN ('article_classify_failed', 'article_digest_failed', 'feed_failed');

-- Retention prune scan support.
CREATE INDEX IF NOT EXISTS auto_digest_run_events_created_idx
  ON auto_digest_run_events (created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
-- Writes are service-role only (orchestrator uses SUPABASE_SERVICE_ROLE_KEY).
-- Reads: users see their own events; owner/admin see all.

ALTER TABLE auto_digest_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_digest_run_events_admin_select ON auto_digest_run_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY auto_digest_run_events_self_select ON auto_digest_run_events
  FOR SELECT USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- Retention (90d) — extend the existing nightly rollup function so we don't
-- spawn another cron schedule.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rollup_ai_usage() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Existing: rollup yesterday's ai_usage_events into ai_usage_daily, prune raw events > 90 days.
  INSERT INTO ai_usage_daily (
    day, user_id, feature, model, category,
    call_count, input_tokens, output_tokens, cached_input_tokens,
    image_count, cost_usd, failure_count
  )
  SELECT
    (created_at AT TIME ZONE 'UTC')::date,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    feature, model, category,
    COUNT(*),
    SUM(input_tokens), SUM(output_tokens), SUM(cached_input_tokens),
    SUM(image_count), SUM(cost_usd),
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)
  FROM ai_usage_events
  WHERE created_at >= (now() AT TIME ZONE 'UTC')::date - interval '1 day'
    AND created_at <  (now() AT TIME ZONE 'UTC')::date
  GROUP BY 1, 2, 3, 4, 5
  ON CONFLICT (day, user_id, feature, model, category) DO UPDATE SET
    call_count          = EXCLUDED.call_count,
    input_tokens        = EXCLUDED.input_tokens,
    output_tokens       = EXCLUDED.output_tokens,
    cached_input_tokens = EXCLUDED.cached_input_tokens,
    image_count         = EXCLUDED.image_count,
    cost_usd            = EXCLUDED.cost_usd,
    failure_count       = EXCLUDED.failure_count,
    updated_at          = now();

  DELETE FROM ai_usage_events
  WHERE created_at < now() - interval '90 days';

  -- New: prune auto-digest run events older than 90 days. The cascade from
  -- auto_digest_jobs already drops events when an old job is deleted; this
  -- handles the case where the job row is retained longer than the events.
  DELETE FROM auto_digest_run_events
  WHERE created_at < now() - interval '90 days';
END;
$$;
