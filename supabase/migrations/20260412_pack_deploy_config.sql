-- Pack-Level Deploy Config
--
-- Allows setting deploy-time overrides that apply to all detections in a pack.
-- Shape of deploy_config JSONB:
-- {
--   "severity_override": "Critical" | "High" | "Medium" | "Low" | "Informational" | null,
--   "schedule_override": string | null,  -- cron expression or provider-specific schedule
--   "enabled": boolean,                   -- if false, rules are deployed but disabled in SIEM
--   "notes": string | null
-- }

ALTER TABLE detection_packs
  ADD COLUMN IF NOT EXISTS deploy_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN detection_packs.deploy_config IS
'Pack-level deploy overrides applied to all detections during deploy.
Fields: severity_override, schedule_override, enabled, notes.';
