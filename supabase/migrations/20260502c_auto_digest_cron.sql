-- 20260502c_auto_digest_cron.sql
--
-- Auto-digest scheduling + stuck-job watchdog. Two cron-driven helpers:
--
-- 1. auto_digest_scheduler() — runs hourly. For each user with
--    auto_digest_settings.is_enabled=true whose schedule_hour_utc matches
--    the current UTC hour, inserts a pending auto_digest_jobs row (unless
--    one already exists in the last 23h to avoid double-fire) and calls
--    the orchestrator. Without this, schedule_hour_utc was decorative —
--    the only path that ever woke the orchestrator was a user clicking
--    Run Now.
--
-- 2. auto_digest_watchdog() — runs every 5 min. Flips stuck `processing`
--    jobs to `failed` (and resets their orphaned `pending_entry_ids`
--    entries back to `harvested` so a future run picks them up). The
--    trigger-auto-digest function had a 15-min stale-job watchdog inline,
--    but it only fired when the user clicked Run Now again — so jobs that
--    silently died sat in `processing` indefinitely until the user took
--    another action. This makes recovery automatic.
--
-- Re-uses tr_supabase_url + tr_service_role_key vault secrets created
-- for the threat-research dispatcher; both are project-level.

-- ────────────────────────────────────────────────────────────────────────
-- Stuck-job watchdog
-- ────────────────────────────────────────────────────────────────────────
-- Threshold: 20 min. Phase budget is 240s × up-to-5 phases (harvest,
-- classify, rank, digest×N, finalise). For a job with max_articles_per_day=10,
-- digest×10 alone is up to 40min. But each digest hop is its own edge
-- function invocation; only ONE hop running at a time should count as
-- "still alive". A row that's been status=processing for 20 min without
-- a heartbeat almost certainly means a self-dispatch failed or the worker
-- died silently. 20 min is a balance between false-positive recovery and
-- letting big runs complete; review if real digest latency exceeds it.
CREATE OR REPLACE FUNCTION public.auto_digest_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_threshold timestamptz := v_now - interval '20 minutes';
  v_stuck RECORD;
  v_recovered_count int;
BEGIN
  -- For each stuck job: recover its orphaned pending_entry_ids back to
  -- harvested so a future run can pick them up, then mark the job failed.
  FOR v_stuck IN
    SELECT id, user_id, pending_entry_ids
      FROM public.auto_digest_jobs
     WHERE status = 'processing'
       AND started_at < v_threshold
  LOOP
    -- Reset entries currently in 'digesting' or 'queued' that belong to
    -- this stuck job back to 'harvested'. Without the reset the entries
    -- sit forever in an intermediate state and never re-enter the queue
    -- (the harvester's recovery loop only picks up 'harvested' entries).
    v_recovered_count := 0;
    IF v_stuck.pending_entry_ids IS NOT NULL
       AND jsonb_typeof(v_stuck.pending_entry_ids) = 'array'
       AND jsonb_array_length(v_stuck.pending_entry_ids) > 0 THEN
      WITH ids AS (
        SELECT (jsonb_array_elements_text(v_stuck.pending_entry_ids))::uuid AS id
      )
      UPDATE public.threat_intel_feed_entries e
         SET digest_status = 'harvested'
        FROM ids
       WHERE e.id = ids.id
         AND e.user_id = v_stuck.user_id
         AND e.digest_status IN ('digesting', 'queued');
      GET DIAGNOSTICS v_recovered_count = ROW_COUNT;
    END IF;

    UPDATE public.auto_digest_jobs
       SET status       = 'failed',
           completed_at = v_now,
           error        = format(
             'watchdog: stuck in processing for %s min; recovered %s orphaned entries',
             EXTRACT(EPOCH FROM (v_now - started_at))::int / 60,
             v_recovered_count
           )
     WHERE id = v_stuck.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_digest_watchdog() IS
  'Reaps auto_digest_jobs stuck in processing for >20 min and recovers their orphaned pending_entry_ids back to harvested status.';

-- ────────────────────────────────────────────────────────────────────────
-- Scheduler — inserts pending jobs at the user's chosen UTC hour
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_digest_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url      text;
  v_key      text;
  v_now      timestamptz := now();
  v_hour     int := EXTRACT(HOUR FROM v_now AT TIME ZONE 'UTC')::int;
  v_user     RECORD;
  v_inserted int := 0;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'tr_supabase_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'auto_digest_scheduler: missing vault secrets tr_supabase_url or tr_service_role_key — skipping';
    RETURN;
  END IF;

  -- For every enabled user whose schedule matches the current UTC hour,
  -- insert a pending job IF there isn't already a recent pending/processing
  -- one for them. The 23h dedup window covers the case where this cron
  -- and the user's manual Run Now race within the same scheduling slot.
  FOR v_user IN
    SELECT s.user_id
      FROM public.auto_digest_settings s
     WHERE s.is_enabled = true
       AND s.schedule_hour_utc = v_hour
       AND NOT EXISTS (
         SELECT 1 FROM public.auto_digest_jobs j
          WHERE j.user_id = s.user_id
            AND j.status IN ('pending', 'processing')
            AND j.created_at > v_now - interval '23 hours'
       )
  LOOP
    INSERT INTO public.auto_digest_jobs (user_id, status)
    VALUES (v_user.user_id, 'pending');
    v_inserted := v_inserted + 1;
  END LOOP;

  -- One HTTP wake-up to the orchestrator covers all freshly-inserted jobs;
  -- the orchestrator's claim-and-dispatch loop processes up to 10 pendings
  -- per invocation. Skip the call when nothing was inserted to avoid
  -- pointless POSTs.
  IF v_inserted > 0 THEN
    SELECT net.http_post(
      url := v_url || '/functions/v1/auto-digest-orchestrator',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_key
                 ),
      body := '{}'::jsonb
    ) INTO v_request_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.auto_digest_scheduler() IS
  'Hourly scheduler: inserts pending auto_digest_jobs for users whose schedule_hour_utc matches the current UTC hour, then wakes the orchestrator.';

-- ────────────────────────────────────────────────────────────────────────
-- Cron registration
-- ────────────────────────────────────────────────────────────────────────
-- Watchdog: every 5 minutes
SELECT cron.unschedule('auto-digest-watchdog')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-digest-watchdog');

SELECT cron.schedule(
  'auto-digest-watchdog',
  '*/5 * * * *',
  $$SELECT public.auto_digest_watchdog()$$
);

-- Scheduler: every hour, on the hour
SELECT cron.unschedule('auto-digest-scheduler')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-digest-scheduler');

SELECT cron.schedule(
  'auto-digest-scheduler',
  '0 * * * *',
  $$SELECT public.auto_digest_scheduler()$$
);
