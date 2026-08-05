-- Fix JWT role resolution across all auto-digest RPC functions.
-- PostgREST exposes the JWT role through auth.jwt() ->> 'role' rather than
-- current_setting('request.jwt.claim.role', true) in some edge runtime paths.
-- Support both representations so service-role calls from edge functions succeed.

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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND current_user NOT IN ('postgres', 'supabase_admin')
     AND v_jwt_role <> 'service_role' THEN
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
DECLARE
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND v_jwt_role NOT IN ('service_role', 'postgres') THEN
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

CREATE OR REPLACE FUNCTION public.auto_digest_enqueue(
  p_kind text,
  p_job_id uuid,
  p_entry_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_delay_seconds integer DEFAULT 0
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_message_id bigint;
  v_payload jsonb;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF v_jwt_role NOT IN ('service_role', 'postgres')
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_enqueue is internal only' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object(
    'kind', p_kind,
    'job_id', p_job_id,
    'entry_id', p_entry_id,
    'payload', COALESCE(p_payload, '{}'::jsonb),
    'enqueued_at', now()
  );
  IF to_regnamespace('pgmq') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT pgmq.send($1, $2, $3)' INTO v_message_id
    USING 'auto-digest-work', v_payload, GREATEST(0, COALESCE(p_delay_seconds, 0));
  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_digest_read_queue(
  p_visibility_seconds integer DEFAULT 600,
  p_quantity integer DEFAULT 10
)
RETURNS TABLE(msg_id bigint, read_ct bigint, enqueued_at timestamptz, vt timestamptz, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF v_jwt_role NOT IN ('service_role', 'postgres')
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_read_queue is internal only' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('pgmq') IS NULL THEN RETURN; END IF;
  RETURN QUERY EXECUTE 'SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.read($1, $2, $3)'
    USING 'auto-digest-work', GREATEST(30, p_visibility_seconds), LEAST(50, GREATEST(1, p_quantity));
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_digest_archive_queue_message(
  p_message_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_archived boolean;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF v_jwt_role NOT IN ('service_role', 'postgres')
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'auto_digest_archive_queue_message is internal only' USING ERRCODE = '42501';
  END IF;
  IF to_regnamespace('pgmq') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT pgmq.archive($1, $2)' INTO v_archived USING 'auto-digest-work', p_message_id;
  RETURN COALESCE(v_archived, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_auto_digest_report(
  p_report_id text,
  p_user_id uuid,
  p_source_url text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(report_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_target_id text := p_report_id;
  v_existing_id text;
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS DISTINCT FROM p_user_id
      AND v_jwt_role <> 'service_role') THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;
  IF p_report_id IS NULL OR p_report_id = '' THEN
    RAISE EXCEPTION 'report id is required' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || COALESCE(p_source_url, ''), 0));
  IF p_source_url IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.threat_intel_reports
     WHERE user_id = p_user_id AND source = 'auto' AND source_article_url = p_source_url
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;
    v_target_id := COALESCE(v_existing_id, p_report_id);
  END IF;
  v_payload := jsonb_set(v_payload, '{id}', to_jsonb(v_target_id), true);

  INSERT INTO public.threat_intel_reports (
    id, user_id, name, source_type, source_url, raw_content_preview, summary,
    classification, ttps, iocs, rules, mitre_mapping, library_matches,
    processing_stage, outcome, section_outcomes, section_errors, report_title,
    threat_level, attack_type, attribution, organization, ttp_count, ioc_count,
    rule_count, coverage_percent, source, source_feed_name, source_article_url,
    relevance_score, library_overlap_percent, validated_overlap_percent,
    deployment_readiness_percent, overlap_calculated_at, content_hash,
    canonical_url, fetched_url, model_provider, model_version, prompt_version,
    pipeline_version, attack_version, extraction_started_at, extraction_completed_at,
    source_quality, source_content_length, source_content_hash, quality_warnings,
    possible_actor_mentions
  ) VALUES (
    v_target_id, p_user_id, v_payload->>'name', v_payload->>'source_type',
    v_payload->>'source_url', v_payload->>'raw_content_preview', v_payload->'summary',
    v_payload->'classification', COALESCE(v_payload->'ttps', '[]'::jsonb),
    COALESCE(v_payload->'iocs', '[]'::jsonb), COALESCE(v_payload->'rules', '[]'::jsonb),
    v_payload->'mitre_mapping', v_payload->'library_matches',
    COALESCE(v_payload->>'processing_stage', 'complete'), COALESCE(v_payload->>'outcome', 'complete'),
    COALESCE(v_payload->'section_outcomes', '{}'::jsonb), COALESCE(v_payload->'section_errors', '{}'::jsonb),
    v_payload->>'report_title', v_payload->>'threat_level', v_payload->>'attack_type',
    v_payload->>'attribution', v_payload->>'organization',
    COALESCE((v_payload->>'ttp_count')::integer, 0), COALESCE((v_payload->>'ioc_count')::integer, 0),
    COALESCE((v_payload->>'rule_count')::integer, 0), (v_payload->>'coverage_percent')::integer,
    COALESCE(v_payload->>'source', 'auto'), v_payload->>'source_feed_name',
    v_payload->>'source_article_url', COALESCE((v_payload->>'relevance_score')::numeric, 0),
    (v_payload->>'library_overlap_percent')::numeric, (v_payload->>'validated_overlap_percent')::numeric,
    (v_payload->>'deployment_readiness_percent')::numeric,
    CASE WHEN v_payload->>'overlap_calculated_at' IS NOT NULL THEN (v_payload->>'overlap_calculated_at')::timestamptz ELSE NULL END,
    v_payload->>'content_hash', v_payload->>'canonical_url', v_payload->>'fetched_url',
    v_payload->>'model_provider', v_payload->>'model_version', v_payload->>'prompt_version',
    v_payload->>'pipeline_version', v_payload->>'attack_version',
    CASE WHEN v_payload->>'extraction_started_at' IS NOT NULL THEN (v_payload->>'extraction_started_at')::timestamptz ELSE NULL END,
    CASE WHEN v_payload->>'extraction_completed_at' IS NOT NULL THEN (v_payload->>'extraction_completed_at')::timestamptz ELSE NULL END,
    COALESCE(v_payload->>'source_quality', 'legacy_unverified'),
    (v_payload->>'source_content_length')::integer, v_payload->>'source_content_hash',
    COALESCE(v_payload->'quality_warnings', '[]'::jsonb), COALESCE(v_payload->'possible_actor_mentions', '[]'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    source_type = EXCLUDED.source_type,
    source_url = EXCLUDED.source_url,
    raw_content_preview = EXCLUDED.raw_content_preview,
    summary = EXCLUDED.summary,
    classification = EXCLUDED.classification,
    ttps = EXCLUDED.ttps,
    iocs = EXCLUDED.iocs,
    rules = EXCLUDED.rules,
    mitre_mapping = EXCLUDED.mitre_mapping,
    library_matches = EXCLUDED.library_matches,
    processing_stage = EXCLUDED.processing_stage,
    outcome = EXCLUDED.outcome,
    section_outcomes = EXCLUDED.section_outcomes,
    section_errors = EXCLUDED.section_errors,
    report_title = EXCLUDED.report_title,
    threat_level = EXCLUDED.threat_level,
    attack_type = EXCLUDED.attack_type,
    attribution = EXCLUDED.attribution,
    organization = EXCLUDED.organization,
    ttp_count = EXCLUDED.ttp_count,
    ioc_count = EXCLUDED.ioc_count,
    rule_count = EXCLUDED.rule_count,
    coverage_percent = EXCLUDED.coverage_percent,
    source = EXCLUDED.source,
    source_feed_name = EXCLUDED.source_feed_name,
    source_article_url = EXCLUDED.source_article_url,
    relevance_score = EXCLUDED.relevance_score,
    library_overlap_percent = EXCLUDED.library_overlap_percent,
    validated_overlap_percent = EXCLUDED.validated_overlap_percent,
    deployment_readiness_percent = EXCLUDED.deployment_readiness_percent,
    overlap_calculated_at = EXCLUDED.overlap_calculated_at,
    content_hash = EXCLUDED.content_hash,
    canonical_url = EXCLUDED.canonical_url,
    fetched_url = EXCLUDED.fetched_url,
    model_provider = EXCLUDED.model_provider,
    model_version = EXCLUDED.model_version,
    prompt_version = EXCLUDED.prompt_version,
    pipeline_version = EXCLUDED.pipeline_version,
    attack_version = EXCLUDED.attack_version,
    extraction_started_at = EXCLUDED.extraction_started_at,
    extraction_completed_at = EXCLUDED.extraction_completed_at,
    source_quality = EXCLUDED.source_quality,
    source_content_length = EXCLUDED.source_content_length,
    source_content_hash = EXCLUDED.source_content_hash,
    quality_warnings = EXCLUDED.quality_warnings,
    possible_actor_mentions = EXCLUDED.possible_actor_mentions,
    updated_at = now();

  RETURN QUERY SELECT v_target_id;
END;
$$;
