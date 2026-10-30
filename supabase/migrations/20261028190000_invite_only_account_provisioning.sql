-- Invite-only account provisioning: roles come only from server-issued invitations, and
-- Supabase Auth cannot create an account without one. Mirrored in supabase/schema.sql.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation RECORD;
  v_full_name  text;
  v_role       text;
  v_requested  text;
BEGIN
  v_full_name := split_part(NEW.email, '@', 1);

  -- A role comes only from a server-issued invitation. Supabase Auth (sign-up, OAuth/SSO,
  -- dashboard "Add user", admin API) connects as supabase_auth_admin, so every account it
  -- creates needs one, whatever the project's sign-up switch says. session_user, not
  -- current_user: this function runs as its owner.
  -- manage-users names the invitation it issued (invitation_id), so an invitation replaced
  -- in the meantime cannot hand this account a different role. The match is still bound
  -- to the address, so the field cannot select anyone else's invitation.
  v_requested := nullif(NEW.raw_user_meta_data->>'invitation_id', '');
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
    AND expires_at > now()
    AND (v_requested IS NULL OR id::text = v_requested)
  LIMIT 1
  FOR UPDATE;

  IF v_invitation.id IS NOT NULL THEN
    v_role := v_invitation.role;
  ELSIF v_requested IS NOT NULL THEN
    RAISE EXCEPTION 'The invitation for % was replaced or has expired. Send a new one.', NEW.email
      USING ERRCODE = '42501';
  ELSIF session_user IN ('postgres', 'supabase_admin') THEN
    -- A database administrator inserting into auth.users directly already controls everything.
    v_role := 'viewer';
  ELSE
    RAISE EXCEPTION 'Optimus is invite-only. Ask an administrator to invite %.', NEW.email
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name, status, password_set, created_at, updated_at)
  VALUES (
    NEW.id, NEW.email, v_role, v_full_name, 'active',
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN false ELSE true END,
    now(), now()
  );

  IF v_invitation.id IS NOT NULL THEN
    UPDATE public.user_invitations
       SET accepted_at = now()
     WHERE id = v_invitation.id;

    INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (NEW.id, 'user', NEW.id::text, 'user_joined',
      jsonb_build_object('email', NEW.email, 'role', v_role,
                         'invited_by', v_invitation.invited_by, 'method', 'invitation'));

    INSERT INTO public.user_notifications (user_id, type, title, message)
    VALUES (NEW.id, 'welcome', 'Welcome to Optimus!',
      'You have been added as ' || v_role || '. Start by exploring the Detection Library.');
  ELSE
    INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (NEW.id, 'user', NEW.id::text, 'user_registered',
      jsonb_build_object('email', NEW.email, 'method', 'database_administrator'));
  END IF;

  RETURN NEW;
END;
$function$;

-- Invite-only account provisioning (docs/plans/2026-10-28-invite-only-account-provisioning.md).
-- handle_new_user (above) takes roles only from invitations and refuses uninvited Supabase Auth
-- accounts. Owner invitations exist for the first-owner bootstrap; system-issued ones have no inviter.
ALTER TABLE public.user_invitations DROP CONSTRAINT IF EXISTS user_invitations_role_check;
ALTER TABLE public.user_invitations ADD CONSTRAINT user_invitations_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text, 'analyst'::text, 'viewer'::text]));
ALTER TABLE public.user_invitations ALTER COLUMN invited_by DROP NOT NULL;

-- At most one pending invitation per address. Older duplicates were never the ones used.
DELETE FROM public.user_invitations older
USING public.user_invitations newer
WHERE older.accepted_at IS NULL AND newer.accepted_at IS NULL
  AND lower(older.email) = lower(newer.email)
  AND (newer.created_at, newer.id) > (older.created_at, older.id);
CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_one_pending_per_email
  ON public.user_invitations (lower(email)) WHERE accepted_at IS NULL;

-- The only way to issue an invitation: replaces any pending one for the address in a single
-- transaction, serialised per address, and returns the id the new account must claim.
CREATE OR REPLACE FUNCTION public.issue_user_invitation(
  p_email text, p_role text, p_invited_by uuid, p_valid_for interval DEFAULT interval '7 days')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
  v_id    uuid;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'An email address is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('user_invitations:' || v_email, 0));
  DELETE FROM public.user_invitations WHERE lower(email) = v_email AND accepted_at IS NULL;
  INSERT INTO public.user_invitations (email, role, invited_by, expires_at)
  VALUES (v_email, p_role, p_invited_by, now() + p_valid_for)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_user_invitation(text, text, uuid, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_user_invitation(text, text, uuid, interval) TO service_role;

-- Account identity comes from Supabase Auth, never from the editable profile row.
CREATE OR REPLACE FUNCTION public.auth_user_ids_for_email(p_email text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT coalesce(array_agg(id ORDER BY id), '{}')
  FROM auth.users
  WHERE lower(email) = lower(btrim(p_email));
$function$;

REVOKE ALL ON FUNCTION public.auth_user_ids_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_ids_for_email(text) TO service_role;

-- profiles.email mirrors auth.users.email. Browser sessions cannot rewrite it; Supabase Auth keeps it in sync.
CREATE OR REPLACE FUNCTION public.guard_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND current_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RAISE EXCEPTION 'The profile email follows the sign-in email and cannot be changed here.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_guard_email ON public.profiles;
CREATE TRIGGER profiles_guard_email BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_email();

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.profiles SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Run once in the SQL editor on a new install, then add the user under Authentication > Users.
CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter the email address of the first owner, for example bootstrap_first_owner(''you@company.com'')';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'owner' AND coalesce(status, 'active') <> 'deactivated') THEN
    RAISE EXCEPTION 'An active owner already exists. Invite people from Settings > Users instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An account for % already exists. Make it the owner with: update public.profiles set role = ''owner'' where lower(email) = ''%'';',
      v_email, v_email;
  END IF;

  PERFORM public.issue_user_invitation(v_email, 'owner', NULL, interval '1 day');

  RETURN format('Owner invitation ready for %s for 24 hours. Now open Authentication > Users > Add user, '
    'enter this email and a password, and tick Auto Confirm User.', v_email);
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_first_owner(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(text) TO postgres;
