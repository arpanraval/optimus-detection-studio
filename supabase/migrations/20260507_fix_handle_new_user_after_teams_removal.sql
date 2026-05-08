-- Migration: Fix handle_new_user trigger after teams removal
-- Date: 2026-05-07
-- Depends on: 20260429b_drop_teams.sql
--
-- The teams-removal migration dropped team_invitations (renamed to
-- user_invitations) and team_members, but left public.handle_new_user()
-- — the trigger fired by auth.users INSERT — referencing both. Every
-- inviteUserByEmail / signup attempt has been failing in prod with
--   ERROR: relation "team_invitations" does not exist (SQLSTATE 42P01)
--   500: Database error saving new user
--
-- Fix:
--   1. Read invitations from user_invitations (the renamed table).
--   2. Drop the team_members insert (table no longer exists).
--   3. Drop team_id column references from activity_log inserts (column dropped).
--   4. Let the invited role override metadata role, matching edge-function intent.

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
BEGIN
  v_full_name := split_part(NEW.email, '@', 1);

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  IF v_role NOT IN ('owner', 'admin', 'lead', 'analyst', 'viewer') THEN
    v_role := 'analyst';
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    v_role := v_invitation.role;
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name, status, password_set, created_at, updated_at)
  VALUES (
    NEW.id, NEW.email, v_role, v_full_name, 'active',
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN false ELSE true END,
    now(), now()
  );

  IF v_invitation IS NOT NULL THEN
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
      jsonb_build_object('email', NEW.email, 'method', 'direct_signup'));
  END IF;

  RETURN NEW;
END;
$function$;
