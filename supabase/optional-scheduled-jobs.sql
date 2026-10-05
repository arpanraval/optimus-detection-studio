-- ============================================================================
-- Background automation (pg_cron + pg_net) — REQUIRED for Threat Research
-- ============================================================================
-- `bun run setup` (step 7) applies everything in this file automatically with
-- your real values. Use this file only if you prefer to run it by hand in the
-- Supabase SQL Editor.
--
-- These schedulers drive background processing:
--   • ai_usage_rollup            — nightly roll-up of AI usage into ai_usage_daily
--   • threat-research-dispatcher — advances async Threat Research jobs
--   • auto-digest-watchdog       — recovers stuck auto-digest jobs
--   • auto-digest-scheduler      — kicks off scheduled threat-intel auto-digests
--
-- How optional is this?
--   • Threat Research: NOT optional. Even a manually-started research session
--     dispatches its jobs over pg_net using the Vault secrets below (steps 1-2);
--     the dispatcher cron (step 4) recovers any dispatch that fails. Without
--     them, sessions sit in "pending" forever with no visible error.
--     Threat Research also needs the ANTHROPIC_API_KEY edge-function secret.
--   • Auto-digest / AI-usage rollup: optional — "Run Now" in the UI works
--     without any of this; you only lose the scheduled runs.
--
-- Enable this ONLY after supabase/schema.sql is applied and your edge functions
-- are deployed. Run everything below as the project owner in the SQL Editor.
-- Nothing here is hard-coded to any instance — fill in YOUR project values.
-- ============================================================================

-- 1) Enable the extensions (Supabase: allowed for the postgres role).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2) Store the secrets the jobs use to call your own edge functions.
--    Replace the placeholders with YOUR project ref and service-role key
--    (Dashboard → Settings → API → service_role). Safe to re-run: existing
--    secrets are updated in place.
do $vaultblk$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'tr_supabase_url';
  if sid is null then perform vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'tr_supabase_url');
  else perform vault.update_secret(sid, 'https://YOUR_PROJECT_REF.supabase.co'); end if;

  select id into sid from vault.secrets where name = 'tr_service_role_key';
  if sid is null then perform vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'tr_service_role_key');
  else perform vault.update_secret(sid, 'YOUR_SERVICE_ROLE_KEY'); end if;
end $vaultblk$;

-- 3) Some auto-digest paths read these database settings instead of Vault.
alter database postgres set app.settings.supabase_url    = 'https://YOUR_PROJECT_REF.supabase.co';
alter database postgres set app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- 4) Schedule the jobs (idempotent: re-scheduling an existing job name updates it).
select cron.schedule('pack-deploy-dispatcher', '* * * * *', $$ select public.pack_deploy_dispatch() $$);
select cron.schedule('ai_usage_rollup',            '0 2 * * *',   $$ select public.rollup_ai_usage() $$);
select cron.schedule('threat-research-dispatcher', '* * * * *',   $$ select public.threat_research_dispatcher() $$);
select cron.schedule('auto-digest-watchdog',       '*/5 * * * *', $$ select public.auto_digest_watchdog() $$);
select cron.schedule('auto-digest-scheduler',      '0 * * * *',   $$ select public.auto_digest_scheduler() $$);

-- Durable auto-digest consumer: one leased queue message per invocation.
select cron.schedule('auto-digest-queue-consumer', '* * * * *', $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-digest-queue-consumer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )
);

-- To remove later:  select cron.unschedule('ai_usage_rollup');  -- etc.
