-- Pack Deployment Status Views
--
-- Computes pack deployment status by picking the latest deployment_history
-- row per (detection, integration) and classifying it by action + status.
--
-- "Deployed" = latest action is create/update with status=success.
-- A later 'delete' makes the detection count as neither deployed nor failed
-- (rule is no longer in the SIEM). status='failed' counts as failed.
-- status='in_progress' and 'rolled_back' count as neither.
--
-- Used by usePackDeploymentStatus hook to show "X/Y deployed to Splunk" on packs.

DROP VIEW IF EXISTS v_pack_deployment_status;

CREATE VIEW v_pack_deployment_status AS
WITH latest_action AS (
  -- Absolute latest deployment_history row per (detection, integration).
  SELECT DISTINCT ON (dh.detection_id, dh.integration_id)
    dh.detection_id,
    dh.integration_id,
    dh.action,
    dh.status,
    dh.created_at
  FROM deployment_history dh
  ORDER BY dh.detection_id, dh.integration_id, dh.created_at DESC
)
SELECT
  pd.pack_id,
  la.integration_id,
  COUNT(DISTINCT pd.detection_id) AS total_detections,
  COUNT(DISTINCT CASE
    WHEN la.action IN ('create', 'update') AND la.status = 'success'
    THEN pd.detection_id
  END) AS deployed_count,
  COUNT(DISTINCT CASE
    WHEN la.action IN ('create', 'update') AND la.status = 'failed'
    THEN pd.detection_id
  END) AS failed_count,
  MAX(la.created_at) AS last_deployed_at
FROM pack_detections pd
INNER JOIN latest_action la ON la.detection_id = pd.detection_id
GROUP BY pd.pack_id, la.integration_id;

-- Per-pack totals including quality breakdown
CREATE OR REPLACE VIEW v_pack_totals AS
SELECT
  p.id AS pack_id,
  COUNT(DISTINCT pd.detection_id) AS total_detections,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('Production', 'Testing')) AS production_ready_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'Draft') AS draft_count
FROM detection_packs p
LEFT JOIN pack_detections pd ON pd.pack_id = p.id
LEFT JOIN detections d ON d.id = pd.detection_id
GROUP BY p.id;

GRANT SELECT ON v_pack_deployment_status TO authenticated;
GRANT SELECT ON v_pack_totals TO authenticated;
