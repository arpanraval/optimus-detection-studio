-- Allow SentinelOne file imports to persist their job history. No integration is added.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.bulk_import_jobs DROP CONSTRAINT IF EXISTS bulk_import_jobs_source_vendor_check;
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_source_vendor_check
  CHECK (source_vendor IN ('sigma', 'splunk_escu', 'elastic', 'kql', 'chronicle', 'crowdstrike_cql', 'sentinelone', 'mixed'));

-- Keep the canonical language vocabulary aligned with src/constants.ts.
-- Provider constraints remain unchanged: this does not enable SentinelOne integration.
ALTER TABLE public.siem_rule_bindings DROP CONSTRAINT siem_rule_bindings_query_language_check;
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_rule_bindings_query_language_check
  CHECK (query_language = ANY (ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL',
    'YARA','YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL','S1QL','S1QL 2.0','PowerQuery']));

CREATE OR REPLACE FUNCTION public.siem_rule_query_language(p_provider text, p_content jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(
    (SELECT canonical
       FROM unnest(ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL',
         'YARA','YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL','S1QL','S1QL 2.0','PowerQuery']) AS canonical
      WHERE lower(canonical) = lower(p_content ->> 'language')
      LIMIT 1),
    siem_provider_query_language(p_provider));
$$;
COMMIT;
