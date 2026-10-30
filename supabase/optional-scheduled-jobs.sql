-- Background automation: run after schema.sql (or pending migrations) as postgres.
-- Required for Threat Research and scheduled Auto Digest / pack deployments.
-- Replace both placeholders with this project's values. Keep the key private.
-- Use Settings > API Keys > Legacy keys > service_role: the existing worker
-- authentication chain expects that JWT, not an sb_secret or publishable key.
--
-- The same versioned function is called by `bun run setup`. It updates the
-- existing Vault secrets and six named cron jobs atomically and is safe to rerun.
-- Schedules keep references to Vault, so neither URL nor key is copied into cron.
SELECT public.configure_background_automation(
  'https://YOUR_PROJECT_REF.supabase.co',
  'YOUR_LEGACY_SERVICE_ROLE_JWT'
);
