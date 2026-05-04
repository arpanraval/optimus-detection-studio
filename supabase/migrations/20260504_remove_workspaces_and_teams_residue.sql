-- ============================================================
-- Migration: Remove workspace tables + leftover team/workspace functions
-- Date: 2026-05-04
-- Depends on: 20260429b_drop_teams.sql
--
-- Cleans up DB residue that the prior teams retirement (PR1/PR2/PR3 in
-- April 2026) left behind. The teams concept and workspaces concept
-- are both retired in product. This migration drops:
--
-- 1. 5 zero-row workspace_* tables that aren't recreated by setup files
--    and have no callers anywhere in src/, supabase/functions/, or migrations.
-- 2. 14 workspace_* helper functions, all unreferenced.
-- 3. 4 team_* helper functions that supabase/setup/06_functions.sql:223-226
--    documents as already removed but were never actually dropped on prod.
-- 4. user_invitations table comment, which still said "Pending team
--    invitations" from before 20260429a renamed team_invitations.
--
-- Pre-flight verified:
--   SELECT count(*) FROM workspaces                = 0
--   SELECT count(*) FROM workspace_members         = 0
--   SELECT count(*) FROM workspace_detections      = 0
--   SELECT count(*) FROM workspace_invitations     = 0
--   SELECT count(*) FROM workspace_activity_log    = 0
--   SELECT count(*) FROM user_invitations          = 8 (intact, untouched)
--   No code references any workspace_* function or table (grep verified)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop workspace_* helper functions (14 total)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_detection_to_workspace                 CASCADE;
DROP FUNCTION IF EXISTS public.bulk_add_detections_to_workspace           CASCADE;
DROP FUNCTION IF EXISTS public.bulk_pull_workspace_updates                CASCADE;
DROP FUNCTION IF EXISTS public.check_workspace_updates                    CASCADE;
DROP FUNCTION IF EXISTS public.create_workspace                           CASCADE;
DROP FUNCTION IF EXISTS public.get_user_workspaces                        CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_detection_with_overrides     CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_role                         CASCADE;
DROP FUNCTION IF EXISTS public.get_workspace_stats                        CASCADE;
DROP FUNCTION IF EXISTS public.has_workspace_role                         CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_member                        CASCADE;
DROP FUNCTION IF EXISTS public.pull_workspace_update                      CASCADE;
DROP FUNCTION IF EXISTS public.remove_detection_from_workspace            CASCADE;
DROP FUNCTION IF EXISTS public.save_workspace_override                    CASCADE;

-- ------------------------------------------------------------
-- 2. Drop leftover team_* helper functions (4 total)
--    setup/06_functions.sql:223-226 already documents these as removed.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_user_to_team           CASCADE;
DROP FUNCTION IF EXISTS public.change_team_role           CASCADE;
DROP FUNCTION IF EXISTS public.deactivate_team_member     CASCADE;
DROP FUNCTION IF EXISTS public.get_team_role              CASCADE;

-- ------------------------------------------------------------
-- 3. Drop workspace tables (5 total) in FK-safe order
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.workspace_activity_log    CASCADE;
DROP TABLE IF EXISTS public.workspace_detections      CASCADE;
DROP TABLE IF EXISTS public.workspace_invitations     CASCADE;
DROP TABLE IF EXISTS public.workspace_members         CASCADE;
DROP TABLE IF EXISTS public.workspaces                CASCADE;

-- ------------------------------------------------------------
-- 4. Update stale comment on user_invitations
-- ------------------------------------------------------------
COMMENT ON TABLE public.user_invitations IS 'Pending user platform invitations';
