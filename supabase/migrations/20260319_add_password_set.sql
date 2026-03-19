-- Add password_set flag to profiles
-- Default true: existing users already have passwords
-- New invited users get false from handle_new_user() trigger
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_set boolean DEFAULT true;
