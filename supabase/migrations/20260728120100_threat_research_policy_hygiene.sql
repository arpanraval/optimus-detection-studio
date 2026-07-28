-- Threat-research RLS policy hygiene. Two unrelated cleanups, no behaviour
-- change for a correctly-behaving client.
--
-- ── 1. trs_self_* on threat_research_sessions ────────────────────────────────
--
-- trs_self_update declares USING but no WITH CHECK. This is NOT an escalation:
-- for UPDATE, PostgreSQL falls back to the USING expression when WITH CHECK is
-- absent, so a user still cannot re-assign a row to another user_id (probed as
-- `authenticated`: "new row violates row-level security policy"). It is still
-- worth stating explicitly -- the fallback is easy to misread, and a future
-- edit to USING would silently change what writes are allowed.
--
-- The four trs_self_* policies are also declared TO public, which means they
-- are evaluated for anon as well. anon never satisfies them (auth.uid() is
-- NULL), so this is a no-op in practice; narrowing to `authenticated` makes the
-- intent legible and stops anon paying the policy-evaluation cost.
--
-- auth.uid() -> (select auth.uid()) throughout is the documented Supabase
-- initplan optimisation: the wrapped form is evaluated once per statement
-- instead of once per row. This is a PERFORMANCE change, not a security one.
--
-- ── 2. trj_*_select on threat_research_jobs ──────────────────────────────────
--
-- Both policies exist in supabase/schema.sql (the canonical fresh-install
-- snapshot) and in the deployed project, but no migration in this tree ever
-- created them -- they were applied out-of-band. Fresh installs and production
-- are therefore both fine; this is migration-tree parity so replaying
-- migrations/ against an existing project converges to the same state.
--
-- Without these policies the jobs table is invisible to its owner, which
-- silently breaks useThreatResearchJobs: every per-leaf spinner stops and the
-- list view pins every row to "Not started".

-- ── threat_research_sessions ────────────────────────────────────────────────
DROP POLICY IF EXISTS trs_self_select ON public.threat_research_sessions;
CREATE POLICY trs_self_select ON public.threat_research_sessions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS trs_self_insert ON public.threat_research_sessions;
CREATE POLICY trs_self_insert ON public.threat_research_sessions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS trs_self_update ON public.threat_research_sessions;
CREATE POLICY trs_self_update ON public.threat_research_sessions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS trs_self_delete ON public.threat_research_sessions;
CREATE POLICY trs_self_delete ON public.threat_research_sessions
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── threat_research_jobs (parity with schema.sql) ───────────────────────────
DROP POLICY IF EXISTS trj_self_select ON public.threat_research_jobs;
CREATE POLICY trj_self_select ON public.threat_research_jobs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.threat_research_sessions s
     WHERE s.id = threat_research_jobs.session_id
       AND s.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS trj_admin_select ON public.threat_research_jobs;
CREATE POLICY trj_admin_select ON public.threat_research_jobs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
     WHERE profiles.id = (select auth.uid())
       AND profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])
  ));
