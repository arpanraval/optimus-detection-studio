-- ============================================================
-- 11_auto_digest.sql - Auto-Digest Intelligence Pipeline
-- Tables, ALTER columns, indexes, RLS, seed data, cron job
-- ============================================================

-- ----------------------------------------------------------
-- 1. auto_digest_settings — one row per user
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_digest_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  schedule_hour_utc integer NOT NULL DEFAULT 6
    CHECK (schedule_hour_utc BETWEEN 0 AND 23),
  max_articles_per_day integer NOT NULL DEFAULT 3
    CHECK (max_articles_per_day BETWEEN 1 AND 10),
  ai_model text NOT NULL DEFAULT 'gemini-3-flash-preview',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auto_digest_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest settings" ON auto_digest_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 2. curated_feed_sources — system-level seed data
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS curated_feed_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text NOT NULL,
  url text NOT NULL,
  feed_type text NOT NULL DEFAULT 'rss',
  category text NOT NULL DEFAULT 'threat_research'
    CHECK (category IN (
      'threat_research', 'government', 'community'
    )),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  avg_articles_week numeric(4,1) DEFAULT 2.0,
  extraction_method text NOT NULL DEFAULT 'jina_reader'
    CHECK (extraction_method IN ('jina_reader', 'direct', 'headless')),
  extraction_selector text,
  extraction_tested_at timestamptz,
  extraction_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE curated_feed_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read curated feeds" ON curated_feed_sources
  FOR SELECT USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------
-- 3. auto_digest_campaigns — created when 3+ reports match in 48h
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_digest_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  threat_actors text[] DEFAULT '{}',
  campaign_keywords text[] DEFAULT '{}',
  attack_type text,
  severity text,
  merged_ttps jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_iocs jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_percent integer DEFAULT 0,
  total_ttp_count integer DEFAULT 0,
  covered_ttp_count integer DEFAULT 0,
  feasible_gap_count integer DEFAULT 0,
  infeasible_gap_count integer DEFAULT 0,
  relevance_score smallint DEFAULT 0,
  relevance_tags text[] DEFAULT '{}',
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN (
      'pending', 'reviewed', 'actioned', 'deferred', 'dismissed'
    )),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  article_count integer DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auto_digest_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaigns" ON auto_digest_campaigns
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 4. auto_digest_campaign_articles — junction table
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_digest_campaign_articles (
  campaign_id uuid NOT NULL REFERENCES auto_digest_campaigns(id) ON DELETE CASCADE,
  report_id text NOT NULL REFERENCES threat_intel_reports(id) ON DELETE CASCADE,
  feed_entry_id uuid,
  source_feed_name text,
  article_url text,
  article_title text,
  digested_at timestamptz,
  ttp_count integer DEFAULT 0,
  ioc_count integer DEFAULT 0,
  rule_count integer DEFAULT 0,

  CONSTRAINT auto_digest_campaign_articles_pkey PRIMARY KEY (campaign_id, report_id)
);

ALTER TABLE auto_digest_campaign_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaign articles" ON auto_digest_campaign_articles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auto_digest_campaigns c
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auto_digest_campaigns c
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- 5. auto_digest_jobs — queue for orchestrator
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_digest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'processing', 'completed', 'failed', 'timeout_partial'
    )),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  result_summary jsonb,
  error text
);

ALTER TABLE auto_digest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own digest jobs" ON auto_digest_jobs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 6. ALTER threat_intel_reports — add auto-digest columns
-- ----------------------------------------------------------
ALTER TABLE threat_intel_reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS source_feed_name text,
  ADD COLUMN IF NOT EXISTS source_article_url text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES auto_digest_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN (
      'pending', 'reviewed', 'actioned', 'deferred', 'dismissed'
    )),
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS relevance_score numeric(3,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS feasible_gap_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infeasible_gap_count integer DEFAULT 0;

-- ----------------------------------------------------------
-- 7. ALTER threat_intel_feeds — add curated source link
-- ----------------------------------------------------------
ALTER TABLE threat_intel_feeds
  ADD COLUMN IF NOT EXISTS curated_source_id uuid REFERENCES curated_feed_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_auto_digest boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS extraction_reliability numeric(3,2) DEFAULT 1.0;

-- ----------------------------------------------------------
-- 8. ALTER threat_intel_feed_entries — add pipeline columns
-- ----------------------------------------------------------
ALTER TABLE threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS digest_status text DEFAULT 'harvested'
    CHECK (digest_status IN (
      'harvested', 'classified', 'skipped', 'queued', 'digesting',
      'ready', 'digest_failed', 'extract_failed'
    )),
  ADD COLUMN IF NOT EXISTS classification jsonb,
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS relevance_score numeric(3,2),
  ADD COLUMN IF NOT EXISTS full_content text,
  ADD COLUMN IF NOT EXISTS content_length integer,
  ADD COLUMN IF NOT EXISTS extract_error text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES auto_digest_campaigns(id) ON DELETE SET NULL;

-- ----------------------------------------------------------
-- 9. Indexes
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_entries_digest_status
  ON threat_intel_feed_entries (user_id, digest_status);

CREATE INDEX IF NOT EXISTS idx_reports_auto_digest
  ON threat_intel_reports (user_id, source, review_status);

CREATE INDEX IF NOT EXISTS idx_campaigns_review
  ON auto_digest_campaigns (user_id, review_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_user_source_url
  ON threat_intel_reports(user_id, source_url)
  WHERE source_url IS NOT NULL;

-- ----------------------------------------------------------
-- 10. Seed data — curated feed sources
-- ----------------------------------------------------------
INSERT INTO curated_feed_sources (name, vendor, url, feed_type, category, description, avg_articles_week, extraction_method, extraction_notes)
VALUES
  (
    'The DFIR Report',
    'The DFIR Report',
    'https://thedfirreport.com/feed/',
    'rss',
    'threat_research',
    'Deep-dive intrusion analyses with full kill-chain TTPs and timelines',
    1.0,
    'jina_reader',
    'Long-form articles; Jina handles well'
  ),
  (
    'Mandiant Blog',
    'Mandiant / Google Cloud',
    'https://www.mandiant.com/resources/blog/rss.xml',
    'rss',
    'threat_research',
    'APT research, malware analysis, and incident response findings',
    3.0,
    'jina_reader',
    NULL
  ),
  (
    'Sophos X-Ops',
    'Sophos',
    'https://news.sophos.com/en-us/category/threat-research/feed/',
    'rss',
    'threat_research',
    'Threat research covering ransomware, exploits, and attacker tradecraft',
    2.0,
    'jina_reader',
    NULL
  ),
  (
    'Microsoft Security Blog',
    'Microsoft',
    'https://www.microsoft.com/en-us/security/blog/feed/',
    'rss',
    'threat_research',
    'Threat intelligence from Microsoft MSTIC, Defender, and Sentinel teams',
    3.0,
    'jina_reader',
    NULL
  ),
  (
    'Palo Alto Unit 42',
    'Palo Alto Networks',
    'https://unit42.paloaltonetworks.com/feed/',
    'rss',
    'threat_research',
    'Threat research on APTs, ransomware, vulnerabilities, and campaigns',
    2.5,
    'jina_reader',
    NULL
  ),
  (
    'CrowdStrike Blog',
    'CrowdStrike',
    'https://www.crowdstrike.com/blog/feed/',
    'rss',
    'threat_research',
    'Threat intelligence and adversary tracking from CrowdStrike Falcon',
    2.0,
    'jina_reader',
    NULL
  ),
  (
    'Cisco Talos Blog',
    'Cisco Talos',
    'https://blog.talosintelligence.com/rss/',
    'rss',
    'threat_research',
    'Vulnerability research, malware campaigns, and threat landscape updates',
    3.0,
    'jina_reader',
    NULL
  ),
  (
    'SentinelOne Labs',
    'SentinelOne',
    'https://www.sentinelone.com/labs/feed/',
    'rss',
    'threat_research',
    'Malware analysis, threat actor tracking, and detection research',
    2.0,
    'jina_reader',
    NULL
  ),
  (
    'Elastic Security Labs',
    'Elastic',
    'https://www.elastic.co/security-labs/rss/feed.xml',
    'rss',
    'threat_research',
    'Detection engineering research, malware analysis, and rule development',
    1.5,
    'direct',
    'Clean RSS with full content; direct extraction sufficient'
  ),
  (
    'Red Canary Blog',
    'Red Canary',
    'https://redcanary.com/blog/feed/',
    'rss',
    'threat_research',
    'Detection-focused threat research and Atomic Red Team testing insights',
    2.0,
    'jina_reader',
    NULL
  ),
  (
    'Huntress Blog',
    'Huntress',
    'https://www.huntress.com/blog/rss.xml',
    'rss',
    'threat_research',
    'SMB-focused threat research, ransomware tracking, and incident analysis',
    2.5,
    'jina_reader',
    NULL
  ),
  (
    'CISA Advisories',
    'CISA',
    'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    'rss',
    'government',
    'US government cybersecurity advisories, alerts, and vulnerability notices',
    5.0,
    'direct',
    'Structured advisories; direct XML parsing preferred'
  ),
  (
    'Google Threat Analysis Group',
    'Google',
    'https://blog.google/threat-analysis-group/rss/',
    'rss',
    'threat_research',
    'State-sponsored threat actor research and zero-day exploit tracking',
    1.0,
    'jina_reader',
    NULL
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- 11. pg_cron job — queue auto-digest jobs every hour
-- ----------------------------------------------------------
SELECT cron.schedule(
  'auto-digest-queue-jobs',
  '0 * * * *',
  $$
  -- Insert pending jobs for users whose schedule hour matches current UTC hour
  INSERT INTO auto_digest_jobs (user_id, status)
  SELECT s.user_id, 'pending'
  FROM auto_digest_settings s
  WHERE s.is_enabled = true
    AND s.schedule_hour_utc = EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int
    AND NOT EXISTS (
      SELECT 1 FROM auto_digest_jobs j
      WHERE j.user_id = s.user_id
        AND j.created_at > now() - interval '20 hours'
    );

  -- Call the edge function to process pending jobs
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-digest-orchestrator',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
