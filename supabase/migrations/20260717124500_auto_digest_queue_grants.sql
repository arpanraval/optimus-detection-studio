-- Keep queue-owned records and job creation behind authenticated/service roles.
REVOKE ALL ON TABLE public.auto_digest_job_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.auto_digest_job_entries TO authenticated;
GRANT ALL ON TABLE public.auto_digest_job_entries TO service_role;

REVOKE ALL ON FUNCTION public.request_auto_digest_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_auto_digest_job(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) TO authenticated, service_role;
