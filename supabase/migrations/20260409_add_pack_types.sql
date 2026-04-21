-- Add new pack_type values: siem_ready, use_case
-- Drops and recreates the CHECK constraint to include the new types.

ALTER TABLE detection_packs DROP CONSTRAINT IF EXISTS detection_packs_pack_type_check;
ALTER TABLE detection_packs ADD CONSTRAINT detection_packs_pack_type_check
  CHECK (pack_type IN ('tactic','technology','threat_actor','campaign','ransomware','custom','siem_ready','use_case'));
