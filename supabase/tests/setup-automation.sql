-- Isolated PostgreSQL only: substitutes Vault, cron, and pg_net with test doubles.
-- Never run this fixture file on a hosted project. Everything rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;
CREATE TEMP TABLE expected_automation AS
  SELECT replace(pg_get_functiondef('public.configure_background_automation(text,text)'::regprocedure), chr(13), '') AS definition;
\ir ../migrations/20261027164001_configure_background_automation.sql
SELECT pg_temp.assert_true(
  replace(pg_get_functiondef('public.configure_background_automation(text,text)'::regprocedure), chr(13), '') = (SELECT definition FROM expected_automation),
  'fresh schema and upgrade migration configure automation identically'
);
CREATE SCHEMA vault;
CREATE SCHEMA cron;
CREATE SCHEMA net;
CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(value text, label text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO vault.secrets(name,secret) VALUES(label,value) RETURNING id
$$;
CREATE FUNCTION vault.update_secret(secret_id uuid, value text) RETURNS void LANGUAGE sql AS $$
  UPDATE vault.secrets SET secret=value WHERE id=secret_id
$$;
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
CREATE FUNCTION cron.schedule(name text, timing text, sql text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job(jobname,schedule,command) VALUES(name,timing,sql)
  ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command,active=true RETURNING jobid
$$;
CREATE TABLE net.requests(url text, headers jsonb, body jsonb);
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN INSERT INTO net.requests VALUES(url,headers,body); RETURN 1; END $$;

-- Signature is deliberately fake; these tests never call a network service.
CREATE TEMP TABLE inputs AS SELECT
  'https://example.supabase.co'::text AS url,
  (rtrim(encode(convert_to('{"alg":"HS256"}', 'UTF8'), 'base64'), '=') || '.' ||
   rtrim(encode(convert_to('{"role":"service_role","ref":"example"}', 'UTF8'), 'base64'), '=') ||
   '.not-a-secret')::text AS key;
SELECT cron.schedule('unrelated-job','0 0 * * *','select 1');
SELECT public.configure_background_automation(url,key) FROM inputs;
CREATE TEMP TABLE original_secrets AS SELECT id,name FROM vault.secrets;
SELECT public.configure_background_automation(url,key) FROM inputs;
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM cron.job),'six schedules plus the unrelated job, with no duplicates');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM vault.secrets),'only the two existing Vault secret names');
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM vault.secrets v JOIN original_secrets o USING(id,name)),
  'rerunning setup keeps secret identities'
);
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT 1 FROM cron.job,inputs WHERE command LIKE '%'||key||'%' OR command LIKE '%'||url||'%'),
  'schedules do not embed credentials or project URLs'
);
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT 1 FROM cron.job WHERE command LIKE '%app.settings.%'),
  'schedules do not need restricted database settings'
);
DO $$
DECLARE cmd text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname='auto-digest-queue-consumer';
  EXECUTE cmd;
END $$;
SELECT pg_temp.assert_true(
  (SELECT r.url=i.url||'/functions/v1/auto-digest-queue-consumer'
     AND r.headers->>'Authorization'='Bearer '||i.key AND r.headers->>'apikey'=i.key
   FROM net.requests r CROSS JOIN inputs i),
  'queue dispatch uses the existing worker URL and authentication headers'
);
SELECT vault.update_secret(id,secret||'rotated') FROM vault.secrets WHERE name='tr_service_role_key';
DO $$ BEGIN EXECUTE (SELECT command FROM cron.job WHERE jobname='auto-digest-queue-consumer'); END $$;
SELECT pg_temp.assert_true(
  EXISTS(SELECT 1 FROM net.requests r, inputs i WHERE r.headers->>'apikey'=i.key||'rotated'),
  'next dispatch reads the current Vault key without rescheduling'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon','public.configure_background_automation(text,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.configure_background_automation(text,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.configure_background_automation(text,text)','EXECUTE'),
  'browser and worker roles cannot reconfigure automation'
);
SELECT pg_temp.assert_true(
  (SELECT NOT prosecdef FROM pg_proc WHERE oid='public.configure_background_automation(text,text)'::regprocedure),
  'setup never elevates the caller'
);
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.configure_background_automation('https://example.supabase.co','sb_secret_not_a_jwt');
  EXCEPTION WHEN raise_exception THEN rejected := true; END;
  PERFORM pg_temp.assert_true(rejected,'incompatible automation credentials are rejected');
  rejected := false;
  BEGIN
    PERFORM public.configure_background_automation('https://other.supabase.co',(SELECT key FROM inputs));
  EXCEPTION WHEN raise_exception THEN rejected := true; END;
  PERFORM pg_temp.assert_true(rejected,'a key from a different project is rejected');
END $$;

-- Inject a scheduling failure after the Vault updates. No partial update may survive.
CREATE FUNCTION pg_temp.fail_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected cron failure'; END $$;
CREATE TRIGGER fail_schedule BEFORE INSERT ON cron.job FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_schedule();
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.configure_background_automation(url,key) FROM inputs;
  EXCEPTION WHEN raise_exception THEN rejected := true; END;
  PERFORM pg_temp.assert_true(rejected,'scheduling failure is propagated');
END $$;
SELECT pg_temp.assert_true(
  (SELECT secret=key||'rotated' FROM vault.secrets CROSS JOIN inputs WHERE name='tr_service_role_key'),
  'scheduling failure rolls back Vault changes'
);
ROLLBACK;
