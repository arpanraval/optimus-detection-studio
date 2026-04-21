-- Pack Versions
--
-- Immutable snapshots of a detection pack at a point in time.
-- Used for:
--   1. Rollback to a previous pack state
--   2. Preserving state before destructive regenerate
--   3. Historical changelog / audit
--
-- Note: pack_id uses ON DELETE SET NULL (not CASCADE) so versions survive
-- pack deletion (useful for compliance + retroactive restore).
-- pack_name is denormalized so deleted packs remain identifiable in the UI.

CREATE TABLE IF NOT EXISTS pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid REFERENCES detection_packs(id) ON DELETE SET NULL,
  pack_name text NOT NULL,
  version_number integer NOT NULL,
  label text,
  notes text,
  snapshot jsonb NOT NULL,  -- Full pack + detection snapshot (frozen at publish time)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique version number per pack_id (when pack still exists)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pack_versions_pack_version
  ON pack_versions(pack_id, version_number)
  WHERE pack_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pack_versions_pack_id ON pack_versions(pack_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_pack_versions_created_at ON pack_versions(created_at DESC);

-- Add current_version_number to detection_packs for quick lookup
ALTER TABLE detection_packs
  ADD COLUMN IF NOT EXISTS current_version_number integer NOT NULL DEFAULT 0;

-- RLS
ALTER TABLE pack_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pack versions readable by authenticated" ON pack_versions;
CREATE POLICY "Pack versions readable by authenticated"
  ON pack_versions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Leads manage pack versions" ON pack_versions;
CREATE POLICY "Leads manage pack versions"
  ON pack_versions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner','admin','lead')
    )
  );

-- Versions are immutable — no UPDATE or DELETE policies for authenticated users
-- Service role can still delete for cleanup jobs if needed
GRANT ALL ON pack_versions TO service_role;
