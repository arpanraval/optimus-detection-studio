-- =============================================================
-- Top 10 Features Foundation Migration
-- =============================================================

-- 1. Rate Limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  request_count int DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  UNIQUE(key, window_start)
);

CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Rate limit cleanup function
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Threat Intel Feeds table
CREATE TABLE IF NOT EXISTS threat_intel_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  feed_type text NOT NULL CHECK (feed_type IN ('rss', 'taxii')),
  url text NOT NULL,
  taxii_config jsonb,
  schedule_cron text DEFAULT '0 */6 * * *',
  is_enabled boolean DEFAULT true,
  quality_rating int CHECK (quality_rating BETWEEN 1 AND 5),
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE threat_intel_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feeds" ON threat_intel_feeds
  FOR ALL USING (auth.uid() = user_id);

-- 3. Threat Intel Feed Entries table
CREATE TABLE IF NOT EXISTS threat_intel_feed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES threat_intel_feeds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id text,
  title text NOT NULL,
  content text,
  url text,
  published_at timestamptz,
  fetched_at timestamptz DEFAULT now(),
  auto_digest_report_id text REFERENCES threat_intel_reports(id) ON DELETE SET NULL,
  staleness_score float DEFAULT 1.0,
  is_processed boolean DEFAULT false,
  UNIQUE(feed_id, external_id)
);

ALTER TABLE threat_intel_feed_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own feed entries" ON threat_intel_feed_entries
  FOR ALL USING (auth.uid() = user_id);

-- 4. Extend user_notifications
ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Tighten INSERT policy: client-side must set source_user_id = auth.uid()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notifications'
    AND policyname = 'System can insert notifications'
  ) THEN
    DROP POLICY "System can insert notifications" ON user_notifications;
  END IF;
END $$;

CREATE POLICY "Insert notifications with verified source" ON user_notifications
  FOR INSERT WITH CHECK (source_user_id = auth.uid() OR auth.role() = 'service_role');

-- 5. Extend detection_packs
ALTER TABLE detection_packs
  ADD COLUMN IF NOT EXISTS pack_type text DEFAULT 'custom'
    CHECK (pack_type IN ('tactic','technology','threat_actor','campaign','ransomware','custom')),
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_criteria jsonb,
  ADD COLUMN IF NOT EXISTS coverage_percent float DEFAULT 0;

-- 6. Enable Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE detections;

-- 7. Rate limit atomic upsert function
CREATE OR REPLACE FUNCTION upsert_rate_limit(
  p_key text,
  p_window_start timestamptz,
  p_max_requests int
) RETURNS int AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO rate_limits (key, request_count, window_start)
  VALUES (p_key, 1, date_trunc('minute', p_window_start))
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Custom updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_threat_intel_feeds_updated_at
  BEFORE UPDATE ON threat_intel_feeds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
