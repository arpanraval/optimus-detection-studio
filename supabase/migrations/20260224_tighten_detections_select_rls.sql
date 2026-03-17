-- ================================================================
-- Tighten detections SELECT RLS
--
-- Previously: all authenticated users could read ALL detections.
-- Now: users can only read their own, assigned, universal, or
-- team-shared detections. Admins/owners/leads retain full access.
-- ================================================================

-- Drop the old overly-permissive SELECT policy (qual = true)
DROP POLICY IF EXISTS "Authenticated users can read detections" ON detections;

-- Create scoped SELECT policy
CREATE POLICY "Users can read scoped detections"
  ON detections FOR SELECT
  TO authenticated
  USING (
    -- Own detections
    auth.uid() = user_id
    -- Assigned detections
    OR auth.uid() = assigned_to
    -- Universal library (shared reference content)
    OR library_type = 'universal'
    -- Team-shared detections (user is a member of the detection's team)
    OR (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = detections.team_id
        AND team_members.user_id = auth.uid()
      )
    )
    -- Admins, owners, and leads can see everything
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin', 'lead')
    )
  );
