-- ============================================================
-- 08_rls_policies.sql - Row Level Security policies
-- Run after: 07_triggers.sql
-- Generated from live database: 2026-03-01
-- ============================================================

-- ========================
-- Enable RLS on all tables
-- ========================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_preflight_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_scoring_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_tactic_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_tactics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_report_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
-- Workspace RLS removed (feature deprecated)

-- For integration_credentials, also force RLS (prevents even table owner bypass):
ALTER TABLE public.integration_credentials FORCE ROW LEVEL SECURITY;
-- NOTE: integration_credentials has RLS enabled + forced but NO policies defined.
-- This means all access is denied except via service_role. This is intentional for
-- credential storage -- all access goes through edge functions using service_role.

-- detection_embeddings / mitre_embeddings: RLS enabled above (hardened 2026-05-22;
-- advisor rls_disabled_in_public). Writes are service_role-only (edge functions);
-- reads are admin-only via the policies below; anon has no grants.
REVOKE ALL ON public.detection_embeddings FROM anon;
REVOKE ALL ON public.mitre_embeddings     FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.detection_embeddings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mitre_embeddings     FROM authenticated;

CREATE POLICY detection_embeddings_admin_select ON public.detection_embeddings
  FOR SELECT TO authenticated
  USING (public.is_global_admin(auth.uid()));

CREATE POLICY mitre_embeddings_admin_select ON public.mitre_embeddings
  FOR SELECT TO authenticated
  USING (public.is_global_admin(auth.uid()));


-- ========================
-- Policies grouped by table
-- ========================

-- --------------------------------------------------------
-- Table: activity_log
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read activity_log" ON public.activity_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage activity_log" ON public.activity_log
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "System can insert activity" ON public.activity_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can insert activity_log" ON public.activity_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: audit_events
-- --------------------------------------------------------

CREATE POLICY "audit_events_select_admin" ON public.audit_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) OR (user_id = auth.uid())));

-- --------------------------------------------------------
-- Table: batch_embedding_jobs
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can insert batch jobs" ON public.batch_embedding_jobs
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = created_by));

CREATE POLICY "Authenticated users can update own batch jobs" ON public.batch_embedding_jobs
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = created_by));

CREATE POLICY "Authenticated users can view batch jobs" ON public.batch_embedding_jobs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- Table: bulk_import_jobs
-- --------------------------------------------------------

CREATE POLICY "Admins can update any bulk import job" ON public.bulk_import_jobs
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "Admins can view all bulk import jobs" ON public.bulk_import_jobs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "Users can create bulk import jobs" ON public.bulk_import_jobs
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update their own bulk import jobs" ON public.bulk_import_jobs
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own bulk import jobs" ON public.bulk_import_jobs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: deployment_history
-- --------------------------------------------------------

CREATE POLICY "Users can create own deployment records" ON public.deployment_history
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own deployment records" ON public.deployment_history
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own deployment history" ON public.deployment_history
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: detection_preflight_runs
-- --------------------------------------------------------

CREATE POLICY "Users can create own preflight runs" ON public.detection_preflight_runs
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own preflight runs" ON public.detection_preflight_runs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: detection_finetune_runs
-- --------------------------------------------------------

CREATE POLICY "Users can view own finetune runs" ON public.detection_finetune_runs
  AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: detection_assignments
-- --------------------------------------------------------

CREATE POLICY "Users can view assignments on own detections" ON public.detection_assignments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));

CREATE POLICY "Users can create assignments on own detections" ON public.detection_assignments
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));

CREATE POLICY "Users can update assignments on own detections" ON public.detection_assignments
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));

-- --------------------------------------------------------
-- Table: detection_comments
-- --------------------------------------------------------

CREATE POLICY "Users can add comments to own detections" ON public.detection_comments
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_comments.detection_id) AND (d.user_id = auth.uid()))))));

CREATE POLICY "Users can view comments on accessible detections" ON public.detection_comments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_comments.detection_id) AND ((d.user_id = auth.uid()) OR (d.library_type = 'development'::text))))));

CREATE POLICY "Users can delete own comments" ON public.detection_comments
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((user_id = auth.uid()));

CREATE POLICY "Users can update own comments" ON public.detection_comments
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((user_id = auth.uid()));

-- --------------------------------------------------------
-- Table: detection_packs
-- --------------------------------------------------------

CREATE POLICY "Active packs readable by authenticated users" ON public.detection_packs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((is_active = true) AND (auth.uid() IS NOT NULL)));

CREATE POLICY "Admins manage packs" ON public.detection_packs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));

-- --------------------------------------------------------
-- Table: detection_reviews
-- --------------------------------------------------------

CREATE POLICY "Assigned users can request reviews" ON public.detection_reviews
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((requested_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_reviews.detection_id) AND ((d.assigned_to = auth.uid()) OR (d.user_id = auth.uid())))))));

CREATE POLICY "Authenticated users can read detection_reviews" ON public.detection_reviews
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Global admin/lead can update reviews" ON public.detection_reviews
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "Service role can manage detection_reviews" ON public.detection_reviews
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: detections
-- --------------------------------------------------------

-- Production Library: readable by all authenticated users
CREATE POLICY "production_select" ON public.detections
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((library_type = 'production'::text));

-- Production Library: only admins/leads can insert
CREATE POLICY "production_insert" ON public.detections
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((library_type = 'production'::text) AND is_global_admin_or_lead(auth.uid())));

-- Production Library: only admins/leads can update
CREATE POLICY "production_update" ON public.detections
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((library_type = 'production'::text) AND is_global_admin_or_lead(auth.uid())))
  WITH CHECK (((library_type = 'production'::text) AND is_global_admin_or_lead(auth.uid())));

-- Production Library: only admins/leads can delete
CREATE POLICY "production_delete" ON public.detections
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((library_type = 'production'::text) AND is_global_admin_or_lead(auth.uid())));

-- Development Library: users can see own, assigned, shared, or team detections; admins/leads see all
CREATE POLICY "development_select" ON public.detections
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((library_type = 'development'::text) AND (
    (auth.uid() = user_id) OR
    (auth.uid() = assigned_to) OR
    (visibility = 'shared'::text) OR
    is_global_admin_or_lead(auth.uid())
  )));

-- Development Library: authenticated users can insert (own detections)
CREATE POLICY "development_insert" ON public.detections
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((library_type = 'development'::text) AND ((auth.uid() = user_id) OR (user_id IS NULL))));

-- Development Library: users can update own/assigned; admins/leads can update any
CREATE POLICY "development_update" ON public.detections
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((library_type = 'development'::text) AND (
    (auth.uid() = user_id) OR
    (auth.uid() = assigned_to) OR
    is_global_admin_or_lead(auth.uid())
  )))
  WITH CHECK (((library_type = 'development'::text) AND (
    (auth.uid() = user_id) OR
    (auth.uid() = assigned_to) OR
    is_global_admin_or_lead(auth.uid())
  )));

-- Development Library: users can delete own; admins/leads can delete any
CREATE POLICY "development_delete" ON public.detections
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((library_type = 'development'::text) AND (
    (auth.uid() = user_id) OR
    is_global_admin_or_lead(auth.uid())
  )));

-- Service role bypasses all RLS
CREATE POLICY "service_role_all" ON public.detections
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: enrichment_audit
-- --------------------------------------------------------

CREATE POLICY "Admins can create enrichment audit" ON public.enrichment_audit
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "Admins can update enrichment audit" ON public.enrichment_audit
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "Admins can view enrichment audit" ON public.enrichment_audit
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

-- --------------------------------------------------------
-- Table: environment_profiles
-- --------------------------------------------------------

CREATE POLICY "Service role full access to environment_profiles" ON public.environment_profiles
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can create own environment profile" ON public.environment_profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can read own environment profile" ON public.environment_profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own environment profile" ON public.environment_profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: integration_credentials
-- NOTE: RLS is enabled AND forced, but NO policies are defined.
-- All access is denied except via service_role (edge functions).
-- This is intentional for credential storage security.
-- --------------------------------------------------------

-- (no policies)

-- --------------------------------------------------------
-- Table: integrations
-- --------------------------------------------------------

CREATE POLICY "Users can create own integrations" ON public.integrations
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own integrations" ON public.integrations
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own integrations" ON public.integrations
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own integrations" ON public.integrations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: mitre_metadata
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_metadata" ON public.mitre_metadata
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_metadata" ON public.mitre_metadata
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_objects
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_objects" ON public.mitre_objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_objects" ON public.mitre_objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_relationships
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_relationships" ON public.mitre_relationships
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_relationships" ON public.mitre_relationships
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_scoring_snapshot
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_scoring_snapshot" ON public.mitre_scoring_snapshot
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_scoring_snapshot" ON public.mitre_scoring_snapshot
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_tactic_weights
-- --------------------------------------------------------

CREATE POLICY "Admins can manage mitre_tactic_weights" ON public.mitre_tactic_weights
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "Authenticated users can read mitre_tactic_weights" ON public.mitre_tactic_weights
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- --------------------------------------------------------
-- Table: mitre_technique_data_sources
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_technique_data_sources" ON public.mitre_technique_data_sources
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_technique_data_sources" ON public.mitre_technique_data_sources
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_technique_platforms
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_technique_platforms" ON public.mitre_technique_platforms
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_technique_platforms" ON public.mitre_technique_platforms
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: mitre_technique_tactics
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read mitre_technique_tactics" ON public.mitre_technique_tactics
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage mitre_technique_tactics" ON public.mitre_technique_tactics
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: pack_detections
-- --------------------------------------------------------

CREATE POLICY "Admins manage pack detections" ON public.pack_detections
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));

CREATE POLICY "Pack detections readable by authenticated users" ON public.pack_detections
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() IS NOT NULL));

-- --------------------------------------------------------
-- Table: profiles
-- --------------------------------------------------------

CREATE POLICY "Authenticated users can read profiles" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage profiles" ON public.profiles
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = id))
  WITH CHECK (((auth.uid() = id) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (status = ( SELECT p.status
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (permission_overrides IS NOT DISTINCT FROM ( SELECT p.permission_overrides
   FROM profiles p
  WHERE (p.id = auth.uid())))));

CREATE POLICY "Users can view own profile" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((id = auth.uid()));

-- --------------------------------------------------------
-- Table: promotion_requests
-- --------------------------------------------------------

CREATE POLICY "promotion_requests_insert" ON public.promotion_requests
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((submitted_by = auth.uid()));

CREATE POLICY "promotion_requests_select_own" ON public.promotion_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((submitted_by = auth.uid()));

CREATE POLICY "promotion_requests_select_admin" ON public.promotion_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "promotion_requests_update" ON public.promotion_requests
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "promotion_requests_service_role" ON public.promotion_requests
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- Table: scoring_profiles
-- --------------------------------------------------------

CREATE POLICY "scoring_profiles_delete" ON public.scoring_profiles
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "scoring_profiles_insert" ON public.scoring_profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

CREATE POLICY "scoring_profiles_select" ON public.scoring_profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "scoring_profiles_update" ON public.scoring_profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

-- --------------------------------------------------------
-- Table: user_invitations
-- --------------------------------------------------------

CREATE POLICY "Admins can create user invitations" ON public.user_invitations
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "Admins can view user invitations" ON public.user_invitations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "Admins can delete user invitations" ON public.user_invitations
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (is_global_admin_or_lead(auth.uid()));

CREATE POLICY "Users can view their own invitations" ON public.user_invitations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((email = (auth.jwt() ->> 'email'::text)));

-- --------------------------------------------------------
-- Table: threat_intel_report_detections
-- --------------------------------------------------------

CREATE POLICY "Users can link detections to own reports" ON public.threat_intel_report_detections
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));

CREATE POLICY "Users can unlink detections from own reports" ON public.threat_intel_report_detections
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));

CREATE POLICY "Users can view detections for own reports" ON public.threat_intel_report_detections
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));

-- --------------------------------------------------------
-- Table: threat_intel_reports
-- --------------------------------------------------------

CREATE POLICY "Users can create own reports" ON public.threat_intel_reports
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own reports" ON public.threat_intel_reports
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own reports" ON public.threat_intel_reports
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own reports" ON public.threat_intel_reports
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: user_dashboards
-- --------------------------------------------------------

CREATE POLICY "Users can create their own dashboards" ON public.user_dashboards
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own dashboards" ON public.user_dashboards
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own dashboards" ON public.user_dashboards
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view their own dashboards" ON public.user_dashboards
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id));

-- --------------------------------------------------------
-- Table: user_notifications
-- --------------------------------------------------------

CREATE POLICY "Service role can manage user_notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Insert notifications with verified source" ON public.user_notifications
  FOR INSERT
  WITH CHECK (source_user_id = auth.uid() OR auth.role() = 'service_role');

CREATE POLICY "Users can read own notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users see own notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = auth.uid()));

CREATE POLICY "Users update own notifications" ON public.user_notifications
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((user_id = auth.uid()));

-- ============================================================
-- Table: detection_drift  (upstream-drift tracking for imported rules)
-- ============================================================
ALTER TABLE public.detection_drift ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can see the underlying detection (production rules are
-- visible to all; development rules to their owner; admins/owners see all).
CREATE POLICY detection_drift_select ON public.detection_drift
  FOR SELECT TO authenticated
  USING (
    public.is_global_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.detections d
      WHERE d.id = detection_drift.detection_id
        AND (d.library_type = 'production' OR d.user_id = auth.uid())
    )
  );

-- Write: admins/owners only (matches the admin-gated Data Sync page).
CREATE POLICY detection_drift_write ON public.detection_drift
  FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- Workspace policies removed (feature deprecated)
