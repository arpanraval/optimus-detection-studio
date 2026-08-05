-- Additive provenance and evidence-quality metadata.
-- Existing reports remain readable and default to legacy_unverified.
ALTER TABLE public.threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS source_quality text NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS source_content_hash text;

ALTER TABLE public.threat_intel_reports
  ADD COLUMN IF NOT EXISTS source_quality text NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS source_content_length integer,
  ADD COLUMN IF NOT EXISTS source_content_hash text,
  ADD COLUMN IF NOT EXISTS quality_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS possible_actor_mentions jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'threat_intel_feed_entries_source_quality_check'
      AND conrelid = 'public.threat_intel_feed_entries'::regclass
  ) THEN
    ALTER TABLE public.threat_intel_feed_entries
      ADD CONSTRAINT threat_intel_feed_entries_source_quality_check
      CHECK (source_quality IN ('full_article', 'partial_article', 'feed_summary', 'title_only', 'unavailable', 'legacy_unverified'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'threat_intel_reports_source_quality_check'
      AND conrelid = 'public.threat_intel_reports'::regclass
  ) THEN
    ALTER TABLE public.threat_intel_reports
      ADD CONSTRAINT threat_intel_reports_source_quality_check
      CHECK (source_quality IN ('full_article', 'partial_article', 'feed_summary', 'title_only', 'unavailable', 'legacy_unverified'));
  END IF;
END $$;

UPDATE public.threat_intel_feed_entries
   SET content_length = COALESCE(content_length, char_length(COALESCE(full_content, content))),
       source_quality = CASE
         WHEN COALESCE(char_length(full_content), 0) >= 1500 THEN 'full_article'
         WHEN COALESCE(char_length(full_content), 0) >= 800 THEN 'partial_article'
         WHEN COALESCE(char_length(full_content), 0) >= 180 THEN 'feed_summary'
         WHEN COALESCE(char_length(full_content), char_length(content), 0) > 0 THEN 'title_only'
         ELSE 'legacy_unverified'
       END
 WHERE source_quality = 'legacy_unverified';

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
  v_quality text := CASE
    WHEN COALESCE(char_length(p_content), 0) >= 1500 THEN 'full_article'
    WHEN COALESCE(char_length(p_content), 0) >= 800 THEN 'partial_article'
    WHEN COALESCE(char_length(p_content), 0) >= 180 THEN 'feed_summary'
    WHEN COALESCE(char_length(p_content), 0) > 0 THEN 'title_only'
    ELSE 'unavailable'
  END;
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
           content_length = COALESCE(e.content_length, char_length(p_content)),
           source_quality = CASE WHEN e.source_quality = 'legacy_unverified' THEN v_quality ELSE e.source_quality END,
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
    digest_status, canonical_url, content_hash, source_feed_ids, source_count,
    content_length, source_quality
  )
  VALUES (
    p_feed_id, p_user_id, p_external_id, COALESCE(NULLIF(p_title, ''), 'Untitled'),
    p_content, p_url, p_published_at, 'harvested', p_canonical_url,
    p_content_hash, ARRAY[p_feed_id], 1, char_length(p_content), v_quality
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
    pipeline_version, attack_version, extraction_started_at, extraction_completed_at,
    source_quality, source_content_length, source_content_hash, quality_warnings,
    possible_actor_mentions
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
    (v_payload->>'extraction_completed_at')::timestamptz,
    COALESCE(v_payload->>'source_quality', 'legacy_unverified'),
    (v_payload->>'source_content_length')::integer,
    v_payload->>'source_content_hash',
    COALESCE(v_payload->'quality_warnings', '[]'::jsonb),
    COALESCE(v_payload->'possible_actor_mentions', '[]'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, source_type = EXCLUDED.source_type, source_url = EXCLUDED.source_url,
    raw_content_preview = EXCLUDED.raw_content_preview, summary = EXCLUDED.summary,
    classification = EXCLUDED.classification, ttps = EXCLUDED.ttps, iocs = EXCLUDED.iocs,
    rules = EXCLUDED.rules, mitre_mapping = EXCLUDED.mitre_mapping, library_matches = EXCLUDED.library_matches,
    processing_stage = EXCLUDED.processing_stage, outcome = EXCLUDED.outcome,
    section_outcomes = EXCLUDED.section_outcomes, section_errors = EXCLUDED.section_errors,
    report_title = EXCLUDED.report_title, threat_level = EXCLUDED.threat_level,
    attack_type = EXCLUDED.attack_type, organization = EXCLUDED.organization,
    ttp_count = EXCLUDED.ttp_count, ioc_count = EXCLUDED.ioc_count, rule_count = EXCLUDED.rule_count,
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
    extraction_completed_at = EXCLUDED.extraction_completed_at,
    source_quality = EXCLUDED.source_quality, source_content_length = EXCLUDED.source_content_length,
    source_content_hash = EXCLUDED.source_content_hash, quality_warnings = EXCLUDED.quality_warnings,
    possible_actor_mentions = EXCLUDED.possible_actor_mentions, updated_at = now();

  RETURN QUERY SELECT v_target_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_auto_digest_report(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_auto_digest_report(text, uuid, text, jsonb)
  TO service_role;
