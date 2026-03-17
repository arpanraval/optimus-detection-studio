-- ============================================================================
-- Environment Profiles — Customer environment configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS environment_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  industry TEXT,
  siem_platforms TEXT[] DEFAULT '{}',
  log_sources TEXT[] DEFAULT '{}',
  custom_log_sources TEXT[] DEFAULT '{}',
  edr_tools TEXT[] DEFAULT '{}',
  cloud_platforms JSONB DEFAULT '{}',
  crown_jewels TEXT[] DEFAULT '{}',
  profile_completeness INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_environment_profiles_user_id ON environment_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_environment_profiles_team_id ON environment_profiles(team_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_environment_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_environment_profiles_updated_at
  BEFORE UPDATE ON environment_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_environment_profiles_updated_at();

-- RLS
ALTER TABLE environment_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile (or their team's)
CREATE POLICY "Users can read own environment profile"
  ON environment_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can create own environment profile"
  ON environment_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own environment profile"
  ON environment_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access to environment_profiles"
  ON environment_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
