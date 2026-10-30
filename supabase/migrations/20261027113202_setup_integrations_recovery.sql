-- Allow the Chronicle provider already supported by the integration handler.
ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_provider_check CHECK ((provider = ANY (ARRAY['splunk'::text, 'sentinel'::text, 'defender_xdr'::text, 'elastic'::text, 'crowdstrike'::text, 'chronicle'::text, 'github'::text, 'gitlab'::text, 'azure_devops'::text, 'jira'::text, 'slack'::text])));

-- Only invalidate results created by the old placeholder. Real successful tests
-- and disabled integrations are left intact.
UPDATE public.integrations
   SET status = 'configured', last_tested_at = NULL,
       last_test_result = jsonb_build_object(
         'success', false, 'code', 'TEST_NOT_SUPPORTED', 'latency_ms', 0,
         'message', 'Connection testing is not supported for ' || provider || '. Credentials have not been verified.'
       )
 WHERE status = 'connected'
   AND last_test_result->>'success' = 'true'
   AND last_test_result->>'message' = provider || ' connection test not yet implemented';

-- Keep the additive columns without replaying the obsolete watchdog migration.
ALTER TABLE public.auto_digest_jobs
  ADD COLUMN IF NOT EXISTS active_entry_id uuid REFERENCES public.threat_intel_feed_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Repair installations previously downgraded by setup. Only replace the known
-- legacy implementation, and only after the durable-queue prerequisites exist.
-- A current (or future) queue-aware watchdog must survive every setup rerun.
DO $repair$
DECLARE
  definition text := pg_get_functiondef(to_regprocedure('public.auto_digest_watchdog()'));
BEGIN
  IF definition LIKE '%pending_entry_ids%'
     AND definition NOT LIKE '%auto_digest_job_entries%'
     AND to_regclass('public.auto_digest_job_entries') IS NOT NULL
     AND to_regprocedure('public.auto_digest_enqueue(text,uuid,uuid,jsonb,integer)') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'auto_digest_jobs'
          AND column_name = 'phase_attempt_count'
     ) THEN
    EXECUTE $watchdog$
CREATE OR REPLACE FUNCTION public.auto_digest_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_job record;
  v_message_id bigint;
BEGIN
  UPDATE public.auto_digest_job_entries
     SET status = CASE WHEN attempt_count >= max_attempts THEN 'quarantined' ELSE 'pending' END,
         quarantined_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE quarantined_at END,
         last_error_code = CASE WHEN attempt_count >= max_attempts THEN 'POISON_ARTICLE' ELSE 'LEASE_EXPIRED' END,
         last_error = CASE WHEN attempt_count >= max_attempts
           THEN 'Retry limit exceeded; article quarantined'
           ELSE 'Worker lease expired; returned to queue' END,
         lease_expires_at = NULL,
         completed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
         updated_at = now()
   WHERE status = 'running' AND lease_expires_at < now();

  FOR v_job IN
    SELECT id, phase, phase_attempt_count
      FROM public.auto_digest_jobs
     WHERE status = 'processing'
       AND phase IS NOT NULL
       AND COALESCE(heartbeat_at, started_at) < now() - CASE phase
         WHEN 'harvesting' THEN interval '10 minutes'
         WHEN 'classifying' THEN interval '10 minutes'
         WHEN 'ranking' THEN interval '5 minutes'
         WHEN 'digesting' THEN interval '5 minutes'
         ELSE interval '10 minutes'
       END
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_job.phase_attempt_count >= 3 THEN
      UPDATE public.auto_digest_jobs
         SET status = 'failed', outcome = 'failed', phase = NULL,
             completed_at = now(), heartbeat_at = now(),
             phase_lease_expires_at = NULL,
             error = COALESCE(error, 'watchdog: phase retry limit exceeded')
       WHERE id = v_job.id;
    ELSE
      UPDATE public.auto_digest_jobs
         SET phase_attempt_count = phase_attempt_count + 1,
             phase_lease_expires_at = NULL,
             phase_started_at = NULL,
             heartbeat_at = now(),
             error = 'watchdog: phase lease expired; requeued'
       WHERE id = v_job.id;
      v_message_id := public.auto_digest_enqueue(
        'run_phase', v_job.id, NULL, jsonb_build_object('phase', v_job.phase)
      );
      UPDATE public.auto_digest_jobs
         SET queue_message_id = COALESCE(v_message_id, queue_message_id)
       WHERE id = v_job.id;
    END IF;
  END LOOP;
END;
$$;
$watchdog$;
  END IF;
END;
$repair$;
