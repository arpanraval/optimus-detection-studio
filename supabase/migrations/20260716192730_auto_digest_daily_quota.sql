-- Shared daily article reservations for scheduled and manual digest runs.
CREATE TABLE IF NOT EXISTS public.auto_digest_daily_quota (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date date NOT NULL,
  reserved_articles integer NOT NULL DEFAULT 0 CHECK (reserved_articles >= 0),
  completed_articles integer NOT NULL DEFAULT 0 CHECK (completed_articles >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quota_date)
);

ALTER TABLE public.auto_digest_daily_quota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auto_digest_daily_quota_select_own ON public.auto_digest_daily_quota;
CREATE POLICY auto_digest_daily_quota_select_own ON public.auto_digest_daily_quota
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS auto_digest_daily_quota_service_all ON public.auto_digest_daily_quota;
CREATE POLICY auto_digest_daily_quota_service_all ON public.auto_digest_daily_quota
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.auto_digest_daily_quota FROM anon, authenticated;
GRANT SELECT ON public.auto_digest_daily_quota TO authenticated;
GRANT ALL ON public.auto_digest_daily_quota TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_auto_digest_article_quota(
  p_user_id uuid,
  p_requested integer,
  p_daily_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_limit integer := greatest(0, least(coalesce(p_daily_limit, 0), 100));
  v_requested integer := greatest(0, least(coalesce(p_requested, 0), 100));
  v_reserved integer;
  v_granted integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_day::text, 0));
  INSERT INTO public.auto_digest_daily_quota (user_id, quota_date)
  VALUES (p_user_id, v_day)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT reserved_articles INTO v_reserved
    FROM public.auto_digest_daily_quota
   WHERE user_id = p_user_id AND quota_date = v_day
   FOR UPDATE;

  v_granted := least(v_requested, greatest(0, v_limit - coalesce(v_reserved, 0)));
  UPDATE public.auto_digest_daily_quota
     SET reserved_articles = reserved_articles + v_granted, updated_at = now()
   WHERE user_id = p_user_id AND quota_date = v_day;
  RETURN v_granted;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) TO authenticated, service_role;
