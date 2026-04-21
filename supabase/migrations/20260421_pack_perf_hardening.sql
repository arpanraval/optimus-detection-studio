-- Pack performance hardening — addresses Supabase advisor findings.
-- 1. Add covering indexes on foreign keys to prevent full-table scans on joins/cascades.
-- 2. Rewrite RLS policies to wrap auth.uid() in (SELECT auth.uid()) so Postgres evaluates
--    it once per query instead of re-running for every row (auth_rls_initplan warning).

-- ========== FK indexes ==========
CREATE INDEX IF NOT EXISTS idx_detection_packs_created_by ON public.detection_packs (created_by);
CREATE INDEX IF NOT EXISTS idx_pack_deploy_jobs_integration_id ON public.pack_deploy_jobs (integration_id);
CREATE INDEX IF NOT EXISTS idx_pack_deploy_jobs_pack_id ON public.pack_deploy_jobs (pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_versions_created_by ON public.pack_versions (created_by);

-- ========== RLS: wrap auth.uid() in subselect for initPlan optimization ==========

-- detection_packs
DROP POLICY IF EXISTS "Active packs readable by authenticated users" ON public.detection_packs;
CREATE POLICY "Active packs readable by authenticated users" ON public.detection_packs
  FOR SELECT USING (is_active = true AND (SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage packs" ON public.detection_packs;
CREATE POLICY "Admins manage packs" ON public.detection_packs
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));

-- pack_detections
DROP POLICY IF EXISTS "Pack detections readable by authenticated users" ON public.pack_detections;
CREATE POLICY "Pack detections readable by authenticated users" ON public.pack_detections
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage pack detections" ON public.pack_detections;
CREATE POLICY "Admins manage pack detections" ON public.pack_detections
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])));

-- pack_deploy_jobs
DROP POLICY IF EXISTS "Users can view their own deploy jobs" ON public.pack_deploy_jobs;
CREATE POLICY "Users can view their own deploy jobs" ON public.pack_deploy_jobs
  FOR SELECT USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create deploy jobs" ON public.pack_deploy_jobs;
CREATE POLICY "Users can create deploy jobs" ON public.pack_deploy_jobs
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own deploy jobs" ON public.pack_deploy_jobs;
CREATE POLICY "Users can update their own deploy jobs" ON public.pack_deploy_jobs
  FOR UPDATE USING (created_by = (SELECT auth.uid()));

-- pack_deploy_job_items
DROP POLICY IF EXISTS "Users can view their own deploy job items" ON public.pack_deploy_job_items;
CREATE POLICY "Users can view their own deploy job items" ON public.pack_deploy_job_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM pack_deploy_jobs j WHERE j.id = pack_deploy_job_items.job_id AND j.created_by = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can insert their own deploy job items" ON public.pack_deploy_job_items;
CREATE POLICY "Users can insert their own deploy job items" ON public.pack_deploy_job_items
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM pack_deploy_jobs j WHERE j.id = pack_deploy_job_items.job_id AND j.created_by = (SELECT auth.uid())
  ));

-- pack_versions
DROP POLICY IF EXISTS "Leads manage pack versions" ON public.pack_versions;
CREATE POLICY "Leads manage pack versions" ON public.pack_versions
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])
  ));
