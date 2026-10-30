-- Run on an isolated database after schema.sql. All fixtures and DDL roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;
CREATE TEMP TABLE expected_watchdog AS
  SELECT replace(pg_get_functiondef('public.auto_digest_watchdog()'::regprocedure), chr(13), '') AS definition;

INSERT INTO auth.users(id,email) VALUES
  ('81000000-0000-0000-0000-000000000001','setup-check@example.test');
INSERT INTO public.integrations(user_id,provider,name,category,auth_type) VALUES
  ('81000000-0000-0000-0000-000000000001','chronicle','Fresh Chronicle','siem','oauth2_client_credentials');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.integrations(user_id,provider,name,category,auth_type) VALUES
      ('81000000-0000-0000-0000-000000000001','invalid_provider','Invalid','siem','token');
    RAISE EXCEPTION 'An unknown provider was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO public.integrations(user_id,provider,name,category,auth_type,status,last_tested_at,last_test_result) VALUES
  ('81000000-0000-0000-0000-000000000001','jira','Placeholder Jira','automation','token','connected',now(),
   '{"success":true,"message":"jira connection test not yet implemented","latency_ms":0}'),
  ('81000000-0000-0000-0000-000000000001','slack','Placeholder Slack','automation','webhook','connected',now(),
   '{"success":true,"message":"slack connection test not yet implemented","latency_ms":0}'),
  ('81000000-0000-0000-0000-000000000001','splunk','Verified Splunk','siem','token','connected',now(),
   '{"success":true,"message":"Connected to Splunk","latency_ms":30}'),
  ('81000000-0000-0000-0000-000000000001','slack','Disabled Slack','automation','webhook','disabled',now(),
   '{"success":true,"message":"slack connection test not yet implemented","latency_ms":0}');

-- Simulate the old constraint and installer downgrade on an existing database.
DELETE FROM public.integrations WHERE name='Fresh Chronicle';
ALTER TABLE public.integrations DROP CONSTRAINT integrations_provider_check;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_provider_check CHECK (provider <> 'chronicle');
\ir ../migrations/20260716000000_active_entry_id.sql
SELECT pg_temp.assert_true(
  pg_get_functiondef('public.auto_digest_watchdog()'::regprocedure) LIKE '%pending_entry_ids%',
  'fixture reproduces the old watchdog'
);
\ir ../migrations/20261027113202_setup_integrations_recovery.sql
SELECT pg_temp.assert_true(
  replace(pg_get_functiondef('public.auto_digest_watchdog()'::regprocedure), chr(13), '') = (SELECT definition FROM expected_watchdog),
  'repair restores the same watchdog as a fresh installation'
);
INSERT INTO public.integrations(user_id,provider,name,category,auth_type) VALUES
  ('81000000-0000-0000-0000-000000000001','chronicle','Upgraded Chronicle','siem','oauth2_client_credentials');
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM public.integrations
    WHERE name IN ('Placeholder Jira','Placeholder Slack') AND status='configured'
      AND last_tested_at IS NULL AND last_test_result->>'code'='TEST_NOT_SUPPORTED'
      AND last_test_result->>'success'='false'),
  'placeholder successes become unverified configurations'
);
SELECT pg_temp.assert_true(
  (SELECT status='connected' FROM public.integrations WHERE name='Verified Splunk'),
  'real successful connections are preserved'
);
SELECT pg_temp.assert_true(
  (SELECT status='disabled' FROM public.integrations WHERE name='Disabled Slack'),
  'disabled integrations stay disabled'
);

-- Re-running the repair must not replace a future queue-aware implementation.
DO $$
BEGIN
  EXECUTE replace((SELECT definition FROM expected_watchdog), 'DECLARE', E'-- future watchdog revision\nDECLARE');
END $$;
\ir ../migrations/20261027113202_setup_integrations_recovery.sql
SELECT pg_temp.assert_true(
  pg_get_functiondef('public.auto_digest_watchdog()'::regprocedure) LIKE '%future watchdog revision%',
  'rerunning setup preserves later queue-aware watchdog revisions'
);

-- Exercise recovery, not just the function text: expired entries retry or
-- quarantine; a stuck phase is requeued instead of failed immediately.
INSERT INTO public.threat_intel_feeds(id,user_id,name,feed_type,url) VALUES
  ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Fixture','rss','https://example.test/feed');
INSERT INTO public.threat_intel_feed_entries(id,feed_id,user_id,title) VALUES
  ('83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Retry'),
  ('83000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Quarantine');
INSERT INTO public.auto_digest_jobs(id,user_id,status,phase,heartbeat_at,started_at) VALUES
  ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','processing','digesting',now()-interval '30 minutes',now()-interval '30 minutes');
INSERT INTO public.auto_digest_job_entries(job_id,user_id,feed_entry_id,phase,status,attempt_count,lease_expires_at) VALUES
  ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','digest','running',1,now()-interval '1 minute'),
  ('84000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002','digest','running',3,now()-interval '1 minute');
SELECT public.auto_digest_watchdog();
SELECT pg_temp.assert_true(
  (SELECT status='pending' AND lease_expires_at IS NULL FROM public.auto_digest_job_entries WHERE feed_entry_id='83000000-0000-0000-0000-000000000001'),
  'an expired entry lease is returned to the queue'
);
SELECT pg_temp.assert_true(
  (SELECT status='quarantined' AND last_error_code='POISON_ARTICLE' FROM public.auto_digest_job_entries WHERE feed_entry_id='83000000-0000-0000-0000-000000000002'),
  'exhausted entry retries are quarantined'
);
SELECT pg_temp.assert_true(
  (SELECT status='processing' AND phase_attempt_count=1 AND phase_started_at IS NULL FROM public.auto_digest_jobs WHERE id='84000000-0000-0000-0000-000000000001'),
  'a stuck phase is retried rather than immediately failed'
);
ROLLBACK;
