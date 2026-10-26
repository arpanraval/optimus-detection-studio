-- Run against an isolated database after schema.sql; every fixture rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES
  ('71000000-0000-0000-0000-000000000001','digest-owner@example.test'),
  ('71000000-0000-0000-0000-000000000002','digest-reader@example.test');
INSERT INTO public.profiles(id,role,status) VALUES
  ('71000000-0000-0000-0000-000000000001','owner','active'),
  ('71000000-0000-0000-0000-000000000002','viewer','active')
ON CONFLICT(id) DO UPDATE SET role=excluded.role,status='active';
INSERT INTO public.auto_digest_team(user_id) VALUES ('71000000-0000-0000-0000-000000000001');
INSERT INTO public.auto_digest_settings(user_id,is_enabled) VALUES ('71000000-0000-0000-0000-000000000001',true);
INSERT INTO public.threat_intel_feeds(id,user_id,name,feed_type,url,is_auto_digest) VALUES
  ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Team source','rss','https://example.test/feed',true),
  ('72000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','Personal source','rss','https://example.test/private',false);
INSERT INTO public.auto_digest_jobs(id,user_id,status) VALUES
  ('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','completed');
INSERT INTO public.auto_digest_run_events(job_id,user_id,event_type) VALUES
  ('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','feed_fetched');
INSERT INTO public.threat_intel_reports(id,user_id,name,source_type) VALUES
  ('team-rbac-report','71000000-0000-0000-0000-000000000001','Shared intelligence','url');

DO $$
DECLARE role_name text; changed integer; denied boolean; job uuid;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['viewer','analyst','lead','admin','owner'] LOOP
    UPDATE public.profiles SET role=role_name WHERE id='71000000-0000-0000-0000-000000000002';
    PERFORM set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
    PERFORM set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.auto_digest_team),'team identity is readable');
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.auto_digest_settings),'team settings are readable');
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.threat_intel_feeds),'team sources visible, personal sources private');
    PERFORM pg_temp.assert_true((SELECT count(*)>=1 FROM public.auto_digest_jobs),'team runs are readable');
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.auto_digest_run_events),'team transcript is readable');
    PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.threat_intel_reports WHERE id='team-rbac-report'),'threat intelligence shared for every role');

    UPDATE public.auto_digest_settings SET schedule_hour_utc=7;
    GET DIAGNOSTICS changed = ROW_COUNT;
    PERFORM pg_temp.assert_true(changed=CASE WHEN role_name IN ('owner','admin') THEN 1 ELSE 0 END,'settings writes require admin');
    UPDATE public.threat_intel_feeds SET is_enabled=false WHERE is_auto_digest;
    GET DIAGNOSTICS changed = ROW_COUNT;
    PERFORM pg_temp.assert_true(changed=CASE WHEN role_name IN ('owner','admin') THEN 1 ELSE 0 END,'source writes require admin');

    denied := false;
    BEGIN
      INSERT INTO public.auto_digest_settings(user_id) VALUES ('71000000-0000-0000-0000-000000000002');
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    PERFORM pg_temp.assert_true(denied,'a second personal configuration cannot be created');
    denied := false;
    BEGIN
      INSERT INTO public.threat_intel_feeds(user_id,name,feed_type,url,is_auto_digest)
      VALUES ('71000000-0000-0000-0000-000000000001','Extra','rss','https://example.test/extra',true);
      DELETE FROM public.threat_intel_feeds WHERE name='Extra';
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    PERFORM pg_temp.assert_true(denied=(role_name NOT IN ('owner','admin')),'source creation requires admin');

    denied := false;
    BEGIN
      SELECT job_id INTO job FROM public.request_auto_digest_job('71000000-0000-0000-0000-000000000001','rbac-test');
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    PERFORM pg_temp.assert_true(denied=(role_name NOT IN ('owner','admin')),'manual runs require admin even through direct RPC');
    denied := false;
    BEGIN
      PERFORM public.cancel_auto_digest_job(COALESCE(job,'73000000-0000-0000-0000-000000000001'));
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    PERFORM pg_temp.assert_true(denied=(role_name NOT IN ('owner','admin')),'cancellation requires admin');
    RESET ROLE;
  END LOOP;
END $$;

SELECT pg_temp.assert_true(NOT has_table_privilege('anon','public.auto_digest_team','SELECT'),'anonymous users cannot read team configuration');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.auto_digest_team','UPDATE'),'pipeline identity cannot be reassigned');

-- Owning the historic pipeline must not bypass a later role downgrade.
UPDATE public.profiles SET role='viewer' WHERE id='71000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE changed integer; denied boolean := false;
BEGIN
  UPDATE public.auto_digest_settings SET is_enabled=false;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_temp.assert_true(changed=0,'historic ownership does not grant settings writes');
  UPDATE public.threat_intel_feeds SET is_enabled=true WHERE is_auto_digest;
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_temp.assert_true(changed=0,'historic ownership does not grant source writes');
  BEGIN PERFORM public.request_auto_digest_job('71000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.assert_true(denied,'historic owner cannot bypass run authorization');
END $$;
RESET ROLE;
ROLLBACK;
