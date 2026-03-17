-- ============================================================================
-- THREAT GROUP TARGETING ENRICHMENT - Database Migration
-- ============================================================================
-- This migration creates:
-- 1. enrichment_audit table for tracking enrichment operations
-- 2. RPC functions for updating and removing targeting intelligence
-- 3. RLS policies for secure access
-- ============================================================================

-- ============================================================================
-- 1. ENRICHMENT AUDIT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS enrichment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What type of enrichment was applied
  enrichment_type TEXT NOT NULL DEFAULT 'misp_targeting_intel',

  -- When and by whom
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT,  -- Could be a user ID or 'system'

  -- Preview verification
  preview_hash TEXT NOT NULL,  -- SHA256 of the preview that was reviewed

  -- Affected groups
  affected_group_ids TEXT[] NOT NULL,  -- Array of STIX IDs

  -- Rollback data (previous targeting_intel values keyed by stix_id)
  -- NULL value in the JSONB means the group had no targeting_intel before
  rollback_data JSONB NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'rolled_back')),
  rolled_back_at TIMESTAMPTZ,

  -- Additional context
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_status ON enrichment_audit(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_applied_at ON enrichment_audit(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_type ON enrichment_audit(enrichment_type);

-- Comment for documentation
COMMENT ON TABLE enrichment_audit IS 'Tracks enrichment operations on MITRE objects for audit and rollback capabilities';
COMMENT ON COLUMN enrichment_audit.preview_hash IS 'SHA256 hash of the preview JSON - ensures the reviewed preview matches what was applied';
COMMENT ON COLUMN enrichment_audit.rollback_data IS 'Previous targeting_intel values for each affected group - enables full rollback';

-- ============================================================================
-- 2. RPC FUNCTION: Update Targeting Intelligence
-- ============================================================================
-- Updates the targeting_intel key in a mitre_objects data JSONB column

CREATE OR REPLACE FUNCTION update_targeting_intel(
  p_stix_id TEXT,
  p_targeting_intel JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mitre_objects
  SET
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('targeting_intel', p_targeting_intel),
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION update_targeting_intel IS 'Updates the targeting_intel key in a MITRE object data column';

-- ============================================================================
-- 3. RPC FUNCTION: Remove Targeting Intelligence
-- ============================================================================
-- Removes the targeting_intel key from a mitre_objects data JSONB column

CREATE OR REPLACE FUNCTION remove_targeting_intel(
  p_stix_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mitre_objects
  SET
    data = data - 'targeting_intel',
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION remove_targeting_intel IS 'Removes the targeting_intel key from a MITRE object data column';

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE enrichment_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Admins and owners can view enrichment audit records
CREATE POLICY "Admins can view enrichment audit"
  ON enrichment_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can create enrichment audit records
CREATE POLICY "Admins can create enrichment audit"
  ON enrichment_audit
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can update enrichment audit records (for rollback)
CREATE POLICY "Admins can update enrichment audit"
  ON enrichment_audit
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 5. SERVICE ROLE BYPASS (for scripts running with service key)
-- ============================================================================
-- The RPC functions use SECURITY DEFINER, so they run with the privileges
-- of the function owner (postgres), bypassing RLS. This is intentional for
-- the enrichment script which uses the service role key.

-- ============================================================================
-- 6. HELPER VIEW: Groups with Targeting Intelligence
-- ============================================================================
-- Creates a view that includes targeting intelligence data for easier querying

CREATE OR REPLACE VIEW v_mitre_groups_with_targeting AS
SELECT
  mo.id,
  mo.stix_id,
  mo.mitre_id,
  mo.name,
  mo.description,
  mo.deprecated,
  mo.revoked,
  mo.data,
  mo.created_at,
  mo.updated_at,
  -- Extract targeting intel fields for filtering
  mo.data->'targeting_intel'->>'origin_country' AS origin_country,
  mo.data->'targeting_intel'->>'origin_country_code' AS origin_country_code,
  mo.data->'targeting_intel'->'target_countries' AS target_countries,
  mo.data->'targeting_intel'->'target_sectors' AS target_sectors,
  mo.data->'targeting_intel'->>'activity_type' AS activity_type,
  mo.data->'targeting_intel'->>'match_confidence' AS match_confidence,
  mo.data->'targeting_intel' IS NOT NULL AS has_targeting_intel
FROM mitre_objects mo
WHERE mo.type = 'intrusion-set';

COMMENT ON VIEW v_mitre_groups_with_targeting IS 'MITRE intrusion sets with extracted targeting intelligence fields for filtering';

-- ============================================================================
-- 7. INDEX FOR TARGETING QUERIES
-- ============================================================================
-- Create a GIN index on the targeting_intel JSONB for efficient filtering

CREATE INDEX IF NOT EXISTS idx_mitre_objects_targeting_intel
ON mitre_objects USING GIN ((data->'targeting_intel'))
WHERE type = 'intrusion-set';

-- Index for origin country queries
CREATE INDEX IF NOT EXISTS idx_mitre_objects_origin_country
ON mitre_objects ((data->'targeting_intel'->>'origin_country'))
WHERE type = 'intrusion-set' AND data->'targeting_intel' IS NOT NULL;

COMMENT ON INDEX idx_mitre_objects_targeting_intel IS 'GIN index for efficient targeting intelligence queries';
