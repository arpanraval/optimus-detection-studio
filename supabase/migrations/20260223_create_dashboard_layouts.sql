-- ============================================================================
-- Enterprise Dashboard — User Dashboards Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Dashboard',
  is_default BOOLEAN NOT NULL DEFAULT false,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_dashboards_user_id ON user_dashboards(user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_user_dashboards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_dashboards_updated_at
  BEFORE UPDATE ON user_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION update_user_dashboards_updated_at();

-- Enforce single default dashboard per user:
-- When a dashboard is set as default, unset all others for that user
CREATE OR REPLACE FUNCTION enforce_single_default_dashboard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_dashboards
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_single_default
  AFTER INSERT OR UPDATE OF is_default ON user_dashboards
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_dashboard();

-- ============================================================================
-- RLS Policies — users can only access their own dashboards
-- ============================================================================

ALTER TABLE user_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboards"
  ON user_dashboards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dashboards"
  ON user_dashboards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboards"
  ON user_dashboards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dashboards"
  ON user_dashboards FOR DELETE
  USING (auth.uid() = user_id);
