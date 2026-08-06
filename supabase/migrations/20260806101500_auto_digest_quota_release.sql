-- Auto-digest daily quota: make reservations refundable, and start recording
-- completions.
--
-- reserve_auto_digest_article_quota was the ONLY function that ever touched
-- auto_digest_daily_quota.reserved_articles, and it only ever incremented. A
-- run that reserved N articles and then failed burned N against the day's cap
-- permanently -- the 2026-08-06 failure reserved 2 and never gave them back.
-- Enough retries in one day would lock the user out until UTC midnight.
--
-- completed_articles was never written by anything: it read 0 on every row,
-- including days where articles were digested successfully.
--
-- The cap is named max_articles_per_day and is documented as a limit on how
-- many reports get produced, so it counts SUCCESSFUL digests. An article that
-- ends skipped, quarantined, failed, or retained gives its reservation back.

-- Unrelated to quota, but a live trap in the same table: the phase column's
-- DEFAULT is 'digesting', which is absent from its own CHECK constraint
-- (harvest|classify|rank|digest|story_link|finalize). Any INSERT that omits
-- phase therefore fails outright. Every row production has ever written sets
-- 'digest' explicitly, so aligning the default changes no existing behaviour
-- and removes the trap for the next writer.
ALTER TABLE public.auto_digest_job_entries ALTER COLUMN phase SET DEFAULT 'digest';

CREATE OR REPLACE FUNCTION public.release_auto_digest_article_quota(
  p_user_id uuid,
  p_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_count integer := greatest(0, least(coalesce(p_count, 0), 100));
  v_reserved integer;
  v_released integer;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Same lock key as reserve, so a release cannot interleave with a
  -- concurrent reservation for the same user and day.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_day::text, 0));

  SELECT reserved_articles INTO v_reserved
    FROM public.auto_digest_daily_quota
   WHERE user_id = p_user_id AND quota_date = v_day
   FOR UPDATE;

  IF v_reserved IS NULL THEN
    RETURN 0;
  END IF;

  -- Floor at zero. A double-release must never manufacture capacity.
  v_released := least(v_count, v_reserved);
  UPDATE public.auto_digest_daily_quota
     SET reserved_articles = reserved_articles - v_released, updated_at = now()
   WHERE user_id = p_user_id AND quota_date = v_day;

  RETURN v_released;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_auto_digest_article_quota(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auto_digest_article_quota(uuid, integer)
  TO service_role;

-- complete_auto_digest_entry now settles the quota alongside the entry, so the
-- two can never drift: a success counts, anything else terminal refunds. The
-- decrement is inlined rather than calling the RPC above because this function
-- also runs from the watchdog as `postgres`, where the RPC's service_role JWT
-- check would not hold.
CREATE OR REPLACE FUNCTION public.complete_auto_digest_entry(
  p_entry_id uuid,
  p_status text,
  p_report_id text DEFAULT NULL::text,
  p_error_code text DEFAULT NULL::text,
  p_error text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_entry public.auto_digest_job_entries%ROWTYPE;
  v_status text;
  v_retry boolean := false;
  v_message_id bigint;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
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

  -- Quota settlement. Skipped while v_retry, because the article still holds
  -- its reservation for the retry that complete_auto_digest_entry enqueues
  -- below; the eventual terminal outcome settles it.
  IF NOT v_retry THEN
    IF v_status = 'succeeded' THEN
      UPDATE public.auto_digest_daily_quota
         SET completed_articles = completed_articles + 1, updated_at = now()
       WHERE user_id = v_entry.user_id AND quota_date = v_day;
    ELSE
      UPDATE public.auto_digest_daily_quota
         SET reserved_articles = greatest(0, reserved_articles - 1), updated_at = now()
       WHERE user_id = v_entry.user_id AND quota_date = v_day;
    END IF;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.release_auto_digest_article_quota(uuid, integer) IS
  'Returns unused daily article reservations. Floors at zero so a double-release cannot manufacture capacity.';
