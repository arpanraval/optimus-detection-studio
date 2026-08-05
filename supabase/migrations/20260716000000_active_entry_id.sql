-- Track the currently digesting article and the last live phase heartbeat.
ALTER TABLE public.auto_digest_jobs 
  ADD COLUMN IF NOT EXISTS active_entry_id uuid REFERENCES public.threat_intel_feed_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Update watchdog to recover stuck active entry to digest_failed and others to classified
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
  v_row_count int;
BEGIN
  FOR v_stuck IN
    SELECT id, user_id, pending_entry_ids, active_entry_id, heartbeat_at, started_at
      FROM public.auto_digest_jobs
     WHERE status = 'processing'
       AND COALESCE(heartbeat_at, started_at) < v_threshold
  LOOP
    v_recovered_count := 0;

    -- 1. Recover the currently active entry to digest_failed if present
    IF v_stuck.active_entry_id IS NOT NULL THEN
      UPDATE public.threat_intel_feed_entries
         SET digest_status = 'digest_failed',
             extract_error = 'watchdog: job hung/terminated during processing'
       WHERE id = v_stuck.active_entry_id
         AND digest_status IN ('queued', 'digesting');
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_recovered_count := v_recovered_count + v_row_count;
    END IF;

    -- 2. Recover pending entries back to classified
    IF v_stuck.pending_entry_ids IS NOT NULL
       AND jsonb_typeof(v_stuck.pending_entry_ids) = 'array'
       AND jsonb_array_length(v_stuck.pending_entry_ids) > 0 THEN
      WITH ids AS (
        SELECT (jsonb_array_elements_text(v_stuck.pending_entry_ids))::uuid AS id
      )
      UPDATE public.threat_intel_feed_entries e
         SET digest_status = 'classified'
        FROM ids
       WHERE e.id = ids.id
         AND e.user_id = v_stuck.user_id
         AND e.digest_status IN ('digesting', 'queued')
         AND e.classification IS NOT NULL;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_recovered_count := v_recovered_count + v_row_count;
    END IF;

    -- 3. Belt-and-suspenders: any entry stuck in 'digesting'/'queued' gets recovered to classified
    UPDATE public.threat_intel_feed_entries e
       SET digest_status = 'classified'
     WHERE e.user_id = v_stuck.user_id
       AND e.digest_status IN ('digesting', 'queued')
       AND e.classification IS NOT NULL
       AND e.fetched_at < v_threshold
       AND (v_stuck.active_entry_id IS NULL OR e.id <> v_stuck.active_entry_id);
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_recovered_count := v_recovered_count + v_row_count;

    UPDATE public.auto_digest_jobs
       SET status       = 'failed',
           phase        = NULL,
           active_entry_id = NULL,
           pending_entry_ids = '[]'::jsonb,
           heartbeat_at = v_now,
           completed_at = v_now,
           error        = format(
             'watchdog: stuck in processing for %s min; recovered %s orphaned entries',
             EXTRACT(EPOCH FROM (v_now - v_stuck.started_at))::int / 60,
             v_recovered_count
           )
     WHERE id = v_stuck.id
       AND status = 'processing';
  END LOOP;
END;
$$;
