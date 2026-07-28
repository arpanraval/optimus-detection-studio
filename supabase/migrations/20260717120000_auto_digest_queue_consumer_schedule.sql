-- Schedule the durable queue consumer only when the required managed services
-- and existing setup secrets are available. The worker reads the secrets from
-- Vault at execution time; no credential value is stored in the cron command.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND to_regclass('vault.decrypted_secrets') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM vault.secrets
        WHERE name IN ('tr_supabase_url', 'tr_service_role_key')
        GROUP BY 1
       HAVING count(*) = 2
     ) THEN
    PERFORM cron.schedule(
      'auto-digest-queue-consumer',
      '* * * * *',
      $job$
        SELECT net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tr_supabase_url')
            || '/functions/v1/auto-digest-queue-consumer',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key'),
            'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key')
          ),
          body := '{}'::jsonb
        )
      $job$
    );
  END IF;
END;
$$;
