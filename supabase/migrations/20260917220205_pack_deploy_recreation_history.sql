-- History records identify successful remote creates, not one permanent active rule.
-- Recreating a deleted rule produces a new vendor identity and must retain both events.
DROP INDEX IF EXISTS public.idx_active_deployment;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_create_identity
  ON public.deployment_history (detection_id, integration_id, vendor_rule_id)
  WHERE action = 'create' AND status = 'success';
