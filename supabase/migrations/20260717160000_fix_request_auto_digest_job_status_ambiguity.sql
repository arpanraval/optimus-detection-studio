-- Fix manual/scheduled job creation when the RETURNS TABLE \`status\` output
-- parameter collides with auto_digest_jobs.status in PL/pgSQL.
-- This is additive and preserves the existing RPC signature and behavior.

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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND current_user NOT IN ('postgres', 'supabase_admin')
     AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Cannot create a digest job for another user' USING ERRCODE = '42501';
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

