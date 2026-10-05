-- Restore the pinned search_path on get_filter_options.
--
-- 20260917120000 replaced the function with CREATE OR REPLACE and no SET clause, which clears the
-- search_path that the schema's hardening step pins on every SECURITY DEFINER function. A project
-- that applied it was left with a definer function running on the caller's search_path. The
-- migration itself now carries the SET clause; this brings a project that already applied the
-- earlier text back in line. Idempotent, and changes nothing else about the function.

ALTER FUNCTION public.get_filter_options(text) SET search_path TO 'public', 'extensions';
