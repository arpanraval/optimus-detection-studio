REVOKE ALL ON FUNCTION public.cancel_auto_digest_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_auto_digest_job(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_auto_digest_job(uuid, text) FROM anon;
