-- One administrator-only entry point for guided and manual automation setup.
-- Caller privileges apply: this function does not bypass RLS or Vault permissions.
CREATE OR REPLACE FUNCTION public.configure_background_automation(p_url text, p_service_role_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  secret_id uuid;
  payload text;
  claims jsonb;
BEGIN
  IF p_url IS NULL OR p_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' THEN
    RAISE EXCEPTION 'Expected the hosted Supabase project URL without a trailing slash';
  END IF;
  IF p_service_role_key IS NULL OR p_service_role_key !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Automation currently requires the legacy service_role JWT from Settings > API Keys > Legacy keys';
  END IF;
  BEGIN
    payload := translate(split_part(p_service_role_key, '.', 2), '-_', '+/');
    claims := convert_from(decode(payload || repeat('=', (4 - length(payload) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid service_role JWT format';
  END;
  IF claims->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Automation requires a service_role key, not a public or user key';
  END IF;
  IF claims ? 'ref' AND claims->>'ref' IS DISTINCT FROM split_part(split_part(p_url, '//', 2), '.', 1) THEN
    RAISE EXCEPTION 'The service_role key belongs to a different Supabase project';
  END IF;

  -- Supabase provisions these extensions; enable them if not already available.
  IF to_regnamespace('cron') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  END IF;
  IF to_regnamespace('net') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  END IF;

  SELECT id INTO secret_id FROM vault.secrets WHERE name = 'tr_supabase_url';
  IF secret_id IS NULL THEN
    PERFORM vault.create_secret(p_url, 'tr_supabase_url');
  ELSE
    PERFORM vault.update_secret(secret_id, p_url);
  END IF;
  SELECT id INTO secret_id FROM vault.secrets WHERE name = 'tr_service_role_key';
  IF secret_id IS NULL THEN
    PERFORM vault.create_secret(p_service_role_key, 'tr_service_role_key');
  ELSE
    PERFORM vault.update_secret(secret_id, p_service_role_key);
  END IF;

  PERFORM cron.schedule('pack-deploy-dispatcher', '* * * * *', 'select public.pack_deploy_dispatch()');
  PERFORM cron.schedule('ai_usage_rollup', '0 2 * * *', 'select public.rollup_ai_usage()');
  PERFORM cron.schedule('threat-research-dispatcher', '* * * * *', 'select public.threat_research_dispatcher()');
  PERFORM cron.schedule('auto-digest-watchdog', '*/5 * * * *', 'select public.auto_digest_watchdog()');
  PERFORM cron.schedule('auto-digest-scheduler', '0 * * * *', 'select public.auto_digest_scheduler()');
  PERFORM cron.schedule('auto-digest-queue-consumer', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'tr_supabase_url')
             || '/functions/v1/auto-digest-queue-consumer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tr_service_role_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'tr_service_role_key')
      ),
      body := '{}'::jsonb
    );
  $job$);
END;
$function$;

REVOKE ALL ON FUNCTION public.configure_background_automation(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_background_automation(text, text) TO postgres;
