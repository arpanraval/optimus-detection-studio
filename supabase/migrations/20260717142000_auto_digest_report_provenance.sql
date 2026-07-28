-- Persist the provenance fields already present on threat_intel_reports.
-- Analyst-owned review fields remain intentionally outside the update set.
CREATE OR REPLACE FUNCTION public.upsert_auto_digest_report(
  p_report_id text,
  p_user_id uuid,
  p_source_url text,
  p_payload jsonb
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
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS DISTINCT FROM p_user_id
      AND current_setting('request.jwt.claim.role', true) <> 'service_role') THEN
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
    pipeline_version, attack_version, extraction_started_at, extraction_completed_at
  ) VALUES (
    v_target_id, p_user_id, v_payload->>'name', v_payload->>'source_type',
    v_payload->>'source_url', v_payload->>'raw_content_preview', v_payload->'summary',
    v_payload->'classification', COALESCE(v_payload->'ttps', '[]'::jsonb),
    COALESCE(v_payload->'iocs', '[]'::jsonb), COALESCE(v_payload->'rules', '[]'::jsonb),
    v_payload->'mitre_mapping', v_payload->'library_matches', v_payload->>'processing_stage',
    v_payload->>'outcome', COALESCE(v_payload->'section_outcomes', '{}'::jsonb),
    v_payload->'section_errors', v_payload->>'report_title', v_payload->>'threat_level',
    v_payload->>'attack_type', v_payload->>'attribution', v_payload->>'organization',
    COALESCE((v_payload->>'ttp_count')::integer, 0), COALESCE((v_payload->>'ioc_count')::integer, 0),
    COALESCE((v_payload->>'rule_count')::integer, 0), (v_payload->>'coverage_percent')::integer,
    COALESCE(v_payload->>'source', 'auto'), v_payload->>'source_feed_name',
    v_payload->>'source_article_url', (v_payload->>'relevance_score')::numeric,
    (v_payload->>'library_overlap_percent')::integer, (v_payload->>'validated_overlap_percent')::integer,
    (v_payload->>'deployment_readiness_percent')::integer, (v_payload->>'overlap_calculated_at')::timestamptz,
    v_payload->>'content_hash', v_payload->>'canonical_url', v_payload->>'fetched_url',
    v_payload->>'model_provider', v_payload->>'model_version', v_payload->>'prompt_version',
    v_payload->>'pipeline_version', v_payload->>'attack_version',
    (v_payload->>'extraction_started_at')::timestamptz,
    (v_payload->>'extraction_completed_at')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, source_type = EXCLUDED.source_type, source_url = EXCLUDED.source_url,
    raw_content_preview = EXCLUDED.raw_content_preview, summary = EXCLUDED.summary,
    classification = EXCLUDED.classification, ttps = EXCLUDED.ttps, iocs = EXCLUDED.iocs,
    rules = EXCLUDED.rules, mitre_mapping = EXCLUDED.mitre_mapping, library_matches = EXCLUDED.library_matches,
    processing_stage = EXCLUDED.processing_stage, outcome = EXCLUDED.outcome,
    section_outcomes = EXCLUDED.section_outcomes, section_errors = EXCLUDED.section_errors,
    report_title = EXCLUDED.report_title, threat_level = EXCLUDED.threat_level,
    attack_type = EXCLUDED.attack_type, attribution = EXCLUDED.attribution,
    organization = EXCLUDED.organization, ttp_count = EXCLUDED.ttp_count,
    ioc_count = EXCLUDED.ioc_count, rule_count = EXCLUDED.rule_count,
    coverage_percent = EXCLUDED.coverage_percent, source = EXCLUDED.source,
    source_feed_name = EXCLUDED.source_feed_name, source_article_url = EXCLUDED.source_article_url,
    relevance_score = EXCLUDED.relevance_score, library_overlap_percent = EXCLUDED.library_overlap_percent,
    validated_overlap_percent = EXCLUDED.validated_overlap_percent,
    deployment_readiness_percent = EXCLUDED.deployment_readiness_percent,
    overlap_calculated_at = EXCLUDED.overlap_calculated_at, content_hash = EXCLUDED.content_hash,
    canonical_url = EXCLUDED.canonical_url, fetched_url = EXCLUDED.fetched_url,
    model_provider = EXCLUDED.model_provider, model_version = EXCLUDED.model_version,
    prompt_version = EXCLUDED.prompt_version, pipeline_version = EXCLUDED.pipeline_version,
    attack_version = EXCLUDED.attack_version, extraction_started_at = EXCLUDED.extraction_started_at,
    extraction_completed_at = EXCLUDED.extraction_completed_at, updated_at = now();

  RETURN QUERY SELECT v_target_id;
END;
$$;

