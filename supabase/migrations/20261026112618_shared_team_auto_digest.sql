-- This installation has one shared intelligence pipeline. Keep the existing
-- processing identity so feeds, reports, quotas and run history retain their IDs.
CREATE TABLE public.auto_digest_team (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.auto_digest_team ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auto_digest_team FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.auto_digest_team TO authenticated;
GRANT ALL ON public.auto_digest_team TO service_role;
CREATE POLICY auto_digest_team_read ON public.auto_digest_team
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auto_digest_team_initialize ON public.auto_digest_team
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.is_global_admin()));

INSERT INTO public.auto_digest_team (user_id)
SELECT s.user_id FROM public.auto_digest_settings s
ORDER BY (SELECT count(*) FROM public.auto_digest_jobs j WHERE j.user_id = s.user_id) DESC,
  s.is_enabled DESC, s.created_at, s.user_id
LIMIT 1;

DROP POLICY IF EXISTS auto_digest_settings_own ON public.auto_digest_settings;
CREATE POLICY auto_digest_settings_team_read ON public.auto_digest_settings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT user_id FROM public.auto_digest_team));
CREATE POLICY auto_digest_settings_team_insert ON public.auto_digest_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_global_admin()) AND user_id = (SELECT user_id FROM public.auto_digest_team));
CREATE POLICY auto_digest_settings_team_update ON public.auto_digest_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_global_admin()) AND user_id = (SELECT user_id FROM public.auto_digest_team))
  WITH CHECK ((SELECT public.is_global_admin()) AND user_id = (SELECT user_id FROM public.auto_digest_team));

-- Personal, non-pipeline feeds keep their existing ownership model.
DROP POLICY IF EXISTS threat_intel_feeds_own ON public.threat_intel_feeds;
CREATE POLICY threat_intel_feeds_own ON public.threat_intel_feeds
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id AND NOT is_auto_digest)
  WITH CHECK ((SELECT auth.uid()) = user_id AND NOT is_auto_digest);
CREATE POLICY threat_intel_feeds_team_read ON public.threat_intel_feeds
  FOR SELECT TO authenticated
  USING (is_auto_digest AND user_id = (SELECT user_id FROM public.auto_digest_team));
CREATE POLICY threat_intel_feeds_team_manage ON public.threat_intel_feeds
  FOR ALL TO authenticated
  USING ((SELECT public.is_global_admin()) AND is_auto_digest AND user_id = (SELECT user_id FROM public.auto_digest_team))
  WITH CHECK ((SELECT public.is_global_admin()) AND is_auto_digest AND user_id = (SELECT user_id FROM public.auto_digest_team));

CREATE POLICY auto_digest_jobs_team_read ON public.auto_digest_jobs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT user_id FROM public.auto_digest_team));
CREATE POLICY auto_digest_run_events_team_read ON public.auto_digest_run_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT user_id FROM public.auto_digest_team));
CREATE POLICY auto_digest_job_entries_team_read ON public.auto_digest_job_entries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT user_id FROM public.auto_digest_team));
GRANT SELECT ON public.auto_digest_settings, public.threat_intel_feeds,
  public.auto_digest_jobs, public.auto_digest_run_events, public.auto_digest_job_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.request_auto_digest_job(
  p_user_id uuid DEFAULT auth.uid(),
  p_reason text DEFAULT 'manual'
)
RETURNS TABLE(job_id uuid, status text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_job public.auto_digest_jobs%ROWTYPE;
  v_message_id bigint;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF v_jwt_role <> 'service_role'
     AND NOT (session_user IN ('postgres', 'supabase_admin') AND auth.uid() IS NULL AND v_jwt_role = '') THEN
    IF auth.uid() IS NULL OR NOT public.is_global_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can run the team digest' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM (SELECT user_id FROM public.auto_digest_team) THEN
    RAISE EXCEPTION 'Use the shared team digest configuration' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.auto_digest_jobs (user_id, status, outcome, result_summary)
  VALUES (p_user_id, 'pending', NULL, jsonb_build_object('reason', COALESCE(p_reason, 'manual')))
  ON CONFLICT (user_id) WHERE auto_digest_jobs.status IN ('pending', 'processing') DO NOTHING
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    SELECT j.* INTO v_job
      FROM public.auto_digest_jobs AS j
     WHERE j.user_id = p_user_id AND j.status IN ('pending', 'processing')
     ORDER BY j.created_at DESC
     LIMIT 1;
    RETURN QUERY SELECT v_job.id, v_job.status, false;
    RETURN;
  END IF;

  v_message_id := public.auto_digest_enqueue(
    'run_job',
    v_job.id,
    NULL,
    jsonb_build_object('reason', COALESCE(p_reason, 'manual'))
  );
  UPDATE public.auto_digest_jobs AS j
     SET queue_message_id = v_message_id
   WHERE j.id = v_job.id;

  RETURN QUERY SELECT v_job.id, v_job.status, true;
END;
$$;


CREATE OR REPLACE FUNCTION public.cancel_auto_digest_job(p_job_id uuid, p_reason text DEFAULT 'Cancelled by user')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_uid uuid := auth.uid(); v_job public.auto_digest_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_global_admin(v_uid) THEN RAISE EXCEPTION 'Only admins can cancel the team digest' USING ERRCODE = '42501'; END IF;
  UPDATE public.auto_digest_jobs SET status = 'cancelled', outcome = 'cancelled', phase = NULL,
    cancellation_requested = true, cancellation_requested_at = now(), cancelled_by = v_uid,
    completed_at = COALESCE(completed_at, now()), error = COALESCE(p_reason, 'Cancelled by user'),
    active_entry_id = NULL, pending_entry_ids = '[]'::jsonb
   WHERE id = p_job_id AND user_id = (SELECT user_id FROM public.auto_digest_team) AND status IN ('pending','processing') RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_ACTIVE'); END IF;
  UPDATE public.auto_digest_job_entries SET status = 'skipped', last_error_code = 'CANCELLED',
    last_error = COALESCE(p_reason, 'Cancelled by user'), completed_at = now(), updated_at = now()
   WHERE job_id = p_job_id AND status IN ('pending','running');
  RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'job_id', p_job_id);
END; $$;
CREATE OR REPLACE FUNCTION public.auto_digest_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE v_hour integer := extract(hour from now() at time zone 'UTC')::integer; v_user record;
BEGIN
  FOR v_user IN
    SELECT user_id FROM public.auto_digest_settings
     WHERE is_enabled = true AND schedule_hour_utc = v_hour
       AND user_id = (SELECT user_id FROM public.auto_digest_team)
  LOOP
    PERFORM public.request_auto_digest_job(v_user.user_id, 'scheduled');
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.request_auto_digest_job(uuid, text), public.cancel_auto_digest_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_auto_digest_job(uuid, text), public.cancel_auto_digest_job(uuid, text) TO authenticated, service_role;

