-- ============================================
-- Fix activity_log RLS: replace overly-broad SELECT
-- ============================================
-- The existing USING (true) SELECT policy lets any authenticated
-- user read ALL activity entries. Replace with team-scoped access.

-- Drop the overly-permissive policy if it exists
DO $$
BEGIN
  -- Try to drop common policy names
  BEGIN
    DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
    DROP POLICY IF EXISTS "activity_log_select_policy" ON activity_log;
    DROP POLICY IF EXISTS "Allow authenticated users to read activity" ON activity_log;
    DROP POLICY IF EXISTS "Enable read access for all users" ON activity_log;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if policies don't exist
    NULL;
  END;
END $$;

-- Create team-scoped read policy
CREATE POLICY "activity_log_select_scoped"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    -- Admins/owners see all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
    -- Others see only their own activity or their team's activity
    OR user_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND team_id IN (
        SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
      )
    )
  );
