-- ============================================================
-- Migration: Drop teams concept entirely
-- Date: 2026-04-29
-- Depends on: 20260429a_rename_team_invitations.sql
--   (renamed team_invitations -> user_invitations and added a
--   backwards-compat view that's dropped here)
--
-- Rationale: team_members has been empty for the active user, so every
-- is_team_member() / has_team_role() call has been returning false at
-- runtime. The team-related branches in policies were dead. Removing
-- them changes zero effective behavior.
--
-- See docs/plans/2026-04-29-teams-removal-plan.md
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the backwards-compat view (so user_invitations.team_id can be dropped)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.team_invitations;

-- ------------------------------------------------------------
-- 2. Drop policies that reference team helpers; replace where needed
--    All replacements preserve current effective behavior.
-- ------------------------------------------------------------

-- activity_log: drop dead branch; "Authenticated users can read activity_log"
-- (USING true) already covers SELECT.
DROP POLICY IF EXISTS "Team members can view activity" ON public.activity_log;

-- analysis_reports: drop dead branch; analysis_reports_select_own
-- (user_id = auth.uid()) covers user's own reports.
DROP POLICY IF EXISTS analysis_reports_select_team ON public.analysis_reports;

-- detection_assignments
DROP POLICY IF EXISTS "Team members can view assignments" ON public.detection_assignments;
DROP POLICY IF EXISTS "Users can create assignments on own or team detections" ON public.detection_assignments;
DROP POLICY IF EXISTS "Users can update assignments on own or team detections" ON public.detection_assignments;
CREATE POLICY "Users can view assignments on own detections" ON public.detection_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM detections d WHERE d.id = detection_assignments.detection_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Users can create assignments on own detections" ON public.detection_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM detections d WHERE d.id = detection_assignments.detection_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Users can update assignments on own detections" ON public.detection_assignments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM detections d WHERE d.id = detection_assignments.detection_id AND d.user_id = auth.uid())
  );

-- detection_comments
DROP POLICY IF EXISTS "Team members can view comments" ON public.detection_comments;
DROP POLICY IF EXISTS "Team members can add comments" ON public.detection_comments;
CREATE POLICY "Users can view comments on accessible detections" ON public.detection_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM detections d
      WHERE d.id = detection_comments.detection_id
        AND (d.user_id = auth.uid() OR d.library_type = 'development')
    )
  );
CREATE POLICY "Users can add comments to own detections" ON public.detection_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM detections d WHERE d.id = detection_comments.detection_id AND d.user_id = auth.uid())
  );

-- detection_decisions
DROP POLICY IF EXISTS detection_decisions_select ON public.detection_decisions;
CREATE POLICY detection_decisions_select ON public.detection_decisions
  FOR SELECT USING (
    user_id = auth.uid()
    OR detection_id IN (SELECT id FROM detections WHERE user_id = auth.uid())
  );

-- detection_reviews: open SELECT (true) already handles reads.
-- Replace UPDATE policy with global admin/lead so it works without service role.
DROP POLICY IF EXISTS "Team members can view reviews" ON public.detection_reviews;
DROP POLICY IF EXISTS "Leads can update reviews" ON public.detection_reviews;
CREATE POLICY "Global admin/lead can update reviews" ON public.detection_reviews
  FOR UPDATE USING (is_global_admin_or_lead(auth.uid()));

-- user_invitations: drop team-helper-based policies, replace with global-admin.
-- "Users can view their own invitations" (email-based) stays — it doesn't reference teams.
DROP POLICY IF EXISTS "Admins can create invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Admins can view invitations" ON public.user_invitations;
CREATE POLICY "Admins can create user invitations" ON public.user_invitations
  FOR INSERT WITH CHECK (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Admins can view user invitations" ON public.user_invitations
  FOR SELECT USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Admins can delete user invitations" ON public.user_invitations
  FOR DELETE USING (is_global_admin_or_lead(auth.uid()));

-- team_members, teams: drop all policies (tables dropped below)
DROP POLICY IF EXISTS "Admins can add members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Owners can remove members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view members" ON public.team_members;
DROP POLICY IF EXISTS "Admins can manage teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can read teams" ON public.teams;
DROP POLICY IF EXISTS "Owners can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Owners can update teams" ON public.teams;
DROP POLICY IF EXISTS "Service role can manage teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;

-- ------------------------------------------------------------
-- 3. Drop FKs, indexes, and team_id columns on retained tables
-- ------------------------------------------------------------

-- user_invitations
ALTER TABLE public.user_invitations DROP CONSTRAINT IF EXISTS team_invitations_team_id_fkey;
ALTER TABLE public.user_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;
DROP INDEX IF EXISTS public.idx_team_invitations_team;
ALTER TABLE public.user_invitations DROP COLUMN IF EXISTS team_id;
ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_role_check CHECK (role = ANY (ARRAY['admin', 'lead', 'analyst', 'viewer']));

-- detections
ALTER TABLE public.detections DROP CONSTRAINT IF EXISTS detections_team_id_fkey;
DROP INDEX IF EXISTS public.idx_detections_team;
ALTER TABLE public.detections DROP COLUMN IF EXISTS team_id;

-- activity_log
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_team_id_fkey;
DROP INDEX IF EXISTS public.idx_activity_log_team;
ALTER TABLE public.activity_log DROP COLUMN IF EXISTS team_id;

-- audit_events: drop the composite (team_id, created_at DESC) index.
-- idx_audit_events_created_at (created_at DESC alone) already exists, no replacement needed.
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_team_id_fkey;
DROP INDEX IF EXISTS public.idx_audit_events_team_time;
ALTER TABLE public.audit_events DROP COLUMN IF EXISTS team_id;

-- scoring_profiles: replace the two partial-unique indexes with one global default.
ALTER TABLE public.scoring_profiles DROP CONSTRAINT IF EXISTS scoring_profiles_team_id_fkey;
DROP INDEX IF EXISTS public.idx_scoring_profiles_team_id;
DROP INDEX IF EXISTS public.idx_scoring_profiles_team_default;
DROP INDEX IF EXISTS public.idx_scoring_profiles_global_default;
ALTER TABLE public.scoring_profiles DROP COLUMN IF EXISTS team_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_profiles_default
  ON public.scoring_profiles ((true)) WHERE is_default = true;

-- environment_profiles
ALTER TABLE public.environment_profiles DROP CONSTRAINT IF EXISTS environment_profiles_team_id_fkey;
DROP INDEX IF EXISTS public.idx_environment_profiles_team_id;
ALTER TABLE public.environment_profiles DROP COLUMN IF EXISTS team_id;

-- analysis_reports
ALTER TABLE public.analysis_reports DROP CONSTRAINT IF EXISTS analysis_reports_team_id_fkey;
ALTER TABLE public.analysis_reports DROP COLUMN IF EXISTS team_id;

-- ------------------------------------------------------------
-- 4. Drop the dead tables
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.team_members;
DROP TABLE IF EXISTS public.teams;

-- ------------------------------------------------------------
-- 5. Drop the now-unused helper functions
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_team_member(uuid);
DROP FUNCTION IF EXISTS public.has_team_role(uuid, text[]);

COMMIT;
