-- ============================================================================
-- OPTIONAL — Background automation (pg_cron + pg_net)
-- ============================================================================
-- These schedulers drive background processing:
--   • ai_usage_rollup            — nightly roll-up of AI usage into ai_usage_daily
--   • threat-research-dispatcher — advances async Threat Research jobs
--   • auto-digest-watchdog       — recovers stuck auto-digest jobs
--   • auto-digest-scheduler      — kicks off scheduled threat-intel auto-digests
--
-- They are OPTIONAL. The app is fully usable without them — you just trigger
-- those flows manually from the UI instead of on a schedule. Enable this ONLY
-- after supabase/schema.sql is applied and your edge functions are deployed.
--
-- The dispatcher/auto-digest functions call your edge functions over HTTP using
-- pg_net, reading your project URL + service-role key from Vault. You must set
-- those for YOUR project first — nothing here is hard-coded to any instance.
--
-- Run everything below as the project owner in the Supabase SQL Editor.
-- ============================================================================

-- 1) Enable the extensions (Supabase: allowed for the postgres role).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2) Store the secrets the jobs use to call your own edge functions.
--    Replace the placeholders with YOUR project ref and service-role key.
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'tr_supabase_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY',                'tr_service_role_key');

-- 3) Some auto-digest paths read these database settings instead of Vault.
alter database postgres set app.settings.supabase_url    = 'https://YOUR_PROJECT_REF.supabase.co';
alter database postgres set app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- 4) Schedule the jobs (idempotent: unschedule first if re-running).
select cron.schedule('ai_usage_rollup',            '0 2 * * *',   $$ select public.rollup_ai_usage() $$);
select cron.schedule('threat-research-dispatcher', '* * * * *',   $$ select public.threat_research_dispatcher() $$);
select cron.schedule('auto-digest-watchdog',       '*/5 * * * *', $$ select public.auto_digest_watchdog() $$);
select cron.schedule('auto-digest-scheduler',      '0 * * * *',   $$ select public.auto_digest_scheduler() $$);

-- To remove later:  select cron.unschedule('ai_usage_rollup');  -- etc.
