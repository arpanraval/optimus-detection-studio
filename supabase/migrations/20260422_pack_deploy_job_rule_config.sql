-- Pack deploy jobs can now carry a per-deploy-time ruleConfig that applies
-- to every detection in the pack. This supersedes detection_packs.deploy_config
-- for active jobs.
--
-- Shape: same as integration-ops rule_config (provider-specific), set by the
-- user in PackDeployPickerModal via ProviderRuleConfigForm.

ALTER TABLE pack_deploy_jobs
  ADD COLUMN IF NOT EXISTS rule_config jsonb;

COMMENT ON COLUMN pack_deploy_jobs.rule_config IS
  'Provider-specific rule configuration captured at deploy time. Applied to every detection in the job.';
