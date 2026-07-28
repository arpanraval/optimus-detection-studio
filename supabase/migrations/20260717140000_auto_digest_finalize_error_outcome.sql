-- A legacy-compatible run may have no queue-entry rows while still recording
-- article-level errors in result_summary. Those runs must not be reported as
-- complete merely because v_total is zero.
CREATE OR REPLACE FUNCTION public.finalize_auto_digest_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_total integer;
  v_success integer;
  v_failed integer;
  v_quarantined integer;
  v_skipped integer;
  v_active integer;
  v_has_errors boolean;
  v_outcome text;
  v_status text;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'succeeded')::integer,
         count(*) FILTER (WHERE status = 'failed')::integer,
         count(*) FILTER (WHERE status = 'quarantined')::integer,
         count(*) FILTER (WHERE status IN ('skipped', 'retained_previous'))::integer,
         count(*) FILTER (WHERE status IN ('pending', 'running'))::integer
    INTO v_total, v_success, v_failed, v_quarantined, v_skipped, v_active
    FROM public.auto_digest_job_entries
   WHERE job_id = p_job_id;

  SELECT jsonb_array_length(COALESCE(result_summary->'errors', '[]'::jsonb)) > 0
    INTO v_has_errors
    FROM public.auto_digest_jobs
   WHERE id = p_job_id;

  IF EXISTS (SELECT 1 FROM public.auto_digest_jobs WHERE id = p_job_id AND (status = 'cancelled' OR cancellation_requested)) THEN
    v_outcome := 'cancelled'; v_status := 'cancelled';
  ELSIF v_active > 0 THEN
    RETURN jsonb_build_object('job_id', p_job_id, 'status', 'processing', 'outcome', NULL, 'entries_active', v_active);
  ELSIF (v_total = 0 AND NOT COALESCE(v_has_errors, false))
     OR (v_failed = 0 AND v_quarantined = 0 AND NOT COALESCE(v_has_errors, false)) THEN
    v_outcome := 'complete'; v_status := 'completed';
  ELSIF v_success > 0 OR v_skipped > 0 OR COALESCE(v_has_errors, false) THEN
    v_outcome := 'partial'; v_status := 'partial';
  ELSE
    v_outcome := 'failed'; v_status := 'failed';
  END IF;

  UPDATE public.auto_digest_jobs
     SET status = v_status, outcome = v_outcome, phase = NULL,
         phase_started_at = NULL, phase_lease_expires_at = NULL,
         completed_at = now(), heartbeat_at = now(), active_entry_id = NULL,
         pending_entry_ids = '[]'::jsonb
   WHERE id = p_job_id AND status = 'processing';
  RETURN jsonb_build_object('job_id', p_job_id, 'status', v_status, 'outcome', v_outcome,
