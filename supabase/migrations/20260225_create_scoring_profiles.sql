-- ============================================
-- Scoring Profiles Table
-- ============================================
-- Configurable quality scoring weight profiles.
-- Each profile defines how detection quality dimensions
-- are weighted (must sum to 100).

-- Create the table
CREATE TABLE IF NOT EXISTS scoring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  weights JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
-- Only one default per team (team_id NULL = global default)
CREATE UNIQUE INDEX idx_scoring_profiles_team_default
  ON scoring_profiles (team_id)
  WHERE is_default = true AND team_id IS NOT NULL;

CREATE UNIQUE INDEX idx_scoring_profiles_global_default
  ON scoring_profiles ((true))
  WHERE is_default = true AND team_id IS NULL;

CREATE INDEX idx_scoring_profiles_team_id ON scoring_profiles (team_id);

-- Constraint: weights must sum to 100
ALTER TABLE scoring_profiles
  ADD CONSTRAINT scoring_profiles_weights_sum_100
  CHECK (
    (weights->>'query_completeness')::int +
    (weights->>'mitre_mapping')::int +
    (weights->>'peer_review')::int +
    (weights->>'description_quality')::int +
    (weights->>'false_positive_guidance')::int +
    (weights->>'data_sources')::int +
    (weights->>'threat_intel')::int +
    (weights->>'test_coverage')::int +
    (weights->>'investigation_steps')::int +
    (weights->>'references')::int = 100
  );

-- Enable RLS
ALTER TABLE scoring_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- All authenticated users can read scoring profiles
CREATE POLICY "scoring_profiles_select"
  ON scoring_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Only admins/owners can insert
CREATE POLICY "scoring_profiles_insert"
  ON scoring_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );

-- Only admins/owners can update
CREATE POLICY "scoring_profiles_update"
  ON scoring_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );

-- Only admins/owners can delete
CREATE POLICY "scoring_profiles_delete"
  ON scoring_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'admin')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_scoring_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scoring_profiles_updated_at
  BEFORE UPDATE ON scoring_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_scoring_profiles_updated_at();

-- Seed the system default profile
INSERT INTO scoring_profiles (name, description, is_default, weights)
VALUES (
  'System Default',
  'Default quality scoring weights balancing query completeness, MITRE mapping, and peer review as top priorities.',
  true,
  '{
    "query_completeness": 20,
    "mitre_mapping": 15,
    "peer_review": 15,
    "description_quality": 10,
    "false_positive_guidance": 10,
    "data_sources": 10,
    "threat_intel": 5,
    "test_coverage": 5,
    "investigation_steps": 5,
    "references": 5
  }'::jsonb
);
