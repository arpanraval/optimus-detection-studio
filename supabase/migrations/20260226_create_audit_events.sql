-- ============================================
-- Audit Events Table
-- ============================================
-- Immutable, append-only enterprise audit trail.
-- No UPDATE or DELETE policies — events are permanent.

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,          -- denormalized for historical accuracy
  user_role TEXT,           -- denormalized: role at time of action

  -- WHAT
  action TEXT NOT NULL,     -- dot-notation: 'detection.created', 'user.login', etc.
  entity_type TEXT,         -- 'detection', 'user', 'review', 'comment', 'export', 'import', 'settings'
  entity_id TEXT,           -- UUID or identifier of affected entity
  entity_name TEXT,         -- human-readable name at time of action

  -- CHANGE DETAILS
  old_values JSONB,         -- previous field values (for updates)
  new_values JSONB,         -- new field values (for creates/updates)
  changed_fields TEXT[],    -- list of changed field names for quick filtering

  -- CONTEXT
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ip_address INET,          -- captured server-side via edge function
  user_agent TEXT,           -- captured server-side
  session_id TEXT,           -- auth session ID
  source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'edge_function', 'migration')),

  -- META
  details JSONB,            -- additional context (e.g., import count, export format)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — this table is immutable
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_audit_events_user_id ON audit_events (user_id);
CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_action ON audit_events (action);
CREATE INDEX idx_audit_events_team_time ON audit_events (team_id, created_at DESC);
CREATE INDEX idx_audit_events_created_at ON audit_events (created_at DESC);
CREATE INDEX idx_audit_events_changed_fields ON audit_events USING GIN (changed_fields);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/owners see all team events; users see their own events
CREATE POLICY "audit_events_select_admin"
  ON audit_events FOR SELECT
  TO authenticated
  USING (
    -- Admins/owners can see everything
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
    -- Non-admins can see their own events
    OR user_id = auth.uid()
  );

-- NO INSERT for authenticated users — only service_role can insert
-- This ensures all writes go through the audit-log edge function
-- (service_role bypasses RLS)

-- NO UPDATE policy — events are immutable
-- NO DELETE policy — events are permanent
