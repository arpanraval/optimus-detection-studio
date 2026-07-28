-- Durable auto-digest queue and outcome model.
-- Additive migration: legacy report IDs, job statuses, and compatibility
-- fields remain available during the queue-backed rollout.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgmq;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgmq unavailable; queue RPCs fall back to durable job rows: %', SQLERRM;
END;
$$;

ALTER TABLE public.auto_digest_jobs
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_message_id bigint;

ALTER TABLE public.auto_digest_jobs DROP CONSTRAINT IF EXISTS auto_digest_jobs_status_check;
ALTER TABLE public.auto_digest_jobs
  ADD CONSTRAINT auto_digest_jobs_status_check CHECK (
    status = ANY (ARRAY['pending','processing','completed','partial','failed','timeout_partial','cancelled']::text[])
  );
ALTER TABLE public.auto_digest_jobs
  ADD CONSTRAINT auto_digest_jobs_outcome_check CHECK (
    outcome IS NULL OR outcome = ANY (ARRAY['complete','partial','failed','cancelled']::text[])
  );
UPDATE public.auto_digest_jobs
   SET outcome = CASE
     WHEN status = 'completed' THEN 'complete'
     WHEN status IN ('timeout_partial','partial') THEN 'partial'
     WHEN status = 'cancelled' THEN 'cancelled'
     WHEN status = 'failed' THEN 'failed'
     ELSE NULL END
 WHERE outcome IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.auto_digest_jobs
   WHERE status IN ('pending','processing')
)
UPDATE public.auto_digest_jobs j
   SET status = 'failed', outcome = 'failed', completed_at = COALESCE(j.completed_at, now()),
       error = COALESCE(j.error, 'Superseded by a newer active auto-digest job during queue migration')
  FROM ranked r WHERE j.id = r.id AND r.rn > 1;

ALTER TABLE public.auto_digest_jobs
  ADD CONSTRAINT auto_digest_jobs_id_user_id_key UNIQUE (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auto_digest_jobs_one_active_per_user
  ON public.auto_digest_jobs (user_id) WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS auto_digest_jobs_queue_message_idx
  ON public.auto_digest_jobs (queue_message_id) WHERE queue_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.auto_digest_job_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_entry_id uuid NOT NULL REFERENCES public.threat_intel_feed_entries(id) ON DELETE CASCADE,
  report_id text REFERENCES public.threat_intel_reports(id) ON DELETE SET NULL,
  phase text NOT NULL DEFAULT 'digesting'
    CHECK (phase IN ('harvest','classify','rank','digest','story_link','finalize')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed','skipped','quarantined','retained_previous')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error text,
  quarantined_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auto_digest_job_entries_job_owner_fkey FOREIGN KEY (job_id, user_id)
    REFERENCES public.auto_digest_jobs(id, user_id) ON DELETE CASCADE,
  CONSTRAINT auto_digest_job_entries_job_entry_key UNIQUE (job_id, feed_entry_id)
);
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_claim_idx
  ON public.auto_digest_job_entries (status, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_user_idx
  ON public.auto_digest_job_entries (user_id, created_at DESC);
ALTER TABLE public.auto_digest_job_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS source_feed_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_modified timestamptz;
CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_user_canonical_idx
  ON public.threat_intel_feed_entries (user_id, canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_content_hash_idx
  ON public.threat_intel_feed_entries (user_id, content_hash) WHERE content_hash IS NOT NULL;

ALTER TABLE public.threat_intel_feeds
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS last_modified text,
  ADD COLUMN IF NOT EXISTS fetch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_http_status integer,
  ADD COLUMN IF NOT EXISTS last_discovered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS taxii_credential_id uuid;

ALTER TABLE public.threat_intel_reports
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS section_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS library_overlap_percent integer,
  ADD COLUMN IF NOT EXISTS validated_overlap_percent integer,
  ADD COLUMN IF NOT EXISTS deployment_readiness_percent integer,
  ADD COLUMN IF NOT EXISTS overlap_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS fetched_url text,
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS pipeline_version text,
  ADD COLUMN IF NOT EXISTS attack_version text,
  ADD COLUMN IF NOT EXISTS extraction_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_completed_at timestamptz;
ALTER TABLE public.threat_intel_reports DROP CONSTRAINT IF EXISTS threat_intel_reports_outcome_check;
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_outcome_check
  CHECK (outcome = ANY (ARRAY['complete','partial','failed','cancelled']::text[]));
UPDATE public.threat_intel_reports
   SET library_overlap_percent = coverage_percent, validated_overlap_percent = coverage_percent
 WHERE library_overlap_percent IS NULL;

-- Private pgmq wrappers. The queue tables stay outside the Data API.
CREATE OR REPLACE FUNCTION public.auto_digest_enqueue(
  p_kind text, p_job_id uuid, p_entry_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb, p_delay_seconds integer DEFAULT 0
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_message_id bigint; v_payload jsonb;
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role','postgres')
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_enqueue is internal only' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object('kind', p_kind, 'job_id', p_job_id, 'entry_id', p_entry_id,
    'payload', COALESCE(p_payload, '{}'::jsonb), 'enqueued_at', now());
  IF to_regnamespace('pgmq') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT pgmq.send($1, $2, $3)' INTO v_message_id
    USING 'auto-digest-work', v_payload, GREATEST(0, COALESCE(p_delay_seconds, 0));
  RETURN v_message_id;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_digest_read_queue(
  p_visibility_seconds integer DEFAULT 600, p_quantity integer DEFAULT 10
)
RETURNS TABLE(msg_id bigint, read_ct bigint, enqueued_at timestamptz, vt timestamptz, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role','postgres')
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_read_queue is internal only' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('pgmq') IS NULL THEN RETURN; END IF;
  RETURN QUERY EXECUTE 'SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.read($1, $2, $3)'
    USING 'auto-digest-work', GREATEST(30, p_visibility_seconds), LEAST(50, GREATEST(1, p_quantity));
END; $$;

CREATE OR REPLACE FUNCTION public.auto_digest_archive_queue_message(p_message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_archived boolean;
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role','postgres')
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_archive_queue_message is internal only' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('pgmq') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT pgmq.archive($1, $2)' INTO v_archived USING 'auto-digest-work', p_message_id;
  RETURN COALESCE(v_archived, false);
END; $$;

-- Atomic job creation, cancellation, and article leases.
CREATE OR REPLACE FUNCTION public.request_auto_digest_job(
  p_user_id uuid DEFAULT auth.uid(), p_reason text DEFAULT 'manual'
)
RETURNS TABLE(job_id uuid, status text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_job public.auto_digest_jobs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Cannot create a digest job for another user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.auto_digest_jobs (user_id, status, outcome, result_summary)
  VALUES (p_user_id, 'pending', NULL, jsonb_build_object('reason', COALESCE(p_reason, 'manual')))
  ON CONFLICT (user_id) WHERE status IN ('pending','processing') DO NOTHING
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    SELECT * INTO v_job FROM public.auto_digest_jobs
     WHERE user_id = p_user_id AND status IN ('pending','processing')
     ORDER BY created_at DESC LIMIT 1;
    RETURN QUERY SELECT v_job.id, v_job.status, false; RETURN;
  END IF;
  PERFORM public.auto_digest_enqueue('run_job', v_job.id, NULL, jsonb_build_object('reason', p_reason));
  RETURN QUERY SELECT v_job.id, v_job.status, true;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_auto_digest_job(p_job_id uuid, p_reason text DEFAULT 'Cancelled by user')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_uid uuid := auth.uid(); v_job public.auto_digest_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  UPDATE public.auto_digest_jobs SET status = 'cancelled', outcome = 'cancelled', phase = NULL,
    cancellation_requested = true, cancellation_requested_at = now(), cancelled_by = v_uid,
    completed_at = COALESCE(completed_at, now()), error = COALESCE(p_reason, 'Cancelled by user'),
    heartbeat_at = now(), active_entry_id = NULL, pending_entry_ids = '[]'::jsonb
   WHERE id = p_job_id AND user_id = v_uid AND status IN ('pending','processing') RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_NOT_ACTIVE'); END IF;
  UPDATE public.auto_digest_job_entries SET status = 'skipped', last_error_code = 'CANCELLED',
    last_error = COALESCE(p_reason, 'Cancelled by user'), completed_at = now(), updated_at = now()
   WHERE job_id = p_job_id AND status IN ('pending','running');
  RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'job_id', p_job_id);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_auto_digest_entry(p_job_id uuid, p_entry_id uuid, p_lease_seconds integer DEFAULT 300)
RETURNS SETOF public.auto_digest_job_entries LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
BEGIN
  RETURN QUERY UPDATE public.auto_digest_job_entries e SET status = 'running', attempt_count = e.attempt_count + 1,
    started_at = COALESCE(e.started_at, now()), heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => GREATEST(30, p_lease_seconds)), updated_at = now()
   FROM public.auto_digest_jobs j
   WHERE e.id = p_entry_id AND e.job_id = p_job_id AND j.id = e.job_id AND j.status = 'processing'
     AND NOT j.cancellation_requested AND e.status = 'pending' AND e.attempt_count < e.max_attempts
   RETURNING e.*;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_auto_digest_entry(
  p_entry_id uuid, p_status text, p_report_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL, p_error text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_status text := CASE WHEN p_status IN ('succeeded','failed','skipped','quarantined','retained_previous') THEN p_status ELSE 'failed' END;
BEGIN
  UPDATE public.auto_digest_job_entries SET status = v_status, report_id = COALESCE(p_report_id, report_id),
    last_error_code = p_error_code, last_error = p_error,
    quarantined_at = CASE WHEN v_status = 'quarantined' THEN now() ELSE quarantined_at END,
    completed_at = now(), lease_expires_at = NULL, heartbeat_at = now(), updated_at = now()
   WHERE id = p_entry_id AND status IN ('running','pending');
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_auto_digest_job(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_total int; v_success int; v_failed int; v_quarantined int; v_skipped int; v_outcome text; v_status text;
BEGIN
  SELECT count(*)::int, count(*) FILTER (WHERE status = 'succeeded')::int,
    count(*) FILTER (WHERE status = 'failed')::int, count(*) FILTER (WHERE status = 'quarantined')::int,
    count(*) FILTER (WHERE status IN ('skipped','retained_previous'))::int
    INTO v_total, v_success, v_failed, v_quarantined, v_skipped
    FROM public.auto_digest_job_entries WHERE job_id = p_job_id;
  IF EXISTS (SELECT 1 FROM public.auto_digest_jobs WHERE id = p_job_id AND (status = 'cancelled' OR cancellation_requested)) THEN
    v_outcome := 'cancelled'; v_status := 'cancelled';
  ELSIF v_total = 0 OR (v_failed = 0 AND v_quarantined = 0) THEN
    v_outcome := 'complete'; v_status := 'completed';
  ELSIF v_success > 0 THEN v_outcome := 'partial'; v_status := 'partial';
  ELSE v_outcome := 'failed'; v_status := 'failed'; END IF;
  UPDATE public.auto_digest_jobs SET status = v_status, outcome = v_outcome, phase = NULL,
    completed_at = now(), heartbeat_at = now(), active_entry_id = NULL, pending_entry_ids = '[]'::jsonb
   WHERE id = p_job_id AND status = 'processing';
  RETURN jsonb_build_object('job_id', p_job_id, 'status', v_status, 'outcome', v_outcome,
    'entries_total', v_total, 'entries_succeeded', v_success, 'entries_failed', v_failed,
    'entries_quarantined', v_quarantined, 'entries_skipped', v_skipped);
END; $$;

-- Phase-aware recovery: leases are authoritative for article workers; the job
-- heartbeat remains the coarse safety net for a crashed phase dispatcher.
CREATE OR REPLACE FUNCTION public.auto_digest_watchdog()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
BEGIN
  UPDATE public.auto_digest_job_entries SET status = CASE WHEN attempt_count >= max_attempts THEN 'quarantined' ELSE 'pending' END,
    quarantined_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE quarantined_at END,
    last_error_code = CASE WHEN attempt_count >= max_attempts THEN 'POISON_ARTICLE' ELSE 'LEASE_EXPIRED' END,
    last_error = CASE WHEN attempt_count >= max_attempts THEN 'Retry limit exceeded; article quarantined' ELSE 'Worker lease expired; returned to queue' END,
    lease_expires_at = NULL, updated_at = now()
   WHERE status = 'running' AND lease_expires_at < now();
  UPDATE public.auto_digest_jobs j SET status = 'failed', outcome = 'failed', phase = NULL,
    completed_at = now(), heartbeat_at = now(), active_entry_id = NULL, pending_entry_ids = '[]'::jsonb,
    error = COALESCE(j.error, 'watchdog: phase heartbeat expired')
   WHERE j.status = 'processing' AND COALESCE(j.heartbeat_at, j.started_at) < now() - CASE j.phase
     WHEN 'harvesting' THEN interval '10 minutes' WHEN 'classifying' THEN interval '10 minutes'
     WHEN 'ranking' THEN interval '5 minutes' WHEN 'digesting' THEN interval '15 minutes'
     ELSE interval '10 minutes' END;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_digest_scheduler()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_hour integer := extract(hour from now() at time zone 'UTC')::integer; v_user record;
BEGIN
  FOR v_user IN SELECT user_id FROM public.auto_digest_settings WHERE is_enabled = true AND schedule_hour_utc = v_hour LOOP
    PERFORM public.request_auto_digest_job(v_user.user_id, 'scheduled');
  END LOOP;
END; $$;

-- Linked-database lint repairs.
CREATE OR REPLACE FUNCTION public.cleanup_user_data(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE owner_user_id uuid;
BEGIN
  SELECT id INTO owner_user_id FROM public.profiles WHERE role = 'owner' AND id <> target_user_id LIMIT 1;
  IF owner_user_id IS NULL THEN SELECT id INTO owner_user_id FROM public.profiles WHERE id <> target_user_id LIMIT 1; END IF;
  DELETE FROM public.activity_log WHERE user_id = target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = target_user_id;
  DELETE FROM public.detection_comments WHERE user_id = target_user_id;
  DELETE FROM public.detection_reviews WHERE reviewer_id = target_user_id OR requested_by = target_user_id;
  UPDATE public.detections SET assigned_to = NULL WHERE assigned_to = target_user_id;
  IF owner_user_id IS NOT NULL THEN UPDATE public.detections SET user_id = owner_user_id WHERE user_id = target_user_id;
  ELSE DELETE FROM public.detections WHERE user_id = target_user_id; END IF;
  DELETE FROM public.profiles WHERE id = target_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_team_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_current_user uuid := auth.uid(); v_role text; v_is_global_admin boolean;
BEGIN
  SELECT COALESCE(role, 'viewer'), role IN ('owner','admin') INTO v_role, v_is_global_admin FROM public.profiles WHERE id = v_current_user;
  RETURN jsonb_build_object('user_id', v_current_user, 'team_id', p_team_id, 'role', COALESCE(v_role, 'viewer'),
    'is_global_admin', COALESCE(v_is_global_admin, false), 'permissions', CASE COALESCE(v_role, 'viewer')
      WHEN 'owner' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true, 'team_manage', true, 'user_manage', true, 'user_invite', true, 'assign', true, 'review', true, 'publish_approve', true, 'view_activity', true, 'export_bulk', true)
      WHEN 'admin' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true, 'user_manage', true, 'user_invite', true, 'assign', true, 'review', true, 'publish_approve', true, 'view_activity', true, 'export_bulk', true)
      WHEN 'lead' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'assign', true, 'review', true, 'view_activity', true)
      WHEN 'analyst' THEN jsonb_build_object('detection_create', true, 'detection_edit_assigned', true, 'detection_delete_own', true, 'request_review', true)
      ELSE jsonb_build_object('detection_view', true, 'comment', true) END);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_detection record; v_request_id uuid; v_target_rule_id text;
BEGIN
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT * INTO v_detection FROM public.detections WHERE id = p_detection_id::text AND library_type = 'development' AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user'); END IF;
  IF v_detection.promotion_status = 'pending' THEN RETURN json_build_object('success', false, 'error', 'Already pending approval'); END IF;
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60'); END IF;
  IF v_detection.name IS NULL OR v_detection.name = '' THEN RETURN json_build_object('success', false, 'error', 'Name is required'); END IF;
  IF v_detection.description IS NULL OR length(v_detection.description) < 20 THEN RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters'); END IF;
  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required'); END IF;
  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN RETURN json_build_object('success', false, 'error', 'Detection query is required'); END IF;
  v_target_rule_id := v_detection.source_rule_id;
  INSERT INTO public.promotion_requests (detection_id, target_rule_id, submitted_by, status) VALUES (p_detection_id::text, v_target_rule_id, p_user_id, 'pending') RETURNING id INTO v_request_id;
  UPDATE public.detections SET promotion_status = 'pending', "updatedDate" = now() WHERE id = p_detection_id::text;
  RETURN json_build_object('success', true, 'request_id', v_request_id);
END; $$;

CREATE OR REPLACE FUNCTION public.threat_research_promote_phase(p_session_id uuid, p_completed_phase text, p_next_phase text, p_behaviour_ids text[] DEFAULT NULL::text[])
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_remaining int; v_new_ids uuid[] := '{}'; v_id uuid; v_bid text; v_dispatched int := 0; v_max_concurrent int;
BEGIN
  v_max_concurrent := CASE p_next_phase WHEN 'detection' THEN 6 WHEN 'qa' THEN 6 WHEN 'attack_research' THEN 2 ELSE 1 END;
  PERFORM pg_advisory_xact_lock(hashtext('tr-session-' || p_session_id::text));
  SELECT count(*) INTO v_remaining FROM public.threat_research_jobs WHERE session_id = p_session_id AND phase = p_completed_phase AND status NOT IN ('completed','failed');
  IF v_remaining > 0 OR EXISTS (SELECT 1 FROM public.threat_research_jobs WHERE session_id = p_session_id AND phase = p_next_phase) THEN RETURN v_new_ids; END IF;
  IF p_behaviour_ids IS NULL OR array_length(p_behaviour_ids, 1) IS NULL THEN
    INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id) VALUES (p_session_id, p_next_phase, NULL) RETURNING id INTO v_id;
    v_new_ids := array_append(v_new_ids, v_id); UPDATE public.threat_research_jobs SET status = 'running', started_at = now() WHERE id = v_id; PERFORM public.threat_research_dispatch_job(v_id);
  ELSE
    FOREACH v_bid IN ARRAY p_behaviour_ids LOOP
      INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id) VALUES (p_session_id, p_next_phase, v_bid) RETURNING id INTO v_id;
      v_new_ids := array_append(v_new_ids, v_id);
      IF v_dispatched < v_max_concurrent THEN UPDATE public.threat_research_jobs SET status = 'running', started_at = now() WHERE id = v_id; PERFORM public.threat_research_dispatch_job(v_id); v_dispatched := v_dispatched + 1; END IF;
    END LOOP;
  END IF;
  RETURN v_new_ids;
END; $$;

CREATE OR REPLACE FUNCTION public.get_coverage_summary(p_platform text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_total_techniques int; v_covered_techniques int; v_total_detections bigint; v_production_detections bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_covered), sum(detection_count), sum(production_count)
    INTO v_total_techniques, v_covered_techniques, v_total_detections, v_production_detections
    FROM public.mv_coverage_stats s
   WHERE s.is_subtechnique = false AND (p_platform IS NULL OR EXISTS (
     SELECT 1 FROM public.detections d WHERE s.technique_id = ANY(COALESCE(d."mitreAttackIds", '{}'::text[]))
       AND p_platform = ANY(COALESCE(d.platforms, '{}'::text[]))));
  RETURN jsonb_build_object('summary', jsonb_build_object('total_techniques', coalesce(v_total_techniques, 0),
    'covered_techniques', coalesce(v_covered_techniques, 0), 'coverage_percent',
    CASE WHEN coalesce(v_total_techniques, 0) > 0 THEN round((v_covered_techniques::numeric / v_total_techniques) * 100) ELSE 0 END,
    'total_detections', coalesce(v_total_detections, 0), 'production_detections', coalesce(v_production_detections, 0)),
    'by_tactic', '[]'::jsonb, 'top_covered', '[]'::jsonb, 'critical_gaps', '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.get_threat_actor_coverage(p_actor_stix_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_actor jsonb; v_covered_techniques jsonb; v_gaps jsonb; v_total int; v_covered int;
BEGIN
  SELECT jsonb_build_object('name', name, 'mitreId', mitre_id, 'stixId', stix_id,
    'aliases', coalesce(data->'aliases', '[]'::jsonb), 'description', coalesce(data->>'description', ''))
    INTO v_actor FROM public.mitre_objects WHERE stix_id = p_actor_stix_id;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('error', 'Threat actor not found'); END IF;
  WITH actor_techniques AS (
    SELECT DISTINCT mo.mitre_id, mo.name FROM public.mitre_relationships mr
    JOIN public.mitre_objects mo ON mr.target_ref = mo.stix_id
    WHERE mr.source_ref = p_actor_stix_id AND mr.relationship_type = 'uses' AND mo.type = 'attack-pattern'
  ), detection_coverage AS (
    SELECT at.mitre_id, at.name, count(d.id) AS detection_count
    FROM actor_techniques at LEFT JOIN public.detections d ON at.mitre_id = ANY(d."mitreAttackIds")
    GROUP BY at.mitre_id, at.name
  )
  SELECT count(*), count(*) FILTER (WHERE detection_count > 0),
    jsonb_agg(jsonb_build_object('id', mitre_id, 'name', name, 'detectionCount', detection_count) ORDER BY detection_count DESC) FILTER (WHERE detection_count > 0),
    jsonb_agg(jsonb_build_object('id', mitre_id, 'name', name, 'reason', 'Uncovered technique used by ' || (v_actor->>'name')) ORDER BY mitre_id) FILTER (WHERE detection_count = 0)
    INTO v_total, v_covered, v_covered_techniques, v_gaps FROM detection_coverage;
  RETURN jsonb_build_object('actor', v_actor, 'coverage', jsonb_build_object('total', coalesce(v_total, 0), 'covered', coalesce(v_covered, 0), 'percent', CASE WHEN coalesce(v_total, 0) > 0 THEN round((v_covered::numeric / v_total) * 100) ELSE 0 END), 'coveredTechniques', coalesce(v_covered_techniques, '[]'::jsonb), 'gaps', coalesce(v_gaps, '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_rate_limit(p_key text, p_window_start timestamptz, p_max_requests integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_count int;
BEGIN
  IF p_max_requests IS NULL OR p_max_requests < 1 THEN RAISE EXCEPTION 'p_max_requests must be positive' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.rate_limits (key, request_count, window_start) VALUES (p_key, 1, date_trunc('minute', p_window_start))
  ON CONFLICT (key, window_start) DO UPDATE SET request_count = public.rate_limits.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END; $$;

-- Explicit Data API roles and ownership predicates for digest data.
DROP POLICY IF EXISTS "Users read own digest jobs" ON public.auto_digest_jobs;
CREATE POLICY auto_digest_jobs_select_own ON public.auto_digest_jobs FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY auto_digest_jobs_service_all ON public.auto_digest_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users manage own digest settings" ON public.auto_digest_settings;
CREATE POLICY auto_digest_settings_own ON public.auto_digest_settings FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users manage own feed entries" ON public.threat_intel_feed_entries;
DROP POLICY IF EXISTS "Users see own feed entries" ON public.threat_intel_feed_entries;
CREATE POLICY threat_intel_feed_entries_select_own ON public.threat_intel_feed_entries FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY threat_intel_feed_entries_insert_own ON public.threat_intel_feed_entries FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY threat_intel_feed_entries_update_own ON public.threat_intel_feed_entries FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY threat_intel_feed_entries_delete_own ON public.threat_intel_feed_entries FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY threat_intel_feed_entries_service_all ON public.threat_intel_feed_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users manage own feeds" ON public.threat_intel_feeds;
CREATE POLICY threat_intel_feeds_own ON public.threat_intel_feeds FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY threat_intel_feeds_service_all ON public.threat_intel_feeds FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can read curated feeds" ON public.curated_feed_sources;
CREATE POLICY curated_feed_sources_read ON public.curated_feed_sources FOR SELECT TO authenticated USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.auto_digest_jobs FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.auto_digest_job_entries FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.threat_intel_feed_entries FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.threat_intel_feeds FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_digest_enqueue(text, uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_digest_read_queue(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_digest_archive_queue_message(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_auto_digest_job(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_auto_digest_job(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_auto_digest_entry(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_auto_digest_job(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.auto_digest_job_entries IS 'Per-article durable ownership, lease, retry, quarantine, and report correlation state.';
