-- Threat intelligence is shared within this single-organization deployment.
-- Authenticated users may read reports and their supporting story/link rows,
-- while mutations remain restricted to the user who owns the parent record.

DROP POLICY IF EXISTS threat_intel_reports_authenticated_select
  ON public.threat_intel_reports;

CREATE POLICY threat_intel_reports_authenticated_select
  ON public.threat_intel_reports
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_all
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_select
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_insert
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_update
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_delete
  ON public.auto_digest_campaigns;

CREATE POLICY auto_digest_campaigns_authenticated_select
  ON public.auto_digest_campaigns
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY auto_digest_campaigns_authenticated_insert
  ON public.auto_digest_campaigns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY auto_digest_campaigns_authenticated_update
  ON public.auto_digest_campaigns
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY auto_digest_campaigns_authenticated_delete
  ON public.auto_digest_campaigns
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_all
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_select
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_insert
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_update
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_delete
  ON public.auto_digest_campaign_articles;

CREATE POLICY auto_digest_campaign_articles_authenticated_select
  ON public.auto_digest_campaign_articles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY auto_digest_campaign_articles_authenticated_insert
  ON public.auto_digest_campaign_articles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));

CREATE POLICY auto_digest_campaign_articles_authenticated_update
  ON public.auto_digest_campaign_articles
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));

CREATE POLICY auto_digest_campaign_articles_authenticated_delete
  ON public.auto_digest_campaign_articles
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));

DO $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can view detections for own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can link detections to own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can unlink detections from own reports');
END $$;

DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_select
  ON public.threat_intel_report_detections;
DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_insert
  ON public.threat_intel_report_detections;
DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_delete
  ON public.threat_intel_report_detections;

CREATE POLICY threat_intel_report_detections_authenticated_select
  ON public.threat_intel_report_detections
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY threat_intel_report_detections_authenticated_insert
  ON public.threat_intel_report_detections
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.threat_intel_reports AS report
    WHERE report.id = threat_intel_report_detections.report_id
      AND report.user_id = (SELECT auth.uid())
  ));

CREATE POLICY threat_intel_report_detections_authenticated_delete
  ON public.threat_intel_report_detections
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.threat_intel_reports AS report
    WHERE report.id = threat_intel_report_detections.report_id
      AND report.user_id = (SELECT auth.uid())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.threat_intel_reports, public.auto_digest_campaigns, public.auto_digest_campaign_articles
  TO authenticated;

GRANT SELECT, INSERT, DELETE
  ON public.threat_intel_report_detections
  TO authenticated;
