-- Cover report/feed/story foreign keys and remove broad public policies from
-- user-owned intelligence tables. Service-role workers retain access.
CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_auto_digest_report_idx
  ON public.threat_intel_feed_entries (auto_digest_report_id);

CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_campaign_idx
  ON public.threat_intel_feed_entries (campaign_id);

CREATE INDEX IF NOT EXISTS threat_intel_reports_campaign_idx
  ON public.threat_intel_reports (campaign_id);

DO $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.auto_digest_campaigns', 'Users manage own campaigns');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.auto_digest_campaign_articles', 'Users manage own campaign articles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can view own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can create own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can update own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can delete own reports');
END $$;

CREATE POLICY auto_digest_campaigns_authenticated_all
  ON public.auto_digest_campaigns
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY auto_digest_campaigns_service_all
  ON public.auto_digest_campaigns
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auto_digest_campaign_articles_authenticated_all
  ON public.auto_digest_campaign_articles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.auto_digest_campaigns c
    WHERE c.id = auto_digest_campaign_articles.campaign_id
      AND c.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.auto_digest_campaigns c
    WHERE c.id = auto_digest_campaign_articles.campaign_id
      AND c.user_id = (SELECT auth.uid())
  ));
CREATE POLICY auto_digest_campaign_articles_service_all
  ON public.auto_digest_campaign_articles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY threat_intel_reports_authenticated_select
  ON public.threat_intel_reports
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_insert
  ON public.threat_intel_reports
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_update
  ON public.threat_intel_reports
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_delete
  ON public.threat_intel_reports
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_service_all
  ON public.threat_intel_reports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
