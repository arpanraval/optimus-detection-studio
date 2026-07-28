-- tr_patch_detection cross-user ownership probe
--
-- Run against a project database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tr_patch_detection_ownership.sql
--
-- FAILS (raises) before 20260728120000_tr_patch_detection_owner_guard.sql,
-- PASSES after. Everything happens inside a transaction that is rolled back,
-- so the probe leaves no rows behind.
--
-- WHY THE current_user ASSERTION MATTERS: an earlier version of this probe ran
-- as the superuser and "passed" without proving anything — RLS is bypassed for
-- superusers regardless of FORCE ROW LEVEL SECURITY, and a SECURITY DEFINER
-- function called by a superuser tells you nothing about what `authenticated`
-- can do. The probe asserts its own effective role before it trusts a result.

BEGIN;

DO $probe$
DECLARE
  v_owner    uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_session  uuid;
  v_ran_as   text;
  v_result   boolean;
  v_archived boolean;
BEGIN
  -- ── Arrange (as the migration/superuser role) ────────────────────────────
  INSERT INTO auth.users (id, email)
    VALUES (v_owner,    'probe-owner@example.test'),
           (v_attacker, 'probe-attacker@example.test');

  INSERT INTO public.threat_research_sessions (user_id, input_text, status, tree)
  VALUES (
    v_owner,
    'ownership probe',
    'completed',
    jsonb_build_object(
      'behaviours', jsonb_build_array(
        jsonb_build_object(
          'id', 'b1',
          'opportunities', jsonb_build_array(
            jsonb_build_object(
              'id', 'o1',
              'detection', jsonb_build_object('id', 'd_o1', 'archived', false)
            )
          )
        )
      )
    )
  )
  RETURNING id INTO v_session;

  -- ── Act: become the attacker, exactly as PostgREST would ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_attacker::text, 'role', 'authenticated')::text,
    true                       -- is_local: reverted at COMMIT/ROLLBACK
  );
  SET LOCAL ROLE authenticated;

  v_ran_as := current_user;

  -- The whole probe is worthless unless this holds.
  IF v_ran_as <> 'authenticated' THEN
    RAISE EXCEPTION
      'PROBE INVALID: ran as %, not authenticated. A superuser bypasses RLS and proves nothing.',
      v_ran_as;
  END IF;

  -- Sanity: auth.uid() must actually resolve to the attacker, otherwise the
  -- guard's NULL-uid (service-role) branch would be what we are testing.
  IF auth.uid() IS DISTINCT FROM v_attacker THEN
    RAISE EXCEPTION
      'PROBE INVALID: auth.uid() = %, expected attacker %. JWT claim did not take effect.',
      auth.uid(), v_attacker;
  END IF;

  SELECT public.tr_patch_detection(
    v_session, 'b1', 'o1', 'd_o1', jsonb_build_object('archived', true)
  ) INTO v_result;

  RESET ROLE;

  -- ── Assert ───────────────────────────────────────────────────────────────
  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'VULNERABLE: tr_patch_detection returned % for a session owned by another user (ran_as=%).',
      v_result, v_ran_as;
  END IF;

  SELECT (tree->'behaviours'->0->'opportunities'->0->'detection'->>'archived')::boolean
    INTO v_archived
    FROM public.threat_research_sessions WHERE id = v_session;

  IF v_archived THEN
    RAISE EXCEPTION
      'VULNERABLE: the cross-user patch was applied to the tree even though the RPC reported failure.';
  END IF;

  RAISE NOTICE 'OK: cross-user tr_patch_detection returned false and left the tree untouched (ran_as=%)', v_ran_as;

  -- ── Counter-test: the owner must still be able to patch their own tree ───
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  SELECT public.tr_patch_detection(
    v_session, 'b1', 'o1', 'd_o1', jsonb_build_object('archived', true)
  ) INTO v_result;

  RESET ROLE;

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'REGRESSION: the session owner can no longer patch their own detection (returned %).',
      v_result;
  END IF;

  RAISE NOTICE 'OK: owner patch still succeeds.';
END
$probe$;

ROLLBACK;
