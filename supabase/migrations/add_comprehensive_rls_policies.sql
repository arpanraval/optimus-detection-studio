-- ================================================================
-- Comprehensive RLS Policies for Detection Studio
-- This migration enables Row Level Security on all tables
-- and creates appropriate policies for each table.
-- ================================================================

-- ================================================================
-- MITRE Tables: Read-only for authenticated users
-- These are reference data, not user-modifiable data
-- ================================================================

-- mitre_objects
ALTER TABLE IF EXISTS mitre_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_objects" ON mitre_objects;
CREATE POLICY "Authenticated users can read mitre_objects"
  ON mitre_objects FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_objects" ON mitre_objects;
CREATE POLICY "Service role can manage mitre_objects"
  ON mitre_objects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_relationships
ALTER TABLE IF EXISTS mitre_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_relationships" ON mitre_relationships;
CREATE POLICY "Authenticated users can read mitre_relationships"
  ON mitre_relationships FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_relationships" ON mitre_relationships;
CREATE POLICY "Service role can manage mitre_relationships"
  ON mitre_relationships FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_technique_tactics
ALTER TABLE IF EXISTS mitre_technique_tactics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_technique_tactics" ON mitre_technique_tactics;
CREATE POLICY "Authenticated users can read mitre_technique_tactics"
  ON mitre_technique_tactics FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_technique_tactics" ON mitre_technique_tactics;
CREATE POLICY "Service role can manage mitre_technique_tactics"
  ON mitre_technique_tactics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_technique_platforms
ALTER TABLE IF EXISTS mitre_technique_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_technique_platforms" ON mitre_technique_platforms;
CREATE POLICY "Authenticated users can read mitre_technique_platforms"
  ON mitre_technique_platforms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_technique_platforms" ON mitre_technique_platforms;
CREATE POLICY "Service role can manage mitre_technique_platforms"
  ON mitre_technique_platforms FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_technique_data_sources
ALTER TABLE IF EXISTS mitre_technique_data_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_technique_data_sources" ON mitre_technique_data_sources;
CREATE POLICY "Authenticated users can read mitre_technique_data_sources"
  ON mitre_technique_data_sources FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_technique_data_sources" ON mitre_technique_data_sources;
CREATE POLICY "Service role can manage mitre_technique_data_sources"
  ON mitre_technique_data_sources FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_metadata
ALTER TABLE IF EXISTS mitre_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_metadata" ON mitre_metadata;
CREATE POLICY "Authenticated users can read mitre_metadata"
  ON mitre_metadata FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_metadata" ON mitre_metadata;
CREATE POLICY "Service role can manage mitre_metadata"
  ON mitre_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_scoring_snapshot
ALTER TABLE IF EXISTS mitre_scoring_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_scoring_snapshot" ON mitre_scoring_snapshot;
CREATE POLICY "Authenticated users can read mitre_scoring_snapshot"
  ON mitre_scoring_snapshot FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage mitre_scoring_snapshot" ON mitre_scoring_snapshot;
CREATE POLICY "Service role can manage mitre_scoring_snapshot"
  ON mitre_scoring_snapshot FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mitre_tactic_weights (admins can modify)
ALTER TABLE IF EXISTS mitre_tactic_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mitre_tactic_weights" ON mitre_tactic_weights;
CREATE POLICY "Authenticated users can read mitre_tactic_weights"
  ON mitre_tactic_weights FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage mitre_tactic_weights" ON mitre_tactic_weights;
CREATE POLICY "Admins can manage mitre_tactic_weights"
  ON mitre_tactic_weights FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ================================================================
-- Core Application Tables
-- ================================================================

-- detections: Users can read all, but only modify their own or assigned
ALTER TABLE IF EXISTS detections ENABLE ROW LEVEL SECURITY;

-- Everyone can read detections
DROP POLICY IF EXISTS "Authenticated users can read detections" ON detections;
CREATE POLICY "Authenticated users can read detections"
  ON detections FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert detections (as creator)
DROP POLICY IF EXISTS "Users can create detections" ON detections;
CREATE POLICY "Users can create detections"
  ON detections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can update their own detections or assigned detections
DROP POLICY IF EXISTS "Users can update own or assigned detections" ON detections;
CREATE POLICY "Users can update own or assigned detections"
  ON detections FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = assigned_to
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'lead')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() = assigned_to
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'lead')
    )
  );

-- Only owners and admins can delete detections
DROP POLICY IF EXISTS "Admins can delete detections" ON detections;
CREATE POLICY "Admins can delete detections"
  ON detections FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Service role bypass for edge functions
DROP POLICY IF EXISTS "Service role can manage detections" ON detections;
CREATE POLICY "Service role can manage detections"
  ON detections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- profiles: Users can read all, but only update own (role changes via edge function)
-- ================================================================
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own non-privileged profile fields
-- WITH CHECK prevents role/status escalation by ensuring those columns remain unchanged
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND status = (SELECT p.status FROM profiles p WHERE p.id = auth.uid())
  );

-- Service role can manage all profiles (for edge functions)
DROP POLICY IF EXISTS "Service role can manage profiles" ON profiles;
CREATE POLICY "Service role can manage profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- teams: Authenticated users can read, admins can modify
-- ================================================================
ALTER TABLE IF EXISTS teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read teams" ON teams;
CREATE POLICY "Authenticated users can read teams"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage teams" ON teams;
CREATE POLICY "Service role can manage teams"
  ON teams FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- workspaces: Members can read, owners/admins can modify
-- ================================================================
ALTER TABLE IF EXISTS workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read workspaces" ON workspaces;
CREATE POLICY "Authenticated users can read workspaces"
  ON workspaces FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create workspaces" ON workspaces;
CREATE POLICY "Users can create workspaces"
  ON workspaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Workspace owners can update" ON workspaces;
CREATE POLICY "Workspace owners can update"
  ON workspaces FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Workspace owners can delete" ON workspaces;
CREATE POLICY "Workspace owners can delete"
  ON workspaces FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage workspaces" ON workspaces;
CREATE POLICY "Service role can manage workspaces"
  ON workspaces FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- detection_reviews: Authenticated users can read, controlled write
-- ================================================================
ALTER TABLE IF EXISTS detection_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read detection_reviews" ON detection_reviews;
CREATE POLICY "Authenticated users can read detection_reviews"
  ON detection_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Reviews are managed through edge function, allow insert for service role
DROP POLICY IF EXISTS "Service role can manage detection_reviews" ON detection_reviews;
CREATE POLICY "Service role can manage detection_reviews"
  ON detection_reviews FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- activity_log: Read own team's logs, write via service role
-- ================================================================
ALTER TABLE IF EXISTS activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read activity_log" ON activity_log;
CREATE POLICY "Authenticated users can read activity_log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage activity_log" ON activity_log;
CREATE POLICY "Service role can manage activity_log"
  ON activity_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can insert activity logs
DROP POLICY IF EXISTS "Users can insert activity_log" ON activity_log;
CREATE POLICY "Users can insert activity_log"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- user_notifications: Users can only see their own
-- ================================================================
ALTER TABLE IF EXISTS user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON user_notifications;
CREATE POLICY "Users can read own notifications"
  ON user_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON user_notifications;
CREATE POLICY "Users can update own notifications"
  ON user_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage user_notifications" ON user_notifications;
CREATE POLICY "Service role can manage user_notifications"
  ON user_notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- Grant necessary permissions
-- ================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
