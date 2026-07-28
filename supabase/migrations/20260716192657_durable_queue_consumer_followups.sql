-- Durable queue consumer and phase recovery follow-up.
-- This migration is additive and keeps the legacy job-row fallback intact.

ALTER TABLE public.auto_digest_jobs
  ADD COLUMN IF NOT EXISTS phase_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase_claim_token uuid;

CREATE OR REPLACE FUNCTION public.claim_auto_digest_phase(
  p_job_id uuid,
  p_phase text,
  p_lease_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'claim_auto_digest_phase is internal only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.auto_digest_jobs
     SET phase_started_at = COALESCE(phase_started_at, now()),
         phase_lease_expires_at = now() + make_interval(secs => GREATEST(60, p_lease_seconds)),
         phase_claim_token = gen_random_uuid(),
         heartbeat_at = now(),
         phase_attempt_count = phase_attempt_count + 1
   WHERE id = p_job_id
     AND status = 'processing'
     AND phase = p_phase
     AND NOT cancellation_requested
     AND (phase_lease_expires_at IS NULL OR phase_lease_expires_at < now());

  RETURN FOUND;
END;
$$;

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
  ON CONFLICT (user_id) WHERE status IN ('pending', 'processing') DO NOTHING
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    SELECT * INTO v_job
      FROM public.auto_digest_jobs
     WHERE user_id = p_user_id AND status IN ('pending', 'processing')
     ORDER BY created_at DESC
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
  UPDATE public.auto_digest_jobs
     SET queue_message_id = v_message_id
   WHERE id = v_job.id;

  RETURN QUERY SELECT v_job.id, v_job.status, true;
END;
$$;

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
       SET pending_entry_ids = jsonb_build_array(p_entry_id) ||
         COALESCE(pending_entry_ids, '[]'::jsonb),
           phase = 'digesting',
           phase_lease_expires_at = NULL,
           phase_started_at = NULL,
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

  IF EXISTS (
    SELECT 1 FROM public.auto_digest_jobs
     WHERE id = p_job_id AND (status = 'cancelled' OR cancellation_requested)
  ) THEN
    v_outcome := 'cancelled';
    v_status := 'cancelled';
  ELSIF v_active > 0 THEN
    RETURN jsonb_build_object('job_id', p_job_id, 'status', 'processing', 'outcome', NULL,
      'entries_total', v_total, 'entries_active', v_active);
  ELSIF v_total = 0 OR (v_failed = 0 AND v_quarantined = 0) THEN
    v_outcome := 'complete';
    v_status := 'completed';
  ELSIF v_success > 0 OR v_skipped > 0 THEN
    v_outcome := 'partial';
    v_status := 'partial';
  ELSE
    v_outcome := 'failed';
    v_status := 'failed';
  END IF;

  UPDATE public.auto_digest_jobs
     SET status = v_status,
         outcome = v_outcome,
         phase = NULL,
         phase_started_at = NULL,
         phase_lease_expires_at = NULL,
         completed_at = now(),
         heartbeat_at = now(),
         active_entry_id = NULL,
         pending_entry_ids = '[]'::jsonb
   WHERE id = p_job_id AND status = 'processing';

  RETURN jsonb_build_object('job_id', p_job_id, 'status', v_status, 'outcome', v_outcome,
    'entries_total', v_total, 'entries_succeeded', v_success,
    'entries_failed', v_failed, 'entries_quarantined', v_quarantined,
    'entries_skipped', v_skipped);
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.claim_auto_digest_phase(uuid, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_auto_digest_phase(uuid, text, integer) FROM PUBLIC, anon, authenticated;


-- Feed ingestion consolidation and protected TAXII metadata.
ALTER TABLE public.threat_intel_feeds
  ADD COLUMN IF NOT EXISTS taxii_api_root text,
  ADD COLUMN IF NOT EXISTS taxii_collection_id text,
  ADD COLUMN IF NOT EXISTS taxii_credential_id uuid REFERENCES public.integration_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_items_per_fetch integer NOT NULL DEFAULT 200;

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_credentials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_credentials TO service_role;
DROP POLICY IF EXISTS integration_credentials_owner_select ON public.integration_credentials;
DROP POLICY IF EXISTS integration_credentials_owner_write ON public.integration_credentials;
CREATE POLICY integration_credentials_owner_select
  ON public.integration_credentials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.integrations i
     WHERE i.id = integration_id AND i.user_id = (select auth.uid())
  ));
CREATE POLICY integration_credentials_owner_write
  ON public.integration_credentials FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.integrations i
     WHERE i.id = integration_id AND i.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.integrations i
     WHERE i.id = integration_id AND i.user_id = (select auth.uid())
  ));

-- Remove legacy credential values from the browser-readable feed config. New
-- credentials are written through the backend to integration_credentials.
UPDATE public.threat_intel_feeds
   SET taxii_config = COALESCE(taxii_config, '{}'::jsonb)
     - 'username' - 'password' - 'token' - 'api_key'
 WHERE taxii_config IS NOT NULL
   AND (taxii_config ? 'username' OR taxii_config ? 'password' OR taxii_config ? 'token' OR taxii_config ? 'api_key');

CREATE OR REPLACE FUNCTION public.ingest_threat_intel_feed_entry(
  p_user_id uuid,
  p_feed_id uuid,
  p_external_id text,
  p_title text,
  p_content text,
  p_url text,
  p_published_at timestamptz,
  p_canonical_url text,
  p_content_hash text
)
RETURNS TABLE(entry_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_existing public.threat_intel_feed_entries%ROWTYPE;
  v_key text := COALESCE(p_canonical_url, p_content_hash, p_external_id);
BEGIN
  IF p_user_id IS NULL OR p_feed_id IS NULL OR v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Feed entry requires owner, feed, and deduplication key' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('feed-entry:' || p_user_id::text || ':' || v_key));

  SELECT * INTO v_existing
    FROM public.threat_intel_feed_entries e
   WHERE e.user_id = p_user_id
     AND (
       (p_canonical_url IS NOT NULL AND e.canonical_url = p_canonical_url)
       OR (p_content_hash IS NOT NULL AND e.content_hash = p_content_hash)
       OR (p_external_id IS NOT NULL AND e.external_id = p_external_id)
     )
   ORDER BY e.fetched_at ASC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.threat_intel_feed_entries e
       SET title = COALESCE(NULLIF(e.title, ''), NULLIF(p_title, ''), e.title),
           content = COALESCE(NULLIF(e.content, ''), p_content, e.content),
           url = COALESCE(e.url, p_url),
           published_at = COALESCE(e.published_at, p_published_at),
           canonical_url = COALESCE(e.canonical_url, p_canonical_url),
           content_hash = COALESCE(e.content_hash, p_content_hash),
           source_feed_ids = ARRAY(
             SELECT DISTINCT source_id
               FROM unnest(COALESCE(e.source_feed_ids, '{}'::uuid[]) || ARRAY[p_feed_id]) AS source_id
           ),
           source_count = cardinality(ARRAY(
             SELECT DISTINCT source_id
               FROM unnest(COALESCE(e.source_feed_ids, '{}'::uuid[]) || ARRAY[p_feed_id]) AS source_id
           )),
           fetched_at = now()
     WHERE e.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, false;
    RETURN;
  END IF;

  INSERT INTO public.threat_intel_feed_entries (
    feed_id, user_id, external_id, title, content, url, published_at,
    digest_status, canonical_url, content_hash, source_feed_ids, source_count
  )
  VALUES (
    p_feed_id, p_user_id, p_external_id, COALESCE(NULLIF(p_title, ''), 'Untitled'),
    p_content, p_url, p_published_at, 'harvested', p_canonical_url,
    p_content_hash, ARRAY[p_feed_id], 1
  )
  RETURNING id INTO v_existing.id;

  RETURN QUERY SELECT v_existing.id, true;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing
    FROM public.threat_intel_feed_entries e
   WHERE e.user_id = p_user_id
     AND (
       (p_canonical_url IS NOT NULL AND e.canonical_url = p_canonical_url)
       OR (p_content_hash IS NOT NULL AND e.content_hash = p_content_hash)
       OR (p_external_id IS NOT NULL AND e.external_id = p_external_id)
     )
   LIMIT 1;
  IF v_existing.id IS NULL THEN RAISE; END IF;
  RETURN QUERY SELECT v_existing.id, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_threat_intel_feed_entry(uuid, uuid, text, text, text, text, timestamptz, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_threat_intel_feed_entry(uuid, uuid, text, text, text, text, timestamptz, text, text)
  TO service_role;
