-- Run after schema.sql on an isolated database. No fixtures survive this suite.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;

-- A database administrator (this session) may insert users directly. Metadata never sets a role.
INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
  ('91000000-0000-0000-0000-000000000001', 'signup@example.test', '{"role":"owner"}', '{"role":"admin"}');
SELECT pg_temp.assert_true((SELECT role = 'viewer' FROM public.profiles WHERE email = 'signup@example.test'),
  'database administrator inserts land as viewer and ignore user and app metadata');

-- First owner: only a database administrator can issue the bootstrap invitation.
SELECT pg_temp.assert_true(NOT has_function_privilege(r, 'public.bootstrap_first_owner(text)', 'EXECUTE'),
  r || ' cannot run the first-owner bootstrap')
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
DO $$ BEGIN
  BEGIN
    PERFORM public.bootstrap_first_owner('not-an-email');
    RAISE EXCEPTION 'bootstrap accepted an invalid email';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Enter the email address%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.bootstrap_first_owner('Signup@Example.test');
    RAISE EXCEPTION 'bootstrap issued an owner invitation for an existing account';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'An account for % already exists%' THEN RAISE; END IF;
  END;
END $$;
SELECT pg_temp.assert_true(public.bootstrap_first_owner('  First.Owner@Example.test ') LIKE 'Owner invitation ready%',
  'bootstrap issues an owner invitation');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.user_invitations
  WHERE email = 'first.owner@example.test' AND role = 'owner' AND invited_by IS NULL
    AND expires_at <= now() + interval '1 day'), 'bootstrap invitation is normalised, system-issued and short-lived');

INSERT INTO public.user_invitations(email, role, invited_by, expires_at) VALUES
  ('invited@example.test', 'viewer', '91000000-0000-0000-0000-000000000001', now() + interval '1 day'),
  ('expired@example.test', 'admin', '91000000-0000-0000-0000-000000000001', now() - interval '1 day');

-- Everything Supabase Auth creates (sign-up, SSO, dashboard "Add user", admin API) arrives from its own
-- login role. Stand one in, so session_user is not a database administrator.
CREATE ROLE oss_test_auth_service NOLOGIN;
GRANT USAGE ON SCHEMA auth TO oss_test_auth_service;
GRANT INSERT ON auth.users TO oss_test_auth_service;
SELECT set_config('oss_test.administrator', session_user, true);
SET LOCAL SESSION AUTHORIZATION oss_test_auth_service;
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('91000000-0000-0000-0000-000000000002', 'FIRST.OWNER@example.test', '{"role":"viewer"}'),
  ('91000000-0000-0000-0000-000000000003', 'Invited@Example.test', '{"role":"owner"}');
DO $$ BEGIN
  BEGIN
    INSERT INTO auth.users(id, email) VALUES ('91000000-0000-0000-0000-000000000004', 'stranger@example.test');
    RAISE EXCEPTION 'Supabase Auth created an account without an invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO auth.users(id, email) VALUES ('91000000-0000-0000-0000-000000000005', 'expired@example.test');
    RAISE EXCEPTION 'Supabase Auth created an account from an expired invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO auth.users(id, email) VALUES ('91000000-0000-0000-0000-000000000006', 'invited@example.test');
    RAISE EXCEPTION 'Supabase Auth reused an accepted invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
-- Switch back explicitly: RESET SESSION AUTHORIZATION does not undo SET LOCAL in every runner.
DO $$ BEGIN EXECUTE format('SET LOCAL SESSION AUTHORIZATION %I', current_setting('oss_test.administrator')); END $$;

SELECT pg_temp.assert_true((SELECT role = 'owner' FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000002'),
  'the bootstrap invitation makes the first owner, matched case-insensitively');
SELECT pg_temp.assert_true((SELECT role = 'viewer' FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000003'),
  'the invitation role wins over user metadata');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.user_invitations
  WHERE email IN ('first.owner@example.test', 'invited@example.test') AND accepted_at IS NOT NULL),
  'used invitations are consumed');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id IN (
  '91000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000006')),
  'refused accounts leave no profile');
DO $$ BEGIN
  BEGIN
    PERFORM public.bootstrap_first_owner('second.owner@example.test');
    RAISE EXCEPTION 'bootstrap ran while an active owner exists';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'An active owner already exists%' THEN RAISE; END IF;
  END;
END $$;

-- A member cannot claim someone else's address by rewriting their profile email; identity comes from Auth.
SELECT set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET email = 'future.admin@example.test' WHERE id = '91000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'a member rewrote their profile email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
UPDATE public.profiles SET full_name = 'Renamed member' WHERE id = '91000000-0000-0000-0000-000000000003';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT full_name = 'Renamed member' AND email = 'Invited@Example.test'
  FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000003'),
  'members still edit their own profile, but not its email');
SELECT pg_temp.assert_true(public.auth_user_ids_for_email(' INVITED@example.test ') = ARRAY['91000000-0000-0000-0000-000000000003'::uuid],
  'accounts are found through Supabase Auth, case-insensitively');
SELECT pg_temp.assert_true(public.auth_user_ids_for_email('future.admin@example.test') = '{}'::uuid[],
  'an address nobody signs in with matches no account');
UPDATE auth.users SET email = 'invited.renamed@example.test' WHERE id = '91000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true((SELECT email = 'invited.renamed@example.test' FROM public.profiles
  WHERE id = '91000000-0000-0000-0000-000000000003'), 'a sign-in email change reaches the profile');

SELECT pg_temp.assert_true(NOT has_function_privilege(r, f, 'EXECUTE'), r || ' cannot run ' || f)
FROM unnest(ARRAY['anon', 'authenticated']) AS r,
     unnest(ARRAY['public.issue_user_invitation(text,text,uuid,interval)', 'public.auth_user_ids_for_email(text)']) AS f;
SELECT pg_temp.assert_true(has_function_privilege('service_role', f, 'EXECUTE'), 'manage-users can run ' || f)
FROM unnest(ARRAY['public.issue_user_invitation(text,text,uuid,interval)', 'public.auth_user_ids_for_email(text)']) AS f;

-- Re-inviting an address replaces its pending invitation; two can never be live at once.
SELECT set_config('oss_test.first_invitation',
  public.issue_user_invitation('Race@Example.test', 'viewer', '91000000-0000-0000-0000-000000000002')::text, true);
SELECT set_config('oss_test.second_invitation',
  public.issue_user_invitation(' race@example.test', 'admin', '91000000-0000-0000-0000-000000000002')::text, true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(role = 'admin' AND id::text = current_setting('oss_test.second_invitation'))
  FROM public.user_invitations WHERE lower(email) = 'race@example.test' AND accepted_at IS NULL),
  'issuing again leaves exactly one pending invitation, the newest');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.user_invitations(email, role, invited_by)
    VALUES ('RACE@example.test', 'viewer', '91000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'a second pending invitation was stored for one address';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- An account names the invitation it was created for, so a replaced one cannot hand it a different role.
SET LOCAL SESSION AUTHORIZATION oss_test_auth_service;
DO $$ BEGIN
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES ('91000000-0000-0000-0000-000000000007',
      'race@example.test', jsonb_build_object('invitation_id', current_setting('oss_test.first_invitation')));
    RAISE EXCEPTION 'an account was created from a replaced invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES ('91000000-0000-0000-0000-000000000008',
  'race@example.test', jsonb_build_object('invitation_id', current_setting('oss_test.second_invitation')));
DO $$ BEGIN EXECUTE format('SET LOCAL SESSION AUTHORIZATION %I', current_setting('oss_test.administrator')); END $$;
SELECT pg_temp.assert_true((SELECT role = 'admin' FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000008'),
  'the account gets the role of the invitation it names');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '91000000-0000-0000-0000-000000000007'),
  'the stale claim left no profile');

SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
), 'browser roles have no non-row table privileges');
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'm' AND has_table_privilege('anon', c.oid, 'SELECT')
), 'anonymous visitors cannot read materialized application data');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.user_invitations', 'INSERT'),
  'browser clients cannot bypass manage-users role checks by creating invitations directly');
SELECT pg_temp.assert_true(has_table_privilege('service_role', 'public.user_invitations', 'INSERT'),
  'manage-users retains server-side invitation creation');

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    TRUNCATE public.access_requests;
    RAISE EXCEPTION 'anon unexpectedly truncated a table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.user_invitations(email, role) VALUES ('forged@example.test', 'owner');
    RAISE EXCEPTION 'authenticated unexpectedly created an invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
