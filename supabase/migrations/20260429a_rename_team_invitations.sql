-- Migration: Rename team_invitations → user_invitations + add backwards-compat view
-- Date: 2026-04-29
-- Purpose:
--   The product has no concept of "teams"; invitations have always been to the app
--   itself. Rename the table to match the domain. A backwards-compat view under the
--   old name ensures any in-flight or yet-to-be-deployed code keeps working. The
--   view is dropped in the follow-up cleanup migration (20260429b_drop_teams.sql).
--
-- Also drops the NOT NULL constraint on team_id so that updated edge-function code
-- (which omits team_id from invite inserts) can succeed. The column itself is
-- removed in the cleanup migration.

BEGIN;

-- 1. Rename to canonical name.
ALTER TABLE public.team_invitations RENAME TO user_invitations;

-- 2. Drop NOT NULL on team_id so invite inserts can omit the column.
--    (Column is dropped entirely in the cleanup migration.)
ALTER TABLE public.user_invitations ALTER COLUMN team_id DROP NOT NULL;

-- 3. Backwards-compat view under the old name. Default view security is
--    SECURITY INVOKER, so RLS policies on user_invitations still apply when
--    accessed through this view. Simple "SELECT *" views are auto-updatable
--    in PostgreSQL, so existing FROM('team_invitations') INSERT/SELECT/DELETE
--    code keeps working until Phase 3 drops the view.
CREATE VIEW public.team_invitations AS SELECT * FROM public.user_invitations;

COMMIT;
