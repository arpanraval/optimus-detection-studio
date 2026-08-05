-- Repair queue-contract defects that prevented ranked articles from reaching
-- the digest worker. PostgREST may expose the JWT role through the claims
-- object instead of the legacy scalar setting, so support both representations.

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
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND v_jwt_role <> 'service_role' THEN
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
     SET reserved_articles = reserved_articles + v_granted,
         updated_at = now()
   WHERE user_id = p_user_id AND quota_date = v_day;
  RETURN v_granted;
END;
$$;

-- Recover rows stranded by a failed ranking phase before pending_entry_ids
-- was persisted. Never touch a user's queued rows while that user has an
-- active job.
UPDATE public.threat_intel_feed_entries e
   SET digest_status = 'classified'
 WHERE e.digest_status = 'queued'
   AND NOT EXISTS (
     SELECT 1
       FROM public.auto_digest_jobs j
      WHERE j.user_id = e.user_id
        AND j.status IN ('pending', 'processing')
   );

-- complete_auto_digest_entry receives the durable queue-row UUID. On retry,
-- translate it back to the feed-entry UUID before restoring pending_entry_ids.
CREATE OR REPLACE FUNCTION public.complete_auto_digest_entry(
  p_entry_id uuid,
  p_status text,
  p_report_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_entry public.auto_digest_job_entries%ROWTYPE;
  v_status text;
  v_retry boolean := false;
  v_message_id bigint;
BEGIN
  SELECT * INTO v_entry
    FROM public.auto_digest_job_entries
   WHERE id = p_entry_id
   FOR UPDATE;
  IF NOT FOUND OR v_entry.status NOT IN ('running', 'pending') THEN
    RETURN false;
  END IF;

  v_status := CASE
    WHEN p_status IN ('succeeded', 'skipped', 'retained_previous') THEN p_status
    WHEN p_status = 'failed' AND v_entry.attempt_count < v_entry.max_attempts THEN 'pending'
    WHEN p_status IN ('failed', 'quarantined') THEN 'quarantined'
    ELSE 'failed'
  END;
  v_retry := v_status = 'pending';

  UPDATE public.auto_digest_job_entries
     SET status = v_status,
         report_id = COALESCE(p_report_id, report_id),
         last_error_code = p_error_code,
         last_error = p_error,
         quarantined_at = CASE WHEN v_status = 'quarantined' THEN now() ELSE quarantined_at END,
         completed_at = CASE WHEN v_retry THEN NULL ELSE now() END,
         lease_expires_at = NULL,
         heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_entry_id;

  IF v_retry THEN
    UPDATE public.auto_digest_jobs
       SET pending_entry_ids = jsonb_build_array(v_entry.feed_entry_id) ||
             COALESCE(pending_entry_ids, '[]'::jsonb),
           phase = 'digesting',
           phase_lease_expires_at = NULL,
           phase_started_at = NULL,
           phase_attempt_count = 0,
           heartbeat_at = now()
     WHERE id = v_entry.job_id
       AND status = 'processing'
       AND NOT cancellation_requested;
    v_message_id := public.auto_digest_enqueue(
      'run_phase', v_entry.job_id, p_entry_id, jsonb_build_object('phase', 'digesting')
    );
    UPDATE public.auto_digest_jobs
       SET queue_message_id = COALESCE(v_message_id, queue_message_id)
     WHERE id = v_entry.job_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_auto_digest_entry(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_digest_entry(uuid, uuid, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text) TO service_role;

-- pending_entry_ids carries threat_intel_feed_entries.id values. Claim the
-- durable row through its feed_entry_id foreign key, not its own UUID.
CREATE OR REPLACE FUNCTION public.claim_auto_digest_entry(
  p_job_id uuid,
  p_entry_id uuid,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.auto_digest_job_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.auto_digest_job_entries e
     SET status = 'running',
         attempt_count = e.attempt_count + 1,
         started_at = COALESCE(e.started_at, now()),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => GREATEST(30, p_lease_seconds)),
         updated_at = now()
    FROM public.auto_digest_jobs j
   WHERE e.feed_entry_id = p_entry_id
     AND e.job_id = p_job_id
     AND j.id = e.job_id
     AND j.status = 'processing'
     AND NOT j.cancellation_requested
     AND e.status = 'pending'
     AND e.attempt_count < e.max_attempts
  RETURNING e.*;
END;
$$;
