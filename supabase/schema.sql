-- Optimus Detection Studio — consolidated database schema
-- Generated from the live schema (single source of truth for fresh installs).
-- Apply to your OWN empty Supabase project:  psql "$DATABASE_URL" -f supabase/schema.sql

SET check_function_bodies = false;
SET client_min_messages = warning;

-- ============================================================
-- Extensions
-- ============================================================
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'optional extension pg_cron not enabled: %', SQLERRM;
END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'optional extension pg_net not enabled: %', SQLERRM;
END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'optional extension pg_stat_statements not enabled: %', SQLERRM;
END $$;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'optional extension supabase_vault not enabled: %', SQLERRM;
END $$;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;

-- pg_catalog stays first (the Postgres default). Listing it last made unqualified gen_random_uuid()
-- bind to the pgcrypto copy in "extensions", while migrations and the live project bind to the core
-- function, so a fresh install and an upgraded database printed different column defaults.
SET search_path TO pg_catalog, public, extensions;

-- ============================================================
-- Sequences
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.rate_limits_id_seq;

-- ============================================================
-- Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'::text
);
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_budget_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL,
  granted_by uuid,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  reason text
);
CREATE TABLE IF NOT EXISTS public.ai_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  scope_value text,
  period text NOT NULL,
  limit_usd numeric(10,2) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  day date NOT NULL,
  user_id uuid NOT NULL,
  feature text NOT NULL,
  model text NOT NULL,
  category text NOT NULL,
  call_count integer NOT NULL,
  input_tokens bigint NOT NULL,
  output_tokens bigint NOT NULL,
  cached_input_tokens bigint NOT NULL,
  image_count bigint NOT NULL,
  cost_usd numeric(12,4) NOT NULL,
  failure_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  feature text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  category text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL,
  error_code text,
  request_id text,
  metadata jsonb
);
CREATE TABLE IF NOT EXISTS public.analysis_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_type text NOT NULL,
  playbook_id text,
  title text NOT NULL,
  inputs jsonb DEFAULT '{}'::jsonb,
  step_results jsonb DEFAULT '[]'::jsonb,
  context jsonb DEFAULT '{}'::jsonb,
  generated_sections jsonb DEFAULT '{}'::jsonb,
  report_template jsonb,
  coverage_score numeric,
  score_breakdown jsonb,
  previous_report_id uuid,
  score_delta numeric,
  environment_snapshot jsonb,
  status text DEFAULT 'completed'::text,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  entity_name text,
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  ip_address inet,
  user_agent text,
  session_id text,
  source text NOT NULL DEFAULT 'client'::text,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.auto_digest_campaign_articles (
  campaign_id uuid NOT NULL,
  report_id text NOT NULL,
  feed_entry_id uuid,
  source_feed_name text,
  article_url text,
  article_title text,
  digested_at timestamp with time zone,
  ttp_count integer DEFAULT 0,
  ioc_count integer DEFAULT 0,
  rule_count integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.auto_digest_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  threat_actors text[] DEFAULT '{}'::text[],
  campaign_keywords text[] DEFAULT '{}'::text[],
  attack_type text,
  severity text,
  merged_ttps jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_iocs jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_percent integer DEFAULT 0,
  total_ttp_count integer DEFAULT 0,
  covered_ttp_count integer DEFAULT 0,
  feasible_gap_count integer DEFAULT 0,
  infeasible_gap_count integer DEFAULT 0,
  relevance_score smallint DEFAULT 0,
  relevance_tags text[] DEFAULT '{}'::text[],
  review_status text NOT NULL DEFAULT 'pending'::text,
  review_note text,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  article_count integer DEFAULT 0,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  unknown_gap_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.auto_digest_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  heartbeat_at timestamp with time zone,
  result_summary jsonb,
  error text,
  phase text,
  pending_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_entry_id uuid
);
CREATE TABLE IF NOT EXISTS public.auto_digest_run_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  feed_id uuid,
  feed_name text,
  article_id uuid,
  article_title text,
  article_url text,
  passed boolean,
  reason text,
  duration_ms integer,
  payload jsonb
);
CREATE TABLE IF NOT EXISTS public.auto_digest_settings (
  user_id uuid NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  schedule_hour_utc integer NOT NULL DEFAULT 6,
  max_articles_per_day integer NOT NULL DEFAULT 3,
  ai_model text NOT NULL DEFAULT 'gemini-3.6-flash'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  classification_model text DEFAULT 'gemini-3.6-flash'::text,
  digest_model text DEFAULT 'gemini-3.6-flash'::text,
  prompt_templates jsonb
);
CREATE TABLE IF NOT EXISTS public.batch_embedding_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gemini_batch_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  request_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.bulk_import_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL,
  source_url text,
  source_vendor text,
  target_library text NOT NULL,
  duplicate_strategy text DEFAULT 'skip'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  total_files integer DEFAULT 0,
  processed_files integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  skip_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  imported_detection_ids text[] DEFAULT '{}'::text[],
  errors jsonb DEFAULT '[]'::jsonb,
  warnings jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  checkpoint_data jsonb,
  last_successful_batch integer DEFAULT 0,
  total_batches integer DEFAULT 0,
  reverted_at timestamp with time zone,
  reverted_by uuid
);
CREATE TABLE IF NOT EXISTS public.crowdstrike_finetune_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text NOT NULL,
  integration_id uuid NOT NULL,
  preflight_run_id uuid,
  anthropic_session_id text,
  status text NOT NULL DEFAULT 'running'::text,
  repository text NOT NULL,
  window_days integer NOT NULL,
  original_query text NOT NULL,
  baseline_hit_count bigint,
  query_count integer NOT NULL DEFAULT 0,
  nudged boolean NOT NULL DEFAULT false,
  result jsonb,
  error_message text,
  usage jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.crowdstrike_finetune_query_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  tool_use_id text NOT NULL,
  purpose text NOT NULL,
  query_text text NOT NULL,
  repository text NOT NULL,
  provider_job_id text,
  status text NOT NULL DEFAULT 'queued'::text,
  row_count integer,
  result_sample jsonb,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.curated_feed_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text NOT NULL,
  url text NOT NULL,
  feed_type text NOT NULL DEFAULT 'rss'::text,
  category text NOT NULL DEFAULT 'threat_research'::text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  avg_articles_week numeric(4,1) DEFAULT 2.0,
  extraction_method text NOT NULL DEFAULT 'jina_reader'::text,
  extraction_selector text,
  extraction_tested_at timestamp with time zone,
  extraction_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.defender_xdr_columns (
  table_name text NOT NULL,
  column_name text NOT NULL,
  column_type text,
  description text
);
CREATE TABLE IF NOT EXISTS public.defender_xdr_tables (
  name text NOT NULL,
  description text,
  table_type text,
  hot_days integer,
  cold_days integer,
  total_interactive_days integer,
  source_type text,
  has_data boolean,
  imported_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.deployment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  detection_id text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  vendor_rule_id text,
  query_language text,
  deployed_query text,
  rule_config jsonb,
  response jsonb,
  error_message text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  detection_version integer,
  detection_hash text
);
CREATE TABLE IF NOT EXISTS public.detection_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  unassigned_at timestamp with time zone,
  unassigned_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid,
  content text NOT NULL,
  comment_type text NOT NULL DEFAULT 'comment'::text,
  is_resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text,
  technique_id text,
  decision_type text NOT NULL,
  decision_context text NOT NULL,
  reasoning text,
  quick_reason text,
  previous_value text,
  new_value text,
  related_entity_ids text[],
  review_by timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_drift (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  user_id uuid NOT NULL,
  source_url text NOT NULL,
  source_vendor text NOT NULL,
  target_library text NOT NULL,
  external_id text NOT NULL,
  upstream_path text,
  upstream_blob_sha text,
  baseline_hash text,
  upstream_hash text,
  upstream_raw_snapshot text,
  drift_state text NOT NULL DEFAULT 'unknown'::text,
  field_diffs jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamp with time zone,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  resolution text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  embedding vector(1536),
  content_hash text NOT NULL,
  embedded_text text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_finetune_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text NOT NULL,
  integration_id uuid NOT NULL,
  preflight_run_id uuid,
  provider text NOT NULL DEFAULT 'defender_xdr'::text,
  anthropic_session_id text,
  status text NOT NULL DEFAULT 'running'::text,
  window_days integer NOT NULL,
  original_query text NOT NULL,
  baseline_hit_count bigint,
  query_count integer NOT NULL DEFAULT 0,
  nudged boolean NOT NULL DEFAULT false,
  result jsonb,
  error_message text,
  usage jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.detection_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text DEFAULT '📦'::text,
  tags text[] DEFAULT '{}'::text[],
  mitre_technique_ids text[] DEFAULT '{}'::text[],
  platforms text[] DEFAULT '{}'::text[],
  rule_count integer DEFAULT 0,
  source text DEFAULT 'community'::text,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pack_type text DEFAULT 'custom'::text,
  auto_generated boolean DEFAULT false,
  generation_criteria jsonb,
  coverage_percent double precision DEFAULT 0,
  current_version_number integer NOT NULL DEFAULT 0,
  deploy_config jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.detection_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  detection_id text NOT NULL,
  technique_ids text[],
  tactics text[],
  log_sources text[],
  platforms text[],
  query_languages text[],
  source text,
  severity text,
  fields_used text[],
  query_snippet text,
  detection_categories text[],
  extracted_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_preflight_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  detection_id text NOT NULL,
  provider text NOT NULL,
  window_days integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  validation_passed boolean NOT NULL DEFAULT false,
  hit_count bigint,
  window_applied boolean NOT NULL DEFAULT true,
  error_message text,
  error_guidance text,
  schema_warnings jsonb,
  query_text text,
  query_language text DEFAULT 'KQL'::text,
  sample jsonb,
  breakdown jsonb,
  duration_ms integer,
  provider_job_state jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detection_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  reviewer_id uuid,
  assigned_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending'::text,
  decision_at timestamp with time zone,
  notes text,
  checklist jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.detections (
  id text NOT NULL,
  version integer NOT NULL,
  "createdDate" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedDate" timestamp with time zone NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  author text,
  status text NOT NULL,
  "detectionType" text NOT NULL,
  severity text NOT NULL,
  "logSource" text NOT NULL,
  technology text NOT NULL,
  "testedAndValidated" boolean NOT NULL,
  "queryLanguage" text NOT NULL,
  "detectionQuery" text NOT NULL,
  "queryExplanation" text,
  "mitreAttackIds" text[],
  "mitreTactics" text[],
  "mitreTechniques" text[],
  "threatActors" text[],
  campaigns text[],
  software text[],
  "associatedCVEs" text[],
  "references" text[],
  caveats text,
  "fineTuning" text,
  tags text[],
  user_id uuid,
  created_by text,
  updated_by text,
  "logSources" text[] DEFAULT '{}'::text[],
  "dataSources" text[] DEFAULT '{}'::text[],
  "dataComponents" text[] DEFAULT '{}'::text[],
  platforms text[] DEFAULT '{}'::text[],
  queries jsonb DEFAULT '[]'::jsonb,
  "linkedGroups" jsonb DEFAULT '[]'::jsonb,
  "linkedSoftware" jsonb DEFAULT '[]'::jsonb,
  "linkedCampaigns" jsonb DEFAULT '[]'::jsonb,
  "investigationSteps" jsonb DEFAULT '[]'::jsonb,
  "responseActions" text[] DEFAULT '{}'::text[],
  "falsePositiveGuidance" text DEFAULT ''::text,
  prerequisites text[] DEFAULT '{}'::text[],
  "validationDate" timestamp with time zone,
  "validationEnvironment" text DEFAULT ''::text,
  "testCases" text[] DEFAULT '{}'::text[],
  "qualityScore" integer DEFAULT 0,
  "auditLog" jsonb DEFAULT '[]'::jsonb,
  library_type text DEFAULT 'user'::text,
  source text DEFAULT 'custom'::text,
  source_rule_id text,
  source_url text,
  external_id text,
  promotion_status text DEFAULT 'unpublished'::text,
  promoted_to_id text,
  promoted_at timestamp with time zone,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone,
  review_status text DEFAULT 'none'::text,
  reviewer_id uuid,
  review_requested_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  review_notes text,
  bulk_import_id uuid,
  vendor_metadata jsonb DEFAULT '{}'::jsonb,
  fts_vector tsvector,
  visibility text DEFAULT 'private'::text,
  research_session_id uuid,
  research_node_id text
);
CREATE TABLE IF NOT EXISTS public.enrichment_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  enrichment_type text NOT NULL DEFAULT 'misp_targeting_intel'::text,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  applied_by text,
  preview_hash text NOT NULL,
  affected_group_ids text[] NOT NULL,
  rollback_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'applied'::text,
  rolled_back_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.environment_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  industry text,
  siem_platforms text[] DEFAULT '{}'::text[],
  log_sources text[] DEFAULT '{}'::text[],
  custom_log_sources text[] DEFAULT '{}'::text[],
  edr_tools text[] DEFAULT '{}'::text[],
  cloud_platforms jsonb DEFAULT '{}'::jsonb,
  crown_jewels text[] DEFAULT '{}'::text[],
  profile_completeness integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  sectors text[] DEFAULT '{}'::text[],
  user_country text,
  threat_origin_countries text[] DEFAULT '{}'::text[]
);
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  encrypted_data text NOT NULL,
  credential_type text NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  auth_type text NOT NULL,
  status text NOT NULL DEFAULT 'configured'::text,
  last_tested_at timestamp with time zone,
  last_test_result jsonb,
  last_synced_at timestamp with time zone,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  mitre_id text NOT NULL,
  type text NOT NULL,
  embedding vector(1536),
  content_hash text NOT NULL,
  embedded_text text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  framework_version text NOT NULL,
  stix_version text NOT NULL,
  last_updated timestamp with time zone NOT NULL,
  total_techniques integer DEFAULT 0,
  total_groups integer DEFAULT 0,
  total_software integer DEFAULT 0,
  total_campaigns integer DEFAULT 0,
  total_mitigations integer DEFAULT 0,
  total_relationships integer DEFAULT 0,
  total_detection_strategies integer DEFAULT 0,
  total_analytics integer DEFAULT 0,
  total_data_components integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  type text NOT NULL,
  mitre_id text,
  name text NOT NULL,
  description text,
  created timestamp with time zone NOT NULL,
  modified timestamp with time zone NOT NULL,
  data jsonb NOT NULL,
  deprecated boolean DEFAULT false,
  revoked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_relationships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  relationship_type text NOT NULL,
  source_ref text NOT NULL,
  target_ref text NOT NULL,
  description text,
  data jsonb,
  created timestamp with time zone NOT NULL,
  modified timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_scoring_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  mitre_version text,
  total_groups integer NOT NULL,
  total_techniques integer NOT NULL,
  total_campaigns integer NOT NULL,
  total_software integer NOT NULL,
  total_mitigations integer NOT NULL,
  total_strategies integer NOT NULL,
  max_group_technique_count integer NOT NULL,
  max_group_campaign_count integer NOT NULL,
  max_group_software_count integer NOT NULL,
  max_technique_group_count integer NOT NULL,
  max_technique_campaign_count integer NOT NULL,
  is_active boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.mitre_tactic_weights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tactic text NOT NULL,
  profile text NOT NULL,
  weight numeric NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mitre_technique_data_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  data_source text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mitre_technique_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  technique_ids text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mitre_technique_platforms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  platform text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mitre_technique_tactics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  tactic_stix_id text NOT NULL,
  tactic_shortname text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.pack_deploy_job_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  detection_id text NOT NULL,
  detection_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  vendor_rule_id text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  attempted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.pack_deploy_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pack_id uuid,
  integration_id uuid NOT NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  total_items integer NOT NULL DEFAULT 0,
  succeeded_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  current_detection_id text,
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  rule_config jsonb
);
CREATE TABLE IF NOT EXISTS public.pack_detections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL,
  detection_id text NOT NULL,
  added_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pack_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pack_id uuid,
  pack_name text NOT NULL,
  version_number integer NOT NULL,
  label text,
  notes text,
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  role text DEFAULT 'viewer'::text,
  full_name text,
  avatar_url text,
  phone text,
  timezone text DEFAULT 'UTC'::text,
  preferences jsonb DEFAULT '{}'::jsonb,
  last_active_at timestamp with time zone,
  status text DEFAULT 'active'::text,
  onboarding_completed boolean DEFAULT true,
  onboarding_step integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  password_set boolean DEFAULT true,
  permission_overrides jsonb
);
CREATE TABLE IF NOT EXISTS public.promotion_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  target_rule_id text,
  submitted_by uuid NOT NULL,
  submitted_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  result_rule_id text,
  notification_sent boolean DEFAULT false,
  notification_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  reviewer_id uuid
);
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id bigint NOT NULL DEFAULT nextval('rate_limits_id_seq'::regclass),
  key text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT date_trunc('minute'::text, now())
);
CREATE TABLE IF NOT EXISTS public.scoring_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  weights jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.threat_intel_feed_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL,
  user_id uuid NOT NULL,
  external_id text,
  title text NOT NULL,
  content text,
  url text,
  published_at timestamp with time zone,
  fetched_at timestamp with time zone DEFAULT now(),
  auto_digest_report_id text,
  staleness_score double precision DEFAULT 1.0,
  is_processed boolean DEFAULT false,
  digest_status text DEFAULT 'harvested'::text,
  classification jsonb,
  skip_reason text,
  relevance_score numeric(3,2),
  full_content text,
  content_length integer,
  extract_error text,
  campaign_id uuid
);
CREATE TABLE IF NOT EXISTS public.threat_intel_feeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  feed_type text NOT NULL,
  url text NOT NULL,
  taxii_config jsonb,
  schedule_cron text DEFAULT '0 */6 * * *'::text,
  is_enabled boolean DEFAULT true,
  quality_rating integer,
  last_fetched_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  curated_source_id uuid,
  is_auto_digest boolean DEFAULT false,
  extraction_method text,
  extraction_reliability numeric(3,2) DEFAULT 1.0
);
CREATE TABLE IF NOT EXISTS public.threat_intel_report_detections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id text NOT NULL,
  detection_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_from text NOT NULL,
  source_ttp_id text,
  source_rule_id text,
  detection_name text NOT NULL,
  mitre_ids text[] DEFAULT '{}'::text[]
);
CREATE TABLE IF NOT EXISTS public.threat_intel_reports (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_url text,
  raw_content_preview text,
  summary jsonb,
  classification jsonb,
  ttps jsonb NOT NULL DEFAULT '[]'::jsonb,
  iocs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  mitre_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  library_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  processing_stage text NOT NULL DEFAULT 'complete'::text,
  processing_error text,
  section_errors jsonb,
  selected_ttp_ids text[] NOT NULL DEFAULT '{}'::text[],
  selected_ioc_ids text[] NOT NULL DEFAULT '{}'::text[],
  report_title text,
  threat_level text,
  attack_type text,
  attribution text,
  organization text,
  ttp_count integer NOT NULL DEFAULT 0,
  ioc_count integer NOT NULL DEFAULT 0,
  rule_count integer NOT NULL DEFAULT 0,
  coverage_percent integer DEFAULT 0,
  source text DEFAULT 'manual'::text,
  source_feed_name text,
  source_article_url text,
  campaign_id uuid,
  review_status text DEFAULT 'reviewed'::text,
  review_note text,
  reviewed_at timestamp with time zone,
  relevance_score smallint DEFAULT 0,
  feasible_gap_count integer DEFAULT 0,
  infeasible_gap_count integer DEFAULT 0,
  unknown_gap_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.threat_research_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  agent text NOT NULL,
  event_type text NOT NULL,
  message text,
  duration_ms integer,
  payload jsonb,
  narration text
);
CREATE TABLE IF NOT EXISTS public.threat_research_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  phase text NOT NULL,
  behaviour_id text,
  status text NOT NULL DEFAULT 'pending'::text,
  attempt_count integer NOT NULL DEFAULT 0,
  failure_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.threat_research_job_checkpoints (
  job_id uuid NOT NULL,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  agent text NOT NULL,
  schema_version integer NOT NULL,
  iteration integer NOT NULL,
  restore_count integer NOT NULL DEFAULT 0,
  messages jsonb NOT NULL,
  bytes integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.threat_research_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  input_text text NOT NULL,
  input_classification text,
  status text NOT NULL DEFAULT 'pending'::text,
  failure_reason text,
  duration_ms integer,
  tree jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment_snapshot jsonb,
  coverage_impact numeric,
  total_tokens integer,
  total_cost_usd numeric,
  tool_calls_used integer,
  model_versions jsonb,
  current_phase text,
  model_calls_used integer NOT NULL DEFAULT 0,
  model_call_cap integer,
  tool_call_cap integer,
  aborted_at timestamp with time zone,
  abort_reason text,
  token_cap integer,
  tokens_reserved integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.threat_research_vendor_searches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  phase text,
  behaviour_id text,
  query text NOT NULL,
  repositories text[] NOT NULL DEFAULT '{}'::text[],
  results_found integer NOT NULL DEFAULT 0,
  source_urls text[] NOT NULL DEFAULT '{}'::text[],
  error text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.threat_research_phase_budgets (
  session_id uuid NOT NULL,
  phase text NOT NULL,
  token_cap integer NOT NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  tokens_reserved integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_dashboards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Dashboard'::text,
  is_default boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'analyst'::text,
  invited_by uuid NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  detection_id text,
  publish_request_id uuid,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  action_url text,
  category text DEFAULT 'general'::text,
  source_user_id uuid
);

-- ============================================================
-- Constraints (primary keys, unique, check, then foreign keys)
-- ============================================================
ALTER TABLE public.access_requests ADD CONSTRAINT access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.access_requests ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['detection'::text, 'user'::text, 'team'::text, 'pack'::text, 'review'::text, 'comment'::text])));
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_budget_overrides ADD CONSTRAINT ai_budget_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_check CHECK ((((scope = 'org'::text) AND (scope_value IS NULL)) OR ((scope = ANY (ARRAY['feature'::text, 'user'::text, 'model'::text])) AND (scope_value IS NOT NULL))));
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_period_check CHECK ((period = ANY (ARRAY['daily'::text, 'monthly'::text, 'rolling_30d'::text])));
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_scope_check CHECK ((scope = ANY (ARRAY['org'::text, 'feature'::text, 'user'::text, 'model'::text])));
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_limit_usd_check CHECK ((limit_usd > (0)::numeric));
ALTER TABLE public.ai_usage_daily ADD CONSTRAINT ai_usage_daily_pkey PRIMARY KEY (day, user_id, feature, model, category);
ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_status_check CHECK ((status = ANY (ARRAY['success'::text, 'provider_error'::text, 'rate_limit'::text, 'budget_blocked'::text, 'timeout'::text])));
ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_category_check CHECK ((category = ANY (ARRAY['llm'::text, 'embedding'::text, 'image'::text, 'failed'::text])));
ALTER TABLE public.analysis_reports ADD CONSTRAINT analysis_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.analysis_reports ADD CONSTRAINT analysis_reports_type_check CHECK ((report_type = ANY (ARRAY['playbook'::text, 'cve_response'::text, 'threat_digest_coverage'::text, 'manual'::text])));
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_source_check CHECK ((source = ANY (ARRAY['client'::text, 'edge_function'::text, 'migration'::text])));
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);
ALTER TABLE public.auto_digest_campaign_articles ADD CONSTRAINT auto_digest_campaign_articles_pkey PRIMARY KEY (campaign_id, report_id);
ALTER TABLE public.auto_digest_campaigns ADD CONSTRAINT auto_digest_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE public.auto_digest_campaigns ADD CONSTRAINT auto_digest_campaigns_review_note_check CHECK ((char_length(review_note) <= 2000));
ALTER TABLE public.auto_digest_campaigns ADD CONSTRAINT auto_digest_campaigns_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'actioned'::text, 'deferred'::text, 'dismissed'::text])));
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_phase_check CHECK (((phase IS NULL) OR (phase = ANY (ARRAY['harvesting'::text, 'classifying'::text, 'ranking'::text, 'digesting'::text, 'finalising'::text]))));
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'timeout_partial'::text])));
ALTER TABLE public.auto_digest_run_events ADD CONSTRAINT auto_digest_run_events_pkey PRIMARY KEY (id);
ALTER TABLE public.auto_digest_run_events ADD CONSTRAINT auto_digest_run_events_event_type_check CHECK ((event_type = ANY (ARRAY['feed_fetched'::text, 'feed_failed'::text, 'article_seen'::text, 'article_classified'::text, 'article_classify_failed'::text, 'article_skipped_daily_limit'::text, 'article_ranked'::text, 'article_digested'::text, 'article_digest_failed'::text, 'campaign_link_evaluated'::text, 'campaign_link_skipped'::text, 'campaign_link_ambiguous'::text, 'campaign_created'::text, 'campaign_updated'::text])));
ALTER TABLE public.auto_digest_settings ADD CONSTRAINT auto_digest_settings_schedule_hour_utc_check CHECK (((schedule_hour_utc >= 0) AND (schedule_hour_utc <= 23)));
ALTER TABLE public.auto_digest_settings ADD CONSTRAINT auto_digest_settings_pkey PRIMARY KEY (user_id);
ALTER TABLE public.auto_digest_settings ADD CONSTRAINT auto_digest_settings_max_articles_per_day_check CHECK (((max_articles_per_day >= 1) AND (max_articles_per_day <= 10)));
ALTER TABLE public.batch_embedding_jobs ADD CONSTRAINT batch_embedding_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.batch_embedding_jobs ADD CONSTRAINT batch_embedding_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'running'::text, 'succeeded'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_target_library_check CHECK ((target_library = ANY (ARRAY['development'::text, 'production'::text])));
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fetching'::text, 'parsing'::text, 'validating'::text, 'preview'::text, 'inserting'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'reverted'::text])));
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_source_vendor_check CHECK ((source_vendor = ANY (ARRAY['sigma'::text, 'splunk_escu'::text, 'elastic'::text, 'kql'::text, 'chronicle'::text, 'mixed'::text])));
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_source_type_check CHECK ((source_type = ANY (ARRAY['github'::text, 'zip'::text, 'files'::text])));
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_duplicate_strategy_check CHECK ((duplicate_strategy = ANY (ARRAY['skip'::text, 'update'::text, 'create_new'::text])));
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_repository_check CHECK ((repository = ANY (ARRAY['search-all'::text, 'investigate_view'::text, 'third-party'::text, 'falcon_for_it_view'::text, 'forensics_view'::text])));
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_window_days_check CHECK (((window_days >= 1) AND (window_days <= 90)));
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.crowdstrike_finetune_query_jobs ADD CONSTRAINT crowdstrike_finetune_query_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.crowdstrike_finetune_query_jobs ADD CONSTRAINT crowdstrike_finetune_query_jobs_repository_check CHECK ((repository = ANY (ARRAY['search-all'::text, 'investigate_view'::text, 'third-party'::text, 'falcon_for_it_view'::text, 'forensics_view'::text])));
ALTER TABLE public.crowdstrike_finetune_query_jobs ADD CONSTRAINT crowdstrike_finetune_query_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.crowdstrike_finetune_query_jobs ADD CONSTRAINT crowdstrike_finetune_query_jobs_tool_unique UNIQUE (run_id, tool_use_id);
ALTER TABLE public.curated_feed_sources ADD CONSTRAINT curated_feed_sources_category_check CHECK ((category = ANY (ARRAY['threat_research'::text, 'government'::text, 'community'::text])));
ALTER TABLE public.curated_feed_sources ADD CONSTRAINT curated_feed_sources_extraction_method_check CHECK ((extraction_method = ANY (ARRAY['jina_reader'::text, 'direct'::text, 'headless'::text])));
ALTER TABLE public.curated_feed_sources ADD CONSTRAINT curated_feed_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.defender_xdr_columns ADD CONSTRAINT defender_xdr_columns_pkey PRIMARY KEY (table_name, column_name);
ALTER TABLE public.defender_xdr_tables ADD CONSTRAINT defender_xdr_tables_pkey PRIMARY KEY (name);
ALTER TABLE public.deployment_history ADD CONSTRAINT deployment_history_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'failed'::text, 'rolled_back'::text])));
ALTER TABLE public.deployment_history ADD CONSTRAINT deployment_history_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'enable'::text, 'disable'::text])));
ALTER TABLE public.deployment_history ADD CONSTRAINT deployment_history_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_assignments ADD CONSTRAINT detection_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_type_check CHECK ((comment_type = ANY (ARRAY['comment'::text, 'review_note'::text, 'status_change'::text, 'system'::text])));
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_decisions ADD CONSTRAINT detection_decisions_type_check CHECK ((decision_type = ANY (ARRAY['status_change'::text, 'query_tuning'::text, 'gap_accepted'::text, 'gap_rejected'::text, 'review_decision'::text, 'deprecation'::text, 'priority_change'::text, 'deployment'::text])));
ALTER TABLE public.detection_decisions ADD CONSTRAINT detection_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_detection_id_key UNIQUE (detection_id);
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_drift_state_check CHECK ((drift_state = ANY (ARRAY['unknown'::text, 'in_sync'::text, 'upstream_changed'::text, 'upstream_removed'::text, 'conflict'::text, 'dismissed'::text])));
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_resolution_check CHECK ((resolution = ANY (ARRAY['accepted'::text, 'kept_mine'::text, 'dismissed'::text, 'reverted'::text])));
ALTER TABLE public.detection_embeddings ADD CONSTRAINT detection_embeddings_detection_id_key UNIQUE (detection_id);
ALTER TABLE public.detection_embeddings ADD CONSTRAINT detection_embeddings_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_window_days_check CHECK (((window_days >= 1) AND (window_days <= 30)));
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_provider_check CHECK ((provider = ANY (ARRAY['defender_xdr'::text, 'sentinel'::text])));
ALTER TABLE public.detection_packs ADD CONSTRAINT detection_packs_pack_type_check CHECK ((pack_type = ANY (ARRAY['tactic'::text, 'technology'::text, 'threat_actor'::text, 'campaign'::text, 'ransomware'::text, 'custom'::text, 'siem_ready'::text, 'use_case'::text])));
ALTER TABLE public.detection_packs ADD CONSTRAINT detection_packs_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_patterns ADD CONSTRAINT detection_patterns_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_patterns ADD CONSTRAINT detection_patterns_unique UNIQUE (user_id, detection_id);
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_provider_check CHECK ((provider = ANY (ARRAY['defender_xdr'::text, 'crowdstrike'::text, 'sentinel'::text])));
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, 'query_error'::text, 'connection_error'::text, 'timeout'::text, 'permission_denied'::text, 'cancelled'::text])));
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_window_days_check CHECK (((window_days >= 1) AND (window_days <= 90)));
ALTER TABLE public.detection_reviews ADD CONSTRAINT detection_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.detection_reviews ADD CONSTRAINT detection_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.detections ADD CONSTRAINT detections_library_type_check CHECK ((library_type = ANY (ARRAY['development'::text, 'production'::text])));
ALTER TABLE public.detections ADD CONSTRAINT detections_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'shared'::text])));
ALTER TABLE public.detections ADD CONSTRAINT detections_review_status_check CHECK ((review_status = ANY (ARRAY['none'::text, 'requested'::text, 'in_review'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.detections ADD CONSTRAINT detections_promotion_status_check CHECK ((promotion_status = ANY (ARRAY['none'::text, 'pending'::text, 'promoted'::text, 'rejected'::text])));
ALTER TABLE public.detections ADD CONSTRAINT detections_pkey PRIMARY KEY (id);
ALTER TABLE public.enrichment_audit ADD CONSTRAINT enrichment_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.enrichment_audit ADD CONSTRAINT enrichment_audit_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'rolled_back'::text])));
ALTER TABLE public.environment_profiles ADD CONSTRAINT environment_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.integration_credentials ADD CONSTRAINT integration_credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);
ALTER TABLE public.integrations ADD CONSTRAINT integrations_category_check CHECK ((category = ANY (ARRAY['siem'::text, 'version_control'::text, 'automation'::text])));
ALTER TABLE public.integrations ADD CONSTRAINT integrations_auth_type_check CHECK ((auth_type = ANY (ARRAY['basic'::text, 'token'::text, 'api_key'::text, 'oauth2_client_credentials'::text, 'webhook'::text])));
ALTER TABLE public.integrations ADD CONSTRAINT integrations_status_check CHECK ((status = ANY (ARRAY['configured'::text, 'testing'::text, 'connected'::text, 'error'::text, 'disabled'::text])));
ALTER TABLE public.integrations ADD CONSTRAINT integrations_provider_check CHECK ((provider = ANY (ARRAY['splunk'::text, 'sentinel'::text, 'defender_xdr'::text, 'elastic'::text, 'crowdstrike'::text, 'github'::text, 'gitlab'::text, 'azure_devops'::text, 'jira'::text, 'slack'::text])));
ALTER TABLE public.mitre_embeddings ADD CONSTRAINT mitre_embeddings_stix_id_key UNIQUE (stix_id);
ALTER TABLE public.mitre_embeddings ADD CONSTRAINT mitre_embeddings_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_metadata ADD CONSTRAINT mitre_metadata_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_objects ADD CONSTRAINT mitre_objects_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_objects ADD CONSTRAINT mitre_objects_stix_id_key UNIQUE (stix_id);
ALTER TABLE public.mitre_relationships ADD CONSTRAINT mitre_relationships_type_check CHECK ((relationship_type = ANY (ARRAY['uses'::text, 'mitigates'::text, 'detects'::text, 'subtechnique-of'::text, 'attributed-to'::text, 'targets'::text, 'revoked-by'::text, 'related-to'::text])));
ALTER TABLE public.mitre_relationships ADD CONSTRAINT mitre_relationships_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_relationships ADD CONSTRAINT mitre_relationships_stix_id_key UNIQUE (stix_id);
ALTER TABLE public.mitre_scoring_snapshot ADD CONSTRAINT mitre_scoring_snapshot_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_tactic_weights ADD CONSTRAINT mitre_tactic_weights_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_tactic_weights ADD CONSTRAINT mitre_tactic_weights_tactic_profile_key UNIQUE (tactic, profile);
ALTER TABLE public.mitre_tactic_weights ADD CONSTRAINT mitre_tactic_weights_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)));
ALTER TABLE public.mitre_technique_data_sources ADD CONSTRAINT mitre_technique_data_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_technique_data_sources ADD CONSTRAINT mitre_technique_data_sources_technique_stix_id_data_source_key UNIQUE (technique_stix_id, data_source);
ALTER TABLE public.mitre_technique_groups ADD CONSTRAINT mitre_technique_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_technique_groups ADD CONSTRAINT mitre_technique_groups_key_key UNIQUE (key);
ALTER TABLE public.mitre_technique_platforms ADD CONSTRAINT mitre_technique_platforms_technique_stix_id_platform_key UNIQUE (technique_stix_id, platform);
ALTER TABLE public.mitre_technique_platforms ADD CONSTRAINT mitre_technique_platforms_pkey PRIMARY KEY (id);
ALTER TABLE public.mitre_technique_tactics ADD CONSTRAINT mitre_technique_tactics_technique_stix_id_tactic_stix_id_key UNIQUE (technique_stix_id, tactic_stix_id);
ALTER TABLE public.mitre_technique_tactics ADD CONSTRAINT mitre_technique_tactics_pkey PRIMARY KEY (id);
ALTER TABLE public.pack_deploy_job_items ADD CONSTRAINT pack_deploy_job_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])));
ALTER TABLE public.pack_deploy_job_items ADD CONSTRAINT pack_deploy_job_items_job_id_detection_id_key UNIQUE (job_id, detection_id);
ALTER TABLE public.pack_deploy_job_items ADD CONSTRAINT pack_deploy_job_items_pkey PRIMARY KEY (id);
ALTER TABLE public.pack_deploy_jobs ADD CONSTRAINT pack_deploy_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.pack_deploy_jobs ADD CONSTRAINT pack_deploy_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'partial'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.pack_detections ADD CONSTRAINT pack_detections_pkey PRIMARY KEY (id);
ALTER TABLE public.pack_detections ADD CONSTRAINT pack_detections_pack_id_detection_id_key UNIQUE (pack_id, detection_id);
ALTER TABLE public.pack_versions ADD CONSTRAINT pack_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'away'::text, 'offline'::text, 'deactivated'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text, 'analyst'::text, 'viewer'::text])));
ALTER TABLE public.promotion_requests ADD CONSTRAINT publish_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'approved_as_new'::text])));
ALTER TABLE public.promotion_requests ADD CONSTRAINT publish_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_key_window_start_key UNIQUE (key, window_start);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);
ALTER TABLE public.scoring_profiles ADD CONSTRAINT scoring_profiles_weights_sum_100 CHECK (((((((((((((weights ->> 'query_completeness'::text))::integer + ((weights ->> 'mitre_mapping'::text))::integer) + ((weights ->> 'peer_review'::text))::integer) + ((weights ->> 'description_quality'::text))::integer) + ((weights ->> 'false_positive_guidance'::text))::integer) + ((weights ->> 'data_sources'::text))::integer) + ((weights ->> 'threat_intel'::text))::integer) + ((weights ->> 'test_coverage'::text))::integer) + ((weights ->> 'investigation_steps'::text))::integer) + ((weights ->> 'references'::text))::integer) = 100));
ALTER TABLE public.scoring_profiles ADD CONSTRAINT scoring_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_feed_id_external_id_key UNIQUE (feed_id, external_id);
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_digest_status_check CHECK ((digest_status = ANY (ARRAY['harvested'::text, 'classified'::text, 'queued'::text, 'digesting'::text, 'ready'::text, 'skipped'::text, 'classify_failed'::text, 'digest_failed'::text, 'extract_failed'::text])));
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_intel_feeds ADD CONSTRAINT threat_intel_feeds_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_intel_feeds ADD CONSTRAINT threat_intel_feeds_feed_type_check CHECK ((feed_type = ANY (ARRAY['rss'::text, 'taxii'::text])));
ALTER TABLE public.threat_intel_feeds ADD CONSTRAINT threat_intel_feeds_quality_rating_check CHECK (((quality_rating >= 1) AND (quality_rating <= 5)));
ALTER TABLE public.threat_intel_report_detections ADD CONSTRAINT threat_intel_report_detections_created_from_check CHECK ((created_from = ANY (ARRAY['ttp'::text, 'rule'::text, 'manual'::text])));
ALTER TABLE public.threat_intel_report_detections ADD CONSTRAINT threat_intel_report_detections_report_id_detection_id_key UNIQUE (report_id, detection_id);
ALTER TABLE public.threat_intel_report_detections ADD CONSTRAINT threat_intel_report_detections_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_source_type_check CHECK ((source_type = ANY (ARRAY['url'::text, 'paste'::text])));
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'actioned'::text, 'deferred'::text, 'dismissed'::text])));
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'auto'::text])));
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT report_review_note_max_length CHECK ((char_length(review_note) <= 2000));
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_research_events ADD CONSTRAINT threat_research_events_agent_check CHECK ((agent = ANY (ARRAY['orchestrator'::text, 'preflight'::text, 'dossier'::text, 'research'::text, 'attack-researcher'::text, 'planner'::text, 'detection-engineer'::text, 'qa'::text])));
ALTER TABLE public.threat_research_events ADD CONSTRAINT threat_research_events_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_research_jobs ADD CONSTRAINT threat_research_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_research_jobs ADD CONSTRAINT threat_research_jobs_session_id_phase_behaviour_id_key UNIQUE (session_id, phase, behaviour_id);
-- Must precede trjc_session_fk / trvs_session_fk / trpb_session_fk below.
-- PostgreSQL requires the referenced column to already carry a unique
-- constraint when a FOREIGN KEY is created, and this primary key used to be
-- declared eight lines AFTER the three FKs that reference it. Prod never
-- noticed -- it was built incrementally by migrations, where ordering is
-- irrelevant -- but schema.sql is what a fresh clone applies, so standing the
-- backend up from zero failed on "no unique constraint matching given keys
-- for referenced table threat_research_sessions".
ALTER TABLE public.threat_research_sessions ADD CONSTRAINT threat_research_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_research_job_checkpoints ADD CONSTRAINT threat_research_job_checkpoints_pkey PRIMARY KEY (job_id);
ALTER TABLE public.threat_research_job_checkpoints ADD CONSTRAINT trjc_job_fk FOREIGN KEY (job_id) REFERENCES public.threat_research_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_job_checkpoints ADD CONSTRAINT trjc_session_fk FOREIGN KEY (session_id) REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_vendor_searches ADD CONSTRAINT threat_research_vendor_searches_pkey PRIMARY KEY (id);
ALTER TABLE public.threat_research_vendor_searches ADD CONSTRAINT trvs_session_fk FOREIGN KEY (session_id) REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_phase_budgets ADD CONSTRAINT threat_research_phase_budgets_pkey PRIMARY KEY (session_id, phase);
ALTER TABLE public.threat_research_phase_budgets ADD CONSTRAINT trpb_session_fk FOREIGN KEY (session_id) REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_jobs ADD CONSTRAINT threat_research_jobs_phase_check CHECK ((phase = ANY (ARRAY['preflight'::text, 'research'::text, 'attack_research'::text, 'opportunity_planning'::text, 'detection'::text, 'qa'::text, 'finalise'::text])));
ALTER TABLE public.threat_research_jobs ADD CONSTRAINT threat_research_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public.threat_research_sessions ADD CONSTRAINT threat_research_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'partial'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.user_dashboards ADD CONSTRAINT user_dashboards_pkey PRIMARY KEY (id);
ALTER TABLE public.user_invitations ADD CONSTRAINT team_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.user_invitations ADD CONSTRAINT team_invitations_token_key UNIQUE (token);
ALTER TABLE public.user_invitations ADD CONSTRAINT user_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'lead'::text, 'analyst'::text, 'viewer'::text])));
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ai_budget_overrides ADD CONSTRAINT ai_budget_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ai_budget_overrides ADD CONSTRAINT ai_budget_overrides_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES ai_budgets(id) ON DELETE CASCADE;
ALTER TABLE public.ai_budgets ADD CONSTRAINT ai_budgets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.analysis_reports ADD CONSTRAINT analysis_reports_previous_report_id_fkey FOREIGN KEY (previous_report_id) REFERENCES analysis_reports(id) ON DELETE SET NULL;
ALTER TABLE public.analysis_reports ADD CONSTRAINT analysis_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.auto_digest_campaign_articles ADD CONSTRAINT auto_digest_campaign_articles_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES auto_digest_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.auto_digest_campaign_articles ADD CONSTRAINT auto_digest_campaign_articles_report_id_fkey FOREIGN KEY (report_id) REFERENCES threat_intel_reports(id) ON DELETE CASCADE;
ALTER TABLE public.auto_digest_campaigns ADD CONSTRAINT auto_digest_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.auto_digest_campaigns ADD CONSTRAINT auto_digest_campaigns_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_active_entry_id_fkey FOREIGN KEY (active_entry_id) REFERENCES public.threat_intel_feed_entries(id) ON DELETE SET NULL;
ALTER TABLE public.auto_digest_run_events ADD CONSTRAINT auto_digest_run_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.auto_digest_run_events ADD CONSTRAINT auto_digest_run_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES auto_digest_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.auto_digest_settings ADD CONSTRAINT auto_digest_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.batch_embedding_jobs ADD CONSTRAINT batch_embedding_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bulk_import_jobs ADD CONSTRAINT bulk_import_jobs_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.crowdstrike_finetune_runs ADD CONSTRAINT crowdstrike_finetune_runs_preflight_run_id_fkey FOREIGN KEY (preflight_run_id) REFERENCES detection_preflight_runs(id) ON DELETE SET NULL;
ALTER TABLE public.crowdstrike_finetune_query_jobs ADD CONSTRAINT crowdstrike_finetune_query_jobs_run_id_fkey FOREIGN KEY (run_id) REFERENCES crowdstrike_finetune_runs(id) ON DELETE CASCADE;
ALTER TABLE public.defender_xdr_columns ADD CONSTRAINT defender_xdr_columns_table_name_fkey FOREIGN KEY (table_name) REFERENCES defender_xdr_tables(name) ON DELETE CASCADE;
ALTER TABLE public.deployment_history ADD CONSTRAINT deployment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.deployment_history ADD CONSTRAINT deployment_history_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.detection_assignments ADD CONSTRAINT detection_assignments_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_assignments ADD CONSTRAINT detection_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.detection_assignments ADD CONSTRAINT detection_assignments_unassigned_by_fkey FOREIGN KEY (unassigned_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.detection_assignments ADD CONSTRAINT detection_assignments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES detection_comments(id) ON DELETE CASCADE;
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_comments ADD CONSTRAINT detection_comments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.detection_decisions ADD CONSTRAINT detection_decisions_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_decisions ADD CONSTRAINT detection_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_drift ADD CONSTRAINT detection_drift_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detection_embeddings ADD CONSTRAINT detection_embeddings_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.detection_finetune_runs ADD CONSTRAINT detection_finetune_runs_preflight_run_id_fkey FOREIGN KEY (preflight_run_id) REFERENCES detection_preflight_runs(id) ON DELETE SET NULL;
ALTER TABLE public.detection_packs ADD CONSTRAINT detection_packs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detection_patterns ADD CONSTRAINT detection_patterns_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_patterns ADD CONSTRAINT detection_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.detection_preflight_runs ADD CONSTRAINT detection_preflight_runs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.detection_reviews ADD CONSTRAINT detection_reviews_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.detection_reviews ADD CONSTRAINT detection_reviews_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.detection_reviews ADD CONSTRAINT detection_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_published_to_id_fkey FOREIGN KEY (promoted_to_id) REFERENCES detections(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_research_session_id_fkey FOREIGN KEY (research_session_id) REFERENCES threat_research_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_source_rule_id_fkey FOREIGN KEY (source_rule_id) REFERENCES detections(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.detections ADD CONSTRAINT detections_bulk_import_id_fkey FOREIGN KEY (bulk_import_id) REFERENCES bulk_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE public.environment_profiles ADD CONSTRAINT environment_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.integration_credentials ADD CONSTRAINT integration_credentials_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.mitre_embeddings ADD CONSTRAINT mitre_embeddings_stix_id_fkey FOREIGN KEY (stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_relationships ADD CONSTRAINT mitre_relationships_target_ref_fkey FOREIGN KEY (target_ref) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_relationships ADD CONSTRAINT mitre_relationships_source_ref_fkey FOREIGN KEY (source_ref) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_technique_data_sources ADD CONSTRAINT mitre_technique_data_sources_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_technique_groups ADD CONSTRAINT mitre_technique_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.mitre_technique_platforms ADD CONSTRAINT mitre_technique_platforms_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_technique_tactics ADD CONSTRAINT mitre_technique_tactics_tactic_stix_id_fkey FOREIGN KEY (tactic_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.mitre_technique_tactics ADD CONSTRAINT mitre_technique_tactics_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE;
ALTER TABLE public.pack_deploy_job_items ADD CONSTRAINT pack_deploy_job_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES pack_deploy_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.pack_deploy_jobs ADD CONSTRAINT pack_deploy_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.pack_deploy_jobs ADD CONSTRAINT pack_deploy_jobs_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES detection_packs(id) ON DELETE SET NULL;
ALTER TABLE public.pack_deploy_jobs ADD CONSTRAINT pack_deploy_jobs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE;
ALTER TABLE public.pack_detections ADD CONSTRAINT pack_detections_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES detection_packs(id) ON DELETE CASCADE;
ALTER TABLE public.pack_detections ADD CONSTRAINT pack_detections_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.pack_versions ADD CONSTRAINT pack_versions_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES detection_packs(id) ON DELETE SET NULL;
ALTER TABLE public.pack_versions ADD CONSTRAINT pack_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_target_rule_id_fkey FOREIGN KEY (target_rule_id) REFERENCES detections(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_result_rule_id_fkey FOREIGN KEY (result_rule_id) REFERENCES detections(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_requests ADD CONSTRAINT promotion_requests_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.scoring_profiles ADD CONSTRAINT scoring_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_auto_digest_report_id_fkey FOREIGN KEY (auto_digest_report_id) REFERENCES threat_intel_reports(id) ON DELETE SET NULL;
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES threat_intel_feeds(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_feed_entries ADD CONSTRAINT threat_intel_feed_entries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES auto_digest_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.threat_intel_feeds ADD CONSTRAINT threat_intel_feeds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_feeds ADD CONSTRAINT threat_intel_feeds_curated_source_id_fkey FOREIGN KEY (curated_source_id) REFERENCES curated_feed_sources(id) ON DELETE SET NULL;
ALTER TABLE public.threat_intel_report_detections ADD CONSTRAINT threat_intel_report_detections_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_report_detections ADD CONSTRAINT threat_intel_report_detections_report_id_fkey FOREIGN KEY (report_id) REFERENCES threat_intel_reports(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.threat_intel_reports ADD CONSTRAINT threat_intel_reports_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES auto_digest_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.threat_research_events ADD CONSTRAINT threat_research_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.threat_research_events ADD CONSTRAINT threat_research_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES threat_research_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_jobs ADD CONSTRAINT threat_research_jobs_session_id_fkey FOREIGN KEY (session_id) REFERENCES threat_research_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.threat_research_sessions ADD CONSTRAINT threat_research_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_dashboards ADD CONSTRAINT user_dashboards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_invitations ADD CONSTRAINT team_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_publish_request_id_fkey FOREIGN KEY (publish_request_id) REFERENCES promotion_requests(id) ON DELETE SET NULL;
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE SET NULL;
ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_team_invitations_token ON public.user_invitations USING btree (token);
CREATE INDEX idx_team_invitations_email ON public.user_invitations USING btree (email);
CREATE INDEX idx_detection_assignments_detection ON public.detection_assignments USING btree (detection_id);
CREATE INDEX idx_detection_assignments_assigned_to ON public.detection_assignments USING btree (assigned_to);
CREATE INDEX idx_detection_assignments_active ON public.detection_assignments USING btree (detection_id) WHERE (unassigned_at IS NULL);
CREATE INDEX idx_mitre_objects_type ON public.mitre_objects USING btree (type);
CREATE INDEX idx_mitre_objects_mitre_id ON public.mitre_objects USING btree (mitre_id);
CREATE INDEX idx_mitre_objects_name ON public.mitre_objects USING btree (name);
CREATE INDEX idx_mitre_objects_deprecated ON public.mitre_objects USING btree (deprecated) WHERE (deprecated = false);
CREATE INDEX idx_mitre_objects_revoked ON public.mitre_objects USING btree (revoked) WHERE (revoked = false);
CREATE INDEX idx_mitre_objects_data_gin ON public.mitre_objects USING gin (data);
CREATE INDEX idx_mitre_objects_name_trgm ON public.mitre_objects USING gin (name gin_trgm_ops);
CREATE INDEX idx_mitre_objects_description_trgm ON public.mitre_objects USING gin (description gin_trgm_ops);
CREATE INDEX idx_mitre_objects_type_deprecated ON public.mitre_objects USING btree (type, deprecated);
CREATE INDEX idx_mitre_objects_stix_id ON public.mitre_objects USING btree (stix_id);
CREATE INDEX idx_mitre_objects_targeting_intel ON public.mitre_objects USING gin (((data -> 'targeting_intel'::text))) WHERE (type = 'intrusion-set'::text);
CREATE INDEX idx_mitre_objects_origin_country ON public.mitre_objects USING btree ((((data -> 'targeting_intel'::text) ->> 'origin_country'::text))) WHERE ((type = 'intrusion-set'::text) AND ((data -> 'targeting_intel'::text) IS NOT NULL));
CREATE INDEX idx_mitre_relationships_type ON public.mitre_relationships USING btree (relationship_type);
CREATE INDEX idx_mitre_relationships_source ON public.mitre_relationships USING btree (source_ref);
CREATE INDEX idx_mitre_relationships_target ON public.mitre_relationships USING btree (target_ref);
CREATE INDEX idx_mitre_relationships_source_type ON public.mitre_relationships USING btree (source_ref, relationship_type);
CREATE INDEX idx_mitre_relationships_target_type ON public.mitre_relationships USING btree (target_ref, relationship_type);
CREATE INDEX idx_mitre_technique_tactics_technique ON public.mitre_technique_tactics USING btree (technique_stix_id);
CREATE INDEX idx_mitre_technique_tactics_tactic ON public.mitre_technique_tactics USING btree (tactic_stix_id);
CREATE INDEX idx_detection_comments_detection ON public.detection_comments USING btree (detection_id);
CREATE INDEX idx_detection_comments_user ON public.detection_comments USING btree (user_id);
CREATE INDEX idx_detection_comments_parent ON public.detection_comments USING btree (parent_id);
CREATE INDEX idx_detection_comments_created ON public.detection_comments USING btree (created_at DESC);
CREATE INDEX idx_user_notifications_detection_id ON public.user_notifications USING btree (detection_id);
CREATE INDEX idx_user_notifications_user ON public.user_notifications USING btree (user_id);
CREATE INDEX idx_user_notifications_unread ON public.user_notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_detection_packs_active ON public.detection_packs USING btree (is_active);
CREATE INDEX idx_detection_packs_created_by ON public.detection_packs USING btree (created_by);
CREATE INDEX idx_pack_detections_pack ON public.pack_detections USING btree (pack_id);
CREATE INDEX idx_pack_detections_detection ON public.pack_detections USING btree (detection_id);
CREATE INDEX idx_promotion_requests_result_rule_id ON public.promotion_requests USING btree (result_rule_id) WHERE (result_rule_id IS NOT NULL);
CREATE INDEX idx_promotion_requests_target_rule_id ON public.promotion_requests USING btree (target_rule_id) WHERE (target_rule_id IS NOT NULL);
CREATE INDEX idx_publish_requests_status ON public.promotion_requests USING btree (status);
CREATE INDEX idx_publish_requests_submitted_by ON public.promotion_requests USING btree (submitted_by);
CREATE INDEX idx_publish_requests_detection ON public.promotion_requests USING btree (detection_id);
CREATE INDEX idx_detection_reviews_detection ON public.detection_reviews USING btree (detection_id);
CREATE INDEX idx_detection_reviews_reviewer ON public.detection_reviews USING btree (reviewer_id);
CREATE INDEX idx_detection_reviews_status ON public.detection_reviews USING btree (status);
CREATE INDEX idx_detection_reviews_requested_by ON public.detection_reviews USING btree (requested_by);
CREATE INDEX threat_research_sessions_user_idx ON public.threat_research_sessions USING btree (user_id, created_at DESC);
CREATE INDEX threat_research_sessions_status_idx ON public.threat_research_sessions USING btree (status, created_at DESC) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));
CREATE INDEX idx_activity_log_user ON public.activity_log USING btree (user_id);
CREATE INDEX idx_activity_log_entity ON public.activity_log USING btree (entity_type, entity_id);
CREATE INDEX idx_activity_log_action ON public.activity_log USING btree (action);
CREATE INDEX idx_activity_log_created ON public.activity_log USING btree (created_at DESC);
CREATE INDEX idx_rate_limits_key_window ON public.rate_limits USING btree (key, window_start);
CREATE INDEX threat_research_events_session_idx ON public.threat_research_events USING btree (session_id, created_at);
CREATE INDEX idx_threat_intel_reports_user ON public.threat_intel_reports USING btree (user_id);
CREATE INDEX idx_threat_intel_reports_updated ON public.threat_intel_reports USING btree (updated_at DESC);
CREATE INDEX idx_threat_intel_reports_threat_level ON public.threat_intel_reports USING btree (threat_level);
CREATE INDEX idx_threat_intel_reports_coverage ON public.threat_intel_reports USING btree (coverage_percent);
CREATE INDEX idx_reports_auto_digest ON public.threat_intel_reports USING btree (user_id, source, review_status);
CREATE UNIQUE INDEX idx_reports_user_source_url ON public.threat_intel_reports USING btree (user_id, source_url) WHERE (source_url IS NOT NULL);
CREATE INDEX idx_defender_xdr_columns_name ON public.defender_xdr_columns USING btree (column_name);
CREATE UNIQUE INDEX idx_scoring_snapshot_active ON public.mitre_scoring_snapshot USING btree (is_active) WHERE (is_active = true);
CREATE INDEX threat_research_jobs_pending_idx ON public.threat_research_jobs USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX threat_research_jobs_session_phase_idx ON public.threat_research_jobs USING btree (session_id, phase, status);
CREATE INDEX threat_research_jobs_running_started_at_idx ON public.threat_research_jobs USING btree (started_at) WHERE (status = 'running'::text);
CREATE INDEX idx_bulk_import_jobs_user_id ON public.bulk_import_jobs USING btree (user_id);
CREATE INDEX idx_bulk_import_jobs_status ON public.bulk_import_jobs USING btree (status);
CREATE INDEX idx_bulk_import_jobs_created_at ON public.bulk_import_jobs USING btree (created_at DESC);
CREATE INDEX idx_report_detections_report ON public.threat_intel_report_detections USING btree (report_id);
CREATE INDEX idx_report_detections_detection ON public.threat_intel_report_detections USING btree (detection_id);
CREATE INDEX idx_detections_promoted_to_id ON public.detections USING btree (promoted_to_id) WHERE (promoted_to_id IS NOT NULL);
CREATE INDEX idx_detections_assigned_to ON public.detections USING btree (assigned_to);
CREATE INDEX idx_detections_review_status ON public.detections USING btree (review_status);
CREATE INDEX idx_detections_user_id ON public.detections USING btree (user_id);
CREATE INDEX idx_detections_status ON public.detections USING btree (status);
CREATE INDEX idx_detections_severity ON public.detections USING btree (severity);
CREATE INDEX idx_detections_name_trgm ON public.detections USING gin (name gin_trgm_ops);
CREATE INDEX idx_detections_description_trgm ON public.detections USING gin (description gin_trgm_ops);
CREATE INDEX idx_detections_mitre_ids ON public.detections USING gin ("mitreAttackIds");
CREATE INDEX idx_detections_tags ON public.detections USING gin (tags);
CREATE INDEX idx_detections_queries ON public.detections USING gin (queries);
CREATE INDEX idx_detections_linked_groups ON public.detections USING gin ("linkedGroups");
CREATE INDEX idx_detections_library_type ON public.detections USING btree (library_type);
CREATE INDEX idx_detections_source ON public.detections USING btree (source);
CREATE INDEX idx_detections_source_rule_id ON public.detections USING btree (source_rule_id);
CREATE INDEX idx_detections_publish_status ON public.detections USING btree (promotion_status);
CREATE INDEX idx_detections_user_library ON public.detections USING btree (user_id, library_type);
CREATE INDEX idx_detections_external_id ON public.detections USING btree (external_id);
CREATE INDEX detections_research_session_idx ON public.detections USING btree (research_session_id) WHERE (research_session_id IS NOT NULL);
CREATE INDEX idx_detections_bulk_import_id ON public.detections USING btree (bulk_import_id) WHERE (bulk_import_id IS NOT NULL);
CREATE INDEX idx_detections_vendor_metadata ON public.detections USING gin (vendor_metadata);
CREATE INDEX detections_fts_idx ON public.detections USING gin (fts_vector);
CREATE INDEX idx_detections_visibility ON public.detections USING btree (library_type, visibility);
CREATE INDEX idx_detections_library_user_updated ON public.detections USING btree (library_type, user_id, "updatedDate" DESC);
CREATE INDEX idx_enrichment_audit_status ON public.enrichment_audit USING btree (status);
CREATE INDEX idx_enrichment_audit_applied_at ON public.enrichment_audit USING btree (applied_at DESC);
CREATE INDEX idx_enrichment_audit_type ON public.enrichment_audit USING btree (enrichment_type);
CREATE INDEX idx_mitre_technique_platforms_technique ON public.mitre_technique_platforms USING btree (technique_stix_id);
CREATE INDEX idx_mitre_technique_data_sources_technique ON public.mitre_technique_data_sources USING btree (technique_stix_id);
CREATE INDEX idx_deployment_history_user_id ON public.deployment_history USING btree (user_id);
CREATE INDEX idx_deployment_history_integration_id ON public.deployment_history USING btree (integration_id);
CREATE INDEX idx_deployment_history_detection_id ON public.deployment_history USING btree (detection_id);
CREATE UNIQUE INDEX idx_deployment_create_identity ON public.deployment_history USING btree (detection_id, integration_id, vendor_rule_id) WHERE ((action = 'create'::text) AND (status = 'success'::text));
CREATE INDEX idx_integrations_user_id ON public.integrations USING btree (user_id);
CREATE INDEX idx_integrations_provider ON public.integrations USING btree (provider);
CREATE INDEX idx_integration_credentials_integration_id ON public.integration_credentials USING btree (integration_id);
CREATE INDEX detection_embeddings_hnsw_idx ON public.detection_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX detection_embeddings_detection_id_idx ON public.detection_embeddings USING btree (detection_id);
CREATE INDEX mitre_embeddings_hnsw_idx ON public.mitre_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX mitre_embeddings_mitre_id_idx ON public.mitre_embeddings USING btree (mitre_id);
CREATE INDEX mitre_embeddings_object_type_idx ON public.mitre_embeddings USING btree (type);
CREATE INDEX idx_feed_entries_digest_status ON public.threat_intel_feed_entries USING btree (user_id, digest_status);
CREATE UNIQUE INDEX idx_user_dashboards_unique_name ON public.user_dashboards USING btree (user_id, name);
CREATE INDEX idx_user_dashboards_user_id ON public.user_dashboards USING btree (user_id);
CREATE UNIQUE INDEX idx_scoring_profiles_default ON public.scoring_profiles USING btree ((true)) WHERE (is_default = true);
CREATE INDEX idx_audit_events_user_id ON public.audit_events USING btree (user_id);
CREATE INDEX idx_audit_events_entity ON public.audit_events USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_events_action ON public.audit_events USING btree (action);
CREATE INDEX idx_audit_events_created_at ON public.audit_events USING btree (created_at DESC);
CREATE INDEX idx_audit_events_changed_fields ON public.audit_events USING gin (changed_fields);
CREATE INDEX idx_batch_embedding_jobs_status ON public.batch_embedding_jobs USING btree (status);
CREATE INDEX detection_preflight_runs_detection_idx ON public.detection_preflight_runs USING btree (detection_id, created_at DESC);
CREATE INDEX idx_environment_profiles_user_id ON public.environment_profiles USING btree (user_id);
CREATE INDEX idx_reports_user ON public.analysis_reports USING btree (user_id);
CREATE INDEX idx_reports_type ON public.analysis_reports USING btree (report_type);
CREATE INDEX idx_reports_playbook ON public.analysis_reports USING btree (playbook_id);
CREATE INDEX idx_reports_created ON public.analysis_reports USING btree (created_at DESC);
CREATE INDEX idx_reports_trend ON public.analysis_reports USING btree (user_id, playbook_id, created_at DESC);
CREATE INDEX idx_decisions_detection ON public.detection_decisions USING btree (detection_id);
CREATE INDEX idx_decisions_user ON public.detection_decisions USING btree (user_id);
CREATE INDEX idx_decisions_type ON public.detection_decisions USING btree (decision_type);
CREATE INDEX idx_decisions_technique ON public.detection_decisions USING btree (technique_id);
CREATE INDEX idx_decisions_created ON public.detection_decisions USING btree (created_at DESC);
CREATE INDEX idx_detection_patterns_detection_id ON public.detection_patterns USING btree (detection_id);
CREATE INDEX idx_patterns_user ON public.detection_patterns USING btree (user_id);
CREATE INDEX idx_patterns_techniques ON public.detection_patterns USING gin (technique_ids);
CREATE INDEX idx_patterns_log_sources ON public.detection_patterns USING gin (log_sources);
CREATE INDEX idx_patterns_platforms ON public.detection_patterns USING gin (platforms);
CREATE INDEX idx_patterns_categories ON public.detection_patterns USING gin (detection_categories);
CREATE INDEX idx_patterns_languages ON public.detection_patterns USING gin (query_languages);
CREATE INDEX idx_campaigns_review ON public.auto_digest_campaigns USING btree (user_id, review_status);
CREATE INDEX crowdstrike_finetune_runs_detection_idx ON public.crowdstrike_finetune_runs USING btree (detection_id, created_at DESC);
CREATE INDEX crowdstrike_finetune_runs_integration_idx ON public.crowdstrike_finetune_runs USING btree (integration_id);
CREATE INDEX crowdstrike_finetune_runs_preflight_idx ON public.crowdstrike_finetune_runs USING btree (preflight_run_id);
CREATE UNIQUE INDEX unique_active_crowdstrike_finetune_run ON public.crowdstrike_finetune_runs USING btree (detection_id, user_id) WHERE (status = 'running'::text);
CREATE INDEX crowdstrike_finetune_query_jobs_run_idx ON public.crowdstrike_finetune_query_jobs USING btree (run_id, created_at);
CREATE INDEX detection_finetune_runs_detection_idx ON public.detection_finetune_runs USING btree (detection_id, created_at DESC);
CREATE UNIQUE INDEX unique_active_finetune_run ON public.detection_finetune_runs USING btree (detection_id, user_id) WHERE (status = 'running'::text);
CREATE INDEX idx_access_requests_email ON public.access_requests USING btree (email, created_at DESC);
CREATE INDEX idx_pack_deploy_jobs_integration_id ON public.pack_deploy_jobs USING btree (integration_id);
CREATE INDEX idx_pack_deploy_jobs_pack_id ON public.pack_deploy_jobs USING btree (pack_id);
CREATE INDEX idx_pack_deploy_jobs_status ON public.pack_deploy_jobs USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));
CREATE INDEX idx_pack_deploy_jobs_created_by ON public.pack_deploy_jobs USING btree (created_by, created_at DESC);
CREATE INDEX idx_pack_deploy_job_items_job ON public.pack_deploy_job_items USING btree (job_id, status);
CREATE INDEX idx_pack_versions_created_by ON public.pack_versions USING btree (created_by);
CREATE UNIQUE INDEX uq_pack_versions_pack_version ON public.pack_versions USING btree (pack_id, version_number) WHERE (pack_id IS NOT NULL);
CREATE INDEX idx_pack_versions_pack_id ON public.pack_versions USING btree (pack_id, version_number DESC);
CREATE INDEX idx_pack_versions_created_at ON public.pack_versions USING btree (created_at DESC);
CREATE INDEX idx_mitre_technique_groups_key ON public.mitre_technique_groups USING btree (key);
CREATE INDEX ai_usage_events_user_created_idx ON public.ai_usage_events USING btree (user_id, created_at DESC);
CREATE INDEX ai_usage_events_feature_created_idx ON public.ai_usage_events USING btree (feature, created_at DESC);
CREATE INDEX ai_usage_events_model_created_idx ON public.ai_usage_events USING btree (model, created_at DESC);
CREATE INDEX ai_usage_events_created_idx ON public.ai_usage_events USING btree (created_at DESC);
CREATE INDEX ai_usage_daily_user_day_idx ON public.ai_usage_daily USING btree (user_id, day DESC);
CREATE UNIQUE INDEX ai_budgets_org_unique ON public.ai_budgets USING btree (period) WHERE (scope = 'org'::text);
CREATE UNIQUE INDEX ai_budgets_scoped_unique ON public.ai_budgets USING btree (scope, scope_value, period) WHERE (scope <> 'org'::text);
CREATE INDEX ai_budget_overrides_active_idx ON public.ai_budget_overrides USING btree (budget_id, expires_at);
CREATE INDEX detection_drift_user_state_idx ON public.detection_drift USING btree (user_id, drift_state);
CREATE INDEX detection_drift_source_idx ON public.detection_drift USING btree (source_url, source_vendor, target_library);
CREATE INDEX detection_drift_detection_id_idx ON public.detection_drift USING btree (detection_id);
CREATE INDEX auto_digest_run_events_job_created_idx ON public.auto_digest_run_events USING btree (job_id, created_at);
CREATE INDEX auto_digest_run_events_failures_idx ON public.auto_digest_run_events USING btree (user_id, event_type, created_at DESC) WHERE (event_type = ANY (ARRAY['article_classify_failed'::text, 'article_digest_failed'::text, 'feed_failed'::text]));
CREATE INDEX auto_digest_run_events_created_idx ON public.auto_digest_run_events USING btree (created_at DESC);

-- ============================================================
-- Functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_promotion(p_request_id uuid, p_admin_id uuid DEFAULT auth.uid(), p_action text DEFAULT 'approve'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request RECORD;
  v_detection RECORD;
  v_target_detection_id TEXT;
  v_notification_type TEXT;
  v_notification_title TEXT;
  v_notification_message TEXT;
  v_is_update BOOLEAN := false;
  v_current_version INTEGER;
BEGIN
  -- HARDENING: ignore caller-supplied p_admin_id; bind to the JWT identity so
  -- the role check below validates the real caller, not a spoofed admin UUID.
  p_admin_id := auth.uid();
  IF p_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_id AND role IN ('owner', 'admin', 'lead')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin or Lead access required');
  END IF;

  SELECT * INTO v_request FROM promotion_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request already processed');
  END IF;

  SELECT * INTO v_detection FROM detections WHERE id = v_request.detection_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Detection not found');
  END IF;

  IF p_action = 'approve' THEN
    IF v_detection.promoted_to_id IS NOT NULL THEN
      v_target_detection_id := v_detection.promoted_to_id;
      v_is_update := true;
      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'production') THEN
        v_target_detection_id := gen_random_uuid()::text;
        v_is_update := false;
      END IF;
    ELSIF v_detection.source_rule_id IS NOT NULL THEN
      v_target_detection_id := v_detection.source_rule_id;
      v_is_update := true;
      IF NOT EXISTS (SELECT 1 FROM detections WHERE id = v_target_detection_id AND library_type = 'production') THEN
        v_target_detection_id := gen_random_uuid()::text;
        v_is_update := false;
      END IF;
    ELSE
      v_target_detection_id := gen_random_uuid()::text;
      v_is_update := false;
    END IF;

    IF v_is_update THEN
      SELECT COALESCE(version, 1) INTO v_current_version FROM detections WHERE id = v_target_detection_id;
      UPDATE detections
      SET
        name = v_detection.name,
        description = v_detection.description,
        status = v_detection.status,
        severity = v_detection.severity,
        author = v_detection.author,
        "detectionType" = v_detection."detectionType",
        "logSource" = v_detection."logSource",
        "logSources" = v_detection."logSources",
        technology = v_detection.technology,
        "queryLanguage" = v_detection."queryLanguage",
        "detectionQuery" = v_detection."detectionQuery",
        queries = v_detection.queries,
        "queryExplanation" = v_detection."queryExplanation",
        "mitreAttackIds" = v_detection."mitreAttackIds",
        "mitreTactics" = v_detection."mitreTactics",
        "mitreTechniques" = v_detection."mitreTechniques",
        "linkedGroups" = v_detection."linkedGroups",
        "linkedSoftware" = v_detection."linkedSoftware",
        "linkedCampaigns" = v_detection."linkedCampaigns",
        "threatActors" = v_detection."threatActors",
        campaigns = v_detection.campaigns,
        software = v_detection.software,
        "associatedCVEs" = v_detection."associatedCVEs",
        "dataSources" = v_detection."dataSources",
        "dataComponents" = v_detection."dataComponents",
        platforms = v_detection.platforms,
        "investigationSteps" = v_detection."investigationSteps",
        "responseActions" = v_detection."responseActions",
        "falsePositiveGuidance" = v_detection."falsePositiveGuidance",
        prerequisites = v_detection.prerequisites,
        caveats = v_detection.caveats,
        "fineTuning" = v_detection."fineTuning",
        "testedAndValidated" = v_detection."testedAndValidated",
        "testCases" = v_detection."testCases",
        "qualityScore" = v_detection."qualityScore",
        "references" = v_detection."references",
        tags = v_detection.tags,
        "updatedDate" = NOW(),
        version = v_current_version + 1
      WHERE id = v_target_detection_id;
      v_notification_message := 'Your update to "' || v_detection.name || '" has been approved and the Production Library rule has been updated.';
    ELSE
      INSERT INTO detections (
        id, name, description, status, severity, author, version,
        "createdDate", "updatedDate", "detectionType", "logSource", "logSources", technology,
        "queryLanguage", "detectionQuery", queries, "queryExplanation",
        "mitreAttackIds", "mitreTactics", "mitreTechniques",
        "linkedGroups", "linkedSoftware", "linkedCampaigns",
        "threatActors", campaigns, software, "associatedCVEs",
        "dataSources", "dataComponents", platforms,
        "investigationSteps", "responseActions", "falsePositiveGuidance",
        prerequisites, caveats, "fineTuning",
        "testedAndValidated", "testCases", "qualityScore",
        "references", tags,
        library_type, source, user_id
      ) VALUES (
        v_target_detection_id,
        v_detection.name, v_detection.description, v_detection.status, v_detection.severity, v_detection.author,
        1, NOW(), NOW(),
        v_detection."detectionType", v_detection."logSource", v_detection."logSources", v_detection.technology,
        v_detection."queryLanguage", v_detection."detectionQuery", v_detection.queries, v_detection."queryExplanation",
        v_detection."mitreAttackIds", v_detection."mitreTactics", v_detection."mitreTechniques",
        v_detection."linkedGroups", v_detection."linkedSoftware", v_detection."linkedCampaigns",
        v_detection."threatActors", v_detection.campaigns, v_detection.software, v_detection."associatedCVEs",
        v_detection."dataSources", v_detection."dataComponents", v_detection.platforms,
        v_detection."investigationSteps", v_detection."responseActions", v_detection."falsePositiveGuidance",
        v_detection.prerequisites, v_detection.caveats, v_detection."fineTuning",
        v_detection."testedAndValidated", v_detection."testCases", v_detection."qualityScore",
        v_detection."references", v_detection.tags,
        'production', 'community', v_request.submitted_by
      );
      v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and promoted to the Production Library.';
    END IF;

    UPDATE detections
    SET promotion_status = 'promoted', promoted_to_id = v_target_detection_id, promoted_at = NOW(), "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'approved', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, result_rule_id = v_target_detection_id, updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_approved';
    v_notification_title := CASE WHEN v_is_update THEN 'Production Update Approved' ELSE 'Promoted to Production' END;

  ELSIF p_action = 'approve_as_new' THEN
    v_target_detection_id := gen_random_uuid()::text;
    INSERT INTO detections (
      id, name, description, status, severity, author, version,
      "createdDate", "updatedDate", "detectionType", "logSource", "logSources", technology,
      "queryLanguage", "detectionQuery", queries, "queryExplanation",
      "mitreAttackIds", "mitreTactics", "mitreTechniques",
      "linkedGroups", "linkedSoftware", "linkedCampaigns",
      "threatActors", campaigns, software, "associatedCVEs",
      "dataSources", "dataComponents", platforms,
      "investigationSteps", "responseActions", "falsePositiveGuidance",
      prerequisites, caveats, "fineTuning",
      "testedAndValidated", "testCases", "qualityScore",
      "references", tags,
      library_type, source, user_id
    ) VALUES (
      v_target_detection_id,
      v_detection.name, v_detection.description, v_detection.status, v_detection.severity, v_detection.author,
      1, NOW(), NOW(),
      v_detection."detectionType", v_detection."logSource", v_detection."logSources", v_detection.technology,
      v_detection."queryLanguage", v_detection."detectionQuery", v_detection.queries, v_detection."queryExplanation",
      v_detection."mitreAttackIds", v_detection."mitreTactics", v_detection."mitreTechniques",
      v_detection."linkedGroups", v_detection."linkedSoftware", v_detection."linkedCampaigns",
      v_detection."threatActors", v_detection.campaigns, v_detection.software, v_detection."associatedCVEs",
      v_detection."dataSources", v_detection."dataComponents", v_detection.platforms,
      v_detection."investigationSteps", v_detection."responseActions", v_detection."falsePositiveGuidance",
      v_detection.prerequisites, v_detection.caveats, v_detection."fineTuning",
      v_detection."testedAndValidated", v_detection."testCases", v_detection."qualityScore",
      v_detection."references", v_detection.tags,
      'production', 'community', v_request.submitted_by
    );

    UPDATE detections
    SET promotion_status = 'promoted', promoted_to_id = v_target_detection_id, promoted_at = NOW(), "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'approved', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, result_rule_id = v_target_detection_id, updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_approved_as_new';
    v_notification_title := 'Promoted as New Rule';
    v_notification_message := 'Your detection "' || v_detection.name || '" has been approved and added as a NEW rule in the Production Library.';

  ELSIF p_action = 'reject' THEN
    UPDATE detections
    SET promotion_status = 'rejected', "updatedDate" = NOW()
    WHERE id = v_request.detection_id;

    UPDATE promotion_requests
    SET status = 'rejected', reviewed_by = p_admin_id, reviewer_id = p_admin_id, reviewed_at = NOW(),
        review_notes = p_notes, updated_at = NOW()
    WHERE id = p_request_id;

    v_notification_type := 'promotion_rejected';
    v_notification_title := 'Promotion Request Rejected';
    v_notification_message := 'Your detection "' || v_detection.name || '" was not approved.' ||
      CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN ' Reason: ' || p_notes ELSE '' END;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Use approve, approve_as_new, or reject.');
  END IF;

  INSERT INTO user_notifications (user_id, type, title, message, detection_id, is_read, created_at)
  VALUES (v_request.submitted_by, v_notification_type, v_notification_title, v_notification_message, v_request.detection_id, false, NOW());

  RETURN jsonb_build_object('success', true, 'action', p_action, 'is_update', v_is_update, 'production_id', v_target_detection_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_digest_scheduler()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url      text;
  v_key      text;
  v_now      timestamptz := now();
  v_hour     int := EXTRACT(HOUR FROM v_now AT TIME ZONE 'UTC')::int;
  v_user     RECORD;
  v_inserted int := 0;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'tr_supabase_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'auto_digest_scheduler: missing vault secrets — skipping';
    RETURN;
  END IF;

  FOR v_user IN
    SELECT s.user_id
      FROM public.auto_digest_settings s
     WHERE s.is_enabled = true
       AND s.schedule_hour_utc = v_hour
       AND NOT EXISTS (
         SELECT 1 FROM public.auto_digest_jobs j
          WHERE j.user_id = s.user_id
            AND j.status IN ('pending', 'processing')
            AND j.created_at > v_now - interval '23 hours'
       )
  LOOP
    INSERT INTO public.auto_digest_jobs (user_id, status)
    VALUES (v_user.user_id, 'pending');
    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted > 0 THEN
    SELECT net.http_post(
      url := v_url || '/functions/v1/auto-digest-orchestrator',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_key
                 ),
      body := '{}'::jsonb
    ) INTO v_request_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_digest_watchdog()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
 AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.check_detection_write_permission(p_user_id uuid, p_library_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'User profile not found');
  END IF;

  -- Check Development Library permissions (admin/owner only for imports)
  IF p_library_type = 'development' THEN
    IF v_profile.role NOT IN ('owner', 'admin') THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'Only owners and admins can import to Development Library',
        'required_role', 'admin',
        'current_role', v_profile.role
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'user_id', p_user_id,
    'library_type', p_library_type, 'user_role', v_profile.role
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.check_promotion_eligibility(p_detection_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection RECORD;
  v_is_pending BOOLEAN;
  v_is_promoted_unchanged BOOLEAN;
BEGIN
  SELECT * INTO v_detection FROM detections WHERE id = p_detection_id;
  IF NOT FOUND THEN
    RETURN json_build_object('eligible', false, 'error', 'Detection not found');
  END IF;

  v_is_pending := v_detection.promotion_status = 'pending';
  v_is_promoted_unchanged := (
    v_detection.promotion_status = 'promoted' AND
    v_detection.promoted_at IS NOT NULL AND
    v_detection."updatedDate" <= v_detection.promoted_at
  );

  RETURN json_build_object(
    'eligible', (
      NOT v_is_pending AND NOT v_is_promoted_unchanged AND
      COALESCE(v_detection."qualityScore", 0) >= 60 AND
      v_detection.name IS NOT NULL AND v_detection.name != '' AND
      v_detection.description IS NOT NULL AND LENGTH(v_detection.description) >= 20 AND
      v_detection."mitreAttackIds" IS NOT NULL AND array_length(v_detection."mitreAttackIds", 1) > 0 AND
      v_detection."detectionQuery" IS NOT NULL AND v_detection."detectionQuery" != ''
    ),
    'checks', json_build_object(
      'quality_score', json_build_object('passed', COALESCE(v_detection."qualityScore", 0) >= 60, 'value', COALESCE(v_detection."qualityScore", 0), 'required', 60),
      'name', json_build_object('passed', v_detection.name IS NOT NULL AND v_detection.name != '', 'value', v_detection.name),
      'description', json_build_object('passed', v_detection.description IS NOT NULL AND LENGTH(v_detection.description) >= 20, 'length', COALESCE(LENGTH(v_detection.description), 0), 'required', 20),
      'mitre_mapping', json_build_object('passed', v_detection."mitreAttackIds" IS NOT NULL AND array_length(v_detection."mitreAttackIds", 1) > 0, 'count', COALESCE(array_length(v_detection."mitreAttackIds", 1), 0)),
      'detection_query', json_build_object('passed', v_detection."detectionQuery" IS NOT NULL AND v_detection."detectionQuery" != '')
    ),
    'promotion_status', v_detection.promotion_status,
    'already_promoted', v_detection.promotion_status = 'promoted',
    'is_pending', v_is_pending,
    'is_promoted_unchanged', v_is_promoted_unchanged,
    'is_update', v_detection.source_rule_id IS NOT NULL
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
$function$;
CREATE OR REPLACE FUNCTION public.cleanup_user_data(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    owner_user_id UUID;
BEGIN
    -- Get an owner to transfer detections to
    SELECT id INTO owner_user_id 
    FROM profiles 
    WHERE role = 'owner' AND id != target_user_id 
    LIMIT 1;
    
    IF owner_user_id IS NULL THEN
        SELECT id INTO owner_user_id 
        FROM profiles 
        WHERE id != target_user_id 
        LIMIT 1;
    END IF;

    -- Clean up related data
    DELETE FROM activity_log WHERE user_id = target_user_id;
    DELETE FROM user_notifications WHERE user_id = target_user_id;
    DELETE FROM detection_comments WHERE user_id = target_user_id;
    DELETE FROM detection_reviews WHERE reviewer_id = target_user_id OR requested_by = target_user_id;
    DELETE FROM team_invitations WHERE invited_by = target_user_id;
    DELETE FROM team_members WHERE user_id = target_user_id;
    UPDATE detections SET assigned_to = NULL WHERE assigned_to = target_user_id;
    
    IF owner_user_id IS NOT NULL THEN
        UPDATE detections SET user_id = owner_user_id WHERE user_id = target_user_id;
    ELSE
        DELETE FROM detections WHERE user_id = target_user_id;
    END IF;

    DELETE FROM profiles WHERE id = target_user_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.clear_research_node_on_session_clear()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.research_session_id IS NULL AND OLD.research_session_id IS NOT NULL THEN
    NEW.research_node_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.complete_password_setup(p_full_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET password_set = true,
      full_name = COALESCE(p_full_name, full_name),
      updated_at = now()
  WHERE id = auth.uid();
END;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_single_default_dashboard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_dashboards
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.find_similar_detections(p_detection_id text, p_match_threshold double precision DEFAULT 0.3, p_match_count integer DEFAULT 10, p_exclude_self boolean DEFAULT true)
 RETURNS TABLE(detection_id text, name text, description text, status text, severity text, query_language text, similarity double precision, mitre_attack_ids text[], source text, library_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_embedding vector(1536);
  v_caller_id UUID;
BEGIN
  -- Get the calling user's ID from the JWT
  v_caller_id := auth.uid();
  
  -- Look up the embedding for the given detection
  SELECT de.embedding INTO v_embedding
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE de.detection_id = p_detection_id
    AND (d.user_id = v_caller_id OR d.library_type = 'development');

  -- If no embedding found (or unauthorized), return empty
  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.name,
    d.description,
    d.status,
    d.severity,
    d."queryLanguage" AS query_language,
    1 - (de.embedding <=> v_embedding) AS similarity,
    d."mitreAttackIds" AS mitre_attack_ids,
    d.source,
    d.library_type
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE
    (NOT p_exclude_self OR de.detection_id != p_detection_id)
    AND 1 - (de.embedding <=> v_embedding) > p_match_threshold
    AND (d.user_id = v_caller_id OR d.library_type = 'development')
  ORDER BY de.embedding <=> v_embedding ASC
  LIMIT p_match_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.find_threat_actor(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_matches jsonb;
  v_query_lower text := lower(p_query);
begin
  -- Search by name, mitre_id, aliases, or vendor names
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stix_id', stix_id,
      'mitre_id', mitre_id,
      'name', name,
      'aliases', coalesce(data->'aliases', '[]'::jsonb),
      'origin_country', coalesce(data->'targeting_intel'->>'origin_country', null),
      'target_sectors', coalesce(data->'targeting_intel'->'target_sectors', '[]'::jsonb)
    ) order by 
      case 
        when lower(name) = v_query_lower then 1
        when lower(mitre_id) = v_query_lower then 2
        when lower(name) like v_query_lower || '%' then 3
        else 4
      end,
      name
  ), '[]'::jsonb)
  into v_matches
  from mitre_objects
  where type = 'intrusion-set'
    and (
      lower(name) like '%' || v_query_lower || '%'
      or lower(mitre_id) = v_query_lower
      or exists (
        select 1 
        from jsonb_array_elements_text(data->'aliases') as alias
        where lower(alias) like '%' || v_query_lower || '%'
      )
      or exists (
        select 1
        from jsonb_each_text(data->'targeting_intel'->'vendor_names') as vn(key, value)
        where lower(vn.value) like '%' || v_query_lower || '%'
      )
    )
  limit 10;

  return jsonb_build_object(
    'found', jsonb_array_length(v_matches) > 0,
    'matches', v_matches,
    'query', p_query
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.fork_to_development(p_detection_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source_rule RECORD;
  v_new_id text;
  v_existing_id text;
BEGIN
  -- HARDENING: ignore caller-supplied p_user_id; bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_source_rule
  FROM detections
  WHERE id = p_detection_id AND library_type = 'production';

  IF v_source_rule IS NULL THEN
    RAISE EXCEPTION 'Detection not found or not in Production Library';
  END IF;

  SELECT id INTO v_existing_id
  FROM detections
  WHERE source_rule_id = p_detection_id
    AND user_id = p_user_id
    AND library_type = 'development';

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a development copy of this detection (ID: %)', v_existing_id;
  END IF;

  v_new_id := gen_random_uuid()::text;

  INSERT INTO detections (
    id, user_id, version, library_type, source_rule_id, promotion_status,
    name, description, author, status, severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags,
    "createdDate", "updatedDate"
  )
  SELECT
    v_new_id, p_user_id, 1, 'development', p_detection_id, 'none',
    name, description, author, 'Draft', severity, "detectionType",
    "logSource", "logSources", technology, "queryLanguage", "detectionQuery",
    queries, "queryExplanation", "mitreAttackIds", "mitreTactics", "mitreTechniques",
    "linkedGroups", "linkedSoftware", "linkedCampaigns",
    "threatActors", campaigns, software, "associatedCVEs",
    "dataSources", "dataComponents", platforms,
    "investigationSteps", "responseActions", "falsePositiveGuidance",
    prerequisites, caveats, "fineTuning",
    "testedAndValidated", "testCases", "qualityScore",
    "references", tags,
    now(), now()
  FROM detections WHERE id = p_detection_id;

  RETURN v_new_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.generate_detection_fts_vector(p_name text, p_description text, p_detection_query text, p_mitre_ids text[], p_tags text[], p_query_explanation text)
 RETURNS tsvector
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  return
    setweight(to_tsvector('english', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_detection_query, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_mitre_ids, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_query_explanation, '')), 'C');
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_coverage_summary(p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_total_techniques int;
  v_covered_techniques int;
  v_total_detections bigint;
  v_production_detections bigint;
  v_by_tactic jsonb;
  v_top_covered jsonb;
  v_critical_gaps jsonb;
begin
  -- Overall counts
  select 
    count(*),
    count(*) filter (where is_covered),
    sum(detection_count),
    sum(production_count)
  into v_total_techniques, v_covered_techniques, v_total_detections, v_production_detections
  from mv_coverage_stats
  where is_subtechnique = false;

  -- Coverage by tactic
  with tactic_stats as (
    select
      unnest(string_to_array(tactics, ', ')) as tactic,
      count(*) as total,
      count(*) filter (where is_covered) as covered
    from mv_coverage_stats
    where tactics is not null
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'tactic', tactic,
      'total', total,
      'covered', covered,
      'percent', case when total > 0 then round((covered::numeric / total) * 100) else 0 end
    ) order by 
      case tactic
        when 'reconnaissance' then 1
        when 'resource development' then 2
        when 'initial access' then 3
        when 'execution' then 4
        when 'persistence' then 5
        when 'privilege escalation' then 6
        when 'defense evasion' then 7
        when 'credential access' then 8
        when 'discovery' then 9
        when 'lateral movement' then 10
        when 'collection' then 11
        when 'command and control' then 12
        when 'exfiltration' then 13
        when 'impact' then 14
        else 15
      end
  )
  into v_by_tactic
  from tactic_stats;

  -- Top covered techniques
  select jsonb_agg(
    jsonb_build_object(
      'technique_id', technique_id,
      'name', technique_name,
      'detection_count', detection_count
    )
  )
  into v_top_covered
  from (
    select technique_id, technique_name, detection_count
    from mv_coverage_stats
    where detection_count > 0
    order by detection_count desc
    limit 5
  ) t;

  -- Critical gaps
  select jsonb_agg(
    jsonb_build_object(
      'technique_id', technique_id,
      'name', technique_name,
      'tactic', coalesce(split_part(tactics, ', ', 1), 'Unknown'),
      'priority', 'high'
    )
  )
  into v_critical_gaps
  from (
    select technique_id, technique_name, tactics
    from mv_coverage_stats
    where not is_covered
      and is_subtechnique = false
    order by technique_id
    limit 10
  ) t;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total_techniques', coalesce(v_total_techniques, 0),
      'covered_techniques', coalesce(v_covered_techniques, 0),
      'coverage_percent', case when v_total_techniques > 0 
        then round((v_covered_techniques::numeric / v_total_techniques) * 100) 
        else 0 end,
      'total_detections', coalesce(v_total_detections, 0),
      'production_detections', coalesce(v_production_detections, 0)
    ),
    'by_tactic', coalesce(v_by_tactic, '[]'::jsonb),
    'top_covered', coalesce(v_top_covered, '[]'::jsonb),
    'critical_gaps', coalesce(v_critical_gaps, '[]'::jsonb)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_coverage_tiers(p_actor_stix_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH techniques AS (
    SELECT mo.mitre_id, mo.name
    FROM mitre_objects mo
    WHERE mo.type = 'attack-pattern'
      AND mo.mitre_id IS NOT NULL
      AND COALESCE((mo.data->>'x_mitre_is_subtechnique')::boolean, false) = false
      AND (
        p_actor_stix_id IS NULL
        OR mo.mitre_id IN (
          SELECT tgt.mitre_id
          FROM mitre_relationships mr
          JOIN mitre_objects tgt ON mr.target_ref = tgt.stix_id
          WHERE mr.source_ref = p_actor_stix_id
            AND mr.relationship_type = 'uses'
            AND tgt.type = 'attack-pattern'
        )
      )
  ),
  coverage AS (
    SELECT
      t.mitre_id,
      t.name,
      bool_or(d.library_type = 'production')  AS in_prod,
      bool_or(d.library_type = 'development') AS in_dev,
      count(d.id) FILTER (WHERE d.library_type = 'production')  AS prod_count,
      count(d.id) FILTER (WHERE d.library_type = 'development') AS dev_count
    FROM techniques t
    LEFT JOIN detections d ON t.mitre_id = ANY(d."mitreAttackIds")
    GROUP BY t.mitre_id, t.name
  ),
  classified AS (
    SELECT *,
      CASE
        WHEN in_prod THEN 'production'
        WHEN in_dev  THEN 'development'
        ELSE 'gap'
      END AS tier
    FROM coverage
  ),
  totals AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE tier = 'production')  AS prod_total,
      count(*) FILTER (WHERE tier = 'development') AS dev_total,
      count(*) FILTER (WHERE tier = 'gap')         AS gap_total
    FROM classified
  ),
  prod_techs AS (
    SELECT jsonb_agg(
      jsonb_build_object('id', mitre_id, 'name', name, 'detectionCount', prod_count)
      ORDER BY prod_count DESC, mitre_id
    ) AS arr
    FROM (
      SELECT mitre_id, name, prod_count FROM classified
      WHERE tier = 'production' ORDER BY prod_count DESC, mitre_id LIMIT 50
    ) t
  ),
  dev_techs AS (
    SELECT jsonb_agg(
      jsonb_build_object('id', mitre_id, 'name', name, 'detectionCount', dev_count)
      ORDER BY dev_count DESC, mitre_id
    ) AS arr
    FROM (
      SELECT mitre_id, name, dev_count FROM classified
      WHERE tier = 'development' ORDER BY dev_count DESC, mitre_id LIMIT 50
    ) t
  ),
  gap_techs AS (
    SELECT jsonb_agg(
      jsonb_build_object('id', mitre_id, 'name', name, 'priority', 'high')
      ORDER BY mitre_id
    ) AS arr
    FROM (
      SELECT mitre_id, name FROM classified
      WHERE tier = 'gap' ORDER BY mitre_id LIMIT 50
    ) t
  )
  SELECT jsonb_build_object(
    'total', totals.total,
    'production',  jsonb_build_object(
      'count',   totals.prod_total,
      'percent', CASE WHEN totals.total > 0 THEN round((totals.prod_total::numeric / totals.total) * 100) ELSE 0 END,
      'techniques', COALESCE(prod_techs.arr, '[]'::jsonb)
    ),
    'development', jsonb_build_object(
      'count',   totals.dev_total,
      'percent', CASE WHEN totals.total > 0 THEN round((totals.dev_total::numeric / totals.total) * 100) ELSE 0 END,
      'techniques', COALESCE(dev_techs.arr, '[]'::jsonb)
    ),
    'gap', jsonb_build_object(
      'count',   totals.gap_total,
      'percent', CASE WHEN totals.total > 0 THEN round((totals.gap_total::numeric / totals.total) * 100) ELSE 0 END,
      'techniques', COALESCE(gap_techs.arr, '[]'::jsonb)
    )
  )
  INTO v_result
  FROM totals, prod_techs, dev_techs, gap_techs;

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_current_spend(p_scope text, p_scope_value text, p_period text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start    timestamptz;
  v_today           date := (now() AT TIME ZONE 'UTC')::date;
  v_rollup_cutoff   date;
  v_total           numeric := 0;
BEGIN
  IF p_period = 'daily' THEN
    v_window_start := v_today::timestamptz;
  ELSIF p_period = 'monthly' THEN
    v_window_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  ELSIF p_period = 'rolling_30d' THEN
    v_window_start := now() - interval '30 days';
  ELSE
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden: authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin')) THEN
    IF p_scope <> 'user' OR p_scope_value IS NULL OR p_scope_value::uuid <> auth.uid() THEN
      RAISE EXCEPTION 'forbidden: requires owner/admin role for non-self spend queries';
    END IF;
  END IF;

  SELECT COALESCE(MAX(day) + 1, v_today) INTO v_rollup_cutoff
  FROM ai_usage_daily;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_total
  FROM ai_usage_daily
  WHERE day >= v_window_start::date
    AND day <  v_rollup_cutoff
    AND (
      p_scope = 'org' OR
      (p_scope = 'feature' AND feature = p_scope_value) OR
      (p_scope = 'user'    AND user_id = p_scope_value::uuid) OR
      (p_scope = 'model'   AND model = p_scope_value)
    );

  v_total := v_total + COALESCE((
    SELECT SUM(cost_usd)
    FROM ai_usage_events
    WHERE created_at >= GREATEST(v_window_start, v_rollup_cutoff::timestamptz)
      AND (
        p_scope = 'org' OR
        (p_scope = 'feature' AND feature = p_scope_value) OR
        (p_scope = 'user'    AND user_id = p_scope_value::uuid) OR
        (p_scope = 'model'   AND model = p_scope_value)
      )
  ), 0);

  RETURN v_total;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_defensive_posture(p_user_id uuid, p_scope text DEFAULT 'production'::text)
 RETURNS TABLE(total_detections bigint, techniques_covered bigint, total_techniques bigint, technique_coverage_pct numeric, groups_defended bigint, total_groups bigint, group_coverage_pct numeric, campaigns_defended bigint, total_campaigns bigint, campaign_coverage_pct numeric, avg_taw_covered numeric, top_gaps jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_covered_stix text[];
  v_total_det bigint;
  v_tech_count bigint;
  v_snap record;
  v_groups bigint;
  v_campaigns bigint;
  v_avg_taw numeric;
  v_gaps jsonb;
BEGIN
  -- Step 1: Get covered technique stix_ids into an array
  SELECT array_agg(DISTINCT ti.stix_id)
  INTO v_covered_stix
  FROM (
    SELECT DISTINCT unnest(d."mitreAttackIds") AS tid
    FROM detections d
    WHERE d."mitreAttackIds" IS NOT NULL
      AND array_length(d."mitreAttackIds", 1) > 0
      AND (CASE p_scope
             WHEN 'production' THEN d.library_type = 'production' AND d.user_id = p_user_id
             WHEN 'lab' THEN d.library_type = 'development'
             WHEN 'all' THEN (d.library_type = 'production' AND d.user_id = p_user_id) OR d.library_type = 'development'
             ELSE d.library_type = 'production' AND d.user_id = p_user_id
           END)
  ) ut
  JOIN mv_technique_importance ti ON ti.mitre_id = ut.tid;

  IF v_covered_stix IS NULL THEN v_covered_stix := ARRAY[]::text[]; END IF;
  v_tech_count := array_length(v_covered_stix, 1);
  IF v_tech_count IS NULL THEN v_tech_count := 0; END IF;

  -- Step 2: Detection count
  SELECT COUNT(*) INTO v_total_det
  FROM detections d
  WHERE d."mitreAttackIds" IS NOT NULL
    AND (CASE p_scope
           WHEN 'production' THEN d.library_type = 'production' AND d.user_id = p_user_id
           WHEN 'lab' THEN d.library_type = 'development'
           WHEN 'all' THEN (d.library_type = 'production' AND d.user_id = p_user_id) OR d.library_type = 'development'
           ELSE d.library_type = 'production' AND d.user_id = p_user_id
         END);

  -- Step 3: Snapshot
  SELECT * INTO v_snap FROM mitre_scoring_snapshot WHERE is_active = true LIMIT 1;

  -- Step 4: Groups defended
  SELECT COUNT(DISTINCT gt.group_stix_id) INTO v_groups
  FROM mitre_group_techniques gt
  WHERE gt.technique_stix_id = ANY(v_covered_stix);

  -- Step 5: Avg TAW
  SELECT ROUND(AVG(taw.taw)::numeric, 3) INTO v_avg_taw
  FROM (SELECT DISTINCT gt.group_stix_id FROM mitre_group_techniques gt WHERE gt.technique_stix_id = ANY(v_covered_stix)) dg
  JOIN mv_threat_actor_weights taw ON taw.stix_id = dg.group_stix_id;

  -- Step 6: Campaigns defended
  SELECT COUNT(DISTINCT ct.campaign_stix_id) INTO v_campaigns
  FROM mitre_campaign_techniques ct
  WHERE ct.technique_stix_id = ANY(v_covered_stix);

  -- Step 7: Top gaps
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mitre_id', g.mitre_id, 'name', g.name,
    'tis', ROUND(g.tis::numeric, 3),
    'gap_score', ROUND((g.tis * COALESCE(g.group_count, 0))::numeric, 2)
  )), '[]'::jsonb) INTO v_gaps
  FROM (
    SELECT ti.mitre_id, ti.name, ti.tis, ti.group_count
    FROM mv_technique_importance ti
    WHERE ti.stix_id != ALL(v_covered_stix)
      AND ti.group_count > 0
    ORDER BY ti.tis DESC, ti.group_count DESC
    LIMIT 10
  ) g;

  RETURN QUERY SELECT
    v_total_det,
    v_tech_count,
    COALESCE(v_snap.total_techniques, 0)::bigint,
    CASE WHEN v_snap.total_techniques > 0 THEN ROUND(v_tech_count::numeric / v_snap.total_techniques * 100, 1) ELSE 0 END,
    v_groups,
    COALESCE(v_snap.total_groups, 0)::bigint,
    CASE WHEN v_snap.total_groups > 0 THEN ROUND(v_groups::numeric / v_snap.total_groups * 100, 1) ELSE 0 END,
    v_campaigns,
    COALESCE(v_snap.total_campaigns, 0)::bigint,
    CASE WHEN v_snap.total_campaigns > 0 THEN ROUND(v_campaigns::numeric / v_snap.total_campaigns * 100, 1) ELSE 0 END,
    COALESCE(v_avg_taw, 0),
    v_gaps;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_filter_options(p_library_type text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT json_build_object(
    'technologies',
      COALESCE((
        SELECT array_agg(DISTINCT technology ORDER BY technology)
        FROM detections
        WHERE library_type = p_library_type
          AND technology IS NOT NULL AND technology != ''
      ), '{}'),

    'log_sources',
      COALESCE((
        SELECT array_agg(DISTINCT "logSource" ORDER BY "logSource")
        FROM detections
        WHERE library_type = p_library_type
          AND "logSource" IS NOT NULL AND "logSource" != ''
      ), '{}'),

    'authors',
      COALESCE((
        SELECT array_agg(DISTINCT author ORDER BY author)
        FROM detections
        WHERE library_type = p_library_type
          AND author IS NOT NULL AND author != ''
      ), '{}'),

    'platforms',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(platforms) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'tags',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(tags) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_tactics',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTactics") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'mitre_techniques',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("mitreTechniques") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'threat_actors',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("threatActors") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'campaigns',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(campaigns) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'software',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest(software) val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    'cves',
      COALESCE((
        SELECT array_agg(DISTINCT val ORDER BY val)
        FROM detections, unnest("associatedCVEs") val
        WHERE library_type = p_library_type AND val IS NOT NULL AND val != ''
      ), '{}'),

    -- Query languages actually present in this library. The filter panel unions these with the
    -- curated QUERY_LANGUAGES list so a value written by an importer or an older client is
    -- still findable, instead of the panel offering options that match nothing while the real
    -- rules are unreachable.
    'query_languages',
      COALESCE((
        SELECT array_agg(DISTINCT "queryLanguage" ORDER BY "queryLanguage")
        FROM detections
        WHERE library_type = p_library_type
          AND "queryLanguage" IS NOT NULL AND "queryLanguage" != ''
      ), '{}')
  );
$function$;
CREATE OR REPLACE FUNCTION public.get_group_techniques(group_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text, tactics json, platforms json, is_subtechnique boolean, data jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    v.stix_id,
    v.mitre_id,
    v.name,
    v.description,
    mr.description as relationship_description,
    v.tactics,
    v.platforms,
    COALESCE((v.data->>'x_mitre_is_subtechnique')::boolean, false) as is_subtechnique,
    v.data
  FROM mitre_relationships mr
  JOIN v_mitre_techniques_full v ON v.stix_id = mr.target_ref
  WHERE mr.source_ref = group_stix_id
    AND mr.relationship_type = 'uses'
    AND v.deprecated = FALSE
  ORDER BY v.mitre_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_mitigation_impact_detail(p_mitigation_stix_id text)
 RETURNS TABLE(mitigation_stix_id text, mitigation_mitre_id text, mitigation_name text, impact_score integer, technique_count integer, total_groups_disrupted integer, total_campaigns_disrupted integer, top_groups jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH mit AS (
    SELECT * FROM mv_mitigation_impact WHERE stix_id = p_mitigation_stix_id
  ),
  technique_list AS (
    SELECT DISTINCT r.target_ref AS technique_stix_id
    FROM mitre_relationships r
    WHERE r.source_ref = p_mitigation_stix_id
    AND r.relationship_type = 'mitigates'
  ),
  disrupted_groups AS (
    SELECT 
      taw.stix_id,
      taw.mitre_id,
      taw.name,
      taw.taw,
      COUNT(DISTINCT gt.technique_stix_id) AS techniques_blocked
    FROM technique_list tl
    JOIN mitre_group_techniques gt ON gt.technique_stix_id = tl.technique_stix_id
    JOIN mv_threat_actor_weights taw ON taw.stix_id = gt.group_stix_id
    GROUP BY taw.stix_id, taw.mitre_id, taw.name, taw.taw
    ORDER BY taw.taw DESC
    LIMIT 15
  ),
  campaign_count AS (
    SELECT COUNT(DISTINCT ct.campaign_stix_id) AS cnt
    FROM technique_list tl
    JOIN mitre_campaign_techniques ct ON ct.technique_stix_id = tl.technique_stix_id
  )
  SELECT 
    mit.stix_id,
    mit.mitre_id,
    mit.name,
    mit.impact_score,
    mit.technique_count::int,
    mit.groups_disrupted::int,
    COALESCE(cc.cnt, 0)::int,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'stix_id', dg.stix_id,
        'mitre_id', dg.mitre_id,
        'name', dg.name,
        'taw', ROUND(dg.taw::numeric, 3),
        'techniques_blocked', dg.techniques_blocked
      ) ORDER BY dg.taw DESC)
      FROM disrupted_groups dg),
      '[]'::jsonb
    )
  FROM mit
  CROSS JOIN campaign_count cc;
$function$;
CREATE OR REPLACE FUNCTION public.get_mitigation_techniques(p_mitigation_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        t.stix_id,
        t.mitre_id,
        t.name,
        t.description,
        r.description as relationship_description
    FROM mitre_objects t
    JOIN mitre_relationships r ON r.target_ref = t.stix_id
    WHERE r.source_ref = p_mitigation_stix_id
    AND r.relationship_type = 'mitigates'
    AND t.type = 'attack-pattern'
    AND t.deprecated = false
    AND t.revoked = false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_strategy_analytics(p_strategy_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, platforms jsonb, log_source_references jsonb, mutable_elements jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        a.stix_id,
        a.mitre_id,
        a.name,
        a.description,
        a.data->'x_mitre_platforms' as platforms,
        a.data->'x_mitre_log_source_references' as log_source_references,
        a.data->'x_mitre_mutable_elements' as mutable_elements
    FROM mitre_objects ds
    CROSS JOIN LATERAL jsonb_array_elements_text(ds.data->'x_mitre_analytic_refs') as ref
    JOIN mitre_objects a ON a.stix_id = ref
    WHERE ds.stix_id = p_strategy_stix_id
    AND ds.type = 'x-mitre-detection-strategy'
    AND a.type = 'x-mitre-analytic'
    AND a.deprecated = false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_strategy_impact_detail(p_strategy_stix_id text)
 RETURNS TABLE(strategy_stix_id text, strategy_mitre_id text, strategy_name text, technique_id text, technique_name text, impact_score integer, analytic_count integer, total_groups_detected integer, total_campaigns_detected integer, top_groups jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH strat AS (
    SELECT * FROM mv_strategy_impact WHERE stix_id = p_strategy_stix_id
  ),
  detected_groups AS (
    SELECT 
      taw.stix_id,
      taw.mitre_id,
      taw.name,
      taw.taw
    FROM strat s
    JOIN mitre_group_techniques gt ON gt.technique_stix_id = s.technique_stix_id
    JOIN mv_threat_actor_weights taw ON taw.stix_id = gt.group_stix_id
    ORDER BY taw.taw DESC
    LIMIT 15
  ),
  campaign_count AS (
    SELECT COUNT(DISTINCT ct.campaign_stix_id) AS cnt
    FROM strat s
    JOIN mitre_campaign_techniques ct ON ct.technique_stix_id = s.technique_stix_id
  )
  SELECT 
    s.stix_id,
    s.mitre_id,
    s.name,
    s.technique_id,
    s.technique_name,
    s.impact_score,
    s.analytic_count::int,
    s.groups_detected::int,
    COALESCE(cc.cnt, 0)::int,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'stix_id', dg.stix_id,
        'mitre_id', dg.mitre_id,
        'name', dg.name,
        'taw', ROUND(dg.taw::numeric, 3)
      ) ORDER BY dg.taw DESC)
      FROM detected_groups dg),
      '[]'::jsonb
    )
  FROM strat s
  CROSS JOIN campaign_count cc;
$function$;
CREATE OR REPLACE FUNCTION public.get_technique_detection_strategies(p_technique_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, analytic_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        ds.stix_id,
        ds.mitre_id,
        ds.name,
        ds.description,
        COALESCE(jsonb_array_length(ds.data->'x_mitre_analytic_refs'), 0)::INT as analytic_count
    FROM mitre_objects ds
    JOIN mitre_relationships r ON r.source_ref = ds.stix_id
    WHERE r.target_ref = p_technique_stix_id
    AND r.relationship_type = 'detects'
    AND ds.type = 'x-mitre-detection-strategy'
    AND ds.deprecated = false
    AND ds.revoked = false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_technique_hierarchy(technique_stix_id text)
 RETURNS TABLE(parent_stix_id text, parent_mitre_id text, parent_name text, subtechnique_stix_id text, subtechnique_mitre_id text, subtechnique_name text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  -- Get parent if this is a sub-technique
  SELECT 
    p.stix_id as parent_stix_id,
    p.mitre_id as parent_mitre_id,
    p.name as parent_name,
    t.stix_id as subtechnique_stix_id,
    t.mitre_id as subtechnique_mitre_id,
    t.name as subtechnique_name
  FROM mitre_relationships r
  JOIN mitre_objects p ON r.target_ref = p.stix_id
  JOIN mitre_objects t ON r.source_ref = t.stix_id
  WHERE r.source_ref = technique_stix_id
    AND r.relationship_type = 'subtechnique-of'
  
  UNION ALL
  
  -- Get sub-techniques if this is a parent
  SELECT 
    p.stix_id as parent_stix_id,
    p.mitre_id as parent_mitre_id,
    p.name as parent_name,
    s.stix_id as subtechnique_stix_id,
    s.mitre_id as subtechnique_mitre_id,
    s.name as subtechnique_name
  FROM mitre_relationships r
  JOIN mitre_objects p ON r.target_ref = p.stix_id
  JOIN mitre_objects s ON r.source_ref = s.stix_id
  WHERE r.target_ref = technique_stix_id
    AND r.relationship_type = 'subtechnique-of';
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_technique_mitigations(technique_stix_id text)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, relationship_description text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.stix_id,
    m.mitre_id,
    m.name,
    m.description,
    r.description as relationship_description
  FROM mitre_relationships r
  JOIN mitre_objects m ON r.source_ref = m.stix_id
  WHERE r.target_ref = technique_stix_id
    AND r.relationship_type = 'mitigates'
    AND m.type = 'course-of-action'
    AND NOT m.deprecated
    AND NOT m.revoked;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_technique_strategies_by_mitre_id(p_technique_mitre_id text)
 RETURNS TABLE(strategy_stix_id text, strategy_mitre_id text, strategy_name text, strategy_description text, analytic_count integer, technique_stix_id text, technique_mitre_id text, technique_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        ds.stix_id as strategy_stix_id,
        ds.mitre_id as strategy_mitre_id,
        ds.name as strategy_name,
        ds.description as strategy_description,
        COALESCE(jsonb_array_length(ds.data->'x_mitre_analytic_refs'), 0)::INT as analytic_count,
        t.stix_id as technique_stix_id,
        t.mitre_id as technique_mitre_id,
        t.name as technique_name
    FROM mitre_objects t
    JOIN mitre_relationships r ON r.target_ref = t.stix_id AND r.relationship_type = 'detects'
    JOIN mitre_objects ds ON ds.stix_id = r.source_ref AND ds.type = 'x-mitre-detection-strategy'
    WHERE t.mitre_id = p_technique_mitre_id
    AND t.type = 'attack-pattern'
    AND ds.deprecated = false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_threat_actor_coverage(p_actor_stix_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_actor jsonb;
  v_techniques jsonb;
  v_covered_techniques jsonb;
  v_gaps jsonb;
  v_total int;
  v_covered int;
begin
  -- Get actor info
  select jsonb_build_object(
    'name', name,
    'mitreId', mitre_id,
    'stixId', stix_id,
    'aliases', coalesce(data->'aliases', '[]'::jsonb),
    'description', coalesce(data->>'description', ''),
    'originCountry', coalesce(data->'targeting_intel'->>'origin_country', null),
    'targetSectors', coalesce(data->'targeting_intel'->'target_sectors', '[]'::jsonb)
  )
  into v_actor
  from mitre_objects
  where stix_id = p_actor_stix_id;

  if v_actor is null then
    return jsonb_build_object('error', 'Threat actor not found');
  end if;

  -- Get techniques used by this actor and coverage info
  with actor_techniques as (
    select distinct
      mo.mitre_id,
      mo.name,
      mo.stix_id
    from mitre_relationships mr
    join mitre_objects mo on mr.target_ref = mo.stix_id
    where mr.source_ref = p_actor_stix_id
      and mr.relationship_type = 'uses'
      and mo.type = 'attack-pattern'
  ),
  detection_coverage as (
    select
      at.mitre_id,
      at.name,
      count(d.id) as detection_count,
      array_agg(distinct d.name) filter (where d.name is not null) as detection_names
    from actor_techniques at
    left join detections d on at.mitre_id = any(d."mitreAttackIds")
    group by at.mitre_id, at.name
  )
  select
    count(*),
    count(*) filter (where detection_count > 0),
    jsonb_agg(
      jsonb_build_object(
        'id', mitre_id,
        'name', name,
        'detectionCount', detection_count
      ) order by detection_count desc
    ) filter (where detection_count > 0),
    jsonb_agg(
      jsonb_build_object(
        'id', mitre_id,
        'name', name,
        'reason', 'Uncovered technique used by ' || (v_actor->>'name')
      ) order by mitre_id
    ) filter (where detection_count = 0)
  into v_total, v_covered, v_covered_techniques, v_gaps
  from detection_coverage;

  return jsonb_build_object(
    'actor', v_actor,
    'coverage', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'covered', coalesce(v_covered, 0),
      'percent', case when v_total > 0 
        then round((v_covered::numeric / v_total) * 100) 
        else 0 end
    ),
    'coveredTechniques', coalesce(v_covered_techniques, '[]'::jsonb),
    'gaps', coalesce(v_gaps, '[]'::jsonb)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_top_impact_mitigations(p_limit integer DEFAULT 20)
 RETURNS TABLE(stix_id text, mitre_id text, name text, description text, technique_count integer, impact_score numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    stix_id,
    mitre_id,
    name,
    description,
    technique_count::int,
    impact_score
  FROM v_mitigation_impact
  ORDER BY impact_score DESC
  LIMIT p_limit;
$function$;
CREATE OR REPLACE FUNCTION public.get_top_impact_strategies(p_limit integer DEFAULT 20)
 RETURNS TABLE(stix_id text, mitre_id text, name text, technique_id text, technique_name text, analytic_count integer, impact_score numeric)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    stix_id,
    mitre_id,
    name,
    technique_id,
    technique_name,
    analytic_count::int,
    impact_score
  FROM v_strategy_impact
  ORDER BY impact_score DESC
  LIMIT p_limit;
$function$;
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COUNT(*)::INTEGER FROM user_notifications WHERE user_id = p_user_id AND is_read = false;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_user uuid := auth.uid();
  v_role text;
  v_is_global_admin boolean;
  v_team_id uuid;
BEGIN
  -- Check global admin (from profiles)
  SELECT role = 'admin' INTO v_is_global_admin
  FROM profiles WHERE id = v_current_user;
  
  -- Get team_id (use provided or get user's default team)
  IF p_team_id IS NOT NULL THEN
    v_team_id := p_team_id;
  ELSE
    SELECT team_id INTO v_team_id
    FROM team_members
    WHERE user_id = v_current_user AND status = 'active'
    ORDER BY role = 'owner' DESC, created_at ASC
    LIMIT 1;
  END IF;
  
  -- Get team role
  SELECT role INTO v_role
  FROM team_members
  WHERE team_id = v_team_id AND user_id = v_current_user AND status = 'active';
  
  -- Return permissions based on role
  RETURN jsonb_build_object(
    'user_id', v_current_user,
    'team_id', v_team_id,
    'role', COALESCE(v_role, 'viewer'),
    'is_global_admin', COALESCE(v_is_global_admin, false),
    'permissions', CASE COALESCE(v_role, 'viewer')
      WHEN 'owner' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'team_manage', true, 'user_manage', true, 'user_invite', true,
        'assign', true, 'review', true, 'publish_approve', true,
        'view_activity', true, 'export_bulk', true
      )
      WHEN 'admin' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'team_manage', false, 'user_manage', true, 'user_invite', true,
        'assign', true, 'review', true, 'publish_approve', true,
        'view_activity', true, 'export_bulk', true
      )
      WHEN 'lead' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true,
        'team_manage', false, 'user_manage', false, 'user_invite', false,
        'assign', true, 'review', true, 'publish_approve', false,
        'view_activity', true, 'export_bulk', false
      )
      WHEN 'analyst' THEN jsonb_build_object(
        'detection_create', true, 'detection_edit_assigned', true, 'detection_delete_own', true,
        'team_manage', false, 'user_manage', false, 'user_invite', false,
        'assign', false, 'review', false, 'publish_approve', false,
        'view_activity', false, 'export_bulk', false,
        'self_assign', true, 'request_review', true
      )
      ELSE jsonb_build_object(
        'detection_view', true,
        'comment', true
      )
    END
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation RECORD;
  v_full_name  text;
  v_role       text;
BEGIN
  v_full_name := split_part(NEW.email, '@', 1);

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'analyst');
  IF v_role NOT IN ('owner', 'admin', 'lead', 'analyst', 'viewer') THEN
    v_role := 'analyst';
  END IF;

  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE email = NEW.email
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    v_role := v_invitation.role;
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name, status, password_set, created_at, updated_at)
  VALUES (
    NEW.id, NEW.email, v_role, v_full_name, 'active',
    CASE WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN false ELSE true END,
    now(), now()
  );

  IF v_invitation IS NOT NULL THEN
    UPDATE public.user_invitations
       SET accepted_at = now()
     WHERE id = v_invitation.id;

    INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (NEW.id, 'user', NEW.id::text, 'user_joined',
      jsonb_build_object('email', NEW.email, 'role', v_role,
                         'invited_by', v_invitation.invited_by, 'method', 'invitation'));

    INSERT INTO public.user_notifications (user_id, type, title, message)
    VALUES (NEW.id, 'welcome', 'Welcome to Optimus!',
      'You have been added as ' || v_role || '. Start by exploring the Detection Library.');
  ELSE
    INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, details)
    VALUES (NEW.id, 'user', NEW.id::text, 'user_registered',
      jsonb_build_object('email', NEW.email, 'method', 'direct_signup'));
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.hybrid_search_detections(p_query text, p_query_embedding vector, p_semantic_weight double precision DEFAULT 0.5, p_keyword_weight double precision DEFAULT 0.5, p_limit integer DEFAULT 25, p_status text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(detection_id text, name text, description text, mitre_ids text[], status text, severity text, semantic_score double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_or_query text := regexp_replace(coalesce(p_query, ''), '\s+', ' or ', 'g');
  v_tsq tsquery := websearch_to_tsquery('english', v_or_query);
begin
  return query
  with semantic_results as (
    select
      de.detection_id as det_id,
      (1 - (de.embedding <=> p_query_embedding))::float as score
    from detection_embeddings de
    where 1 - (de.embedding <=> p_query_embedding) > 0.4
    order by de.embedding <=> p_query_embedding
    limit p_limit * 3
  ),
  keyword_results as (
    select
      d.id as det_id,
      ts_rank_cd(d.fts_vector, v_tsq, 32)::float as score
    from detections d
    where d.fts_vector @@ v_tsq
    order by score desc
    limit p_limit * 3
  ),
  combined as (
    select
      coalesce(sr.det_id, kr.det_id) as det_id,
      coalesce(sr.score, 0.0)::float as sem_score,
      coalesce(kr.score, 0.0)::float as kw_score,
      ((coalesce(sr.score, 0.0) * p_semantic_weight) +
       (coalesce(kr.score, 0.0) * p_keyword_weight))::float as total_score
    from semantic_results sr
    full outer join keyword_results kr on sr.det_id = kr.det_id
  )
  select
    c.det_id as detection_id,
    d.name,
    d.description,
    d."mitreAttackIds" as mitre_ids,
    d.status,
    d.severity,
    c.sem_score as semantic_score,
    c.kw_score as keyword_score,
    c.total_score as combined_score
  from combined c
  join detections d on c.det_id = d.id
  where
    (p_status is null or d.status = p_status)
    and (p_severity is null or d.severity = p_severity)
    and (
      d.library_type = 'production'
      or (d.library_type = 'development' and (d.visibility = 'shared' or d.user_id = p_user_id))
    )
  order by c.total_score desc
  limit p_limit;
end;
$function$;
CREATE OR REPLACE FUNCTION public.identify_coverage_gaps(p_profile text DEFAULT 'apt'::text, p_custom_techniques text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_techniques text[];
  v_result jsonb;
begin
  -- Define threat profiles
  v_techniques := case p_profile
    when 'ransomware' then array['T1486', 'T1490', 'T1027', 'T1547.001', 'T1059.001', 'T1059.003', 'T1082', 'T1083', 'T1105', 'T1112', 'T1489', 'T1562.001']
    when 'apt' then array['T1003.001', 'T1003.002', 'T1021.001', 'T1021.002', 'T1055', 'T1087', 'T1018', 'T1057', 'T1016', 'T1049', 'T1071.001', 'T1105']
    when 'initial_access' then array['T1566.001', 'T1566.002', 'T1190', 'T1133', 'T1078', 'T1189', 'T1195.002', 'T1199']
    when 'persistence' then array['T1547.001', 'T1543.003', 'T1053.005', 'T1136.001', 'T1546.003', 'T1574.001', 'T1574.002', 'T1505.003']
    when 'credential_access' then array['T1003.001', 'T1003.002', 'T1003.003', 'T1003.006', 'T1555', 'T1552.001', 'T1558.003', 'T1110.001', 'T1110.003']
    when 'defense_evasion' then array['T1027', 'T1070.001', 'T1055', 'T1218.011', 'T1036.005', 'T1562.001', 'T1112', 'T1140']
    when 'lateral_movement' then array['T1021.001', 'T1021.002', 'T1021.003', 'T1021.006', 'T1080', 'T1534', 'T1570']
    when 'exfiltration' then array['T1048.001', 'T1048.002', 'T1041', 'T1567.002', 'T1020', 'T1030']
    when 'impact' then array['T1486', 'T1490', 'T1489', 'T1485', 'T1491.001', 'T1529', 'T1561.002']
    when 'custom' then coalesce(p_custom_techniques, array[]::text[])
    else array['T1059.001', 'T1003.001', 'T1547.001', 'T1055', 'T1021.002']
  end;

  -- Analyze coverage
  with profile_analysis as (
    select
      t.technique_id,
      mo.name as technique_name,
      coalesce(cs.detection_count, 0) as detection_count,
      coalesce(cs.is_covered, false) as is_covered,
      cs.tactics
    from unnest(v_techniques) as t(technique_id)
    left join mitre_objects mo on mo.mitre_id = t.technique_id and mo.type = 'attack-pattern'
    left join mv_coverage_stats cs on cs.technique_id = t.technique_id
  )
  select jsonb_build_object(
    'profile', p_profile,
    'profile_techniques', array_length(v_techniques, 1),
    'covered', count(*) filter (where is_covered),
    'coverage_percent', case when count(*) > 0 
      then round((count(*) filter (where is_covered)::numeric / count(*)) * 100) 
      else 0 end,
    'critical_gaps', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'technique_id', technique_id,
          'name', coalesce(technique_name, technique_id),
          'tactic', coalesce(split_part(tactics, ', ', 1), 'Unknown'),
          'priority', 'high',
          'reason', 'Key technique in ' || p_profile || ' attack chain'
        )
      ), '[]'::jsonb)
      from profile_analysis
      where not is_covered
    ),
    'quick_wins', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'technique_id', technique_id,
          'name', coalesce(technique_name, technique_id),
          'reason', 'Already have ' || detection_count || ' detection(s), add more for depth'
        )
      ), '[]'::jsonb)
      from (
        select * from profile_analysis
        where is_covered and detection_count < 3
        order by detection_count
        limit 3
      ) t
    ),
    'recommendation', case 
      when count(*) filter (where is_covered)::float / nullif(count(*), 0) < 0.3 
        then 'Critical: Very low coverage for ' || p_profile || ' threats. Prioritize detection development.'
      when count(*) filter (where is_covered)::float / nullif(count(*), 0) < 0.6
        then 'Moderate: Partial coverage for ' || p_profile || ' threats. Focus on the identified gaps.'
      else 'Good: Reasonable coverage for ' || p_profile || ' threats. Consider depth improvements.'
    end
  )
  into v_result
  from profile_analysis;

  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_global_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role IN ('owner', 'admin')
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_global_admin_or_lead(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('owner', 'admin', 'lead')
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_defender_xdr_tables()
 RETURNS TABLE(name text, description text, has_data boolean, column_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT t.name, t.description, t.has_data,
    (SELECT count(*)::int FROM public.defender_xdr_columns c WHERE c.table_name = t.name) AS column_count
  FROM public.defender_xdr_tables t
  ORDER BY t.name;
$function$;
CREATE OR REPLACE FUNCTION public.lookup_defender_xdr_table(p_table_name text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'name', t.name,
    'description', t.description,
    'table_type', t.table_type,
    'retention', jsonb_build_object(
      'hot_days', t.hot_days,
      'cold_days', t.cold_days,
      'total_interactive_days', t.total_interactive_days
    ),
    'source_type', t.source_type,
    'has_data', t.has_data,
    'columns', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'type', c.column_type,
          'description', c.description
        ) ORDER BY c.column_name
      ) FROM public.defender_xdr_columns c WHERE c.table_name = t.name),
      '[]'::jsonb
    )
  )
  FROM public.defender_xdr_tables t
  WHERE lower(t.name) = lower(p_table_name);
$function$;
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE v_count INTEGER;
BEGIN
  IF p_notification_ids IS NULL THEN
    UPDATE user_notifications SET is_read = true, read_at = now()
    WHERE user_id = p_user_id AND is_read = false;
  ELSE
    UPDATE user_notifications SET is_read = true, read_at = now()
    WHERE user_id = p_user_id AND id = ANY(p_notification_ids) AND is_read = false;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.pack_update_with_lock(p_pack_id uuid, p_expected_updated_at timestamp with time zone, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_platforms text[] DEFAULT NULL::text[])
 RETURNS detection_packs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  current_updated timestamptz;
  updated_row detection_packs;
BEGIN
  SELECT updated_at INTO current_updated FROM detection_packs WHERE id = p_pack_id;

  IF current_updated IS NULL THEN
    RAISE EXCEPTION 'Pack not found' USING ERRCODE = 'P0002';
  END IF;

  -- Compare as epoch milliseconds to avoid microsecond precision issues
  IF EXTRACT(EPOCH FROM current_updated) * 1000 <> EXTRACT(EPOCH FROM p_expected_updated_at) * 1000 THEN
    RAISE EXCEPTION 'Pack was modified by another user. Reload and try again.'
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE detection_packs
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    icon = COALESCE(p_icon, icon),
    tags = COALESCE(p_tags, tags),
    platforms = COALESCE(p_platforms, platforms),
    updated_at = now()
  WHERE id = p_pack_id
  RETURNING * INTO updated_row;

  RETURN updated_row;
END;
$function$;
CREATE OR REPLACE FUNCTION public.populate_scoring_snapshot(p_mitre_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_snapshot_id uuid;
BEGIN
  -- Deactivate previous snapshots
  UPDATE mitre_scoring_snapshot SET is_active = false WHERE is_active = true;
  
  -- Insert new snapshot
  INSERT INTO mitre_scoring_snapshot (
    mitre_version,
    total_groups,
    total_techniques,
    total_campaigns,
    total_software,
    total_mitigations,
    total_strategies,
    max_group_technique_count,
    max_group_campaign_count,
    max_group_software_count,
    max_technique_group_count,
    max_technique_campaign_count
  )
  SELECT
    COALESCE(p_mitre_version, 'unknown'),
    (SELECT COUNT(*) FROM mitre_groups WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_techniques WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_campaigns),
    (SELECT COUNT(*) FROM mitre_software WHERE NOT deprecated),
    (SELECT COUNT(*) FROM mitre_mitigations WHERE NOT deprecated),
    (SELECT COUNT(*) FROM v_mitre_detection_strategies),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_techniques GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_campaigns GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_software GROUP BY group_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_group_techniques GROUP BY technique_stix_id) t),
    (SELECT COALESCE(MAX(cnt), 1) FROM (SELECT COUNT(*) as cnt FROM mitre_campaign_techniques GROUP BY technique_stix_id) t)
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.publish_pack_version(p_pack_id uuid, p_label text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS pack_versions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_pack detection_packs;
  v_next_number int;
  v_snapshot jsonb;
  v_detections jsonb;
  v_version pack_versions;
  v_user_id uuid := auth.uid();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_pack_id::text));

  SELECT * INTO v_pack FROM detection_packs WHERE id = p_pack_id;
  IF v_pack.id IS NULL THEN
    RAISE EXCEPTION 'Pack not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_number
  FROM pack_versions
  WHERE pack_id = p_pack_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(d.*)), '[]'::jsonb)
    INTO v_detections
  FROM pack_detections pd
  JOIN detections d ON d.id = pd.detection_id
  WHERE pd.pack_id = p_pack_id;

  v_snapshot := jsonb_build_object(
    'pack', jsonb_build_object(
      'name', v_pack.name,
      'description', v_pack.description,
      'icon', v_pack.icon,
      'tags', v_pack.tags,
      'platforms', v_pack.platforms,
      'mitre_technique_ids', v_pack.mitre_technique_ids,
      'pack_type', v_pack.pack_type,
      'source', v_pack.source,
      'auto_generated', v_pack.auto_generated,
      'generation_criteria', v_pack.generation_criteria
    ),
    'detections', v_detections,
    'published_at', now()
  );

  INSERT INTO pack_versions (
    pack_id, pack_name, version_number, label, notes, snapshot, created_by
  )
  VALUES (
    p_pack_id,
    v_pack.name,
    v_next_number,
    COALESCE(p_label, 'v' || v_next_number),
    p_notes,
    v_snapshot,
    v_user_id
  )
  RETURNING * INTO v_version;

  UPDATE detection_packs
  SET current_version_number = v_next_number
  WHERE id = p_pack_id;

  RETURN v_version;
END;
$function$;
CREATE OR REPLACE FUNCTION public.refresh_coverage_stats()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  refresh materialized view concurrently mv_coverage_stats;
end;
$function$;
CREATE OR REPLACE FUNCTION public.refresh_impact_materialized_views()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_threat_actor_weights;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_technique_importance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mitigation_impact;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_strategy_impact;
END;
$function$;
CREATE OR REPLACE FUNCTION public.remove_targeting_intel(p_stix_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE mitre_objects
  SET
    data = data - 'targeting_intel',
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.reserve_crowdstrike_finetune_query_slot(p_run_id uuid, p_budget integer)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  UPDATE public.crowdstrike_finetune_runs
     SET query_count = query_count + 1,
         updated_at = now()
   WHERE id = p_run_id
     AND status = 'running'
     AND query_count < p_budget
  RETURNING query_count;
$function$;
REVOKE ALL ON FUNCTION public.reserve_crowdstrike_finetune_query_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_crowdstrike_finetune_query_slot(uuid, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_finetune_query_slot(p_run_id uuid, p_budget integer)
 RETURNS integer
 LANGUAGE sql
AS $function$
  UPDATE detection_finetune_runs
     SET query_count = query_count + 1,
         updated_at  = now()
   WHERE id = p_run_id
     AND query_count < p_budget
  RETURNING query_count;
$function$;
CREATE OR REPLACE FUNCTION public.rollback_bulk_import(p_job_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_job RECORD;
  v_deleted_count INTEGER;
  v_result JSONB;
BEGIN
  -- HARDENING: permission decision must use the JWT identity, not p_user_id.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_job FROM bulk_import_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import job not found');
  END IF;
  IF v_job.status = 'reverted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Import has already been reverted');
  END IF;
  IF v_job.status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only completed or failed imports can be rolled back');
  END IF;

  IF v_job.user_id != p_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('owner', 'admin')) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Permission denied: you can only rollback your own imports');
    END IF;
  END IF;

  DELETE FROM detections WHERE bulk_import_id = p_job_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  UPDATE bulk_import_jobs
  SET status = 'reverted', reverted_at = now(), reverted_by = p_user_id, updated_at = now()
  WHERE id = p_job_id;

  v_result := jsonb_build_object('success', true, 'deleted_count', v_deleted_count,
                                 'job_id', p_job_id, 'reverted_at', now());
  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rollback_pack_to_version(p_pack_id uuid, p_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_detection_ids text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_pack_id::text));

  PERFORM publish_pack_version(
    p_pack_id,
    'Pre-rollback snapshot',
    'Auto-saved before rollback'
  );

  SELECT snapshot INTO v_snapshot
  FROM pack_versions
  WHERE id = p_version_id AND pack_id = p_pack_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Version not found for pack' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(d->>'id'), ARRAY[]::text[])
    INTO v_detection_ids
  FROM jsonb_array_elements(v_snapshot->'detections') AS d
  WHERE d->>'id' IS NOT NULL;

  DELETE FROM pack_detections WHERE pack_id = p_pack_id;

  IF array_length(v_detection_ids, 1) IS NOT NULL THEN
    INSERT INTO pack_detections (pack_id, detection_id)
    SELECT p_pack_id, did
    FROM unnest(v_detection_ids) AS did
    WHERE EXISTS (SELECT 1 FROM detections WHERE id = did)
    ON CONFLICT (pack_id, detection_id) DO NOTHING;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rollup_ai_usage()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO ai_usage_daily (
    day, user_id, feature, model, category,
    call_count, input_tokens, output_tokens, cached_input_tokens,
    image_count, cost_usd, failure_count
  )
  SELECT
    (created_at AT TIME ZONE 'UTC')::date,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    feature, model, category,
    COUNT(*),
    SUM(input_tokens), SUM(output_tokens), SUM(cached_input_tokens),
    SUM(image_count), SUM(cost_usd),
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)
  FROM ai_usage_events
  WHERE created_at >= (now() AT TIME ZONE 'UTC')::date - interval '1 day'
    AND created_at <  (now() AT TIME ZONE 'UTC')::date
  GROUP BY 1, 2, 3, 4, 5
  ON CONFLICT (day, user_id, feature, model, category) DO UPDATE SET
    call_count = EXCLUDED.call_count,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cached_input_tokens = EXCLUDED.cached_input_tokens,
    image_count = EXCLUDED.image_count,
    cost_usd = EXCLUDED.cost_usd,
    failure_count = EXCLUDED.failure_count,
    updated_at = now();

  DELETE FROM ai_usage_events WHERE created_at < now() - interval '90 days';
  DELETE FROM auto_digest_run_events WHERE created_at < now() - interval '90 days';
END;
$function$;
CREATE OR REPLACE FUNCTION public.search_detections_by_embedding(query_embedding vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 25)
 RETURNS TABLE(detection_id text, name text, description text, mitre_attack_ids text[], status text, severity text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select
    de.detection_id,
    d.name,
    d.description,
    d."mitreAttackIds" as mitre_attack_ids,
    d.status,
    d.severity,
    (1 - (de.embedding <=> query_embedding))::float as similarity
  from detection_embeddings de
  join detections d on d.id = de.detection_id
  where 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.search_detections_keyword(p_query text, p_status text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, name text, description text, status text, severity text, "mitreAttackIds" text[], "mitreTactics" text[], "queryLanguage" text, tags text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.name, d.description, d.status, d.severity,
         d."mitreAttackIds", d."mitreTactics", d."queryLanguage", d.tags
  FROM detections d
  WHERE (
    d.name ILIKE '%' || p_query || '%'
    OR d.description ILIKE '%' || p_query || '%'
  )
  AND (p_status   IS NULL OR d.status   = p_status)
  AND (p_severity IS NULL OR d.severity = p_severity)
  LIMIT LEAST(p_limit, 50);
$function$;
CREATE OR REPLACE FUNCTION public.search_mitre_objects(p_query text, p_entity_type text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(stix_id text, mitre_id text, name text, type text, description text, data jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT mo.stix_id, mo.mitre_id, mo.name, mo.type, mo.description, mo.data
  FROM mitre_objects mo
  WHERE (
    mo.name ILIKE '%' || p_query || '%'
    OR mo.mitre_id ILIKE '%' || p_query || '%'
    OR mo.description ILIKE '%' || p_query || '%'
  )
  AND (p_entity_type IS NULL OR mo.type = p_entity_type)
  LIMIT LEAST(p_limit, 50);
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_detection RECORD; v_request_id UUID; v_target_rule_id TEXT;
BEGIN
  -- HARDENING: bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;

  SELECT * INTO v_detection FROM detections
  WHERE id = p_detection_id AND library_type = 'development' AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user'); END IF;
  IF v_detection.promotion_status = 'pending' THEN RETURN json_build_object('success', false, 'error', 'Already pending approval'); END IF;
  IF v_detection.promotion_status = 'promoted' AND v_detection.promoted_at IS NOT NULL AND v_detection."updatedDate" <= v_detection.promoted_at THEN
    RETURN json_build_object('success', false, 'error', 'Already promoted and unchanged'); END IF;
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60'); END IF;
  IF v_detection.name IS NULL OR v_detection.name = '' THEN RETURN json_build_object('success', false, 'error', 'Name is required'); END IF;
  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters'); END IF;
  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required'); END IF;
  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN RETURN json_build_object('success', false, 'error', 'Detection query is required'); END IF;

  v_target_rule_id := v_detection.source_rule_id;
  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending') RETURNING id INTO v_request_id;
  UPDATE detections SET promotion_status = 'pending', "updatedDate" = now() WHERE id = p_detection_id;

  RETURN json_build_object('success', true, 'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.submit_for_promotion(p_detection_id text, p_user_id uuid DEFAULT auth.uid())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_detection RECORD; v_request_id UUID; v_target_rule_id TEXT;
BEGIN
  -- HARDENING: bind to the JWT identity.
  p_user_id := auth.uid();
  IF p_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;

  SELECT * INTO v_detection FROM detections
  WHERE id = p_detection_id AND library_type = 'development' AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Detection not found or not owned by user'); END IF;
  IF v_detection.promotion_status = 'pending' THEN RETURN json_build_object('success', false, 'error', 'Already pending approval'); END IF;
  IF COALESCE(v_detection."qualityScore", 0) < 60 THEN RETURN json_build_object('success', false, 'error', 'Quality score must be at least 60', 'current_score', v_detection."qualityScore"); END IF;
  IF v_detection.name IS NULL OR v_detection.name = '' THEN RETURN json_build_object('success', false, 'error', 'Name is required'); END IF;
  IF v_detection.description IS NULL OR LENGTH(v_detection.description) < 20 THEN RETURN json_build_object('success', false, 'error', 'Description must be at least 20 characters'); END IF;
  IF v_detection."mitreAttackIds" IS NULL OR array_length(v_detection."mitreAttackIds", 1) IS NULL THEN RETURN json_build_object('success', false, 'error', 'At least one MITRE technique is required'); END IF;
  IF v_detection."detectionQuery" IS NULL OR v_detection."detectionQuery" = '' THEN RETURN json_build_object('success', false, 'error', 'Detection query is required'); END IF;

  v_target_rule_id := v_detection.source_rule_id;
  INSERT INTO promotion_requests (detection_id, target_rule_id, submitted_by, status)
  VALUES (p_detection_id, v_target_rule_id, p_user_id, 'pending') RETURNING id INTO v_request_id;
  UPDATE detections SET promotion_status = 'pending', "updatedDate" = now() WHERE id = p_detection_id;

  RETURN json_build_object('success', true, 'request_id', v_request_id,
    'target_action', CASE WHEN v_target_rule_id IS NULL THEN 'create_new' ELSE 'update_existing' END,
    'target_rule_id', v_target_rule_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_affected_pack_mitre_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  affected_pack_id uuid;
BEGIN
  -- Only care if mitreAttackIds actually changed
  IF OLD."mitreAttackIds" IS NOT DISTINCT FROM NEW."mitreAttackIds" THEN
    RETURN NEW;
  END IF;

  -- For each pack containing this detection, recompute aggregate technique IDs
  FOR affected_pack_id IN
    SELECT DISTINCT pack_id FROM pack_detections WHERE detection_id = NEW.id
  LOOP
    UPDATE detection_packs
    SET mitre_technique_ids = (
      SELECT COALESCE(
        array_agg(DISTINCT tid ORDER BY tid),
        ARRAY[]::text[]
      )
      FROM pack_detections pd
      JOIN detections d ON d.id = pd.detection_id
      CROSS JOIN LATERAL unnest(COALESCE(d."mitreAttackIds", ARRAY[]::text[])) AS tid
      WHERE pd.pack_id = affected_pack_id
    ),
    updated_at = now()
    WHERE id = affected_pack_id;
  END LOOP;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_pack_rule_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Recompute rule_count for the affected pack
  IF TG_OP = 'DELETE' THEN
    UPDATE detection_packs
    SET rule_count = (
      SELECT COUNT(*) FROM pack_detections WHERE pack_id = OLD.pack_id
    ),
    updated_at = now()
    WHERE id = OLD.pack_id;
    RETURN OLD;
  ELSE
    UPDATE detection_packs
    SET rule_count = (
      SELECT COUNT(*) FROM pack_detections WHERE pack_id = NEW.pack_id
    ),
    updated_at = now()
    WHERE id = NEW.pack_id;
    RETURN NEW;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.threat_research_dispatch_job(p_job_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url        text;
  v_key        text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url   FROM vault.decrypted_secrets WHERE name = 'tr_supabase_url';
  SELECT decrypted_secret INTO v_key   FROM vault.decrypted_secrets WHERE name = 'tr_service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'threat_research_dispatch_job: missing vault secrets tr_supabase_url or tr_service_role_key';
  END IF;
  SELECT net.http_post(
    url     := v_url || '/functions/v1/threat-research-orchestrator?action=run_job',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('job_id', p_job_id)
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.threat_research_dispatch_next_in_phase(p_session_id uuid, p_phase text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_running        int;
  v_job_id         uuid;
  v_max_concurrent int;
BEGIN
  v_max_concurrent := CASE p_phase
    WHEN 'detection'       THEN 6
    WHEN 'qa'              THEN 6
    WHEN 'attack_research' THEN 2
    ELSE 1
  END;

  PERFORM pg_advisory_xact_lock(hashtext('tr-phase-' || p_session_id::text || '-' || p_phase));

  SELECT count(*) INTO v_running
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_phase
     AND status     = 'running';
  IF v_running >= v_max_concurrent THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_job_id
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_phase
     AND status     = 'pending'
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.threat_research_jobs
     SET status     = 'running',
         started_at = now()
   WHERE id = v_job_id;

  PERFORM public.threat_research_dispatch_job(v_job_id);
  RETURN v_job_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.threat_research_dispatcher()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_now timestamptz := now();
  v_grp RECORD;
  v_dispatched uuid;
BEGIN
  -- 1. Hard-kill exhausted-retry running jobs. The Supabase edge worker is
  --    killed at 400 s, so nothing legitimate is still alive at 480 s.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, 'reaper: worker exceeded edge-function lifetime'),
         completed_at   = v_now
   WHERE status     = 'running'
     AND attempt_count >= 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '240 seconds')
       OR (phase IN ('research','attack_research','opportunity_planning','detection') AND started_at < v_now - interval '480 seconds')
       OR (phase = 'qa'                                                     AND started_at < v_now - interval '480 seconds')
     );

  -- 2. Reset still-retryable stuck running jobs. 450 s = the 400 s platform
  --    ceiling plus headroom for clock skew and cron granularity. Kept below
  --    the hard-kill threshold so a job always gets its retries first.
  UPDATE public.threat_research_jobs
     SET status     = 'pending',
         started_at = NULL
   WHERE status     = 'running'
     AND attempt_count < 3
     AND (
       (phase IN ('preflight','finalise')                                  AND started_at < v_now - interval '240 seconds')
       OR (phase IN ('research','attack_research')                         AND started_at < v_now - interval '450 seconds')
       OR (phase IN ('opportunity_planning','detection')                   AND started_at < v_now - interval '450 seconds')
       OR (phase = 'qa'                                                    AND started_at < v_now - interval '450 seconds')
     );

  -- 3. Mark sessions failed when all their jobs have terminated AND at
  --    least one failed.
  UPDATE public.threat_research_sessions s
     SET status         = 'failed',
         failure_reason = COALESCE(
           (SELECT j.failure_reason
              FROM public.threat_research_jobs j
             WHERE j.session_id = s.id AND j.status = 'failed'
             ORDER BY j.completed_at DESC NULLS LAST
             LIMIT 1),
           'job worker exhausted retries'
         ),
         completed_at   = v_now,
         updated_at     = v_now
   WHERE s.status = 'running'
     AND EXISTS (
       SELECT 1 FROM public.threat_research_jobs j
        WHERE j.session_id = s.id AND j.status = 'failed'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.threat_research_jobs j
        WHERE j.session_id = s.id AND j.status IN ('pending','running')
     );

  -- 4. Dispatch stranded pending jobs.
  FOR v_grp IN
      SELECT DISTINCT session_id, phase
        FROM public.threat_research_jobs
       WHERE status     = 'pending'
         AND created_at < v_now - interval '30 seconds'
  LOOP
    LOOP
      SELECT public.threat_research_dispatch_next_in_phase(v_grp.session_id, v_grp.phase) INTO v_dispatched;
      EXIT WHEN v_dispatched IS NULL;
    END LOOP;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.threat_research_promote_phase(p_session_id uuid, p_completed_phase text, p_next_phase text, p_behaviour_ids text[] DEFAULT NULL::text[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_remaining      int;
  v_new_ids        uuid[] := '{}';
  v_id             uuid;
  v_bid            text;
  v_dispatched     int := 0;
  v_max_concurrent int;
BEGIN
  v_max_concurrent := CASE p_next_phase
    WHEN 'detection'       THEN 6
    WHEN 'qa'              THEN 6
    WHEN 'attack_research' THEN 2
    ELSE 1
  END;

  PERFORM pg_advisory_xact_lock(hashtext('tr-session-' || p_session_id::text));

  SELECT count(*) INTO v_remaining
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id
     AND phase      = p_completed_phase
     AND status NOT IN ('completed','failed');
  IF v_remaining > 0 THEN
    RETURN v_new_ids;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.threat_research_jobs
     WHERE session_id = p_session_id
       AND phase      = p_next_phase
  ) THEN
    RETURN v_new_ids;
  END IF;

  IF p_behaviour_ids IS NULL OR array_length(p_behaviour_ids, 1) IS NULL THEN
    INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
    VALUES (p_session_id, p_next_phase, NULL)
    RETURNING id INTO v_id;
    v_new_ids := array_append(v_new_ids, v_id);

    UPDATE public.threat_research_jobs
       SET status = 'running', started_at = now()
     WHERE id = v_id;
    PERFORM public.threat_research_dispatch_job(v_id);
  ELSE
    FOREACH v_bid IN ARRAY p_behaviour_ids LOOP
      INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
      VALUES (p_session_id, p_next_phase, v_bid)
      RETURNING id INTO v_id;
      v_new_ids := array_append(v_new_ids, v_id);

      IF v_dispatched < v_max_concurrent THEN
        UPDATE public.threat_research_jobs
           SET status = 'running', started_at = now()
         WHERE id = v_id;
        PERFORM public.threat_research_dispatch_job(v_id);
        v_dispatched := v_dispatched + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_new_ids;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tr_bump_caps(p_session_id uuid, p_model_delta integer, p_tool_delta integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_model int;
  v_tool  int;
BEGIN
  -- Hard ceiling so a misbehaving caller can't push caps to absurd values.
  -- 2000 is well above any realistic session (worst-case Volt Typhoon-class
  -- breakdown: ~20 behaviours × ~3 opportunities × ~5 QA calls = 300 calls,
  -- plus another ~100 for research/attack/engineer-gen).
  UPDATE public.threat_research_sessions
     SET model_call_cap = LEAST(2000, COALESCE(model_call_cap, 40) + GREATEST(0, p_model_delta)),
         tool_call_cap  = LEAST(2000, COALESCE(tool_call_cap,  30) + GREATEST(0, p_tool_delta)),
         updated_at     = now()
   WHERE id = p_session_id
   RETURNING model_call_cap, tool_call_cap
        INTO v_model, v_tool;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'model_call_cap', v_model,
    'tool_call_cap',  v_tool
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.tr_claim_job(p_job_id uuid)
 RETURNS TABLE(id uuid, session_id uuid, phase text, behaviour_id text, status text, attempt_count integer, failure_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.threat_research_jobs j
     SET status        = 'running',
         started_at    = now(),
         attempt_count = COALESCE(j.attempt_count, 0) + 1
   WHERE j.id = p_job_id
     AND j.status IN ('pending', 'running')
   RETURNING j.id, j.session_id, j.phase, j.behaviour_id, j.status, j.attempt_count, j.failure_reason;
END;
$function$;
-- Drop the pre-token four-argument signature. Postgres identifies a function
-- by its full argument list, so leaving it in place would give a
-- four-argument call two equally valid candidates and fail as ambiguous.
DROP FUNCTION IF EXISTS public.tr_consume_budget(uuid, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.tr_consume_budget(
  p_session_id     uuid,
  p_tool_calls     integer DEFAULT 0,
  p_model_calls    integer DEFAULT 0,
  p_tokens         integer DEFAULT 0,
  p_phase          text    DEFAULT NULL,
  p_tokens_reserve integer DEFAULT 0,
  p_tokens_release integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tool int;
  v_model int;
  v_tokens int;
  v_cap_tool int;
  v_cap_model int;
  v_token_cap int;
  v_tokens_reserved int;
  v_aborted_at timestamptz;
  v_abort_reason text;
  v_phase_cap int;
  v_phase_used int;
  v_phase_reserved int;
  c_default_tool  constant int := 30;
  c_default_model constant int := 40;
BEGIN
  -- Every parameter is a quantity consumed or reserved. A negative value would
  -- run the accounting backwards and hand out budget that was never earned.
  IF COALESCE(p_tool_calls, 0)     < 0
     OR COALESCE(p_model_calls, 0) < 0
     OR COALESCE(p_tokens, 0)      < 0
     OR COALESCE(p_tokens_reserve, 0) < 0
     OR COALESCE(p_tokens_release, 0) < 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'negative budget arguments are not permitted'
    );
  END IF;
  SELECT COALESCE(tool_calls_used, 0),
         COALESCE(model_calls_used, 0),
         COALESCE(total_tokens, 0),
         COALESCE(tool_call_cap,  c_default_tool),
         COALESCE(model_call_cap, c_default_model),
         token_cap,
         COALESCE(tokens_reserved, 0),
         aborted_at,
         abort_reason
    INTO v_tool, v_model, v_tokens, v_cap_tool, v_cap_model,
         v_token_cap, v_tokens_reserved, v_aborted_at, v_abort_reason
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'session not found');
  END IF;

  -- Before the caps: an aborted session stops regardless of remaining budget.
  IF v_aborted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'aborted', true,
      'reason', COALESCE(v_abort_reason, 'session aborted'),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;

  -- Session token gate. Counts in-flight reservations so concurrent workers
  -- cannot each pass and then collectively overspend.
  IF p_tokens_reserve > 0 AND v_token_cap IS NOT NULL
     AND v_tokens + v_tokens_reserved + p_tokens_reserve > v_token_cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('token cap reached (%s used + %s reserved + %s requested > %s)',
                       v_tokens, v_tokens_reserved, p_tokens_reserve, v_token_cap),
      'tokens_used', v_tokens, 'token_cap', v_token_cap,
      'tokens_reserved', v_tokens_reserved,
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model
    );
  END IF;

  -- Phase gate. A phase without a row is unbudgeted and passes.
  IF p_phase IS NOT NULL AND p_tokens_reserve > 0 THEN
    SELECT token_cap, tokens_used, tokens_reserved
      INTO v_phase_cap, v_phase_used, v_phase_reserved
      FROM public.threat_research_phase_budgets
     WHERE session_id = p_session_id AND phase = p_phase
     FOR UPDATE;
    IF FOUND AND v_phase_used + v_phase_reserved + p_tokens_reserve > v_phase_cap THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', format('phase token cap reached for %s (%s used + %s reserved + %s requested > %s)',
                         p_phase, v_phase_used, v_phase_reserved, p_tokens_reserve, v_phase_cap),
        'phase', p_phase,
        'phase_tokens_used', v_phase_used, 'phase_token_cap', v_phase_cap,
        'tokens_used', v_tokens, 'token_cap', v_token_cap
      );
    END IF;
  END IF;

  IF p_tool_calls > 0 AND v_tool + p_tool_calls > v_cap_tool THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('tool-call cap reached (%s/%s)', v_tool, v_cap_tool),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;
  IF p_model_calls > 0 AND v_model + p_model_calls > v_cap_model THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('model-call cap reached (%s/%s)', v_model, v_cap_model),
      'tool_used', v_tool, 'tool_cap', v_cap_tool,
      'model_used', v_model, 'model_cap', v_cap_model,
      'tokens_used', v_tokens
    );
  END IF;

  UPDATE public.threat_research_sessions
     SET tool_calls_used  = COALESCE(tool_calls_used,  0) + p_tool_calls,
         model_calls_used = COALESCE(model_calls_used, 0) + p_model_calls,
         total_tokens     = COALESCE(total_tokens,     0) + p_tokens,
         -- GREATEST(0, ...) so a double settle, or a settle whose reserve was
         -- lost with a killed worker, cannot drive the counter negative and
         -- silently hand out free budget.
         tokens_reserved  = GREATEST(0, COALESCE(tokens_reserved, 0) + p_tokens_reserve - p_tokens_release)
   WHERE id = p_session_id;

  IF p_phase IS NOT NULL AND (p_tokens <> 0 OR p_tokens_reserve <> 0 OR p_tokens_release <> 0) THEN
    UPDATE public.threat_research_phase_budgets
       SET tokens_used     = tokens_used + p_tokens,
           tokens_reserved = GREATEST(0, tokens_reserved + p_tokens_reserve - p_tokens_release)
     WHERE session_id = p_session_id AND phase = p_phase;
  END IF;

  v_tool   := v_tool   + p_tool_calls;
  v_model  := v_model  + p_model_calls;
  v_tokens := v_tokens + p_tokens;

  RETURN jsonb_build_object(
    'allowed', true,
    'tool_used', v_tool, 'tool_cap', v_cap_tool,
    'model_used', v_model, 'model_cap', v_cap_model,
    'tokens_used', v_tokens, 'token_cap', v_token_cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer)
  TO service_role;

-- The grants for tr_set_phase_budgets and tr_abort_session used to sit here,
-- ahead of the CREATE statements below, which a fresh database rejects with
-- "function ... does not exist". They now follow each function's definition.

COMMENT ON FUNCTION public.tr_consume_budget(uuid, integer, integer, integer, text, integer, integer) IS
  'Atomic budget check-and-spend for a threat-research session. SECURITY DEFINER, service-role only: it validates no caller identity, so end-user execution must stay revoked. Any future signature change must re-apply these grants -- DROP discards the ACL and Supabase default privileges re-grant anon/authenticated.';

CREATE OR REPLACE FUNCTION public.tr_set_phase_budgets(
  p_session_id uuid,
  p_token_cap  integer,
  p_phases     jsonb          -- {"detection": 300000, "qa": 120000, ...}
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phase text;
  v_cap   int;
  v_count int := 0;
BEGIN
  UPDATE public.threat_research_sessions
     SET token_cap  = p_token_cap,
         updated_at = now()
   WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session not found');
  END IF;

  FOR v_phase, v_cap IN SELECT key, value::int FROM jsonb_each_text(p_phases) LOOP
    INSERT INTO public.threat_research_phase_budgets (session_id, phase, token_cap)
    VALUES (p_session_id, v_phase, v_cap)
    ON CONFLICT (session_id, phase) DO UPDATE
      -- Re-sizing may only raise a floor. Lowering one mid-session could
      -- retroactively starve a phase that has already spent against it.
      SET token_cap = GREATEST(public.threat_research_phase_budgets.token_cap, EXCLUDED.token_cap);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'phases', v_count, 'token_cap', p_token_cap);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tr_set_phase_budgets(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_set_phase_budgets(uuid, integer, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.tr_abort_session(p_session_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_already   timestamptz;
  v_cancelled int := 0;
BEGIN
  -- Idempotent: several workers hit the same account-scoped provider failure
  -- within the same second, so the first to arrive wins.
  SELECT aborted_at INTO v_already
    FROM public.threat_research_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('aborted', false, 'reason', 'session not found');
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('aborted', true, 'already_aborted', true);
  END IF;

  UPDATE public.threat_research_sessions
     SET aborted_at     = now(),
         abort_reason   = p_reason,
         status         = 'failed',
         failure_reason = p_reason,
         completed_at   = now(),
         updated_at     = now()
   WHERE id = p_session_id;

  -- Fail everything not yet started; running jobs stop cooperatively at their
  -- next tr_consume_budget call.
  UPDATE public.threat_research_jobs
     SET status         = 'failed',
         failure_reason = COALESCE(failure_reason, p_reason),
         completed_at   = now()
   WHERE session_id = p_session_id
     AND status     = 'pending';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object(
    'aborted', true,
    'already_aborted', false,
    'pending_jobs_cancelled', v_cancelled
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tr_abort_session(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_abort_session(uuid, text) TO service_role;
CREATE OR REPLACE FUNCTION public.tr_find_actor_tagged_detections(p_aliases text[], p_limit integer DEFAULT 200, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, name text, severity text, mitre_technique_ids text[], matching_aliases text[])
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    d.id,
    d.name,
    d.severity,
    d."mitreAttackIds" AS mitre_technique_ids,
    ARRAY(SELECT DISTINCT t FROM unnest(d.tags) t WHERE t = ANY(p_aliases))::text[] AS matching_aliases
  FROM public.detections d
  WHERE d.tags && p_aliases
    AND (
      d.library_type = 'production'
      OR (d.library_type = 'development' AND (d.visibility = 'shared' OR d.user_id = p_user_id))
    )
  ORDER BY d."updatedDate" DESC NULLS LAST
  LIMIT p_limit;
$function$;
CREATE OR REPLACE FUNCTION public.tr_patch_behaviour(p_session_id uuid, p_behaviour_id text, p_patch jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_idx int;
BEGIN
  SELECT (idx - 1)::int INTO v_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id
     AND arr.item->>'id' = p_behaviour_id
   LIMIT 1;
  IF v_idx IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.threat_research_sessions
     SET tree = jsonb_set(
                  tree,
                  ARRAY['behaviours', v_idx::text],
                  (tree->'behaviours'->v_idx) || p_patch,
                  false
                ),
         updated_at = now()
   WHERE id = p_session_id;
  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tr_patch_detection(p_session_id uuid, p_behaviour_id text, p_opportunity_id text, p_detection_id text, p_patch jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_b_idx int;
  v_o_idx int;
  v_existing_det_id text;
BEGIN
  -- HARDENING: end-user callers must own the session. Service-role
  -- (orchestrator) calls carry no JWT subject, so auth.uid() is NULL and the
  -- check is skipped. SECURITY DEFINER bypasses RLS, so this is the only
  -- thing standing between an authenticated caller and another user's tree.
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.threat_research_sessions s
        WHERE s.id = p_session_id AND s.user_id = (SELECT auth.uid())
     ) THEN
    RETURN false;
  END IF;

  SELECT (idx - 1)::int INTO v_b_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id AND arr.item->>'id' = p_behaviour_id LIMIT 1;
  IF v_b_idx IS NULL THEN RETURN false; END IF;

  SELECT (idx - 1)::int INTO v_o_idx
    FROM public.threat_research_sessions s,
         jsonb_array_elements(s.tree->'behaviours'->v_b_idx->'opportunities') WITH ORDINALITY AS arr(item, idx)
   WHERE s.id = p_session_id AND arr.item->>'id' = p_opportunity_id LIMIT 1;
  IF v_o_idx IS NULL THEN RETURN false; END IF;

  SELECT (tree->'behaviours'->v_b_idx->'opportunities'->v_o_idx->'detection'->>'id')
    INTO v_existing_det_id
    FROM public.threat_research_sessions WHERE id = p_session_id;
  IF v_existing_det_id IS DISTINCT FROM p_detection_id THEN
    RETURN false;
  END IF;

  UPDATE public.threat_research_sessions
     SET tree = jsonb_set(
                  tree,
                  ARRAY['behaviours', v_b_idx::text, 'opportunities', v_o_idx::text, 'detection'],
                  (tree->'behaviours'->v_b_idx->'opportunities'->v_o_idx->'detection') || p_patch,
                  false
                ),
         updated_at = now()
   WHERE id = p_session_id;
  RETURN true;
END;
$function$;
-- tr_patch_detection's in-body ownership guard skips when auth.uid() IS NULL,
-- which is how the service-role worker calls it. anon also presents no JWT
-- subject, so anon MUST NOT hold EXECUTE or the guard is trivially bypassed.
-- tr_patch_behaviour has no in-body guard at all and is worker-only.
REVOKE EXECUTE ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tr_patch_detection(uuid, text, text, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tr_patch_behaviour(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tr_patch_behaviour(uuid, text, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.tr_promote_finalise_if_ready(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_detection_pending int;
  v_detection_total   int;
  v_qa_pending        int;
  v_qa_total          int;
  v_finalise_id       uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tr-finalise-' || p_session_id::text));

  SELECT
    count(*) FILTER (WHERE status NOT IN ('completed','failed')),
    count(*)
    INTO v_detection_pending, v_detection_total
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'detection';

  SELECT
    count(*) FILTER (WHERE status NOT IN ('completed','failed')),
    count(*)
    INTO v_qa_pending, v_qa_total
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'qa';

  IF v_detection_pending > 0 OR v_qa_pending > 0 THEN
    RETURN jsonb_build_object(
      'fired', false,
      'reason', 'blocked',
      'detection_pending', v_detection_pending,
      'detection_total', v_detection_total,
      'qa_pending', v_qa_pending,
      'qa_total', v_qa_total
    );
  END IF;

  -- Idempotency: another concurrent worker may have already inserted
  -- finalise after the advisory lock was released. Bail with diagnostic.
  SELECT id INTO v_finalise_id
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id AND phase = 'finalise'
   LIMIT 1;
  IF v_finalise_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'fired', false,
      'reason', 'already_exists',
      'finalise_job_id', v_finalise_id,
      'detection_total', v_detection_total,
      'qa_total', v_qa_total
    );
  END IF;

  INSERT INTO public.threat_research_jobs (session_id, phase, behaviour_id)
  VALUES (p_session_id, 'finalise', NULL)
  RETURNING id INTO v_finalise_id;

  UPDATE public.threat_research_jobs
     SET status = 'running', started_at = now()
   WHERE id = v_finalise_id;

  PERFORM public.threat_research_dispatch_job(v_finalise_id);

  RETURN jsonb_build_object(
    'fired', true,
    'reason', 'gate_cleared',
    'finalise_job_id', v_finalise_id,
    'detection_total', v_detection_total,
    'qa_total', v_qa_total
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.tr_session_debug(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session record;
  v_jobs jsonb;
  v_ai_usage jsonb;
  v_tree_summary jsonb;
BEGIN
  -- 1. Session row.
  SELECT id, user_id, status, failure_reason, input_text, input_classification,
         duration_ms, model_calls_used, model_call_cap, tool_calls_used, tool_call_cap,
         total_tokens, created_at, completed_at, updated_at, tree
    INTO v_session
    FROM public.threat_research_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'session not found', 'session_id', p_session_id);
  END IF;

  -- 2. Authorization: a user can only inspect their own sessions. Service
  -- role bypasses RLS so this function-level check matters.
  IF v_session.user_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('owner','admin')
     )
     AND current_setting('role') <> 'service_role'
  THEN
    RETURN jsonb_build_object('error', 'forbidden', 'session_id', p_session_id);
  END IF;

  -- 3. Jobs summary with per-job duration.
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', id,
             'phase', phase,
             'status', status,
             'behaviour_id', behaviour_id,
             'attempt_count', attempt_count,
             'started_at', started_at,
             'completed_at', completed_at,
             'failure_reason', failure_reason,
             'duration_ms', CASE
               WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                 THEN round(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int
               ELSE NULL
             END
           )
           ORDER BY created_at
         ) INTO v_jobs
    FROM public.threat_research_jobs
   WHERE session_id = p_session_id;

  -- 4. AI usage rollup (per feature x model) over the session's lifetime.
  -- Approximated by user_id + time window + 'tr-' feature prefix because
  -- ai_usage_events has no session_id FK today. See file header.
  SELECT jsonb_agg(g) INTO v_ai_usage
    FROM (
      SELECT jsonb_build_object(
               'feature', feature,
               'model', model,
               'calls', count(*),
               'success_calls', count(*) FILTER (WHERE status = 'success'),
               'failed_calls', count(*) FILTER (WHERE status <> 'success'),
               'rate_limit_calls', count(*) FILTER (WHERE status = 'rate_limit'),
               'timeout_calls', count(*) FILTER (WHERE status = 'timeout'),
               'input_tokens', sum(input_tokens),
               'cached_input_tokens', sum(cached_input_tokens),
               'output_tokens', sum(output_tokens),
               'cost_usd', round(sum(cost_usd)::numeric, 4),
               'avg_latency_ms', round(avg(latency_ms)::numeric, 0),
               'cache_hit_pct', round(
                 100.0 * sum(cached_input_tokens) /
                 NULLIF(sum(input_tokens + cached_input_tokens), 0),
                 1
               )
             ) AS g
        FROM public.ai_usage_events
       WHERE user_id = v_session.user_id
         AND feature LIKE 'tr-%'
         AND created_at >= v_session.created_at
         AND created_at <= COALESCE(v_session.completed_at, now())
       GROUP BY feature, model
       ORDER BY feature, model
    ) sub;

  -- 5. Tree summary (counts derived from the JSONB tree state).
  WITH tree AS (SELECT v_session.tree AS t),
       behaviours AS (
         SELECT b
           FROM tree, jsonb_array_elements(COALESCE(t->'behaviours', '[]'::jsonb)) b
       ),
       opportunities AS (
         SELECT o, b
           FROM behaviours,
                jsonb_array_elements(COALESCE(b->'opportunities', '[]'::jsonb)) o
       )
  SELECT jsonb_build_object(
    'planner_status', v_session.tree->>'planner_status',
    'subject_classification', v_session.tree->'subject'->>'classification',
    'subject_name', v_session.tree->'subject'->>'subject',
    'behaviour_count', (SELECT count(*) FROM behaviours),
    'opportunity_count', (SELECT count(*) FROM opportunities),
    'detection_with_query', (
      SELECT count(*) FROM opportunities
       WHERE COALESCE(length(o->'detection'->>'query'), 0) > 0
    ),
    'library_match_count', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->>'saved_detection_id' IS NOT NULL
    ),
    'qa_passed', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'pass'
    ),
    'qa_pass_with_concerns', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'pass_with_concerns'
    ),
    'qa_failed', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'verdict' = 'fail'
    ),
    'qa_error_count', (
      SELECT count(*) FROM opportunities
       WHERE (o->'detection'->>'qa_error') IS NOT NULL
         AND (o->'detection'->>'qa_error') <> ''
    ),
    'engineer_failed_count', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->>'qa_error' = 'engineer_failed'
    ),
    'behaviours_not_detectable', (
      SELECT count(*) FROM behaviours
       WHERE b->>'detectability' = 'not_detectable'
    ),
    'behaviours_merged_into_others', (
      SELECT count(*) FROM behaviours
       WHERE jsonb_array_length(COALESCE(b->'merged_into_opportunity_ids', '[]'::jsonb)) > 0
    ),
    'duplicates_flagged', (
      SELECT count(*) FROM opportunities
       WHERE o->'detection'->'qa'->>'duplicate_of' IS NOT NULL
    )
  ) INTO v_tree_summary;

  -- 6. Assemble the final document.
  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'failure_reason', v_session.failure_reason,
      'input_text', v_session.input_text,
      'input_classification', v_session.input_classification,
      'duration_ms', v_session.duration_ms,
      'budget', jsonb_build_object(
        'model_calls_used', v_session.model_calls_used,
        'model_call_cap', v_session.model_call_cap,
        'tool_calls_used', v_session.tool_calls_used,
        'tool_call_cap', v_session.tool_call_cap,
        'total_tokens', v_session.total_tokens
      ),
      'created_at', v_session.created_at,
      'completed_at', v_session.completed_at
    ),
    'tree_summary', v_tree_summary,
    'jobs', COALESCE(v_jobs, '[]'::jsonb),
    'ai_usage', COALESCE(v_ai_usage, '[]'::jsonb)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_bulk_import_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_detection_drift_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_detection_fts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.fts_vector := generate_detection_fts_vector(
    new.name,
    new.description,
    new."detectionQuery",
    new."mitreAttackIds",
    new.tags,
    new."queryExplanation"
  );
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_environment_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $function$;
CREATE OR REPLACE FUNCTION public.update_integrations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_scoring_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_targeting_intel(p_stix_id text, p_targeting_intel jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE mitre_objects
  SET
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('targeting_intel', p_targeting_intel),
    updated_at = NOW()
  WHERE stix_id = p_stix_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MITRE object not found: %', p_stix_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_user_dashboards_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_rate_limit(p_key text, p_window_start timestamp with time zone, p_max_requests integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count int;
BEGIN
  INSERT INTO rate_limits (key, request_count, window_start)
  VALUES (p_key, 1, date_trunc('minute', p_window_start))
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.validate_defender_xdr_columns(p_table_name text, p_column_names text[])
 RETURNS TABLE(unknown_column text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT n AS unknown_column
  FROM unnest(p_column_names) AS n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.defender_xdr_columns c
    WHERE lower(c.table_name) = lower(p_table_name)
      AND lower(c.column_name) = lower(n)
  );
$function$;

-- ============================================================
-- Views and materialized views (dependency ordered)
-- ============================================================
CREATE OR REPLACE VIEW public."mitre_campaign_techniques" WITH (security_invoker=on) AS
 SELECT DISTINCT r.source_ref AS campaign_stix_id,
    r.target_ref AS technique_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects c ON (((r.source_ref = c.stix_id) AND (c.type = 'campaign'::text))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);
CREATE OR REPLACE VIEW public."mitre_campaigns" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified,
    ((data ->> 'first_seen'::text))::timestamp with time zone AS first_seen,
    ((data ->> 'last_seen'::text))::timestamp with time zone AS last_seen
   FROM mitre_objects
  WHERE (type = 'campaign'::text);
CREATE OR REPLACE VIEW public."mitre_group_campaigns" WITH (security_invoker=on) AS
 SELECT DISTINCT r.target_ref AS group_stix_id,
    r.source_ref AS campaign_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.target_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects c ON (((r.source_ref = c.stix_id) AND (c.type = 'campaign'::text))))
  WHERE (r.relationship_type = 'attributed-to'::text);
CREATE OR REPLACE VIEW public."mitre_group_software" WITH (security_invoker=on) AS
 SELECT DISTINCT r.source_ref AS group_stix_id,
    r.target_ref AS software_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.source_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects s ON (((r.target_ref = s.stix_id) AND (s.type = ANY (ARRAY['malware'::text, 'tool'::text])))))
  WHERE (r.relationship_type = 'uses'::text);
CREATE OR REPLACE VIEW public."mitre_group_techniques" WITH (security_invoker=on) AS
 SELECT DISTINCT r.source_ref AS group_stix_id,
    r.target_ref AS technique_stix_id,
    r.description AS usage_description
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.source_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);
CREATE OR REPLACE VIEW public."mitre_groups" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified
   FROM mitre_objects
  WHERE (type = 'intrusion-set'::text);
CREATE OR REPLACE VIEW public."mitre_mitigations" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified
   FROM mitre_objects
  WHERE ((type = 'course-of-action'::text) AND (mitre_id ~~ 'M%'::text));
CREATE OR REPLACE VIEW public."mitre_software" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified,
    type AS software_type
   FROM mitre_objects
  WHERE (type = ANY (ARRAY['malware'::text, 'tool'::text]));
CREATE OR REPLACE VIEW public."mitre_software_techniques" WITH (security_invoker=on) AS
 SELECT DISTINCT r.source_ref AS software_stix_id,
    r.target_ref AS technique_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects s ON (((r.source_ref = s.stix_id) AND (s.type = ANY (ARRAY['malware'::text, 'tool'::text])))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);
CREATE OR REPLACE VIEW public."mitre_techniques" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified,
    ARRAY( SELECT (jsonb_array_elements((mitre_objects.data -> 'kill_chain_phases'::text)) ->> 'phase_name'::text)) AS tactics,
    ((data ->> 'x_mitre_is_subtechnique'::text))::boolean AS is_subtechnique
   FROM mitre_objects
  WHERE (type = 'attack-pattern'::text);
CREATE MATERIALIZED VIEW IF NOT EXISTS public."mv_coverage_stats" AS
 WITH technique_coverage AS (
         SELECT unnest(detections."mitreAttackIds") AS technique_id,
            count(*) AS detection_count,
            count(*) FILTER (WHERE (detections.status = 'Production'::text)) AS production_count
           FROM detections
          WHERE ((detections."mitreAttackIds" IS NOT NULL) AND (array_length(detections."mitreAttackIds", 1) > 0))
          GROUP BY (unnest(detections."mitreAttackIds"))
        ), mitre_techniques AS (
         SELECT mo.mitre_id,
            mo.name,
            mo.stix_id,
            COALESCE((mo.data ->> 'x_mitre_is_subtechnique'::text), 'false'::text) AS is_subtechnique,
            ( SELECT string_agg(DISTINCT replace((kcp.value ->> 'phase_name'::text), '-'::text, ' '::text), ', '::text) AS string_agg
                   FROM jsonb_array_elements((mo.data -> 'kill_chain_phases'::text)) kcp(value)
                  WHERE ((kcp.value ->> 'kill_chain_name'::text) = 'mitre-attack'::text)) AS tactics
           FROM mitre_objects mo
          WHERE ((mo.type = 'attack-pattern'::text) AND (mo.mitre_id IS NOT NULL))
        )
 SELECT mt.mitre_id AS technique_id,
    mt.name AS technique_name,
    mt.stix_id,
    mt.tactics,
    (mt.is_subtechnique)::boolean AS is_subtechnique,
    COALESCE(tc.detection_count, (0)::bigint) AS detection_count,
    COALESCE(tc.production_count, (0)::bigint) AS production_count,
        CASE
            WHEN (tc.detection_count > 0) THEN true
            ELSE false
        END AS is_covered
   FROM (mitre_techniques mt
     LEFT JOIN technique_coverage tc ON ((mt.mitre_id = tc.technique_id)))
WITH DATA;
CREATE MATERIALIZED VIEW IF NOT EXISTS public."mv_technique_importance" AS
 WITH technique_usage AS (
         SELECT t.stix_id,
            t.mitre_id,
            t.name,
            t.tactics,
            count(DISTINCT gt.group_stix_id) AS group_count,
            count(DISTINCT ct.campaign_stix_id) AS campaign_count,
            COALESCE(( SELECT count(*) AS count
                   FROM mitre_relationships r
                  WHERE ((r.target_ref = t.stix_id) AND (r.relationship_type = 'mitigates'::text))), (0)::bigint) AS mitigation_count,
            COALESCE(( SELECT count(*) AS count
                   FROM mitre_relationships r
                  WHERE ((r.target_ref = t.stix_id) AND (r.relationship_type = 'detects'::text))), (0)::bigint) AS detection_count
           FROM ((mitre_techniques t
             LEFT JOIN mitre_group_techniques gt ON ((gt.technique_stix_id = t.stix_id)))
             LEFT JOIN mitre_campaign_techniques ct ON ((ct.technique_stix_id = t.stix_id)))
          GROUP BY t.stix_id, t.mitre_id, t.name, t.tactics
        ), percentiles AS (
         SELECT tu.stix_id,
            tu.mitre_id,
            tu.name,
            tu.tactics,
            tu.group_count,
            tu.campaign_count,
            tu.mitigation_count,
            tu.detection_count,
            percent_rank() OVER (ORDER BY tu.group_count) AS group_percentile,
            percent_rank() OVER (ORDER BY tu.campaign_count) AS campaign_percentile,
                CASE
                    WHEN ((tu.mitigation_count + tu.detection_count) = 0) THEN 1.0
                    WHEN ((tu.mitigation_count + tu.detection_count) <= 2) THEN 0.8
                    WHEN ((tu.mitigation_count + tu.detection_count) <= 5) THEN 0.5
                    ELSE 0.3
                END AS defense_scarcity
           FROM technique_usage tu
        )
 SELECT stix_id,
    mitre_id,
    name,
    tactics,
    group_count,
    campaign_count,
    mitigation_count,
    detection_count,
    group_percentile,
    campaign_percentile,
    defense_scarcity,
    ((((group_percentile * (0.30)::double precision) + (campaign_percentile * (0.25)::double precision)) + ((defense_scarcity * 0.25))::double precision) + ((0.5 * 0.20))::double precision) AS tis
   FROM percentiles p
WITH DATA;
CREATE OR REPLACE VIEW public."v_group_recency" WITH (security_invoker=on) AS
 SELECT g.stix_id,
    g.mitre_id,
    g.name,
    max(c.last_seen) AS most_recent_activity,
    max(c.first_seen) AS earliest_activity,
    count(DISTINCT c.stix_id) AS campaign_count,
        CASE
            WHEN (max(c.last_seen) >= (now() - '1 year'::interval)) THEN 1.3
            WHEN (max(c.last_seen) >= (now() - '2 years'::interval)) THEN 1.0
            WHEN (max(c.last_seen) >= (now() - '4 years'::interval)) THEN 0.7
            WHEN (max(c.last_seen) IS NOT NULL) THEN 0.4
            ELSE 0.6
        END AS recency_multiplier
   FROM ((mitre_groups g
     LEFT JOIN mitre_group_campaigns gc ON ((g.stix_id = gc.group_stix_id)))
     LEFT JOIN mitre_campaigns c ON ((gc.campaign_stix_id = c.stix_id)))
  WHERE (NOT g.deprecated)
  GROUP BY g.stix_id, g.mitre_id, g.name;
CREATE MATERIALIZED VIEW IF NOT EXISTS public."mv_threat_actor_weights" AS
 WITH group_stats AS (
         SELECT g.stix_id,
            g.mitre_id,
            g.name,
            g.description,
            COALESCE(gt.technique_count, (0)::bigint) AS technique_count,
            COALESCE(gc.campaign_count, (0)::bigint) AS campaign_count,
            COALESCE(gs_1.software_count, (0)::bigint) AS software_count,
            COALESCE(gt.tactic_count, (0)::bigint) AS tactic_count,
            COALESCE(gr.recency_multiplier, 0.6) AS recency_multiplier
           FROM ((((mitre_groups g
             LEFT JOIN ( SELECT gt_1.group_stix_id,
                    count(DISTINCT gt_1.technique_stix_id) AS technique_count,
                    count(DISTINCT tactic.tactic) AS tactic_count
                   FROM ((mitre_group_techniques gt_1
                     JOIN mitre_techniques t ON ((t.stix_id = gt_1.technique_stix_id)))
                     CROSS JOIN LATERAL unnest(t.tactics) tactic(tactic))
                  GROUP BY gt_1.group_stix_id) gt ON ((gt.group_stix_id = g.stix_id)))
             LEFT JOIN ( SELECT mitre_group_campaigns.group_stix_id,
                    count(*) AS campaign_count
                   FROM mitre_group_campaigns
                  GROUP BY mitre_group_campaigns.group_stix_id) gc ON ((gc.group_stix_id = g.stix_id)))
             LEFT JOIN ( SELECT mitre_group_software.group_stix_id,
                    count(*) AS software_count
                   FROM mitre_group_software
                  GROUP BY mitre_group_software.group_stix_id) gs_1 ON ((gs_1.group_stix_id = g.stix_id)))
             LEFT JOIN v_group_recency gr ON ((gr.stix_id = g.stix_id)))
        ), snapshot AS (
         SELECT mitre_scoring_snapshot.id,
            mitre_scoring_snapshot.created_at,
            mitre_scoring_snapshot.mitre_version,
            mitre_scoring_snapshot.total_groups,
            mitre_scoring_snapshot.total_techniques,
            mitre_scoring_snapshot.total_campaigns,
            mitre_scoring_snapshot.total_software,
            mitre_scoring_snapshot.total_mitigations,
            mitre_scoring_snapshot.total_strategies,
            mitre_scoring_snapshot.max_group_technique_count,
            mitre_scoring_snapshot.max_group_campaign_count,
            mitre_scoring_snapshot.max_group_software_count,
            mitre_scoring_snapshot.max_technique_group_count,
            mitre_scoring_snapshot.max_technique_campaign_count,
            mitre_scoring_snapshot.is_active
           FROM mitre_scoring_snapshot
          WHERE (mitre_scoring_snapshot.is_active = true)
         LIMIT 1
        )
 SELECT gs.stix_id,
    gs.mitre_id,
    gs.name,
    gs.description,
    gs.technique_count,
    gs.campaign_count,
    gs.software_count,
    gs.tactic_count,
    gs.recency_multiplier,
    (((
        CASE
            WHEN (s.max_group_technique_count > 0) THEN (((gs.technique_count)::numeric / (s.max_group_technique_count)::numeric) * 0.35)
            ELSE (0)::numeric
        END +
        CASE
            WHEN (s.max_group_campaign_count > 0) THEN (((gs.campaign_count)::numeric / (s.max_group_campaign_count)::numeric) * 0.30)
            ELSE (0)::numeric
        END) + (((gs.tactic_count)::numeric / 14.0) * 0.25)) +
        CASE
            WHEN (s.max_group_software_count > 0) THEN (((gs.software_count)::numeric / (s.max_group_software_count)::numeric) * 0.10)
            ELSE (0)::numeric
        END) AS base_weight,
    ((((
        CASE
            WHEN (s.max_group_technique_count > 0) THEN (((gs.technique_count)::numeric / (s.max_group_technique_count)::numeric) * 0.35)
            ELSE (0)::numeric
        END +
        CASE
            WHEN (s.max_group_campaign_count > 0) THEN (((gs.campaign_count)::numeric / (s.max_group_campaign_count)::numeric) * 0.30)
            ELSE (0)::numeric
        END) + (((gs.tactic_count)::numeric / 14.0) * 0.25)) +
        CASE
            WHEN (s.max_group_software_count > 0) THEN (((gs.software_count)::numeric / (s.max_group_software_count)::numeric) * 0.10)
            ELSE (0)::numeric
        END) * gs.recency_multiplier) AS taw
   FROM (group_stats gs
     CROSS JOIN snapshot s)
WITH DATA;
CREATE MATERIALIZED VIEW IF NOT EXISTS public."mv_mitigation_impact" AS
 WITH mitigation_techniques AS (
         SELECT m.stix_id AS mitigation_stix_id,
            m.mitre_id AS mitigation_mitre_id,
            m.name AS mitigation_name,
            m.description,
            t.stix_id AS technique_stix_id,
            ti.tis,
            ti.group_count
           FROM (((mitre_mitigations m
             JOIN mitre_relationships r ON (((r.source_ref = m.stix_id) AND (r.relationship_type = 'mitigates'::text))))
             JOIN mv_technique_importance ti ON ((ti.stix_id = r.target_ref)))
             JOIN mitre_techniques t ON ((t.stix_id = ti.stix_id)))
        ), mitigation_groups AS (
         SELECT mt.mitigation_stix_id,
            gt.group_stix_id,
            taw.taw,
            count(*) AS techniques_blocked
           FROM ((mitigation_techniques mt
             JOIN mitre_group_techniques gt ON ((gt.technique_stix_id = mt.technique_stix_id)))
             JOIN mv_threat_actor_weights taw ON ((taw.stix_id = gt.group_stix_id)))
          GROUP BY mt.mitigation_stix_id, gt.group_stix_id, taw.taw
        ), mitigation_scores AS (
         SELECT mt.mitigation_stix_id,
            mt.mitigation_mitre_id,
            mt.mitigation_name,
            max(mt.description) AS description,
            count(DISTINCT mt.technique_stix_id) AS technique_count,
            count(DISTINCT mg.group_stix_id) AS groups_disrupted,
            COALESCE(sum((mt.tis * (mg.taw)::double precision)), (0)::double precision) AS raw_score
           FROM (mitigation_techniques mt
             LEFT JOIN mitigation_groups mg ON ((mg.mitigation_stix_id = mt.mitigation_stix_id)))
          GROUP BY mt.mitigation_stix_id, mt.mitigation_mitre_id, mt.mitigation_name
        ), score_stats AS (
         SELECT percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY mitigation_scores.raw_score) AS median_score,
            max(mitigation_scores.raw_score) AS max_score
           FROM mitigation_scores
        )
 SELECT ms.mitigation_stix_id AS stix_id,
    ms.mitigation_mitre_id AS mitre_id,
    ms.mitigation_name AS name,
    ms.description,
    ms.technique_count,
    ms.groups_disrupted,
    ms.raw_score,
    (round(((100)::double precision / ((1)::double precision + exp((('-0.1'::numeric)::double precision * (ms.raw_score - ss.median_score)))))))::integer AS impact_score
   FROM (mitigation_scores ms
     CROSS JOIN score_stats ss)
WITH DATA;
CREATE OR REPLACE VIEW public."v_mitre_detection_strategies" WITH (security_invoker=on) AS
 SELECT ds.stix_id,
    ds.mitre_id,
    ds.name,
    ds.description,
    ds.deprecated,
    ds.revoked,
    ds.data,
    ds.created,
    ds.modified,
    tech.stix_id AS technique_stix_id,
    tech.mitre_id AS technique_id,
    tech.name AS technique_name,
    COALESCE(jsonb_array_length((ds.data -> 'x_mitre_analytic_refs'::text)), 0) AS analytic_count,
    (ds.data -> 'x_mitre_domains'::text) AS domains
   FROM ((mitre_objects ds
     LEFT JOIN mitre_relationships r ON (((r.source_ref = ds.stix_id) AND (r.relationship_type = 'detects'::text))))
     LEFT JOIN mitre_objects tech ON (((tech.stix_id = r.target_ref) AND (tech.type = 'attack-pattern'::text))))
  WHERE ((ds.type = 'x-mitre-detection-strategy'::text) AND (ds.deprecated = false) AND (ds.revoked = false));
CREATE MATERIALIZED VIEW IF NOT EXISTS public."mv_strategy_impact" AS
 WITH strategy_base AS (
         SELECT ds.stix_id AS strategy_stix_id,
            ds.mitre_id AS strategy_mitre_id,
            ds.name AS strategy_name,
            ds.description,
            ds.technique_stix_id,
            ds.technique_id,
            ds.technique_name,
            ds.analytic_count,
            ti.tis,
            ti.group_count,
            row_number() OVER (PARTITION BY ds.technique_stix_id ORDER BY ds.analytic_count DESC, ds.name) AS strategy_order
           FROM (v_mitre_detection_strategies ds
             JOIN mv_technique_importance ti ON ((ti.stix_id = ds.technique_stix_id)))
        ), strategy_groups AS (
         SELECT sb.strategy_stix_id,
            gt.group_stix_id,
            taw.taw
           FROM ((strategy_base sb
             JOIN mitre_group_techniques gt ON ((gt.technique_stix_id = sb.technique_stix_id)))
             JOIN mv_threat_actor_weights taw ON ((taw.stix_id = gt.group_stix_id)))
        ), strategy_scores AS (
         SELECT sb.strategy_stix_id,
            sb.strategy_mitre_id,
            sb.strategy_name,
            sb.description,
            sb.technique_stix_id,
            sb.technique_id,
            sb.technique_name,
            sb.analytic_count,
            sb.strategy_order,
            sb.tis,
            count(DISTINCT sg.group_stix_id) AS groups_detected,
            COALESCE((sb.tis * (sum(sg.taw))::double precision), (0)::double precision) AS raw_score
           FROM (strategy_base sb
             LEFT JOIN strategy_groups sg ON ((sg.strategy_stix_id = sb.strategy_stix_id)))
          GROUP BY sb.strategy_stix_id, sb.strategy_mitre_id, sb.strategy_name, sb.description, sb.technique_stix_id, sb.technique_id, sb.technique_name, sb.analytic_count, sb.strategy_order, sb.tis
        ), score_stats AS (
         SELECT percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY strategy_scores.raw_score) AS median_score
           FROM strategy_scores
        )
 SELECT ss.strategy_stix_id AS stix_id,
    ss.strategy_mitre_id AS mitre_id,
    ss.strategy_name AS name,
    ss.description,
    ss.technique_stix_id,
    ss.technique_id,
    ss.technique_name,
    ss.analytic_count,
    ss.strategy_order,
    ss.tis,
    ss.groups_detected,
    ss.raw_score,
    (round(((100)::double precision / ((1)::double precision + exp((('-0.1'::numeric)::double precision * (ss.raw_score - st.median_score)))))))::integer AS impact_score
   FROM (strategy_scores ss
     CROSS JOIN score_stats st)
WITH DATA;
CREATE OR REPLACE VIEW public."resumable_imports" WITH (security_invoker=on) AS
 SELECT id,
    user_id,
    source_type,
    source_url,
    source_vendor,
    target_library,
    status,
    total_files,
    processed_files,
    success_count,
    failure_count,
    last_successful_batch,
    total_batches,
    created_at,
    updated_at,
        CASE
            WHEN ((status = ANY (ARRAY['failed'::text, 'cancelled'::text])) AND (last_successful_batch < total_batches) AND (total_batches > 0)) THEN true
            ELSE false
        END AS can_resume,
        CASE
            WHEN (total_batches > 0) THEN round((((last_successful_batch)::numeric / (total_batches)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS completion_percentage
   FROM bulk_import_jobs bij
  WHERE (status = ANY (ARRAY['failed'::text, 'cancelled'::text, 'inserting'::text]))
  ORDER BY updated_at DESC;
CREATE OR REPLACE VIEW public."v_mitigation_impact" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    technique_count,
    groups_disrupted,
    raw_score,
    impact_score
   FROM mv_mitigation_impact;
CREATE OR REPLACE VIEW public."v_mitre_analytics" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified,
    (data -> 'x_mitre_platforms'::text) AS platforms,
    (data -> 'x_mitre_log_source_references'::text) AS log_source_references,
    (data -> 'x_mitre_mutable_elements'::text) AS mutable_elements,
    (data -> 'x_mitre_domains'::text) AS domains
   FROM mitre_objects a
  WHERE ((type = 'x-mitre-analytic'::text) AND (deprecated = false) AND (revoked = false));
CREATE OR REPLACE VIEW public."v_mitre_analytics_with_strategy" WITH (security_invoker=on) AS
 SELECT a.stix_id,
    a.mitre_id,
    a.name,
    a.description,
    a.data,
    (a.data -> 'x_mitre_platforms'::text) AS platforms,
    (a.data -> 'x_mitre_log_source_references'::text) AS log_source_references,
    (a.data -> 'x_mitre_mutable_elements'::text) AS mutable_elements,
    ds.stix_id AS strategy_stix_id,
    ds.mitre_id AS strategy_id,
    ds.name AS strategy_name,
    tech.mitre_id AS technique_id,
    tech.name AS technique_name
   FROM (((mitre_objects a
     JOIN mitre_objects ds ON (((ds.type = 'x-mitre-detection-strategy'::text) AND (ds.deprecated = false) AND ((ds.data -> 'x_mitre_analytic_refs'::text) @> to_jsonb(a.stix_id)))))
     LEFT JOIN mitre_relationships r ON (((r.source_ref = ds.stix_id) AND (r.relationship_type = 'detects'::text))))
     LEFT JOIN mitre_objects tech ON (((tech.stix_id = r.target_ref) AND (tech.type = 'attack-pattern'::text))))
  WHERE ((a.type = 'x-mitre-analytic'::text) AND (a.deprecated = false) AND (a.revoked = false));
CREATE OR REPLACE VIEW public."v_mitre_data_components" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created,
    modified
   FROM mitre_objects dc
  WHERE ((type = 'x-mitre-data-component'::text) AND (deprecated = false) AND (revoked = false));
CREATE OR REPLACE VIEW public."v_mitre_groups_with_stats" WITH (security_invoker=on) AS
 SELECT id,
    stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    ( SELECT count(DISTINCT r.target_ref) AS count
           FROM (mitre_relationships r
             JOIN mitre_objects t ON ((r.target_ref = t.stix_id)))
          WHERE ((r.source_ref = o.stix_id) AND (r.relationship_type = 'uses'::text) AND (t.type = 'attack-pattern'::text))) AS technique_count,
    ( SELECT count(DISTINCT r.target_ref) AS count
           FROM (mitre_relationships r
             JOIN mitre_objects s ON ((r.target_ref = s.stix_id)))
          WHERE ((r.source_ref = o.stix_id) AND (r.relationship_type = 'uses'::text) AND (s.type = ANY (ARRAY['malware'::text, 'tool'::text])))) AS software_count,
    ( SELECT count(*) AS count
           FROM mitre_relationships r
          WHERE ((r.target_ref = o.stix_id) AND (r.relationship_type = 'attributed-to'::text))) AS campaign_count
   FROM mitre_objects o
  WHERE (type = 'intrusion-set'::text);
CREATE OR REPLACE VIEW public."v_mitre_groups_with_targeting" WITH (security_invoker=on) AS
 SELECT id,
    stix_id,
    mitre_id,
    name,
    description,
    deprecated,
    revoked,
    data,
    created_at,
    updated_at,
    ((data -> 'targeting_intel'::text) ->> 'origin_country'::text) AS origin_country,
    ((data -> 'targeting_intel'::text) ->> 'origin_country_code'::text) AS origin_country_code,
    ((data -> 'targeting_intel'::text) -> 'target_countries'::text) AS target_countries,
    ((data -> 'targeting_intel'::text) -> 'target_sectors'::text) AS target_sectors,
    ((data -> 'targeting_intel'::text) ->> 'activity_type'::text) AS activity_type,
    ((data -> 'targeting_intel'::text) ->> 'match_confidence'::text) AS match_confidence,
    ((data -> 'targeting_intel'::text) IS NOT NULL) AS has_targeting_intel
   FROM mitre_objects mo
  WHERE (type = 'intrusion-set'::text);
CREATE OR REPLACE VIEW public."v_mitre_mitigations" WITH (security_invoker=on) AS
 SELECT m.stix_id,
    m.mitre_id,
    m.name,
    m.description,
    m.deprecated,
    m.revoked,
    m.data,
    m.created,
    m.modified,
    COALESCE(tc.technique_count, (0)::bigint) AS technique_count
   FROM (mitre_objects m
     LEFT JOIN ( SELECT mitre_relationships.source_ref,
            count(*) AS technique_count
           FROM mitre_relationships
          WHERE (mitre_relationships.relationship_type = 'mitigates'::text)
          GROUP BY mitre_relationships.source_ref) tc ON ((tc.source_ref = m.stix_id)))
  WHERE ((m.type = 'course-of-action'::text) AND (m.mitre_id ~~ 'M%'::text) AND (m.deprecated = false) AND (m.revoked = false));
CREATE OR REPLACE VIEW public."v_mitre_software_with_stats" WITH (security_invoker=on) AS
 SELECT id,
    stix_id,
    mitre_id,
    name,
    description,
    type AS software_type,
    deprecated,
    revoked,
    data,
    ( SELECT count(DISTINCT r.target_ref) AS count
           FROM mitre_relationships r
          WHERE ((r.source_ref = o.stix_id) AND (r.relationship_type = 'uses'::text))) AS technique_count,
    ( SELECT count(DISTINCT r.source_ref) AS count
           FROM (mitre_relationships r
             JOIN mitre_objects g ON ((r.source_ref = g.stix_id)))
          WHERE ((r.target_ref = o.stix_id) AND (r.relationship_type = 'uses'::text) AND (g.type = 'intrusion-set'::text))) AS group_count
   FROM mitre_objects o
  WHERE (type = ANY (ARRAY['malware'::text, 'tool'::text]));
CREATE OR REPLACE VIEW public."v_mitre_techniques_full" WITH (security_invoker=on) AS
 SELECT o.id,
    o.stix_id,
    o.mitre_id,
    o.name,
    o.description,
    o.deprecated,
    o.revoked,
    o.data,
    COALESCE(json_agg(DISTINCT jsonb_build_object('stix_id', tt.tactic_stix_id, 'shortname', tt.tactic_shortname)) FILTER (WHERE (tt.tactic_stix_id IS NOT NULL)), '[]'::json) AS tactics,
    COALESCE(json_agg(DISTINCT tp.platform) FILTER (WHERE (tp.platform IS NOT NULL)), '[]'::json) AS platforms,
    COALESCE(json_agg(DISTINCT tds.data_source) FILTER (WHERE (tds.data_source IS NOT NULL)), '[]'::json) AS data_sources,
    ( SELECT count(*) AS count
           FROM mitre_relationships
          WHERE (mitre_relationships.source_ref = o.stix_id)) AS outgoing_relationships,
    ( SELECT count(*) AS count
           FROM mitre_relationships
          WHERE (mitre_relationships.target_ref = o.stix_id)) AS incoming_relationships
   FROM (((mitre_objects o
     LEFT JOIN mitre_technique_tactics tt ON ((o.stix_id = tt.technique_stix_id)))
     LEFT JOIN mitre_technique_platforms tp ON ((o.stix_id = tp.technique_stix_id)))
     LEFT JOIN mitre_technique_data_sources tds ON ((o.stix_id = tds.technique_stix_id)))
  WHERE (o.type = 'attack-pattern'::text)
  GROUP BY o.id, o.stix_id, o.mitre_id, o.name, o.description, o.deprecated, o.revoked, o.data;
CREATE OR REPLACE VIEW public."v_pack_deployment_status" WITH (security_invoker=on) AS
 WITH latest_action AS (
         SELECT DISTINCT ON (dh.detection_id, dh.integration_id) dh.detection_id,
            dh.integration_id,
            dh.action,
            dh.status,
            dh.created_at
           FROM deployment_history dh
          ORDER BY dh.detection_id, dh.integration_id, dh.created_at DESC
        )
 SELECT pd.pack_id,
    la.integration_id,
    count(DISTINCT pd.detection_id) AS total_detections,
    count(DISTINCT
        CASE
            WHEN ((la.action = ANY (ARRAY['create'::text, 'update'::text])) AND (la.status = 'success'::text)) THEN pd.detection_id
            ELSE NULL::text
        END) AS deployed_count,
    count(DISTINCT
        CASE
            WHEN ((la.action = ANY (ARRAY['create'::text, 'update'::text])) AND (la.status = 'failed'::text)) THEN pd.detection_id
            ELSE NULL::text
        END) AS failed_count,
    max(la.created_at) AS last_deployed_at
   FROM (pack_detections pd
     JOIN latest_action la ON ((la.detection_id = pd.detection_id)))
  GROUP BY pd.pack_id, la.integration_id;
CREATE OR REPLACE VIEW public."v_pack_totals" WITH (security_invoker=on) AS
 SELECT p.id AS pack_id,
    count(DISTINCT pd.detection_id) AS total_detections,
    count(DISTINCT d.id) FILTER (WHERE (d.status = ANY (ARRAY['Production'::text, 'Testing'::text]))) AS production_ready_count,
    count(DISTINCT d.id) FILTER (WHERE (d.status = 'Draft'::text)) AS draft_count
   FROM ((detection_packs p
     LEFT JOIN pack_detections pd ON ((pd.pack_id = p.id)))
     LEFT JOIN detections d ON ((d.id = pd.detection_id)))
  GROUP BY p.id;
CREATE OR REPLACE VIEW public."v_strategy_impact" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    technique_stix_id,
    technique_id,
    technique_name,
    analytic_count,
    strategy_order,
    tis,
    groups_detected,
    raw_score,
    impact_score
   FROM mv_strategy_impact;
CREATE OR REPLACE VIEW public."v_technique_importance" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    tactics,
    group_count,
    campaign_count,
    mitigation_count,
    detection_count,
    group_percentile,
    campaign_percentile,
    defense_scarcity,
    tis
   FROM mv_technique_importance;
CREATE OR REPLACE VIEW public."v_technique_stats" WITH (security_invoker=on) AS
 WITH snapshot AS (
         SELECT mitre_scoring_snapshot.id,
            mitre_scoring_snapshot.created_at,
            mitre_scoring_snapshot.mitre_version,
            mitre_scoring_snapshot.total_groups,
            mitre_scoring_snapshot.total_techniques,
            mitre_scoring_snapshot.total_campaigns,
            mitre_scoring_snapshot.total_software,
            mitre_scoring_snapshot.total_mitigations,
            mitre_scoring_snapshot.total_strategies,
            mitre_scoring_snapshot.max_group_technique_count,
            mitre_scoring_snapshot.max_group_campaign_count,
            mitre_scoring_snapshot.max_group_software_count,
            mitre_scoring_snapshot.max_technique_group_count,
            mitre_scoring_snapshot.max_technique_campaign_count,
            mitre_scoring_snapshot.is_active
           FROM mitre_scoring_snapshot
          WHERE (mitre_scoring_snapshot.is_active = true)
        )
 SELECT t.stix_id,
    t.mitre_id,
    t.name,
    t.tactics,
    count(DISTINCT gt.group_stix_id) AS group_count,
    count(DISTINCT ct.campaign_stix_id) AS campaign_count,
    count(DISTINCT st.software_stix_id) AS software_count,
    count(DISTINCT
        CASE
            WHEN (r.relationship_type = 'mitigates'::text) THEN r.source_ref
            ELSE NULL::text
        END) AS mitigation_count,
    count(DISTINCT ds.stix_id) AS strategy_count,
    percent_rank() OVER (ORDER BY (count(DISTINCT gt.group_stix_id))) AS group_percentile,
    percent_rank() OVER (ORDER BY (count(DISTINCT ct.campaign_stix_id))) AS campaign_percentile
   FROM (((((mitre_techniques t
     LEFT JOIN mitre_group_techniques gt ON ((t.stix_id = gt.technique_stix_id)))
     LEFT JOIN mitre_campaign_techniques ct ON ((t.stix_id = ct.technique_stix_id)))
     LEFT JOIN mitre_software_techniques st ON ((t.stix_id = st.technique_stix_id)))
     LEFT JOIN mitre_relationships r ON (((t.stix_id = r.target_ref) AND (r.relationship_type = 'mitigates'::text))))
     LEFT JOIN v_mitre_detection_strategies ds ON ((t.stix_id = ds.technique_stix_id)))
  WHERE (NOT t.deprecated)
  GROUP BY t.stix_id, t.mitre_id, t.name, t.tactics;
CREATE OR REPLACE VIEW public."v_threat_actor_weights" WITH (security_invoker=on) AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    technique_count,
    campaign_count,
    software_count,
    tactic_count,
    recency_multiplier,
    base_weight,
    taw
   FROM mv_threat_actor_weights;

-- ============================================================
-- Materialized view indexes
-- ============================================================
CREATE UNIQUE INDEX mv_mitigation_impact_stix_id_idx ON public.mv_mitigation_impact USING btree (stix_id);
CREATE INDEX mv_mitigation_impact_impact_score_idx ON public.mv_mitigation_impact USING btree (impact_score DESC);
CREATE INDEX mv_mitigation_impact_mitre_id_idx ON public.mv_mitigation_impact USING btree (mitre_id);
CREATE UNIQUE INDEX mv_strategy_impact_stix_id_idx ON public.mv_strategy_impact USING btree (stix_id);
CREATE INDEX mv_strategy_impact_impact_score_idx ON public.mv_strategy_impact USING btree (impact_score DESC);
CREATE INDEX mv_strategy_impact_technique_stix_id_idx ON public.mv_strategy_impact USING btree (technique_stix_id);
CREATE INDEX mv_strategy_impact_mitre_id_idx ON public.mv_strategy_impact USING btree (mitre_id);
CREATE UNIQUE INDEX mv_coverage_stats_technique_id_idx ON public.mv_coverage_stats USING btree (technique_id);
CREATE INDEX mv_coverage_stats_is_covered_idx ON public.mv_coverage_stats USING btree (is_covered);
CREATE INDEX mv_coverage_stats_tactics_idx ON public.mv_coverage_stats USING btree (tactics);
CREATE UNIQUE INDEX mv_threat_actor_weights_stix_id_idx ON public.mv_threat_actor_weights USING btree (stix_id);
CREATE INDEX mv_threat_actor_weights_taw_idx ON public.mv_threat_actor_weights USING btree (taw DESC);
CREATE UNIQUE INDEX mv_technique_importance_stix_id_idx ON public.mv_technique_importance USING btree (stix_id);
CREATE INDEX mv_technique_importance_tis_idx ON public.mv_technique_importance USING btree (tis DESC);
CREATE INDEX mv_technique_importance_mitre_id_idx ON public.mv_technique_importance USING btree (mitre_id);

-- ============================================================
-- Triggers
-- ============================================================
CREATE TRIGGER detection_drift_updated_at BEFORE UPDATE ON public.detection_drift FOR EACH ROW EXECUTE FUNCTION update_detection_drift_updated_at();
CREATE TRIGGER bulk_import_jobs_updated_at BEFORE UPDATE ON public.bulk_import_jobs FOR EACH ROW EXECUTE FUNCTION update_bulk_import_jobs_updated_at();
CREATE TRIGGER detection_fts_update BEFORE INSERT OR UPDATE ON public.detections FOR EACH ROW EXECUTE FUNCTION update_detection_fts_trigger();
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION update_integrations_updated_at();
CREATE TRIGGER integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials FOR EACH ROW EXECUTE FUNCTION update_integrations_updated_at();
CREATE TRIGGER trg_user_dashboards_updated_at BEFORE UPDATE ON public.user_dashboards FOR EACH ROW EXECUTE FUNCTION update_user_dashboards_updated_at();
CREATE TRIGGER trg_enforce_single_default AFTER INSERT OR UPDATE OF is_default ON public.user_dashboards FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION enforce_single_default_dashboard();
CREATE TRIGGER scoring_profiles_updated_at BEFORE UPDATE ON public.scoring_profiles FOR EACH ROW EXECUTE FUNCTION update_scoring_profiles_updated_at();
CREATE TRIGGER trg_environment_profiles_updated_at BEFORE UPDATE ON public.environment_profiles FOR EACH ROW EXECUTE FUNCTION update_environment_profiles_updated_at();
CREATE TRIGGER set_threat_intel_feeds_updated_at BEFORE UPDATE ON public.threat_intel_feeds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_pack_rule_count AFTER INSERT OR DELETE ON public.pack_detections FOR EACH ROW EXECUTE FUNCTION sync_pack_rule_count();
CREATE TRIGGER trg_sync_affected_pack_mitre_ids AFTER UPDATE ON public.detections FOR EACH ROW EXECUTE FUNCTION sync_affected_pack_mitre_ids();
CREATE TRIGGER detections_clear_research_node_trigger BEFORE UPDATE OF research_session_id ON public.detections FOR EACH ROW EXECUTE FUNCTION clear_research_node_on_session_clear();

-- ============================================================
-- Row Level Security — enable
-- ============================================================
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_budget_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_digest_campaign_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_digest_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_digest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_digest_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_digest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crowdstrike_finetune_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crowdstrike_finetune_query_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curated_feed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defender_xdr_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defender_xdr_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_drift ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_finetune_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_preflight_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detection_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_scoring_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_tactic_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_technique_tactics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_deploy_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_deploy_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_feed_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_report_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_intel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_research_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threat_research_jobs ENABLE ROW LEVEL SECURITY;
-- Checkpoints hold the full model conversation: the user's environment
-- profile, their library rule bodies, intermediate agent reasoning. RLS on
-- with NO policies denies every non-service role; the orchestrator uses the
-- service role, which bypasses RLS. Deliberately not exposed to Realtime.
ALTER TABLE public.threat_research_job_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.threat_research_job_checkpoints FROM PUBLIC, anon, authenticated;
-- Phase budgets are readable by the owning user so the UI can show remaining
-- spend; only the orchestrator (service role) writes them.
-- Append-only vendor-search provenance. Deliberately NOT on the session tree:
-- several workers search concurrently, and a read-modify-write of the tree
-- would discard both their provenance and any detection/QA leaf patched
-- between the read and the write.
ALTER TABLE public.threat_research_vendor_searches ENABLE ROW LEVEL SECURITY;
-- `authenticated` too: Supabase default privileges grant it ALL on new public
-- tables, so revoking only PUBLIC and anon left INSERT/UPDATE/DELETE/TRUNCATE
-- in place. RLS denies the first three (no policy for them); TRUNCATE is not
-- subject to RLS, so only the grant closes it.
REVOKE ALL ON TABLE public.threat_research_vendor_searches FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS trvs_self_select ON public.threat_research_vendor_searches;
CREATE POLICY trvs_self_select ON public.threat_research_vendor_searches
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE public.threat_research_vendor_searches TO authenticated;
ALTER TABLE public.threat_research_phase_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.threat_research_phase_budgets FROM PUBLIC, anon;
DROP POLICY IF EXISTS trpb_self_select ON public.threat_research_phase_budgets;
CREATE POLICY trpb_self_select ON public.threat_research_phase_budgets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.threat_research_sessions s
     WHERE s.id = threat_research_phase_budgets.session_id
       AND s.user_id = (SELECT auth.uid())
  ));
GRANT SELECT ON TABLE public.threat_research_phase_budgets TO authenticated;
ALTER TABLE public.threat_research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row Level Security — policies
-- ============================================================
CREATE POLICY "Admins can update access requests" ON public.access_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_global_admin(auth.uid())) WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Admins can view access requests" ON public.access_requests AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_global_admin(auth.uid()));
CREATE POLICY "Anyone can submit an access request" ON public.access_requests AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Authenticated users can read activity_log" ON public.activity_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage activity_log" ON public.activity_log AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "System can insert activity" ON public.activity_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can insert activity_log" ON public.activity_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY ai_budget_overrides_admin_all ON public.ai_budget_overrides AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY ai_budget_overrides_user_visible ON public.ai_budget_overrides AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ai_budgets b
  WHERE ((b.id = ai_budget_overrides.budget_id) AND ((b.scope = 'org'::text) OR ((b.scope = 'user'::text) AND (b.scope_value = (auth.uid())::text)))))));
CREATE POLICY ai_budgets_admin_all ON public.ai_budgets AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY ai_budgets_user_visible ON public.ai_budgets AS PERMISSIVE FOR SELECT TO public USING (((scope = 'org'::text) OR ((scope = 'user'::text) AND (scope_value = (auth.uid())::text))));
CREATE POLICY ai_usage_daily_admin_select ON public.ai_usage_daily AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY ai_usage_daily_self_select ON public.ai_usage_daily AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY ai_usage_events_admin_select ON public.ai_usage_events AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY ai_usage_events_self_select ON public.ai_usage_events AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY analysis_reports_delete ON public.analysis_reports AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY analysis_reports_insert ON public.analysis_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY analysis_reports_select_own ON public.analysis_reports AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY analysis_reports_update ON public.analysis_reports AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY audit_events_select_admin ON public.audit_events AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))) OR (user_id = auth.uid())));
CREATE POLICY "Users manage own campaign articles" ON public.auto_digest_campaign_articles AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM auto_digest_campaigns c
  WHERE ((c.id = auto_digest_campaign_articles.campaign_id) AND (c.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM auto_digest_campaigns c
  WHERE ((c.id = auto_digest_campaign_articles.campaign_id) AND (c.user_id = auth.uid())))));
CREATE POLICY "Users manage own campaigns" ON public.auto_digest_campaigns AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own digest jobs" ON public.auto_digest_jobs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY auto_digest_run_events_admin_select ON public.auto_digest_run_events AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY auto_digest_run_events_self_select ON public.auto_digest_run_events AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users manage own digest settings" ON public.auto_digest_settings AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Authenticated users can insert batch jobs" ON public.batch_embedding_jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "Authenticated users can update own batch jobs" ON public.batch_embedding_jobs AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = created_by));
CREATE POLICY "Authenticated users can view batch jobs" ON public.batch_embedding_jobs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update any bulk import job" ON public.bulk_import_jobs AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Admins can view all bulk import jobs" ON public.bulk_import_jobs AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Users can create bulk import jobs" ON public.bulk_import_jobs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own bulk import jobs" ON public.bulk_import_jobs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own bulk import jobs" ON public.bulk_import_jobs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Authenticated users can read curated feeds" ON public.curated_feed_sources AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY defender_xdr_columns_read ON public.defender_xdr_columns AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY defender_xdr_tables_read ON public.defender_xdr_tables AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can create own deployment records" ON public.deployment_history AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own deployment records" ON public.deployment_history AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own deployment history" ON public.deployment_history AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can create assignments on own detections" ON public.detection_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "Users can update assignments on own detections" ON public.detection_assignments AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "Users can view assignments on own detections" ON public.detection_assignments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_assignments.detection_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "Users can add comments to own detections" ON public.detection_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_comments.detection_id) AND (d.user_id = auth.uid()))))));
CREATE POLICY "Users can delete own comments" ON public.detection_comments AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can update own comments" ON public.detection_comments AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can view comments on accessible detections" ON public.detection_comments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_comments.detection_id) AND ((d.user_id = auth.uid()) OR (d.library_type = 'development'::text))))));
CREATE POLICY detection_decisions_insert ON public.detection_decisions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY detection_decisions_select ON public.detection_decisions AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR (detection_id IN ( SELECT detections.id
   FROM detections
  WHERE (detections.user_id = auth.uid())))));
CREATE POLICY detection_drift_select ON public.detection_drift AS PERMISSIVE FOR SELECT TO authenticated USING ((is_global_admin(auth.uid()) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_drift.detection_id) AND ((d.library_type = 'production'::text) OR (d.user_id = auth.uid())))))));
CREATE POLICY detection_drift_write ON public.detection_drift AS PERMISSIVE FOR ALL TO authenticated USING (is_global_admin(auth.uid())) WITH CHECK (is_global_admin(auth.uid()));
CREATE POLICY detection_embeddings_admin_select ON public.detection_embeddings AS PERMISSIVE FOR SELECT TO authenticated USING (is_global_admin(auth.uid()));
CREATE POLICY crowdstrike_finetune_runs_select ON public.crowdstrike_finetune_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY crowdstrike_finetune_query_jobs_select ON public.crowdstrike_finetune_query_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM crowdstrike_finetune_runs run
  WHERE ((run.id = crowdstrike_finetune_query_jobs.run_id) AND (run.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own finetune runs" ON public.detection_finetune_runs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Active packs readable by authenticated users" ON public.detection_packs AS PERMISSIVE FOR SELECT TO public USING (((is_active = true) AND (( SELECT auth.uid() AS uid) IS NOT NULL)));
CREATE POLICY "Admins delete packs" ON public.detection_packs AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Admins insert packs" ON public.detection_packs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Admins update packs" ON public.detection_packs AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY detection_patterns_delete ON public.detection_patterns AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
CREATE POLICY detection_patterns_insert ON public.detection_patterns AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY detection_patterns_select ON public.detection_patterns AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY detection_patterns_update ON public.detection_patterns AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can create own preflight runs" ON public.detection_preflight_runs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own preflight runs" ON public.detection_preflight_runs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Assigned users can request reviews" ON public.detection_reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK (((requested_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM detections d
  WHERE ((d.id = detection_reviews.detection_id) AND ((d.assigned_to = auth.uid()) OR (d.user_id = auth.uid())))))));
CREATE POLICY "Authenticated users can read detection_reviews" ON public.detection_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Global admin/lead can update reviews" ON public.detection_reviews AS PERMISSIVE FOR UPDATE TO public USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Service role can manage detection_reviews" ON public.detection_reviews AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY development_delete ON public.detections AS PERMISSIVE FOR DELETE TO public USING (((library_type = 'development'::text) AND ((user_id = auth.uid()) OR is_global_admin(auth.uid()))));
CREATE POLICY development_insert ON public.detections AS PERMISSIVE FOR INSERT TO public WITH CHECK (((library_type = 'development'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY development_select ON public.detections AS PERMISSIVE FOR SELECT TO public USING (((library_type = 'development'::text) AND ((visibility = 'shared'::text) OR (user_id = auth.uid()) OR (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))));
CREATE POLICY development_update ON public.detections AS PERMISSIVE FOR UPDATE TO public USING (((library_type = 'development'::text) AND ((user_id = auth.uid()) OR (assigned_to = auth.uid()) OR is_global_admin_or_lead(auth.uid()))));
CREATE POLICY production_delete ON public.detections AS PERMISSIVE FOR DELETE TO public USING (((library_type = 'production'::text) AND ((user_id = auth.uid()) OR is_global_admin(auth.uid()))));
CREATE POLICY production_insert ON public.detections AS PERMISSIVE FOR INSERT TO public WITH CHECK (((library_type = 'production'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY production_select ON public.detections AS PERMISSIVE FOR SELECT TO public USING (((library_type = 'production'::text) AND (auth.uid() IS NOT NULL)));
CREATE POLICY production_update ON public.detections AS PERMISSIVE FOR UPDATE TO public USING (((library_type = 'production'::text) AND ((user_id = auth.uid()) OR (assigned_to = auth.uid()) OR is_global_admin_or_lead(auth.uid()))));
CREATE POLICY service_role_all ON public.detections AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can create enrichment audit" ON public.enrichment_audit AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Admins can update enrichment audit" ON public.enrichment_audit AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Admins can view enrichment audit" ON public.enrichment_audit AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Service role full access to environment_profiles" ON public.environment_profiles AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can create own environment profile" ON public.environment_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own environment profile" ON public.environment_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own environment profile" ON public.environment_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can create own integrations" ON public.integrations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own integrations" ON public.integrations AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own integrations" ON public.integrations AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own integrations" ON public.integrations AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY mitre_embeddings_admin_select ON public.mitre_embeddings AS PERMISSIVE FOR SELECT TO authenticated USING (is_global_admin(auth.uid()));
CREATE POLICY "Authenticated users can read mitre_metadata" ON public.mitre_metadata AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_metadata" ON public.mitre_metadata AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_metadata" ON public.mitre_metadata AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Authenticated users can read mitre_objects" ON public.mitre_objects AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_objects" ON public.mitre_objects AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_objects" ON public.mitre_objects AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Authenticated users can read mitre_relationships" ON public.mitre_relationships AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_relationships" ON public.mitre_relationships AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_relationships" ON public.mitre_relationships AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Authenticated users can read mitre_scoring_snapshot" ON public.mitre_scoring_snapshot AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_scoring_snapshot" ON public.mitre_scoring_snapshot AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_tactic_weights" ON public.mitre_tactic_weights AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Authenticated users can read mitre_tactic_weights" ON public.mitre_tactic_weights AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read mitre_technique_data_sources" ON public.mitre_technique_data_sources AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_technique_data_sources" ON public.mitre_technique_data_sources AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_technique_data_sources" ON public.mitre_technique_data_sources AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Admins manage MITRE technique groups" ON public.mitre_technique_groups AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "MITRE technique groups readable by authenticated" ON public.mitre_technique_groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read mitre_technique_platforms" ON public.mitre_technique_platforms AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_technique_platforms" ON public.mitre_technique_platforms AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_technique_platforms" ON public.mitre_technique_platforms AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Authenticated users can read mitre_technique_tactics" ON public.mitre_technique_tactics AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage mitre_technique_tactics" ON public.mitre_technique_tactics AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage mitre_technique_tactics" ON public.mitre_technique_tactics AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Users can insert their own deploy job items" ON public.pack_deploy_job_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM pack_deploy_jobs j
  WHERE ((j.id = pack_deploy_job_items.job_id) AND (j.created_by = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view their own deploy job items" ON public.pack_deploy_job_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM pack_deploy_jobs j
  WHERE ((j.id = pack_deploy_job_items.job_id) AND (j.created_by = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can create deploy jobs" ON public.pack_deploy_jobs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update their own deploy jobs" ON public.pack_deploy_jobs AS PERMISSIVE FOR UPDATE TO public USING ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view their own deploy jobs" ON public.pack_deploy_jobs AS PERMISSIVE FOR SELECT TO public USING ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Admins delete pack detections" ON public.pack_detections AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Admins insert pack detections" ON public.pack_detections AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Admins update pack detections" ON public.pack_detections AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Pack detections readable by authenticated users" ON public.pack_detections AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "Leads manage pack versions" ON public.pack_versions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text]))))));
CREATE POLICY "Pack versions readable by authenticated" ON public.pack_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage profiles" ON public.profiles AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (status = ( SELECT p.status
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (NOT (permission_overrides IS DISTINCT FROM ( SELECT p.permission_overrides
   FROM profiles p
  WHERE (p.id = auth.uid()))))));
CREATE POLICY promotion_requests_insert ON public.promotion_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((submitted_by = auth.uid()));
CREATE POLICY promotion_requests_select_admin ON public.promotion_requests AS PERMISSIVE FOR SELECT TO public USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY promotion_requests_select_own ON public.promotion_requests AS PERMISSIVE FOR SELECT TO public USING ((submitted_by = auth.uid()));
CREATE POLICY promotion_requests_service_role ON public.promotion_requests AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY promotion_requests_update ON public.promotion_requests AS PERMISSIVE FOR UPDATE TO public USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Service role only" ON public.rate_limits AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY scoring_profiles_delete ON public.scoring_profiles AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY scoring_profiles_insert ON public.scoring_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY scoring_profiles_select ON public.scoring_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY scoring_profiles_update ON public.scoring_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "Users manage own feed entries" ON public.threat_intel_feed_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users see own feed entries" ON public.threat_intel_feed_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own feeds" ON public.threat_intel_feeds AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can link detections to own reports" ON public.threat_intel_report_detections AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));
CREATE POLICY "Users can unlink detections from own reports" ON public.threat_intel_report_detections AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));
CREATE POLICY "Users can view detections for own reports" ON public.threat_intel_report_detections AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM threat_intel_reports
  WHERE ((threat_intel_reports.id = threat_intel_report_detections.report_id) AND (threat_intel_reports.user_id = auth.uid())))));
CREATE POLICY "Users can create own reports" ON public.threat_intel_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own reports" ON public.threat_intel_reports AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own reports" ON public.threat_intel_reports AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own reports" ON public.threat_intel_reports AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY tre_admin_select ON public.threat_research_events AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY tre_self_select ON public.threat_research_events AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM threat_research_sessions s
  WHERE ((s.id = threat_research_events.session_id) AND (s.user_id = auth.uid())))));
CREATE POLICY "service role only" ON public.threat_research_jobs AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY trj_admin_select ON public.threat_research_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY trj_self_select ON public.threat_research_jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM threat_research_sessions s
  WHERE ((s.id = threat_research_jobs.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY trs_admin_select ON public.threat_research_sessions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY trs_self_delete ON public.threat_research_sessions AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trs_self_insert ON public.threat_research_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trs_self_select ON public.threat_research_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trs_self_update ON public.threat_research_sessions AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create their own dashboards" ON public.user_dashboards AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own dashboards" ON public.user_dashboards AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own dashboards" ON public.user_dashboards AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own dashboards" ON public.user_dashboards AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Admins can create user invitations" ON public.user_invitations AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Admins can delete user invitations" ON public.user_invitations AS PERMISSIVE FOR DELETE TO public USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Admins can view user invitations" ON public.user_invitations AS PERMISSIVE FOR SELECT TO public USING (is_global_admin_or_lead(auth.uid()));
CREATE POLICY "Users can view their own invitations" ON public.user_invitations AS PERMISSIVE FOR SELECT TO authenticated USING ((email = (auth.jwt() ->> 'email'::text)));
CREATE POLICY "Authenticated users insert own notifications" ON public.user_notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Service role can manage user_notifications" ON public.user_notifications AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own notifications" ON public.user_notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own notifications" ON public.user_notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users see own notifications" ON public.user_notifications AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users update own notifications" ON public.user_notifications AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));

-- ============================================================
-- Auth trigger — create a profile row when a user signs up
-- ============================================================
DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'auth.users trigger skipped (auth schema not present?): %', SQLERRM;
END $$;

-- ============================================================
-- Realtime — publish tables to the supabase_realtime publication
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['detection_drift','detections','pack_deploy_job_items','pack_deploy_jobs','threat_research_events','threat_research_jobs','threat_research_sessions','user_notifications']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication not present; skipping realtime'; EXIT;
      WHEN OTHERS THEN RAISE NOTICE 'realtime add % skipped: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- Grants (anon / authenticated / service_role)
-- ============================================================
GRANT DELETE ON public.access_requests TO anon;
GRANT DELETE ON public.access_requests TO authenticated;
GRANT DELETE ON public.access_requests TO service_role;
GRANT DELETE ON public.activity_log TO anon;
GRANT DELETE ON public.activity_log TO authenticated;
GRANT DELETE ON public.activity_log TO service_role;
GRANT DELETE ON public.ai_budget_overrides TO anon;
GRANT DELETE ON public.ai_budget_overrides TO authenticated;
GRANT DELETE ON public.ai_budget_overrides TO service_role;
GRANT DELETE ON public.ai_budgets TO anon;
GRANT DELETE ON public.ai_budgets TO authenticated;
GRANT DELETE ON public.ai_budgets TO service_role;
GRANT DELETE ON public.ai_usage_daily TO anon;
GRANT DELETE ON public.ai_usage_daily TO authenticated;
GRANT DELETE ON public.ai_usage_daily TO service_role;
GRANT DELETE ON public.ai_usage_events TO anon;
GRANT DELETE ON public.ai_usage_events TO authenticated;
GRANT DELETE ON public.ai_usage_events TO service_role;
GRANT DELETE ON public.analysis_reports TO anon;
GRANT DELETE ON public.analysis_reports TO authenticated;
GRANT DELETE ON public.analysis_reports TO service_role;
GRANT DELETE ON public.audit_events TO anon;
GRANT DELETE ON public.audit_events TO authenticated;
GRANT DELETE ON public.audit_events TO service_role;
GRANT DELETE ON public.auto_digest_campaign_articles TO anon;
GRANT DELETE ON public.auto_digest_campaign_articles TO authenticated;
GRANT DELETE ON public.auto_digest_campaign_articles TO service_role;
GRANT DELETE ON public.auto_digest_campaigns TO anon;
GRANT DELETE ON public.auto_digest_campaigns TO authenticated;
GRANT DELETE ON public.auto_digest_campaigns TO service_role;
GRANT DELETE ON public.auto_digest_jobs TO anon;
GRANT DELETE ON public.auto_digest_jobs TO authenticated;
GRANT DELETE ON public.auto_digest_jobs TO service_role;
GRANT DELETE ON public.auto_digest_run_events TO anon;
GRANT DELETE ON public.auto_digest_run_events TO authenticated;
GRANT DELETE ON public.auto_digest_run_events TO service_role;
GRANT DELETE ON public.auto_digest_settings TO anon;
GRANT DELETE ON public.auto_digest_settings TO authenticated;
GRANT DELETE ON public.auto_digest_settings TO service_role;
GRANT DELETE ON public.batch_embedding_jobs TO anon;
GRANT DELETE ON public.batch_embedding_jobs TO authenticated;
GRANT DELETE ON public.batch_embedding_jobs TO service_role;
GRANT DELETE ON public.bulk_import_jobs TO anon;
GRANT DELETE ON public.bulk_import_jobs TO authenticated;
GRANT DELETE ON public.bulk_import_jobs TO service_role;
GRANT DELETE ON public.curated_feed_sources TO anon;
GRANT DELETE ON public.crowdstrike_finetune_runs TO service_role;
GRANT DELETE ON public.crowdstrike_finetune_query_jobs TO service_role;
GRANT DELETE ON public.curated_feed_sources TO authenticated;
GRANT DELETE ON public.curated_feed_sources TO service_role;
GRANT DELETE ON public.defender_xdr_columns TO anon;
GRANT DELETE ON public.defender_xdr_columns TO authenticated;
GRANT DELETE ON public.defender_xdr_columns TO service_role;
GRANT DELETE ON public.defender_xdr_tables TO anon;
GRANT DELETE ON public.defender_xdr_tables TO authenticated;
GRANT DELETE ON public.defender_xdr_tables TO service_role;
GRANT DELETE ON public.deployment_history TO anon;
GRANT DELETE ON public.deployment_history TO authenticated;
GRANT DELETE ON public.deployment_history TO service_role;
GRANT DELETE ON public.detection_assignments TO anon;
GRANT DELETE ON public.detection_assignments TO authenticated;
GRANT DELETE ON public.detection_assignments TO service_role;
GRANT DELETE ON public.detection_comments TO anon;
GRANT DELETE ON public.detection_comments TO authenticated;
GRANT DELETE ON public.detection_comments TO service_role;
GRANT DELETE ON public.detection_decisions TO anon;
GRANT DELETE ON public.detection_decisions TO authenticated;
GRANT DELETE ON public.detection_decisions TO service_role;
GRANT DELETE ON public.detection_drift TO anon;
GRANT DELETE ON public.detection_drift TO authenticated;
GRANT DELETE ON public.detection_drift TO service_role;
GRANT DELETE ON public.detection_embeddings TO service_role;
GRANT DELETE ON public.detection_finetune_runs TO anon;
GRANT DELETE ON public.detection_finetune_runs TO authenticated;
GRANT DELETE ON public.detection_finetune_runs TO service_role;
GRANT DELETE ON public.detection_packs TO anon;
GRANT DELETE ON public.detection_packs TO authenticated;
GRANT DELETE ON public.detection_packs TO service_role;
GRANT DELETE ON public.detection_patterns TO anon;
GRANT DELETE ON public.detection_patterns TO authenticated;
GRANT DELETE ON public.detection_patterns TO service_role;
GRANT DELETE ON public.detection_preflight_runs TO anon;
GRANT DELETE ON public.detection_preflight_runs TO authenticated;
GRANT DELETE ON public.detection_preflight_runs TO service_role;
GRANT DELETE ON public.detection_reviews TO anon;
GRANT DELETE ON public.detection_reviews TO authenticated;
GRANT DELETE ON public.detection_reviews TO service_role;
GRANT DELETE ON public.detections TO anon;
GRANT DELETE ON public.detections TO authenticated;
GRANT DELETE ON public.detections TO service_role;
GRANT DELETE ON public.enrichment_audit TO anon;
GRANT DELETE ON public.enrichment_audit TO authenticated;
GRANT DELETE ON public.enrichment_audit TO service_role;
GRANT DELETE ON public.environment_profiles TO anon;
GRANT DELETE ON public.environment_profiles TO authenticated;
GRANT DELETE ON public.environment_profiles TO service_role;
GRANT DELETE ON public.integration_credentials TO anon;
GRANT DELETE ON public.integration_credentials TO authenticated;
GRANT DELETE ON public.integration_credentials TO service_role;
GRANT DELETE ON public.integrations TO anon;
GRANT DELETE ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO service_role;
GRANT DELETE ON public.mitre_campaign_techniques TO anon;
GRANT DELETE ON public.mitre_campaign_techniques TO authenticated;
GRANT DELETE ON public.mitre_campaign_techniques TO service_role;
GRANT DELETE ON public.mitre_campaigns TO anon;
GRANT DELETE ON public.mitre_campaigns TO authenticated;
GRANT DELETE ON public.mitre_campaigns TO service_role;
GRANT DELETE ON public.mitre_embeddings TO service_role;
GRANT DELETE ON public.mitre_group_campaigns TO anon;
GRANT DELETE ON public.mitre_group_campaigns TO authenticated;
GRANT DELETE ON public.mitre_group_campaigns TO service_role;
GRANT DELETE ON public.mitre_group_software TO anon;
GRANT DELETE ON public.mitre_group_software TO authenticated;
GRANT DELETE ON public.mitre_group_software TO service_role;
GRANT DELETE ON public.mitre_group_techniques TO anon;
GRANT DELETE ON public.mitre_group_techniques TO authenticated;
GRANT DELETE ON public.mitre_group_techniques TO service_role;
GRANT DELETE ON public.mitre_groups TO anon;
GRANT DELETE ON public.mitre_groups TO authenticated;
GRANT DELETE ON public.mitre_groups TO service_role;
GRANT DELETE ON public.mitre_metadata TO anon;
GRANT DELETE ON public.mitre_metadata TO authenticated;
GRANT DELETE ON public.mitre_metadata TO service_role;
GRANT DELETE ON public.mitre_mitigations TO anon;
GRANT DELETE ON public.mitre_mitigations TO authenticated;
GRANT DELETE ON public.mitre_mitigations TO service_role;
GRANT DELETE ON public.mitre_objects TO anon;
GRANT DELETE ON public.mitre_objects TO authenticated;
GRANT DELETE ON public.mitre_objects TO service_role;
GRANT DELETE ON public.mitre_relationships TO anon;
GRANT DELETE ON public.mitre_relationships TO authenticated;
GRANT DELETE ON public.mitre_relationships TO service_role;
GRANT DELETE ON public.mitre_scoring_snapshot TO anon;
GRANT DELETE ON public.mitre_scoring_snapshot TO authenticated;
GRANT DELETE ON public.mitre_scoring_snapshot TO service_role;
GRANT DELETE ON public.mitre_software TO anon;
GRANT DELETE ON public.mitre_software TO authenticated;
GRANT DELETE ON public.mitre_software TO service_role;
GRANT DELETE ON public.mitre_software_techniques TO anon;
GRANT DELETE ON public.mitre_software_techniques TO authenticated;
GRANT DELETE ON public.mitre_software_techniques TO service_role;
GRANT DELETE ON public.mitre_tactic_weights TO anon;
GRANT DELETE ON public.mitre_tactic_weights TO authenticated;
GRANT DELETE ON public.mitre_tactic_weights TO service_role;
GRANT DELETE ON public.mitre_technique_data_sources TO anon;
GRANT DELETE ON public.mitre_technique_data_sources TO authenticated;
GRANT DELETE ON public.mitre_technique_data_sources TO service_role;
GRANT DELETE ON public.mitre_technique_groups TO anon;
GRANT DELETE ON public.mitre_technique_groups TO authenticated;
GRANT DELETE ON public.mitre_technique_groups TO service_role;
GRANT DELETE ON public.mitre_technique_platforms TO anon;
GRANT DELETE ON public.mitre_technique_platforms TO authenticated;
GRANT DELETE ON public.mitre_technique_platforms TO service_role;
GRANT DELETE ON public.mitre_technique_tactics TO anon;
GRANT DELETE ON public.mitre_technique_tactics TO authenticated;
GRANT DELETE ON public.mitre_technique_tactics TO service_role;
GRANT DELETE ON public.mitre_techniques TO anon;
GRANT DELETE ON public.mitre_techniques TO authenticated;
GRANT DELETE ON public.mitre_techniques TO service_role;
GRANT DELETE ON public.pack_deploy_job_items TO anon;
GRANT DELETE ON public.pack_deploy_job_items TO authenticated;
GRANT DELETE ON public.pack_deploy_job_items TO service_role;
GRANT DELETE ON public.pack_deploy_jobs TO anon;
GRANT DELETE ON public.pack_deploy_jobs TO authenticated;
GRANT DELETE ON public.pack_deploy_jobs TO service_role;
GRANT DELETE ON public.pack_detections TO anon;
GRANT DELETE ON public.pack_detections TO authenticated;
GRANT DELETE ON public.pack_detections TO service_role;
GRANT DELETE ON public.pack_versions TO anon;
GRANT DELETE ON public.pack_versions TO authenticated;
GRANT DELETE ON public.pack_versions TO service_role;
GRANT DELETE ON public.profiles TO anon;
GRANT DELETE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO service_role;
GRANT DELETE ON public.promotion_requests TO anon;
GRANT DELETE ON public.promotion_requests TO authenticated;
GRANT DELETE ON public.promotion_requests TO service_role;
GRANT DELETE ON public.rate_limits TO anon;
GRANT DELETE ON public.rate_limits TO authenticated;
GRANT DELETE ON public.rate_limits TO service_role;
GRANT DELETE ON public.resumable_imports TO anon;
GRANT DELETE ON public.resumable_imports TO authenticated;
GRANT DELETE ON public.resumable_imports TO service_role;
GRANT DELETE ON public.scoring_profiles TO anon;
GRANT DELETE ON public.scoring_profiles TO authenticated;
GRANT DELETE ON public.scoring_profiles TO service_role;
GRANT DELETE ON public.threat_intel_feed_entries TO anon;
GRANT DELETE ON public.threat_intel_feed_entries TO authenticated;
GRANT DELETE ON public.threat_intel_feed_entries TO service_role;
GRANT DELETE ON public.threat_intel_feeds TO anon;
GRANT DELETE ON public.threat_intel_feeds TO authenticated;
GRANT DELETE ON public.threat_intel_feeds TO service_role;
GRANT DELETE ON public.threat_intel_report_detections TO anon;
GRANT DELETE ON public.threat_intel_report_detections TO authenticated;
GRANT DELETE ON public.threat_intel_report_detections TO service_role;
GRANT DELETE ON public.threat_intel_reports TO anon;
GRANT DELETE ON public.threat_intel_reports TO authenticated;
GRANT DELETE ON public.threat_intel_reports TO service_role;
GRANT DELETE ON public.threat_research_events TO anon;
GRANT DELETE ON public.threat_research_events TO authenticated;
GRANT DELETE ON public.threat_research_events TO service_role;
GRANT DELETE ON public.threat_research_jobs TO anon;
GRANT DELETE ON public.threat_research_jobs TO authenticated;
GRANT DELETE ON public.threat_research_jobs TO service_role;
GRANT DELETE ON public.threat_research_sessions TO anon;
GRANT DELETE ON public.threat_research_sessions TO authenticated;
GRANT DELETE ON public.threat_research_sessions TO service_role;
GRANT DELETE ON public.user_dashboards TO anon;
GRANT DELETE ON public.user_dashboards TO authenticated;
GRANT DELETE ON public.user_dashboards TO service_role;
GRANT DELETE ON public.user_invitations TO anon;
GRANT DELETE ON public.user_invitations TO authenticated;
GRANT DELETE ON public.user_invitations TO service_role;
GRANT DELETE ON public.user_notifications TO anon;
GRANT DELETE ON public.user_notifications TO authenticated;
GRANT DELETE ON public.user_notifications TO service_role;
GRANT DELETE ON public.v_group_recency TO anon;
GRANT DELETE ON public.v_group_recency TO authenticated;
GRANT DELETE ON public.v_group_recency TO service_role;
GRANT DELETE ON public.v_mitigation_impact TO anon;
GRANT DELETE ON public.v_mitigation_impact TO authenticated;
GRANT DELETE ON public.v_mitigation_impact TO service_role;
GRANT DELETE ON public.v_mitre_analytics TO anon;
GRANT DELETE ON public.v_mitre_analytics TO authenticated;
GRANT DELETE ON public.v_mitre_analytics TO service_role;
GRANT DELETE ON public.v_mitre_analytics_with_strategy TO anon;
GRANT DELETE ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT DELETE ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT DELETE ON public.v_mitre_data_components TO anon;
GRANT DELETE ON public.v_mitre_data_components TO authenticated;
GRANT DELETE ON public.v_mitre_data_components TO service_role;
GRANT DELETE ON public.v_mitre_detection_strategies TO anon;
GRANT DELETE ON public.v_mitre_detection_strategies TO authenticated;
GRANT DELETE ON public.v_mitre_detection_strategies TO service_role;
GRANT DELETE ON public.v_mitre_groups_with_stats TO anon;
GRANT DELETE ON public.v_mitre_groups_with_stats TO authenticated;
GRANT DELETE ON public.v_mitre_groups_with_stats TO service_role;
GRANT DELETE ON public.v_mitre_groups_with_targeting TO anon;
GRANT DELETE ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT DELETE ON public.v_mitre_groups_with_targeting TO service_role;
GRANT DELETE ON public.v_mitre_mitigations TO anon;
GRANT DELETE ON public.v_mitre_mitigations TO authenticated;
GRANT DELETE ON public.v_mitre_mitigations TO service_role;
GRANT DELETE ON public.v_mitre_software_with_stats TO anon;
GRANT DELETE ON public.v_mitre_software_with_stats TO authenticated;
GRANT DELETE ON public.v_mitre_software_with_stats TO service_role;
GRANT DELETE ON public.v_mitre_techniques_full TO anon;
GRANT DELETE ON public.v_mitre_techniques_full TO authenticated;
GRANT DELETE ON public.v_mitre_techniques_full TO service_role;
GRANT DELETE ON public.v_pack_deployment_status TO anon;
GRANT DELETE ON public.v_pack_deployment_status TO authenticated;
GRANT DELETE ON public.v_pack_deployment_status TO service_role;
GRANT DELETE ON public.v_pack_totals TO anon;
GRANT DELETE ON public.v_pack_totals TO authenticated;
GRANT DELETE ON public.v_pack_totals TO service_role;
GRANT DELETE ON public.v_strategy_impact TO anon;
GRANT DELETE ON public.v_strategy_impact TO authenticated;
GRANT DELETE ON public.v_strategy_impact TO service_role;
GRANT DELETE ON public.v_technique_importance TO anon;
GRANT DELETE ON public.v_technique_importance TO authenticated;
GRANT DELETE ON public.v_technique_importance TO service_role;
GRANT DELETE ON public.v_technique_stats TO anon;
GRANT DELETE ON public.v_technique_stats TO authenticated;
GRANT DELETE ON public.v_technique_stats TO service_role;
GRANT DELETE ON public.v_threat_actor_weights TO anon;
GRANT DELETE ON public.v_threat_actor_weights TO authenticated;
GRANT DELETE ON public.v_threat_actor_weights TO service_role;
GRANT INSERT ON public.access_requests TO anon;
GRANT INSERT ON public.access_requests TO authenticated;
GRANT INSERT ON public.access_requests TO service_role;
GRANT INSERT ON public.activity_log TO anon;
GRANT INSERT ON public.activity_log TO authenticated;
GRANT INSERT ON public.activity_log TO service_role;
GRANT INSERT ON public.ai_budget_overrides TO anon;
GRANT INSERT ON public.ai_budget_overrides TO authenticated;
GRANT INSERT ON public.ai_budget_overrides TO service_role;
GRANT INSERT ON public.ai_budgets TO anon;
GRANT INSERT ON public.ai_budgets TO authenticated;
GRANT INSERT ON public.ai_budgets TO service_role;
GRANT INSERT ON public.ai_usage_daily TO anon;
GRANT INSERT ON public.ai_usage_daily TO authenticated;
GRANT INSERT ON public.ai_usage_daily TO service_role;
GRANT INSERT ON public.ai_usage_events TO anon;
GRANT INSERT ON public.ai_usage_events TO authenticated;
GRANT INSERT ON public.ai_usage_events TO service_role;
GRANT INSERT ON public.analysis_reports TO anon;
GRANT INSERT ON public.analysis_reports TO authenticated;
GRANT INSERT ON public.analysis_reports TO service_role;
GRANT INSERT ON public.audit_events TO anon;
GRANT INSERT ON public.audit_events TO authenticated;
GRANT INSERT ON public.audit_events TO service_role;
GRANT INSERT ON public.auto_digest_campaign_articles TO anon;
GRANT INSERT ON public.auto_digest_campaign_articles TO authenticated;
GRANT INSERT ON public.auto_digest_campaign_articles TO service_role;
GRANT INSERT ON public.auto_digest_campaigns TO anon;
GRANT INSERT ON public.auto_digest_campaigns TO authenticated;
GRANT INSERT ON public.auto_digest_campaigns TO service_role;
GRANT INSERT ON public.auto_digest_jobs TO anon;
GRANT INSERT ON public.auto_digest_jobs TO authenticated;
GRANT INSERT ON public.auto_digest_jobs TO service_role;
GRANT INSERT ON public.auto_digest_run_events TO anon;
GRANT INSERT ON public.auto_digest_run_events TO authenticated;
GRANT INSERT ON public.auto_digest_run_events TO service_role;
GRANT INSERT ON public.auto_digest_settings TO anon;
GRANT INSERT ON public.auto_digest_settings TO authenticated;
GRANT INSERT ON public.auto_digest_settings TO service_role;
GRANT INSERT ON public.batch_embedding_jobs TO anon;
GRANT INSERT ON public.batch_embedding_jobs TO authenticated;
GRANT INSERT ON public.batch_embedding_jobs TO service_role;
GRANT INSERT ON public.bulk_import_jobs TO anon;
GRANT INSERT ON public.bulk_import_jobs TO authenticated;
GRANT INSERT ON public.bulk_import_jobs TO service_role;
GRANT INSERT ON public.curated_feed_sources TO anon;
GRANT INSERT ON public.crowdstrike_finetune_runs TO service_role;
GRANT INSERT ON public.crowdstrike_finetune_query_jobs TO service_role;
GRANT INSERT ON public.curated_feed_sources TO authenticated;
GRANT INSERT ON public.curated_feed_sources TO service_role;
GRANT INSERT ON public.defender_xdr_columns TO anon;
GRANT INSERT ON public.defender_xdr_columns TO authenticated;
GRANT INSERT ON public.defender_xdr_columns TO service_role;
GRANT INSERT ON public.defender_xdr_tables TO anon;
GRANT INSERT ON public.defender_xdr_tables TO authenticated;
GRANT INSERT ON public.defender_xdr_tables TO service_role;
GRANT INSERT ON public.deployment_history TO anon;
GRANT INSERT ON public.deployment_history TO authenticated;
GRANT INSERT ON public.deployment_history TO service_role;
GRANT INSERT ON public.detection_assignments TO anon;
GRANT INSERT ON public.detection_assignments TO authenticated;
GRANT INSERT ON public.detection_assignments TO service_role;
GRANT INSERT ON public.detection_comments TO anon;
GRANT INSERT ON public.detection_comments TO authenticated;
GRANT INSERT ON public.detection_comments TO service_role;
GRANT INSERT ON public.detection_decisions TO anon;
GRANT INSERT ON public.detection_decisions TO authenticated;
GRANT INSERT ON public.detection_decisions TO service_role;
GRANT INSERT ON public.detection_drift TO anon;
GRANT INSERT ON public.detection_drift TO authenticated;
GRANT INSERT ON public.detection_drift TO service_role;
GRANT INSERT ON public.detection_embeddings TO service_role;
GRANT INSERT ON public.detection_finetune_runs TO anon;
GRANT INSERT ON public.detection_finetune_runs TO authenticated;
GRANT INSERT ON public.detection_finetune_runs TO service_role;
GRANT INSERT ON public.detection_packs TO anon;
GRANT INSERT ON public.detection_packs TO authenticated;
GRANT INSERT ON public.detection_packs TO service_role;
GRANT INSERT ON public.detection_patterns TO anon;
GRANT INSERT ON public.detection_patterns TO authenticated;
GRANT INSERT ON public.detection_patterns TO service_role;
GRANT INSERT ON public.detection_preflight_runs TO anon;
GRANT INSERT ON public.detection_preflight_runs TO authenticated;
GRANT INSERT ON public.detection_preflight_runs TO service_role;
GRANT INSERT ON public.detection_reviews TO anon;
GRANT INSERT ON public.detection_reviews TO authenticated;
GRANT INSERT ON public.detection_reviews TO service_role;
GRANT INSERT ON public.detections TO anon;
GRANT INSERT ON public.detections TO authenticated;
GRANT INSERT ON public.detections TO service_role;
GRANT INSERT ON public.enrichment_audit TO anon;
GRANT INSERT ON public.enrichment_audit TO authenticated;
GRANT INSERT ON public.enrichment_audit TO service_role;
GRANT INSERT ON public.environment_profiles TO anon;
GRANT INSERT ON public.environment_profiles TO authenticated;
GRANT INSERT ON public.environment_profiles TO service_role;
GRANT INSERT ON public.integration_credentials TO anon;
GRANT INSERT ON public.integration_credentials TO authenticated;
GRANT INSERT ON public.integration_credentials TO service_role;
GRANT INSERT ON public.integrations TO anon;
GRANT INSERT ON public.integrations TO authenticated;
GRANT INSERT ON public.integrations TO service_role;
GRANT INSERT ON public.mitre_campaign_techniques TO anon;
GRANT INSERT ON public.mitre_campaign_techniques TO authenticated;
GRANT INSERT ON public.mitre_campaign_techniques TO service_role;
GRANT INSERT ON public.mitre_campaigns TO anon;
GRANT INSERT ON public.mitre_campaigns TO authenticated;
GRANT INSERT ON public.mitre_campaigns TO service_role;
GRANT INSERT ON public.mitre_embeddings TO service_role;
GRANT INSERT ON public.mitre_group_campaigns TO anon;
GRANT INSERT ON public.mitre_group_campaigns TO authenticated;
GRANT INSERT ON public.mitre_group_campaigns TO service_role;
GRANT INSERT ON public.mitre_group_software TO anon;
GRANT INSERT ON public.mitre_group_software TO authenticated;
GRANT INSERT ON public.mitre_group_software TO service_role;
GRANT INSERT ON public.mitre_group_techniques TO anon;
GRANT INSERT ON public.mitre_group_techniques TO authenticated;
GRANT INSERT ON public.mitre_group_techniques TO service_role;
GRANT INSERT ON public.mitre_groups TO anon;
GRANT INSERT ON public.mitre_groups TO authenticated;
GRANT INSERT ON public.mitre_groups TO service_role;
GRANT INSERT ON public.mitre_metadata TO anon;
GRANT INSERT ON public.mitre_metadata TO authenticated;
GRANT INSERT ON public.mitre_metadata TO service_role;
GRANT INSERT ON public.mitre_mitigations TO anon;
GRANT INSERT ON public.mitre_mitigations TO authenticated;
GRANT INSERT ON public.mitre_mitigations TO service_role;
GRANT INSERT ON public.mitre_objects TO anon;
GRANT INSERT ON public.mitre_objects TO authenticated;
GRANT INSERT ON public.mitre_objects TO service_role;
GRANT INSERT ON public.mitre_relationships TO anon;
GRANT INSERT ON public.mitre_relationships TO authenticated;
GRANT INSERT ON public.mitre_relationships TO service_role;
GRANT INSERT ON public.mitre_scoring_snapshot TO anon;
GRANT INSERT ON public.mitre_scoring_snapshot TO authenticated;
GRANT INSERT ON public.mitre_scoring_snapshot TO service_role;
GRANT INSERT ON public.mitre_software TO anon;
GRANT INSERT ON public.mitre_software TO authenticated;
GRANT INSERT ON public.mitre_software TO service_role;
GRANT INSERT ON public.mitre_software_techniques TO anon;
GRANT INSERT ON public.mitre_software_techniques TO authenticated;
GRANT INSERT ON public.mitre_software_techniques TO service_role;
GRANT INSERT ON public.mitre_tactic_weights TO anon;
GRANT INSERT ON public.mitre_tactic_weights TO authenticated;
GRANT INSERT ON public.mitre_tactic_weights TO service_role;
GRANT INSERT ON public.mitre_technique_data_sources TO anon;
GRANT INSERT ON public.mitre_technique_data_sources TO authenticated;
GRANT INSERT ON public.mitre_technique_data_sources TO service_role;
GRANT INSERT ON public.mitre_technique_groups TO anon;
GRANT INSERT ON public.mitre_technique_groups TO authenticated;
GRANT INSERT ON public.mitre_technique_groups TO service_role;
GRANT INSERT ON public.mitre_technique_platforms TO anon;
GRANT INSERT ON public.mitre_technique_platforms TO authenticated;
GRANT INSERT ON public.mitre_technique_platforms TO service_role;
GRANT INSERT ON public.mitre_technique_tactics TO anon;
GRANT INSERT ON public.mitre_technique_tactics TO authenticated;
GRANT INSERT ON public.mitre_technique_tactics TO service_role;
GRANT INSERT ON public.mitre_techniques TO anon;
GRANT INSERT ON public.mitre_techniques TO authenticated;
GRANT INSERT ON public.mitre_techniques TO service_role;
GRANT INSERT ON public.pack_deploy_job_items TO anon;
GRANT INSERT ON public.pack_deploy_job_items TO authenticated;
GRANT INSERT ON public.pack_deploy_job_items TO service_role;
GRANT INSERT ON public.pack_deploy_jobs TO anon;
GRANT INSERT ON public.pack_deploy_jobs TO authenticated;
GRANT INSERT ON public.pack_deploy_jobs TO service_role;
GRANT INSERT ON public.pack_detections TO anon;
GRANT INSERT ON public.pack_detections TO authenticated;
GRANT INSERT ON public.pack_detections TO service_role;
GRANT INSERT ON public.pack_versions TO anon;
GRANT INSERT ON public.pack_versions TO authenticated;
GRANT INSERT ON public.pack_versions TO service_role;
GRANT INSERT ON public.profiles TO anon;
GRANT INSERT ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO service_role;
GRANT INSERT ON public.promotion_requests TO anon;
GRANT INSERT ON public.promotion_requests TO authenticated;
GRANT INSERT ON public.promotion_requests TO service_role;
GRANT INSERT ON public.rate_limits TO anon;
GRANT INSERT ON public.rate_limits TO authenticated;
GRANT INSERT ON public.rate_limits TO service_role;
GRANT INSERT ON public.resumable_imports TO anon;
GRANT INSERT ON public.resumable_imports TO authenticated;
GRANT INSERT ON public.resumable_imports TO service_role;
GRANT INSERT ON public.scoring_profiles TO anon;
GRANT INSERT ON public.scoring_profiles TO authenticated;
GRANT INSERT ON public.scoring_profiles TO service_role;
GRANT INSERT ON public.threat_intel_feed_entries TO anon;
GRANT INSERT ON public.threat_intel_feed_entries TO authenticated;
GRANT INSERT ON public.threat_intel_feed_entries TO service_role;
GRANT INSERT ON public.threat_intel_feeds TO anon;
GRANT INSERT ON public.threat_intel_feeds TO authenticated;
GRANT INSERT ON public.threat_intel_feeds TO service_role;
GRANT INSERT ON public.threat_intel_report_detections TO anon;
GRANT INSERT ON public.threat_intel_report_detections TO authenticated;
GRANT INSERT ON public.threat_intel_report_detections TO service_role;
GRANT INSERT ON public.threat_intel_reports TO anon;
GRANT INSERT ON public.threat_intel_reports TO authenticated;
GRANT INSERT ON public.threat_intel_reports TO service_role;
GRANT INSERT ON public.threat_research_events TO anon;
GRANT INSERT ON public.threat_research_events TO authenticated;
GRANT INSERT ON public.threat_research_events TO service_role;
GRANT INSERT ON public.threat_research_jobs TO anon;
GRANT INSERT ON public.threat_research_jobs TO authenticated;
GRANT INSERT ON public.threat_research_jobs TO service_role;
GRANT INSERT ON public.threat_research_sessions TO anon;
GRANT INSERT ON public.threat_research_sessions TO authenticated;
GRANT INSERT ON public.threat_research_sessions TO service_role;
GRANT INSERT ON public.user_dashboards TO anon;
GRANT INSERT ON public.user_dashboards TO authenticated;
GRANT INSERT ON public.user_dashboards TO service_role;
GRANT INSERT ON public.user_invitations TO anon;
GRANT INSERT ON public.user_invitations TO authenticated;
GRANT INSERT ON public.user_invitations TO service_role;
GRANT INSERT ON public.user_notifications TO anon;
GRANT INSERT ON public.user_notifications TO authenticated;
GRANT INSERT ON public.user_notifications TO service_role;
GRANT INSERT ON public.v_group_recency TO anon;
GRANT INSERT ON public.v_group_recency TO authenticated;
GRANT INSERT ON public.v_group_recency TO service_role;
GRANT INSERT ON public.v_mitigation_impact TO anon;
GRANT INSERT ON public.v_mitigation_impact TO authenticated;
GRANT INSERT ON public.v_mitigation_impact TO service_role;
GRANT INSERT ON public.v_mitre_analytics TO anon;
GRANT INSERT ON public.v_mitre_analytics TO authenticated;
GRANT INSERT ON public.v_mitre_analytics TO service_role;
GRANT INSERT ON public.v_mitre_analytics_with_strategy TO anon;
GRANT INSERT ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT INSERT ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT INSERT ON public.v_mitre_data_components TO anon;
GRANT INSERT ON public.v_mitre_data_components TO authenticated;
GRANT INSERT ON public.v_mitre_data_components TO service_role;
GRANT INSERT ON public.v_mitre_detection_strategies TO anon;
GRANT INSERT ON public.v_mitre_detection_strategies TO authenticated;
GRANT INSERT ON public.v_mitre_detection_strategies TO service_role;
GRANT INSERT ON public.v_mitre_groups_with_stats TO anon;
GRANT INSERT ON public.v_mitre_groups_with_stats TO authenticated;
GRANT INSERT ON public.v_mitre_groups_with_stats TO service_role;
GRANT INSERT ON public.v_mitre_groups_with_targeting TO anon;
GRANT INSERT ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT INSERT ON public.v_mitre_groups_with_targeting TO service_role;
GRANT INSERT ON public.v_mitre_mitigations TO anon;
GRANT INSERT ON public.v_mitre_mitigations TO authenticated;
GRANT INSERT ON public.v_mitre_mitigations TO service_role;
GRANT INSERT ON public.v_mitre_software_with_stats TO anon;
GRANT INSERT ON public.v_mitre_software_with_stats TO authenticated;
GRANT INSERT ON public.v_mitre_software_with_stats TO service_role;
GRANT INSERT ON public.v_mitre_techniques_full TO anon;
GRANT INSERT ON public.v_mitre_techniques_full TO authenticated;
GRANT INSERT ON public.v_mitre_techniques_full TO service_role;
GRANT INSERT ON public.v_pack_deployment_status TO anon;
GRANT INSERT ON public.v_pack_deployment_status TO authenticated;
GRANT INSERT ON public.v_pack_deployment_status TO service_role;
GRANT INSERT ON public.v_pack_totals TO anon;
GRANT INSERT ON public.v_pack_totals TO authenticated;
GRANT INSERT ON public.v_pack_totals TO service_role;
GRANT INSERT ON public.v_strategy_impact TO anon;
GRANT INSERT ON public.v_strategy_impact TO authenticated;
GRANT INSERT ON public.v_strategy_impact TO service_role;
GRANT INSERT ON public.v_technique_importance TO anon;
GRANT INSERT ON public.v_technique_importance TO authenticated;
GRANT INSERT ON public.v_technique_importance TO service_role;
GRANT INSERT ON public.v_technique_stats TO anon;
GRANT INSERT ON public.v_technique_stats TO authenticated;
GRANT INSERT ON public.v_technique_stats TO service_role;
GRANT INSERT ON public.v_threat_actor_weights TO anon;
GRANT INSERT ON public.v_threat_actor_weights TO authenticated;
GRANT INSERT ON public.v_threat_actor_weights TO service_role;
GRANT REFERENCES ON public.access_requests TO anon;
GRANT REFERENCES ON public.access_requests TO authenticated;
GRANT REFERENCES ON public.access_requests TO service_role;
GRANT REFERENCES ON public.activity_log TO anon;
GRANT REFERENCES ON public.activity_log TO authenticated;
GRANT REFERENCES ON public.activity_log TO service_role;
GRANT REFERENCES ON public.ai_budget_overrides TO anon;
GRANT REFERENCES ON public.ai_budget_overrides TO authenticated;
GRANT REFERENCES ON public.ai_budget_overrides TO service_role;
GRANT REFERENCES ON public.ai_budgets TO anon;
GRANT REFERENCES ON public.ai_budgets TO authenticated;
GRANT REFERENCES ON public.ai_budgets TO service_role;
GRANT REFERENCES ON public.ai_usage_daily TO anon;
GRANT REFERENCES ON public.ai_usage_daily TO authenticated;
GRANT REFERENCES ON public.ai_usage_daily TO service_role;
GRANT REFERENCES ON public.ai_usage_events TO anon;
GRANT REFERENCES ON public.ai_usage_events TO authenticated;
GRANT REFERENCES ON public.ai_usage_events TO service_role;
GRANT REFERENCES ON public.analysis_reports TO anon;
GRANT REFERENCES ON public.analysis_reports TO authenticated;
GRANT REFERENCES ON public.analysis_reports TO service_role;
GRANT REFERENCES ON public.audit_events TO anon;
GRANT REFERENCES ON public.audit_events TO authenticated;
GRANT REFERENCES ON public.audit_events TO service_role;
GRANT REFERENCES ON public.auto_digest_campaign_articles TO anon;
GRANT REFERENCES ON public.auto_digest_campaign_articles TO authenticated;
GRANT REFERENCES ON public.auto_digest_campaign_articles TO service_role;
GRANT REFERENCES ON public.auto_digest_campaigns TO anon;
GRANT REFERENCES ON public.auto_digest_campaigns TO authenticated;
GRANT REFERENCES ON public.auto_digest_campaigns TO service_role;
GRANT REFERENCES ON public.auto_digest_jobs TO anon;
GRANT REFERENCES ON public.auto_digest_jobs TO authenticated;
GRANT REFERENCES ON public.auto_digest_jobs TO service_role;
GRANT REFERENCES ON public.auto_digest_run_events TO anon;
GRANT REFERENCES ON public.auto_digest_run_events TO authenticated;
GRANT REFERENCES ON public.auto_digest_run_events TO service_role;
GRANT REFERENCES ON public.auto_digest_settings TO anon;
GRANT REFERENCES ON public.auto_digest_settings TO authenticated;
GRANT REFERENCES ON public.auto_digest_settings TO service_role;
GRANT REFERENCES ON public.batch_embedding_jobs TO anon;
GRANT REFERENCES ON public.batch_embedding_jobs TO authenticated;
GRANT REFERENCES ON public.batch_embedding_jobs TO service_role;
GRANT REFERENCES ON public.bulk_import_jobs TO anon;
GRANT REFERENCES ON public.bulk_import_jobs TO authenticated;
GRANT REFERENCES ON public.bulk_import_jobs TO service_role;
GRANT REFERENCES ON public.curated_feed_sources TO anon;
GRANT REFERENCES ON public.curated_feed_sources TO authenticated;
GRANT REFERENCES ON public.curated_feed_sources TO service_role;
GRANT REFERENCES ON public.defender_xdr_columns TO anon;
GRANT REFERENCES ON public.defender_xdr_columns TO authenticated;
GRANT REFERENCES ON public.defender_xdr_columns TO service_role;
GRANT REFERENCES ON public.defender_xdr_tables TO anon;
GRANT REFERENCES ON public.defender_xdr_tables TO authenticated;
GRANT REFERENCES ON public.defender_xdr_tables TO service_role;
GRANT REFERENCES ON public.deployment_history TO anon;
GRANT REFERENCES ON public.deployment_history TO authenticated;
GRANT REFERENCES ON public.deployment_history TO service_role;
GRANT REFERENCES ON public.detection_assignments TO anon;
GRANT REFERENCES ON public.detection_assignments TO authenticated;
GRANT REFERENCES ON public.detection_assignments TO service_role;
GRANT REFERENCES ON public.detection_comments TO anon;
GRANT REFERENCES ON public.detection_comments TO authenticated;
GRANT REFERENCES ON public.detection_comments TO service_role;
GRANT REFERENCES ON public.detection_decisions TO anon;
GRANT REFERENCES ON public.detection_decisions TO authenticated;
GRANT REFERENCES ON public.detection_decisions TO service_role;
GRANT REFERENCES ON public.detection_drift TO anon;
GRANT REFERENCES ON public.detection_drift TO authenticated;
GRANT REFERENCES ON public.detection_drift TO service_role;
GRANT REFERENCES ON public.detection_embeddings TO authenticated;
GRANT REFERENCES ON public.detection_embeddings TO service_role;
GRANT REFERENCES ON public.detection_finetune_runs TO anon;
GRANT REFERENCES ON public.detection_finetune_runs TO authenticated;
GRANT REFERENCES ON public.detection_finetune_runs TO service_role;
GRANT REFERENCES ON public.detection_packs TO anon;
GRANT REFERENCES ON public.detection_packs TO authenticated;
GRANT REFERENCES ON public.detection_packs TO service_role;
GRANT REFERENCES ON public.detection_patterns TO anon;
GRANT REFERENCES ON public.detection_patterns TO authenticated;
GRANT REFERENCES ON public.detection_patterns TO service_role;
GRANT REFERENCES ON public.detection_preflight_runs TO anon;
GRANT REFERENCES ON public.detection_preflight_runs TO authenticated;
GRANT REFERENCES ON public.detection_preflight_runs TO service_role;
GRANT REFERENCES ON public.detection_reviews TO anon;
GRANT REFERENCES ON public.detection_reviews TO authenticated;
GRANT REFERENCES ON public.detection_reviews TO service_role;
GRANT REFERENCES ON public.detections TO anon;
GRANT REFERENCES ON public.detections TO authenticated;
GRANT REFERENCES ON public.detections TO service_role;
GRANT REFERENCES ON public.enrichment_audit TO anon;
GRANT REFERENCES ON public.enrichment_audit TO authenticated;
GRANT REFERENCES ON public.enrichment_audit TO service_role;
GRANT REFERENCES ON public.environment_profiles TO anon;
GRANT REFERENCES ON public.environment_profiles TO authenticated;
GRANT REFERENCES ON public.environment_profiles TO service_role;
GRANT REFERENCES ON public.integration_credentials TO anon;
GRANT REFERENCES ON public.integration_credentials TO authenticated;
GRANT REFERENCES ON public.integration_credentials TO service_role;
GRANT REFERENCES ON public.integrations TO anon;
GRANT REFERENCES ON public.integrations TO authenticated;
GRANT REFERENCES ON public.integrations TO service_role;
GRANT REFERENCES ON public.mitre_campaign_techniques TO anon;
GRANT REFERENCES ON public.mitre_campaign_techniques TO authenticated;
GRANT REFERENCES ON public.mitre_campaign_techniques TO service_role;
GRANT REFERENCES ON public.mitre_campaigns TO anon;
GRANT REFERENCES ON public.mitre_campaigns TO authenticated;
GRANT REFERENCES ON public.mitre_campaigns TO service_role;
GRANT REFERENCES ON public.mitre_embeddings TO authenticated;
GRANT REFERENCES ON public.mitre_embeddings TO service_role;
GRANT REFERENCES ON public.mitre_group_campaigns TO anon;
GRANT REFERENCES ON public.mitre_group_campaigns TO authenticated;
GRANT REFERENCES ON public.mitre_group_campaigns TO service_role;
GRANT REFERENCES ON public.mitre_group_software TO anon;
GRANT REFERENCES ON public.mitre_group_software TO authenticated;
GRANT REFERENCES ON public.mitre_group_software TO service_role;
GRANT REFERENCES ON public.mitre_group_techniques TO anon;
GRANT REFERENCES ON public.mitre_group_techniques TO authenticated;
GRANT REFERENCES ON public.mitre_group_techniques TO service_role;
GRANT REFERENCES ON public.mitre_groups TO anon;
GRANT REFERENCES ON public.mitre_groups TO authenticated;
GRANT REFERENCES ON public.mitre_groups TO service_role;
GRANT REFERENCES ON public.mitre_metadata TO anon;
GRANT REFERENCES ON public.mitre_metadata TO authenticated;
GRANT REFERENCES ON public.mitre_metadata TO service_role;
GRANT REFERENCES ON public.mitre_mitigations TO anon;
GRANT REFERENCES ON public.mitre_mitigations TO authenticated;
GRANT REFERENCES ON public.mitre_mitigations TO service_role;
GRANT REFERENCES ON public.mitre_objects TO anon;
GRANT REFERENCES ON public.mitre_objects TO authenticated;
GRANT REFERENCES ON public.mitre_objects TO service_role;
GRANT REFERENCES ON public.mitre_relationships TO anon;
GRANT REFERENCES ON public.mitre_relationships TO authenticated;
GRANT REFERENCES ON public.mitre_relationships TO service_role;
GRANT REFERENCES ON public.mitre_scoring_snapshot TO anon;
GRANT REFERENCES ON public.mitre_scoring_snapshot TO authenticated;
GRANT REFERENCES ON public.mitre_scoring_snapshot TO service_role;
GRANT REFERENCES ON public.mitre_software TO anon;
GRANT REFERENCES ON public.mitre_software TO authenticated;
GRANT REFERENCES ON public.mitre_software TO service_role;
GRANT REFERENCES ON public.mitre_software_techniques TO anon;
GRANT REFERENCES ON public.mitre_software_techniques TO authenticated;
GRANT REFERENCES ON public.mitre_software_techniques TO service_role;
GRANT REFERENCES ON public.mitre_tactic_weights TO anon;
GRANT REFERENCES ON public.mitre_tactic_weights TO authenticated;
GRANT REFERENCES ON public.mitre_tactic_weights TO service_role;
GRANT REFERENCES ON public.mitre_technique_data_sources TO anon;
GRANT REFERENCES ON public.mitre_technique_data_sources TO authenticated;
GRANT REFERENCES ON public.mitre_technique_data_sources TO service_role;
GRANT REFERENCES ON public.mitre_technique_groups TO anon;
GRANT REFERENCES ON public.mitre_technique_groups TO authenticated;
GRANT REFERENCES ON public.mitre_technique_groups TO service_role;
GRANT REFERENCES ON public.mitre_technique_platforms TO anon;
GRANT REFERENCES ON public.mitre_technique_platforms TO authenticated;
GRANT REFERENCES ON public.mitre_technique_platforms TO service_role;
GRANT REFERENCES ON public.mitre_technique_tactics TO anon;
GRANT REFERENCES ON public.mitre_technique_tactics TO authenticated;
GRANT REFERENCES ON public.mitre_technique_tactics TO service_role;
GRANT REFERENCES ON public.mitre_techniques TO anon;
GRANT REFERENCES ON public.mitre_techniques TO authenticated;
GRANT REFERENCES ON public.mitre_techniques TO service_role;
GRANT REFERENCES ON public.pack_deploy_job_items TO anon;
GRANT REFERENCES ON public.pack_deploy_job_items TO authenticated;
GRANT REFERENCES ON public.pack_deploy_job_items TO service_role;
GRANT REFERENCES ON public.pack_deploy_jobs TO anon;
GRANT REFERENCES ON public.pack_deploy_jobs TO authenticated;
GRANT REFERENCES ON public.pack_deploy_jobs TO service_role;
GRANT REFERENCES ON public.pack_detections TO anon;
GRANT REFERENCES ON public.pack_detections TO authenticated;
GRANT REFERENCES ON public.pack_detections TO service_role;
GRANT REFERENCES ON public.pack_versions TO anon;
GRANT REFERENCES ON public.pack_versions TO authenticated;
GRANT REFERENCES ON public.pack_versions TO service_role;
GRANT REFERENCES ON public.profiles TO anon;
GRANT REFERENCES ON public.profiles TO authenticated;
GRANT REFERENCES ON public.profiles TO service_role;
GRANT REFERENCES ON public.promotion_requests TO anon;
GRANT REFERENCES ON public.promotion_requests TO authenticated;
GRANT REFERENCES ON public.promotion_requests TO service_role;
GRANT REFERENCES ON public.rate_limits TO anon;
GRANT REFERENCES ON public.rate_limits TO authenticated;
GRANT REFERENCES ON public.rate_limits TO service_role;
GRANT REFERENCES ON public.resumable_imports TO anon;
GRANT REFERENCES ON public.resumable_imports TO authenticated;
GRANT REFERENCES ON public.resumable_imports TO service_role;
GRANT REFERENCES ON public.scoring_profiles TO anon;
GRANT REFERENCES ON public.scoring_profiles TO authenticated;
GRANT REFERENCES ON public.scoring_profiles TO service_role;
GRANT REFERENCES ON public.threat_intel_feed_entries TO anon;
GRANT REFERENCES ON public.threat_intel_feed_entries TO authenticated;
GRANT REFERENCES ON public.threat_intel_feed_entries TO service_role;
GRANT REFERENCES ON public.threat_intel_feeds TO anon;
GRANT REFERENCES ON public.threat_intel_feeds TO authenticated;
GRANT REFERENCES ON public.threat_intel_feeds TO service_role;
GRANT REFERENCES ON public.threat_intel_report_detections TO anon;
GRANT REFERENCES ON public.threat_intel_report_detections TO authenticated;
GRANT REFERENCES ON public.threat_intel_report_detections TO service_role;
GRANT REFERENCES ON public.threat_intel_reports TO anon;
GRANT REFERENCES ON public.threat_intel_reports TO authenticated;
GRANT REFERENCES ON public.threat_intel_reports TO service_role;
GRANT REFERENCES ON public.threat_research_events TO anon;
GRANT REFERENCES ON public.threat_research_events TO authenticated;
GRANT REFERENCES ON public.threat_research_events TO service_role;
GRANT REFERENCES ON public.threat_research_jobs TO anon;
GRANT REFERENCES ON public.threat_research_jobs TO authenticated;
GRANT REFERENCES ON public.threat_research_jobs TO service_role;
GRANT REFERENCES ON public.threat_research_sessions TO anon;
GRANT REFERENCES ON public.threat_research_sessions TO authenticated;
GRANT REFERENCES ON public.threat_research_sessions TO service_role;
GRANT REFERENCES ON public.user_dashboards TO anon;
GRANT REFERENCES ON public.user_dashboards TO authenticated;
GRANT REFERENCES ON public.user_dashboards TO service_role;
GRANT REFERENCES ON public.user_invitations TO anon;
GRANT REFERENCES ON public.user_invitations TO authenticated;
GRANT REFERENCES ON public.user_invitations TO service_role;
GRANT REFERENCES ON public.user_notifications TO anon;
GRANT REFERENCES ON public.user_notifications TO authenticated;
GRANT REFERENCES ON public.user_notifications TO service_role;
GRANT REFERENCES ON public.v_group_recency TO anon;
GRANT REFERENCES ON public.v_group_recency TO authenticated;
GRANT REFERENCES ON public.v_group_recency TO service_role;
GRANT REFERENCES ON public.v_mitigation_impact TO anon;
GRANT REFERENCES ON public.v_mitigation_impact TO authenticated;
GRANT REFERENCES ON public.v_mitigation_impact TO service_role;
GRANT REFERENCES ON public.v_mitre_analytics TO anon;
GRANT REFERENCES ON public.v_mitre_analytics TO authenticated;
GRANT REFERENCES ON public.v_mitre_analytics TO service_role;
GRANT REFERENCES ON public.v_mitre_analytics_with_strategy TO anon;
GRANT REFERENCES ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT REFERENCES ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT REFERENCES ON public.v_mitre_data_components TO anon;
GRANT REFERENCES ON public.v_mitre_data_components TO authenticated;
GRANT REFERENCES ON public.v_mitre_data_components TO service_role;
GRANT REFERENCES ON public.v_mitre_detection_strategies TO anon;
GRANT REFERENCES ON public.v_mitre_detection_strategies TO authenticated;
GRANT REFERENCES ON public.v_mitre_detection_strategies TO service_role;
GRANT REFERENCES ON public.v_mitre_groups_with_stats TO anon;
GRANT REFERENCES ON public.v_mitre_groups_with_stats TO authenticated;
GRANT REFERENCES ON public.v_mitre_groups_with_stats TO service_role;
GRANT REFERENCES ON public.v_mitre_groups_with_targeting TO anon;
GRANT REFERENCES ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT REFERENCES ON public.v_mitre_groups_with_targeting TO service_role;
GRANT REFERENCES ON public.v_mitre_mitigations TO anon;
GRANT REFERENCES ON public.v_mitre_mitigations TO authenticated;
GRANT REFERENCES ON public.v_mitre_mitigations TO service_role;
GRANT REFERENCES ON public.v_mitre_software_with_stats TO anon;
GRANT REFERENCES ON public.v_mitre_software_with_stats TO authenticated;
GRANT REFERENCES ON public.v_mitre_software_with_stats TO service_role;
GRANT REFERENCES ON public.v_mitre_techniques_full TO anon;
GRANT REFERENCES ON public.v_mitre_techniques_full TO authenticated;
GRANT REFERENCES ON public.v_mitre_techniques_full TO service_role;
GRANT REFERENCES ON public.v_pack_deployment_status TO anon;
GRANT REFERENCES ON public.v_pack_deployment_status TO authenticated;
GRANT REFERENCES ON public.v_pack_deployment_status TO service_role;
GRANT REFERENCES ON public.v_pack_totals TO anon;
GRANT REFERENCES ON public.v_pack_totals TO authenticated;
GRANT REFERENCES ON public.v_pack_totals TO service_role;
GRANT REFERENCES ON public.v_strategy_impact TO anon;
GRANT REFERENCES ON public.v_strategy_impact TO authenticated;
GRANT REFERENCES ON public.v_strategy_impact TO service_role;
GRANT REFERENCES ON public.v_technique_importance TO anon;
GRANT REFERENCES ON public.v_technique_importance TO authenticated;
GRANT REFERENCES ON public.v_technique_importance TO service_role;
GRANT REFERENCES ON public.v_technique_stats TO anon;
GRANT REFERENCES ON public.v_technique_stats TO authenticated;
GRANT REFERENCES ON public.v_technique_stats TO service_role;
GRANT REFERENCES ON public.v_threat_actor_weights TO anon;
GRANT REFERENCES ON public.v_threat_actor_weights TO authenticated;
GRANT REFERENCES ON public.v_threat_actor_weights TO service_role;
GRANT SELECT ON public.access_requests TO anon;
GRANT SELECT ON public.access_requests TO authenticated;
GRANT SELECT ON public.access_requests TO service_role;
GRANT SELECT ON public.activity_log TO anon;
GRANT SELECT ON public.activity_log TO authenticated;
GRANT SELECT ON public.activity_log TO service_role;
GRANT SELECT ON public.ai_budget_overrides TO anon;
GRANT SELECT ON public.ai_budget_overrides TO authenticated;
GRANT SELECT ON public.ai_budget_overrides TO service_role;
GRANT SELECT ON public.ai_budgets TO anon;
GRANT SELECT ON public.ai_budgets TO authenticated;
GRANT SELECT ON public.ai_budgets TO service_role;
GRANT SELECT ON public.ai_usage_daily TO anon;
GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT SELECT ON public.ai_usage_daily TO service_role;
GRANT SELECT ON public.ai_usage_events TO anon;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT SELECT ON public.ai_usage_events TO service_role;
GRANT SELECT ON public.analysis_reports TO anon;
GRANT SELECT ON public.analysis_reports TO authenticated;
GRANT SELECT ON public.analysis_reports TO service_role;
GRANT SELECT ON public.audit_events TO anon;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT SELECT ON public.audit_events TO service_role;
GRANT SELECT ON public.auto_digest_campaign_articles TO anon;
GRANT SELECT ON public.auto_digest_campaign_articles TO authenticated;
GRANT SELECT ON public.auto_digest_campaign_articles TO service_role;
GRANT SELECT ON public.auto_digest_campaigns TO anon;
GRANT SELECT ON public.auto_digest_campaigns TO authenticated;
GRANT SELECT ON public.auto_digest_campaigns TO service_role;
GRANT SELECT ON public.auto_digest_jobs TO anon;
GRANT SELECT ON public.auto_digest_jobs TO authenticated;
GRANT SELECT ON public.auto_digest_jobs TO service_role;
GRANT SELECT ON public.auto_digest_run_events TO anon;
GRANT SELECT ON public.auto_digest_run_events TO authenticated;
GRANT SELECT ON public.auto_digest_run_events TO service_role;
GRANT SELECT ON public.auto_digest_settings TO anon;
GRANT SELECT ON public.auto_digest_settings TO authenticated;
GRANT SELECT ON public.auto_digest_settings TO service_role;
GRANT SELECT ON public.batch_embedding_jobs TO anon;
GRANT SELECT ON public.batch_embedding_jobs TO authenticated;
GRANT SELECT ON public.batch_embedding_jobs TO service_role;
GRANT SELECT ON public.bulk_import_jobs TO anon;
GRANT SELECT ON public.bulk_import_jobs TO authenticated;
GRANT SELECT ON public.bulk_import_jobs TO service_role;
GRANT SELECT ON public.curated_feed_sources TO anon;
GRANT SELECT ON public.crowdstrike_finetune_runs TO authenticated;
GRANT SELECT ON public.crowdstrike_finetune_runs TO service_role;
GRANT SELECT ON public.crowdstrike_finetune_query_jobs TO authenticated;
GRANT SELECT ON public.crowdstrike_finetune_query_jobs TO service_role;
GRANT SELECT ON public.curated_feed_sources TO authenticated;
GRANT SELECT ON public.curated_feed_sources TO service_role;
GRANT SELECT ON public.defender_xdr_columns TO anon;
GRANT SELECT ON public.defender_xdr_columns TO authenticated;
GRANT SELECT ON public.defender_xdr_columns TO service_role;
GRANT SELECT ON public.defender_xdr_tables TO anon;
GRANT SELECT ON public.defender_xdr_tables TO authenticated;
GRANT SELECT ON public.defender_xdr_tables TO service_role;
GRANT SELECT ON public.deployment_history TO anon;
GRANT SELECT ON public.deployment_history TO authenticated;
GRANT SELECT ON public.deployment_history TO service_role;
GRANT SELECT ON public.detection_assignments TO anon;
GRANT SELECT ON public.detection_assignments TO authenticated;
GRANT SELECT ON public.detection_assignments TO service_role;
GRANT SELECT ON public.detection_comments TO anon;
GRANT SELECT ON public.detection_comments TO authenticated;
GRANT SELECT ON public.detection_comments TO service_role;
GRANT SELECT ON public.detection_decisions TO anon;
GRANT SELECT ON public.detection_decisions TO authenticated;
GRANT SELECT ON public.detection_decisions TO service_role;
GRANT SELECT ON public.detection_drift TO anon;
GRANT SELECT ON public.detection_drift TO authenticated;
GRANT SELECT ON public.detection_drift TO service_role;
GRANT SELECT ON public.detection_embeddings TO authenticated;
GRANT SELECT ON public.detection_embeddings TO service_role;
GRANT SELECT ON public.detection_finetune_runs TO anon;
GRANT SELECT ON public.detection_finetune_runs TO authenticated;
GRANT SELECT ON public.detection_finetune_runs TO service_role;
GRANT SELECT ON public.detection_packs TO anon;
GRANT SELECT ON public.detection_packs TO authenticated;
GRANT SELECT ON public.detection_packs TO service_role;
GRANT SELECT ON public.detection_patterns TO anon;
GRANT SELECT ON public.detection_patterns TO authenticated;
GRANT SELECT ON public.detection_patterns TO service_role;
GRANT SELECT ON public.detection_preflight_runs TO anon;
GRANT SELECT ON public.detection_preflight_runs TO authenticated;
GRANT SELECT ON public.detection_preflight_runs TO service_role;
GRANT SELECT ON public.detection_reviews TO anon;
GRANT SELECT ON public.detection_reviews TO authenticated;
GRANT SELECT ON public.detection_reviews TO service_role;
GRANT SELECT ON public.detections TO anon;
GRANT SELECT ON public.detections TO authenticated;
GRANT SELECT ON public.detections TO service_role;
GRANT SELECT ON public.enrichment_audit TO anon;
GRANT SELECT ON public.enrichment_audit TO authenticated;
GRANT SELECT ON public.enrichment_audit TO service_role;
GRANT SELECT ON public.environment_profiles TO anon;
GRANT SELECT ON public.environment_profiles TO authenticated;
GRANT SELECT ON public.environment_profiles TO service_role;
GRANT SELECT ON public.integration_credentials TO anon;
GRANT SELECT ON public.integration_credentials TO authenticated;
GRANT SELECT ON public.integration_credentials TO service_role;
GRANT SELECT ON public.integrations TO anon;
GRANT SELECT ON public.integrations TO authenticated;
GRANT SELECT ON public.integrations TO service_role;
GRANT SELECT ON public.mitre_campaign_techniques TO anon;
GRANT SELECT ON public.mitre_campaign_techniques TO authenticated;
GRANT SELECT ON public.mitre_campaign_techniques TO service_role;
GRANT SELECT ON public.mitre_campaigns TO anon;
GRANT SELECT ON public.mitre_campaigns TO authenticated;
GRANT SELECT ON public.mitre_campaigns TO service_role;
GRANT SELECT ON public.mitre_embeddings TO authenticated;
GRANT SELECT ON public.mitre_embeddings TO service_role;
GRANT SELECT ON public.mitre_group_campaigns TO anon;
GRANT SELECT ON public.mitre_group_campaigns TO authenticated;
GRANT SELECT ON public.mitre_group_campaigns TO service_role;
GRANT SELECT ON public.mitre_group_software TO anon;
GRANT SELECT ON public.mitre_group_software TO authenticated;
GRANT SELECT ON public.mitre_group_software TO service_role;
GRANT SELECT ON public.mitre_group_techniques TO anon;
GRANT SELECT ON public.mitre_group_techniques TO authenticated;
GRANT SELECT ON public.mitre_group_techniques TO service_role;
GRANT SELECT ON public.mitre_groups TO anon;
GRANT SELECT ON public.mitre_groups TO authenticated;
GRANT SELECT ON public.mitre_groups TO service_role;
GRANT SELECT ON public.mitre_metadata TO anon;
GRANT SELECT ON public.mitre_metadata TO authenticated;
GRANT SELECT ON public.mitre_metadata TO service_role;
GRANT SELECT ON public.mitre_mitigations TO anon;
GRANT SELECT ON public.mitre_mitigations TO authenticated;
GRANT SELECT ON public.mitre_mitigations TO service_role;
GRANT SELECT ON public.mitre_objects TO anon;
GRANT SELECT ON public.mitre_objects TO authenticated;
GRANT SELECT ON public.mitre_objects TO service_role;
GRANT SELECT ON public.mitre_relationships TO anon;
GRANT SELECT ON public.mitre_relationships TO authenticated;
GRANT SELECT ON public.mitre_relationships TO service_role;
GRANT SELECT ON public.mitre_scoring_snapshot TO anon;
GRANT SELECT ON public.mitre_scoring_snapshot TO authenticated;
GRANT SELECT ON public.mitre_scoring_snapshot TO service_role;
GRANT SELECT ON public.mitre_software TO anon;
GRANT SELECT ON public.mitre_software TO authenticated;
GRANT SELECT ON public.mitre_software TO service_role;
GRANT SELECT ON public.mitre_software_techniques TO anon;
GRANT SELECT ON public.mitre_software_techniques TO authenticated;
GRANT SELECT ON public.mitre_software_techniques TO service_role;
GRANT SELECT ON public.mitre_tactic_weights TO anon;
GRANT SELECT ON public.mitre_tactic_weights TO authenticated;
GRANT SELECT ON public.mitre_tactic_weights TO service_role;
GRANT SELECT ON public.mitre_technique_data_sources TO anon;
GRANT SELECT ON public.mitre_technique_data_sources TO authenticated;
GRANT SELECT ON public.mitre_technique_data_sources TO service_role;
GRANT SELECT ON public.mitre_technique_groups TO anon;
GRANT SELECT ON public.mitre_technique_groups TO authenticated;
GRANT SELECT ON public.mitre_technique_groups TO service_role;
GRANT SELECT ON public.mitre_technique_platforms TO anon;
GRANT SELECT ON public.mitre_technique_platforms TO authenticated;
GRANT SELECT ON public.mitre_technique_platforms TO service_role;
GRANT SELECT ON public.mitre_technique_tactics TO anon;
GRANT SELECT ON public.mitre_technique_tactics TO authenticated;
GRANT SELECT ON public.mitre_technique_tactics TO service_role;
GRANT SELECT ON public.mitre_techniques TO anon;
GRANT SELECT ON public.mitre_techniques TO authenticated;
GRANT SELECT ON public.mitre_techniques TO service_role;
GRANT SELECT ON public.pack_deploy_job_items TO anon;
GRANT SELECT ON public.pack_deploy_job_items TO authenticated;
GRANT SELECT ON public.pack_deploy_job_items TO service_role;
GRANT SELECT ON public.pack_deploy_jobs TO anon;
GRANT SELECT ON public.pack_deploy_jobs TO authenticated;
GRANT SELECT ON public.pack_deploy_jobs TO service_role;
GRANT SELECT ON public.pack_detections TO anon;
GRANT SELECT ON public.pack_detections TO authenticated;
GRANT SELECT ON public.pack_detections TO service_role;
GRANT SELECT ON public.pack_versions TO anon;
GRANT SELECT ON public.pack_versions TO authenticated;
GRANT SELECT ON public.pack_versions TO service_role;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT ON public.promotion_requests TO anon;
GRANT SELECT ON public.promotion_requests TO authenticated;
GRANT SELECT ON public.promotion_requests TO service_role;
GRANT SELECT ON public.rate_limits TO anon;
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT SELECT ON public.rate_limits TO service_role;
GRANT SELECT ON public.resumable_imports TO anon;
GRANT SELECT ON public.resumable_imports TO authenticated;
GRANT SELECT ON public.resumable_imports TO service_role;
GRANT SELECT ON public.scoring_profiles TO anon;
GRANT SELECT ON public.scoring_profiles TO authenticated;
GRANT SELECT ON public.scoring_profiles TO service_role;
GRANT SELECT ON public.threat_intel_feed_entries TO anon;
GRANT SELECT ON public.threat_intel_feed_entries TO authenticated;
GRANT SELECT ON public.threat_intel_feed_entries TO service_role;
GRANT SELECT ON public.threat_intel_feeds TO anon;
GRANT SELECT ON public.threat_intel_feeds TO authenticated;
GRANT SELECT ON public.threat_intel_feeds TO service_role;
GRANT SELECT ON public.threat_intel_report_detections TO anon;
GRANT SELECT ON public.threat_intel_report_detections TO authenticated;
GRANT SELECT ON public.threat_intel_report_detections TO service_role;
GRANT SELECT ON public.threat_intel_reports TO anon;
GRANT SELECT ON public.threat_intel_reports TO authenticated;
GRANT SELECT ON public.threat_intel_reports TO service_role;
GRANT SELECT ON public.threat_research_events TO anon;
GRANT SELECT ON public.threat_research_events TO authenticated;
GRANT SELECT ON public.threat_research_events TO service_role;
GRANT SELECT ON public.threat_research_jobs TO anon;
GRANT SELECT ON public.threat_research_jobs TO authenticated;
GRANT SELECT ON public.threat_research_jobs TO service_role;
GRANT SELECT ON public.threat_research_sessions TO anon;
GRANT SELECT ON public.threat_research_sessions TO authenticated;
GRANT SELECT ON public.threat_research_sessions TO service_role;
GRANT SELECT ON public.user_dashboards TO anon;
GRANT SELECT ON public.user_dashboards TO authenticated;
GRANT SELECT ON public.user_dashboards TO service_role;
GRANT SELECT ON public.user_invitations TO anon;
GRANT SELECT ON public.user_invitations TO authenticated;
GRANT SELECT ON public.user_invitations TO service_role;
GRANT SELECT ON public.user_notifications TO anon;
GRANT SELECT ON public.user_notifications TO authenticated;
GRANT SELECT ON public.user_notifications TO service_role;
GRANT SELECT ON public.v_group_recency TO anon;
GRANT SELECT ON public.v_group_recency TO authenticated;
GRANT SELECT ON public.v_group_recency TO service_role;
GRANT SELECT ON public.v_mitigation_impact TO anon;
GRANT SELECT ON public.v_mitigation_impact TO authenticated;
GRANT SELECT ON public.v_mitigation_impact TO service_role;
GRANT SELECT ON public.v_mitre_analytics TO anon;
GRANT SELECT ON public.v_mitre_analytics TO authenticated;
GRANT SELECT ON public.v_mitre_analytics TO service_role;
GRANT SELECT ON public.v_mitre_analytics_with_strategy TO anon;
GRANT SELECT ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT SELECT ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT SELECT ON public.v_mitre_data_components TO anon;
GRANT SELECT ON public.v_mitre_data_components TO authenticated;
GRANT SELECT ON public.v_mitre_data_components TO service_role;
GRANT SELECT ON public.v_mitre_detection_strategies TO anon;
GRANT SELECT ON public.v_mitre_detection_strategies TO authenticated;
GRANT SELECT ON public.v_mitre_detection_strategies TO service_role;
GRANT SELECT ON public.v_mitre_groups_with_stats TO anon;
GRANT SELECT ON public.v_mitre_groups_with_stats TO authenticated;
GRANT SELECT ON public.v_mitre_groups_with_stats TO service_role;
GRANT SELECT ON public.v_mitre_groups_with_targeting TO anon;
GRANT SELECT ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT SELECT ON public.v_mitre_groups_with_targeting TO service_role;
GRANT SELECT ON public.v_mitre_mitigations TO anon;
GRANT SELECT ON public.v_mitre_mitigations TO authenticated;
GRANT SELECT ON public.v_mitre_mitigations TO service_role;
GRANT SELECT ON public.v_mitre_software_with_stats TO anon;
GRANT SELECT ON public.v_mitre_software_with_stats TO authenticated;
GRANT SELECT ON public.v_mitre_software_with_stats TO service_role;
GRANT SELECT ON public.v_mitre_techniques_full TO anon;
GRANT SELECT ON public.v_mitre_techniques_full TO authenticated;
GRANT SELECT ON public.v_mitre_techniques_full TO service_role;
GRANT SELECT ON public.v_pack_deployment_status TO anon;
GRANT SELECT ON public.v_pack_deployment_status TO authenticated;
GRANT SELECT ON public.v_pack_deployment_status TO service_role;
GRANT SELECT ON public.v_pack_totals TO anon;
GRANT SELECT ON public.v_pack_totals TO authenticated;
GRANT SELECT ON public.v_pack_totals TO service_role;
GRANT SELECT ON public.v_strategy_impact TO anon;
GRANT SELECT ON public.v_strategy_impact TO authenticated;
GRANT SELECT ON public.v_strategy_impact TO service_role;
GRANT SELECT ON public.v_technique_importance TO anon;
GRANT SELECT ON public.v_technique_importance TO authenticated;
GRANT SELECT ON public.v_technique_importance TO service_role;
GRANT SELECT ON public.v_technique_stats TO anon;
GRANT SELECT ON public.v_technique_stats TO authenticated;
GRANT SELECT ON public.v_technique_stats TO service_role;
GRANT SELECT ON public.v_threat_actor_weights TO anon;
GRANT SELECT ON public.v_threat_actor_weights TO authenticated;
GRANT SELECT ON public.v_threat_actor_weights TO service_role;
GRANT TRIGGER ON public.access_requests TO anon;
GRANT TRIGGER ON public.access_requests TO authenticated;
GRANT TRIGGER ON public.access_requests TO service_role;
GRANT TRIGGER ON public.activity_log TO anon;
GRANT TRIGGER ON public.activity_log TO authenticated;
GRANT TRIGGER ON public.activity_log TO service_role;
GRANT TRIGGER ON public.ai_budget_overrides TO anon;
GRANT TRIGGER ON public.ai_budget_overrides TO authenticated;
GRANT TRIGGER ON public.ai_budget_overrides TO service_role;
GRANT TRIGGER ON public.ai_budgets TO anon;
GRANT TRIGGER ON public.ai_budgets TO authenticated;
GRANT TRIGGER ON public.ai_budgets TO service_role;
GRANT TRIGGER ON public.ai_usage_daily TO anon;
GRANT TRIGGER ON public.ai_usage_daily TO authenticated;
GRANT TRIGGER ON public.ai_usage_daily TO service_role;
GRANT TRIGGER ON public.ai_usage_events TO anon;
GRANT TRIGGER ON public.ai_usage_events TO authenticated;
GRANT TRIGGER ON public.ai_usage_events TO service_role;
GRANT TRIGGER ON public.analysis_reports TO anon;
GRANT TRIGGER ON public.analysis_reports TO authenticated;
GRANT TRIGGER ON public.analysis_reports TO service_role;
GRANT TRIGGER ON public.audit_events TO anon;
GRANT TRIGGER ON public.audit_events TO authenticated;
GRANT TRIGGER ON public.audit_events TO service_role;
GRANT TRIGGER ON public.auto_digest_campaign_articles TO anon;
GRANT TRIGGER ON public.auto_digest_campaign_articles TO authenticated;
GRANT TRIGGER ON public.auto_digest_campaign_articles TO service_role;
GRANT TRIGGER ON public.auto_digest_campaigns TO anon;
GRANT TRIGGER ON public.auto_digest_campaigns TO authenticated;
GRANT TRIGGER ON public.auto_digest_campaigns TO service_role;
GRANT TRIGGER ON public.auto_digest_jobs TO anon;
GRANT TRIGGER ON public.auto_digest_jobs TO authenticated;
GRANT TRIGGER ON public.auto_digest_jobs TO service_role;
GRANT TRIGGER ON public.auto_digest_run_events TO anon;
GRANT TRIGGER ON public.auto_digest_run_events TO authenticated;
GRANT TRIGGER ON public.auto_digest_run_events TO service_role;
GRANT TRIGGER ON public.auto_digest_settings TO anon;
GRANT TRIGGER ON public.auto_digest_settings TO authenticated;
GRANT TRIGGER ON public.auto_digest_settings TO service_role;
GRANT TRIGGER ON public.batch_embedding_jobs TO anon;
GRANT TRIGGER ON public.batch_embedding_jobs TO authenticated;
GRANT TRIGGER ON public.batch_embedding_jobs TO service_role;
GRANT TRIGGER ON public.bulk_import_jobs TO anon;
GRANT TRIGGER ON public.bulk_import_jobs TO authenticated;
GRANT TRIGGER ON public.bulk_import_jobs TO service_role;
GRANT TRIGGER ON public.curated_feed_sources TO anon;
GRANT TRIGGER ON public.curated_feed_sources TO authenticated;
GRANT TRIGGER ON public.curated_feed_sources TO service_role;
GRANT TRIGGER ON public.defender_xdr_columns TO anon;
GRANT TRIGGER ON public.defender_xdr_columns TO authenticated;
GRANT TRIGGER ON public.defender_xdr_columns TO service_role;
GRANT TRIGGER ON public.defender_xdr_tables TO anon;
GRANT TRIGGER ON public.defender_xdr_tables TO authenticated;
GRANT TRIGGER ON public.defender_xdr_tables TO service_role;
GRANT TRIGGER ON public.deployment_history TO anon;
GRANT TRIGGER ON public.deployment_history TO authenticated;
GRANT TRIGGER ON public.deployment_history TO service_role;
GRANT TRIGGER ON public.detection_assignments TO anon;
GRANT TRIGGER ON public.detection_assignments TO authenticated;
GRANT TRIGGER ON public.detection_assignments TO service_role;
GRANT TRIGGER ON public.detection_comments TO anon;
GRANT TRIGGER ON public.detection_comments TO authenticated;
GRANT TRIGGER ON public.detection_comments TO service_role;
GRANT TRIGGER ON public.detection_decisions TO anon;
GRANT TRIGGER ON public.detection_decisions TO authenticated;
GRANT TRIGGER ON public.detection_decisions TO service_role;
GRANT TRIGGER ON public.detection_drift TO anon;
GRANT TRIGGER ON public.detection_drift TO authenticated;
GRANT TRIGGER ON public.detection_drift TO service_role;
GRANT TRIGGER ON public.detection_embeddings TO authenticated;
GRANT TRIGGER ON public.detection_embeddings TO service_role;
GRANT TRIGGER ON public.detection_finetune_runs TO anon;
GRANT TRIGGER ON public.detection_finetune_runs TO authenticated;
GRANT TRIGGER ON public.detection_finetune_runs TO service_role;
GRANT TRIGGER ON public.detection_packs TO anon;
GRANT TRIGGER ON public.detection_packs TO authenticated;
GRANT TRIGGER ON public.detection_packs TO service_role;
GRANT TRIGGER ON public.detection_patterns TO anon;
GRANT TRIGGER ON public.detection_patterns TO authenticated;
GRANT TRIGGER ON public.detection_patterns TO service_role;
GRANT TRIGGER ON public.detection_preflight_runs TO anon;
GRANT TRIGGER ON public.detection_preflight_runs TO authenticated;
GRANT TRIGGER ON public.detection_preflight_runs TO service_role;
GRANT TRIGGER ON public.detection_reviews TO anon;
GRANT TRIGGER ON public.detection_reviews TO authenticated;
GRANT TRIGGER ON public.detection_reviews TO service_role;
GRANT TRIGGER ON public.detections TO anon;
GRANT TRIGGER ON public.detections TO authenticated;
GRANT TRIGGER ON public.detections TO service_role;
GRANT TRIGGER ON public.enrichment_audit TO anon;
GRANT TRIGGER ON public.enrichment_audit TO authenticated;
GRANT TRIGGER ON public.enrichment_audit TO service_role;
GRANT TRIGGER ON public.environment_profiles TO anon;
GRANT TRIGGER ON public.environment_profiles TO authenticated;
GRANT TRIGGER ON public.environment_profiles TO service_role;
GRANT TRIGGER ON public.integration_credentials TO anon;
GRANT TRIGGER ON public.integration_credentials TO authenticated;
GRANT TRIGGER ON public.integration_credentials TO service_role;
GRANT TRIGGER ON public.integrations TO anon;
GRANT TRIGGER ON public.integrations TO authenticated;
GRANT TRIGGER ON public.integrations TO service_role;
GRANT TRIGGER ON public.mitre_campaign_techniques TO anon;
GRANT TRIGGER ON public.mitre_campaign_techniques TO authenticated;
GRANT TRIGGER ON public.mitre_campaign_techniques TO service_role;
GRANT TRIGGER ON public.mitre_campaigns TO anon;
GRANT TRIGGER ON public.mitre_campaigns TO authenticated;
GRANT TRIGGER ON public.mitre_campaigns TO service_role;
GRANT TRIGGER ON public.mitre_embeddings TO authenticated;
GRANT TRIGGER ON public.mitre_embeddings TO service_role;
GRANT TRIGGER ON public.mitre_group_campaigns TO anon;
GRANT TRIGGER ON public.mitre_group_campaigns TO authenticated;
GRANT TRIGGER ON public.mitre_group_campaigns TO service_role;
GRANT TRIGGER ON public.mitre_group_software TO anon;
GRANT TRIGGER ON public.mitre_group_software TO authenticated;
GRANT TRIGGER ON public.mitre_group_software TO service_role;
GRANT TRIGGER ON public.mitre_group_techniques TO anon;
GRANT TRIGGER ON public.mitre_group_techniques TO authenticated;
GRANT TRIGGER ON public.mitre_group_techniques TO service_role;
GRANT TRIGGER ON public.mitre_groups TO anon;
GRANT TRIGGER ON public.mitre_groups TO authenticated;
GRANT TRIGGER ON public.mitre_groups TO service_role;
GRANT TRIGGER ON public.mitre_metadata TO anon;
GRANT TRIGGER ON public.mitre_metadata TO authenticated;
GRANT TRIGGER ON public.mitre_metadata TO service_role;
GRANT TRIGGER ON public.mitre_mitigations TO anon;
GRANT TRIGGER ON public.mitre_mitigations TO authenticated;
GRANT TRIGGER ON public.mitre_mitigations TO service_role;
GRANT TRIGGER ON public.mitre_objects TO anon;
GRANT TRIGGER ON public.mitre_objects TO authenticated;
GRANT TRIGGER ON public.mitre_objects TO service_role;
GRANT TRIGGER ON public.mitre_relationships TO anon;
GRANT TRIGGER ON public.mitre_relationships TO authenticated;
GRANT TRIGGER ON public.mitre_relationships TO service_role;
GRANT TRIGGER ON public.mitre_scoring_snapshot TO anon;
GRANT TRIGGER ON public.mitre_scoring_snapshot TO authenticated;
GRANT TRIGGER ON public.mitre_scoring_snapshot TO service_role;
GRANT TRIGGER ON public.mitre_software TO anon;
GRANT TRIGGER ON public.mitre_software TO authenticated;
GRANT TRIGGER ON public.mitre_software TO service_role;
GRANT TRIGGER ON public.mitre_software_techniques TO anon;
GRANT TRIGGER ON public.mitre_software_techniques TO authenticated;
GRANT TRIGGER ON public.mitre_software_techniques TO service_role;
GRANT TRIGGER ON public.mitre_tactic_weights TO anon;
GRANT TRIGGER ON public.mitre_tactic_weights TO authenticated;
GRANT TRIGGER ON public.mitre_tactic_weights TO service_role;
GRANT TRIGGER ON public.mitre_technique_data_sources TO anon;
GRANT TRIGGER ON public.mitre_technique_data_sources TO authenticated;
GRANT TRIGGER ON public.mitre_technique_data_sources TO service_role;
GRANT TRIGGER ON public.mitre_technique_groups TO anon;
GRANT TRIGGER ON public.mitre_technique_groups TO authenticated;
GRANT TRIGGER ON public.mitre_technique_groups TO service_role;
GRANT TRIGGER ON public.mitre_technique_platforms TO anon;
GRANT TRIGGER ON public.mitre_technique_platforms TO authenticated;
GRANT TRIGGER ON public.mitre_technique_platforms TO service_role;
GRANT TRIGGER ON public.mitre_technique_tactics TO anon;
GRANT TRIGGER ON public.mitre_technique_tactics TO authenticated;
GRANT TRIGGER ON public.mitre_technique_tactics TO service_role;
GRANT TRIGGER ON public.mitre_techniques TO anon;
GRANT TRIGGER ON public.mitre_techniques TO authenticated;
GRANT TRIGGER ON public.mitre_techniques TO service_role;
GRANT TRIGGER ON public.pack_deploy_job_items TO anon;
GRANT TRIGGER ON public.pack_deploy_job_items TO authenticated;
GRANT TRIGGER ON public.pack_deploy_job_items TO service_role;
GRANT TRIGGER ON public.pack_deploy_jobs TO anon;
GRANT TRIGGER ON public.pack_deploy_jobs TO authenticated;
GRANT TRIGGER ON public.pack_deploy_jobs TO service_role;
GRANT TRIGGER ON public.pack_detections TO anon;
GRANT TRIGGER ON public.pack_detections TO authenticated;
GRANT TRIGGER ON public.pack_detections TO service_role;
GRANT TRIGGER ON public.pack_versions TO anon;
GRANT TRIGGER ON public.pack_versions TO authenticated;
GRANT TRIGGER ON public.pack_versions TO service_role;
GRANT TRIGGER ON public.profiles TO anon;
GRANT TRIGGER ON public.profiles TO authenticated;
GRANT TRIGGER ON public.profiles TO service_role;
GRANT TRIGGER ON public.promotion_requests TO anon;
GRANT TRIGGER ON public.promotion_requests TO authenticated;
GRANT TRIGGER ON public.promotion_requests TO service_role;
GRANT TRIGGER ON public.rate_limits TO anon;
GRANT TRIGGER ON public.rate_limits TO authenticated;
GRANT TRIGGER ON public.rate_limits TO service_role;
GRANT TRIGGER ON public.resumable_imports TO anon;
GRANT TRIGGER ON public.resumable_imports TO authenticated;
GRANT TRIGGER ON public.resumable_imports TO service_role;
GRANT TRIGGER ON public.scoring_profiles TO anon;
GRANT TRIGGER ON public.scoring_profiles TO authenticated;
GRANT TRIGGER ON public.scoring_profiles TO service_role;
GRANT TRIGGER ON public.threat_intel_feed_entries TO anon;
GRANT TRIGGER ON public.threat_intel_feed_entries TO authenticated;
GRANT TRIGGER ON public.threat_intel_feed_entries TO service_role;
GRANT TRIGGER ON public.threat_intel_feeds TO anon;
GRANT TRIGGER ON public.threat_intel_feeds TO authenticated;
GRANT TRIGGER ON public.threat_intel_feeds TO service_role;
GRANT TRIGGER ON public.threat_intel_report_detections TO anon;
GRANT TRIGGER ON public.threat_intel_report_detections TO authenticated;
GRANT TRIGGER ON public.threat_intel_report_detections TO service_role;
GRANT TRIGGER ON public.threat_intel_reports TO anon;
GRANT TRIGGER ON public.threat_intel_reports TO authenticated;
GRANT TRIGGER ON public.threat_intel_reports TO service_role;
GRANT TRIGGER ON public.threat_research_events TO anon;
GRANT TRIGGER ON public.threat_research_events TO authenticated;
GRANT TRIGGER ON public.threat_research_events TO service_role;
GRANT TRIGGER ON public.threat_research_jobs TO anon;
GRANT TRIGGER ON public.threat_research_jobs TO authenticated;
GRANT TRIGGER ON public.threat_research_jobs TO service_role;
GRANT TRIGGER ON public.threat_research_sessions TO anon;
GRANT TRIGGER ON public.threat_research_sessions TO authenticated;
GRANT TRIGGER ON public.threat_research_sessions TO service_role;
GRANT TRIGGER ON public.user_dashboards TO anon;
GRANT TRIGGER ON public.user_dashboards TO authenticated;
GRANT TRIGGER ON public.user_dashboards TO service_role;
GRANT TRIGGER ON public.user_invitations TO anon;
GRANT TRIGGER ON public.user_invitations TO authenticated;
GRANT TRIGGER ON public.user_invitations TO service_role;
GRANT TRIGGER ON public.user_notifications TO anon;
GRANT TRIGGER ON public.user_notifications TO authenticated;
GRANT TRIGGER ON public.user_notifications TO service_role;
GRANT TRIGGER ON public.v_group_recency TO anon;
GRANT TRIGGER ON public.v_group_recency TO authenticated;
GRANT TRIGGER ON public.v_group_recency TO service_role;
GRANT TRIGGER ON public.v_mitigation_impact TO anon;
GRANT TRIGGER ON public.v_mitigation_impact TO authenticated;
GRANT TRIGGER ON public.v_mitigation_impact TO service_role;
GRANT TRIGGER ON public.v_mitre_analytics TO anon;
GRANT TRIGGER ON public.v_mitre_analytics TO authenticated;
GRANT TRIGGER ON public.v_mitre_analytics TO service_role;
GRANT TRIGGER ON public.v_mitre_analytics_with_strategy TO anon;
GRANT TRIGGER ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT TRIGGER ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT TRIGGER ON public.v_mitre_data_components TO anon;
GRANT TRIGGER ON public.v_mitre_data_components TO authenticated;
GRANT TRIGGER ON public.v_mitre_data_components TO service_role;
GRANT TRIGGER ON public.v_mitre_detection_strategies TO anon;
GRANT TRIGGER ON public.v_mitre_detection_strategies TO authenticated;
GRANT TRIGGER ON public.v_mitre_detection_strategies TO service_role;
GRANT TRIGGER ON public.v_mitre_groups_with_stats TO anon;
GRANT TRIGGER ON public.v_mitre_groups_with_stats TO authenticated;
GRANT TRIGGER ON public.v_mitre_groups_with_stats TO service_role;
GRANT TRIGGER ON public.v_mitre_groups_with_targeting TO anon;
GRANT TRIGGER ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT TRIGGER ON public.v_mitre_groups_with_targeting TO service_role;
GRANT TRIGGER ON public.v_mitre_mitigations TO anon;
GRANT TRIGGER ON public.v_mitre_mitigations TO authenticated;
GRANT TRIGGER ON public.v_mitre_mitigations TO service_role;
GRANT TRIGGER ON public.v_mitre_software_with_stats TO anon;
GRANT TRIGGER ON public.v_mitre_software_with_stats TO authenticated;
GRANT TRIGGER ON public.v_mitre_software_with_stats TO service_role;
GRANT TRIGGER ON public.v_mitre_techniques_full TO anon;
GRANT TRIGGER ON public.v_mitre_techniques_full TO authenticated;
GRANT TRIGGER ON public.v_mitre_techniques_full TO service_role;
GRANT TRIGGER ON public.v_pack_deployment_status TO anon;
GRANT TRIGGER ON public.v_pack_deployment_status TO authenticated;
GRANT TRIGGER ON public.v_pack_deployment_status TO service_role;
GRANT TRIGGER ON public.v_pack_totals TO anon;
GRANT TRIGGER ON public.v_pack_totals TO authenticated;
GRANT TRIGGER ON public.v_pack_totals TO service_role;
GRANT TRIGGER ON public.v_strategy_impact TO anon;
GRANT TRIGGER ON public.v_strategy_impact TO authenticated;
GRANT TRIGGER ON public.v_strategy_impact TO service_role;
GRANT TRIGGER ON public.v_technique_importance TO anon;
GRANT TRIGGER ON public.v_technique_importance TO authenticated;
GRANT TRIGGER ON public.v_technique_importance TO service_role;
GRANT TRIGGER ON public.v_technique_stats TO anon;
GRANT TRIGGER ON public.v_technique_stats TO authenticated;
GRANT TRIGGER ON public.v_technique_stats TO service_role;
GRANT TRIGGER ON public.v_threat_actor_weights TO anon;
GRANT TRIGGER ON public.v_threat_actor_weights TO authenticated;
GRANT TRIGGER ON public.v_threat_actor_weights TO service_role;
GRANT TRUNCATE ON public.access_requests TO anon;
GRANT TRUNCATE ON public.access_requests TO authenticated;
GRANT TRUNCATE ON public.access_requests TO service_role;
GRANT TRUNCATE ON public.activity_log TO anon;
GRANT TRUNCATE ON public.activity_log TO authenticated;
GRANT TRUNCATE ON public.activity_log TO service_role;
GRANT TRUNCATE ON public.ai_budget_overrides TO anon;
GRANT TRUNCATE ON public.ai_budget_overrides TO authenticated;
GRANT TRUNCATE ON public.ai_budget_overrides TO service_role;
GRANT TRUNCATE ON public.ai_budgets TO anon;
GRANT TRUNCATE ON public.ai_budgets TO authenticated;
GRANT TRUNCATE ON public.ai_budgets TO service_role;
GRANT TRUNCATE ON public.ai_usage_daily TO anon;
GRANT TRUNCATE ON public.ai_usage_daily TO authenticated;
GRANT TRUNCATE ON public.ai_usage_daily TO service_role;
GRANT TRUNCATE ON public.ai_usage_events TO anon;
GRANT TRUNCATE ON public.ai_usage_events TO authenticated;
GRANT TRUNCATE ON public.ai_usage_events TO service_role;
GRANT TRUNCATE ON public.analysis_reports TO anon;
GRANT TRUNCATE ON public.analysis_reports TO authenticated;
GRANT TRUNCATE ON public.analysis_reports TO service_role;
GRANT TRUNCATE ON public.audit_events TO anon;
GRANT TRUNCATE ON public.audit_events TO authenticated;
GRANT TRUNCATE ON public.audit_events TO service_role;
GRANT TRUNCATE ON public.auto_digest_campaign_articles TO anon;
GRANT TRUNCATE ON public.auto_digest_campaign_articles TO authenticated;
GRANT TRUNCATE ON public.auto_digest_campaign_articles TO service_role;
GRANT TRUNCATE ON public.auto_digest_campaigns TO anon;
GRANT TRUNCATE ON public.auto_digest_campaigns TO authenticated;
GRANT TRUNCATE ON public.auto_digest_campaigns TO service_role;
GRANT TRUNCATE ON public.auto_digest_jobs TO anon;
GRANT TRUNCATE ON public.auto_digest_jobs TO authenticated;
GRANT TRUNCATE ON public.auto_digest_jobs TO service_role;
GRANT TRUNCATE ON public.auto_digest_run_events TO anon;
GRANT TRUNCATE ON public.auto_digest_run_events TO authenticated;
GRANT TRUNCATE ON public.auto_digest_run_events TO service_role;
GRANT TRUNCATE ON public.auto_digest_settings TO anon;
GRANT TRUNCATE ON public.auto_digest_settings TO authenticated;
GRANT TRUNCATE ON public.auto_digest_settings TO service_role;
GRANT TRUNCATE ON public.batch_embedding_jobs TO anon;
GRANT TRUNCATE ON public.batch_embedding_jobs TO authenticated;
GRANT TRUNCATE ON public.batch_embedding_jobs TO service_role;
GRANT TRUNCATE ON public.bulk_import_jobs TO anon;
GRANT TRUNCATE ON public.bulk_import_jobs TO authenticated;
GRANT TRUNCATE ON public.bulk_import_jobs TO service_role;
GRANT TRUNCATE ON public.curated_feed_sources TO anon;
GRANT TRUNCATE ON public.curated_feed_sources TO authenticated;
GRANT TRUNCATE ON public.curated_feed_sources TO service_role;
GRANT TRUNCATE ON public.defender_xdr_columns TO anon;
GRANT TRUNCATE ON public.defender_xdr_columns TO authenticated;
GRANT TRUNCATE ON public.defender_xdr_columns TO service_role;
GRANT TRUNCATE ON public.defender_xdr_tables TO anon;
GRANT TRUNCATE ON public.defender_xdr_tables TO authenticated;
GRANT TRUNCATE ON public.defender_xdr_tables TO service_role;
GRANT TRUNCATE ON public.deployment_history TO anon;
GRANT TRUNCATE ON public.deployment_history TO authenticated;
GRANT TRUNCATE ON public.deployment_history TO service_role;
GRANT TRUNCATE ON public.detection_assignments TO anon;
GRANT TRUNCATE ON public.detection_assignments TO authenticated;
GRANT TRUNCATE ON public.detection_assignments TO service_role;
GRANT TRUNCATE ON public.detection_comments TO anon;
GRANT TRUNCATE ON public.detection_comments TO authenticated;
GRANT TRUNCATE ON public.detection_comments TO service_role;
GRANT TRUNCATE ON public.detection_decisions TO anon;
GRANT TRUNCATE ON public.detection_decisions TO authenticated;
GRANT TRUNCATE ON public.detection_decisions TO service_role;
GRANT TRUNCATE ON public.detection_drift TO anon;
GRANT TRUNCATE ON public.detection_drift TO authenticated;
GRANT TRUNCATE ON public.detection_drift TO service_role;
GRANT TRUNCATE ON public.detection_embeddings TO service_role;
GRANT TRUNCATE ON public.detection_finetune_runs TO anon;
GRANT TRUNCATE ON public.detection_finetune_runs TO authenticated;
GRANT TRUNCATE ON public.detection_finetune_runs TO service_role;
GRANT TRUNCATE ON public.detection_packs TO anon;
GRANT TRUNCATE ON public.detection_packs TO authenticated;
GRANT TRUNCATE ON public.detection_packs TO service_role;
GRANT TRUNCATE ON public.detection_patterns TO anon;
GRANT TRUNCATE ON public.detection_patterns TO authenticated;
GRANT TRUNCATE ON public.detection_patterns TO service_role;
GRANT TRUNCATE ON public.detection_preflight_runs TO anon;
GRANT TRUNCATE ON public.detection_preflight_runs TO authenticated;
GRANT TRUNCATE ON public.detection_preflight_runs TO service_role;
GRANT TRUNCATE ON public.detection_reviews TO anon;
GRANT TRUNCATE ON public.detection_reviews TO authenticated;
GRANT TRUNCATE ON public.detection_reviews TO service_role;
GRANT TRUNCATE ON public.detections TO anon;
GRANT TRUNCATE ON public.detections TO authenticated;
GRANT TRUNCATE ON public.detections TO service_role;
GRANT TRUNCATE ON public.enrichment_audit TO anon;
GRANT TRUNCATE ON public.enrichment_audit TO authenticated;
GRANT TRUNCATE ON public.enrichment_audit TO service_role;
GRANT TRUNCATE ON public.environment_profiles TO anon;
GRANT TRUNCATE ON public.environment_profiles TO authenticated;
GRANT TRUNCATE ON public.environment_profiles TO service_role;
GRANT TRUNCATE ON public.integration_credentials TO anon;
GRANT TRUNCATE ON public.integration_credentials TO authenticated;
GRANT TRUNCATE ON public.integration_credentials TO service_role;
GRANT TRUNCATE ON public.integrations TO anon;
GRANT TRUNCATE ON public.integrations TO authenticated;
GRANT TRUNCATE ON public.integrations TO service_role;
GRANT TRUNCATE ON public.mitre_campaign_techniques TO anon;
GRANT TRUNCATE ON public.mitre_campaign_techniques TO authenticated;
GRANT TRUNCATE ON public.mitre_campaign_techniques TO service_role;
GRANT TRUNCATE ON public.mitre_campaigns TO anon;
GRANT TRUNCATE ON public.mitre_campaigns TO authenticated;
GRANT TRUNCATE ON public.mitre_campaigns TO service_role;
GRANT TRUNCATE ON public.mitre_embeddings TO service_role;
GRANT TRUNCATE ON public.mitre_group_campaigns TO anon;
GRANT TRUNCATE ON public.mitre_group_campaigns TO authenticated;
GRANT TRUNCATE ON public.mitre_group_campaigns TO service_role;
GRANT TRUNCATE ON public.mitre_group_software TO anon;
GRANT TRUNCATE ON public.mitre_group_software TO authenticated;
GRANT TRUNCATE ON public.mitre_group_software TO service_role;
GRANT TRUNCATE ON public.mitre_group_techniques TO anon;
GRANT TRUNCATE ON public.mitre_group_techniques TO authenticated;
GRANT TRUNCATE ON public.mitre_group_techniques TO service_role;
GRANT TRUNCATE ON public.mitre_groups TO anon;
GRANT TRUNCATE ON public.mitre_groups TO authenticated;
GRANT TRUNCATE ON public.mitre_groups TO service_role;
GRANT TRUNCATE ON public.mitre_metadata TO anon;
GRANT TRUNCATE ON public.mitre_metadata TO authenticated;
GRANT TRUNCATE ON public.mitre_metadata TO service_role;
GRANT TRUNCATE ON public.mitre_mitigations TO anon;
GRANT TRUNCATE ON public.mitre_mitigations TO authenticated;
GRANT TRUNCATE ON public.mitre_mitigations TO service_role;
GRANT TRUNCATE ON public.mitre_objects TO anon;
GRANT TRUNCATE ON public.mitre_objects TO authenticated;
GRANT TRUNCATE ON public.mitre_objects TO service_role;
GRANT TRUNCATE ON public.mitre_relationships TO anon;
GRANT TRUNCATE ON public.mitre_relationships TO authenticated;
GRANT TRUNCATE ON public.mitre_relationships TO service_role;
GRANT TRUNCATE ON public.mitre_scoring_snapshot TO anon;
GRANT TRUNCATE ON public.mitre_scoring_snapshot TO authenticated;
GRANT TRUNCATE ON public.mitre_scoring_snapshot TO service_role;
GRANT TRUNCATE ON public.mitre_software TO anon;
GRANT TRUNCATE ON public.mitre_software TO authenticated;
GRANT TRUNCATE ON public.mitre_software TO service_role;
GRANT TRUNCATE ON public.mitre_software_techniques TO anon;
GRANT TRUNCATE ON public.mitre_software_techniques TO authenticated;
GRANT TRUNCATE ON public.mitre_software_techniques TO service_role;
GRANT TRUNCATE ON public.mitre_tactic_weights TO anon;
GRANT TRUNCATE ON public.mitre_tactic_weights TO authenticated;
GRANT TRUNCATE ON public.mitre_tactic_weights TO service_role;
GRANT TRUNCATE ON public.mitre_technique_data_sources TO anon;
GRANT TRUNCATE ON public.mitre_technique_data_sources TO authenticated;
GRANT TRUNCATE ON public.mitre_technique_data_sources TO service_role;
GRANT TRUNCATE ON public.mitre_technique_groups TO anon;
GRANT TRUNCATE ON public.mitre_technique_groups TO authenticated;
GRANT TRUNCATE ON public.mitre_technique_groups TO service_role;
GRANT TRUNCATE ON public.mitre_technique_platforms TO anon;
GRANT TRUNCATE ON public.mitre_technique_platforms TO authenticated;
GRANT TRUNCATE ON public.mitre_technique_platforms TO service_role;
GRANT TRUNCATE ON public.mitre_technique_tactics TO anon;
GRANT TRUNCATE ON public.mitre_technique_tactics TO authenticated;
GRANT TRUNCATE ON public.mitre_technique_tactics TO service_role;
GRANT TRUNCATE ON public.mitre_techniques TO anon;
GRANT TRUNCATE ON public.mitre_techniques TO authenticated;
GRANT TRUNCATE ON public.mitre_techniques TO service_role;
GRANT TRUNCATE ON public.pack_deploy_job_items TO anon;
GRANT TRUNCATE ON public.pack_deploy_job_items TO authenticated;
GRANT TRUNCATE ON public.pack_deploy_job_items TO service_role;
GRANT TRUNCATE ON public.pack_deploy_jobs TO anon;
GRANT TRUNCATE ON public.pack_deploy_jobs TO authenticated;
GRANT TRUNCATE ON public.pack_deploy_jobs TO service_role;
GRANT TRUNCATE ON public.pack_detections TO anon;
GRANT TRUNCATE ON public.pack_detections TO authenticated;
GRANT TRUNCATE ON public.pack_detections TO service_role;
GRANT TRUNCATE ON public.pack_versions TO anon;
GRANT TRUNCATE ON public.pack_versions TO authenticated;
GRANT TRUNCATE ON public.pack_versions TO service_role;
GRANT TRUNCATE ON public.profiles TO anon;
GRANT TRUNCATE ON public.profiles TO authenticated;
GRANT TRUNCATE ON public.profiles TO service_role;
GRANT TRUNCATE ON public.promotion_requests TO anon;
GRANT TRUNCATE ON public.promotion_requests TO authenticated;
GRANT TRUNCATE ON public.promotion_requests TO service_role;
GRANT TRUNCATE ON public.rate_limits TO anon;
GRANT TRUNCATE ON public.rate_limits TO authenticated;
GRANT TRUNCATE ON public.rate_limits TO service_role;
GRANT TRUNCATE ON public.resumable_imports TO anon;
GRANT TRUNCATE ON public.resumable_imports TO authenticated;
GRANT TRUNCATE ON public.resumable_imports TO service_role;
GRANT TRUNCATE ON public.scoring_profiles TO anon;
GRANT TRUNCATE ON public.scoring_profiles TO authenticated;
GRANT TRUNCATE ON public.scoring_profiles TO service_role;
GRANT TRUNCATE ON public.threat_intel_feed_entries TO anon;
GRANT TRUNCATE ON public.threat_intel_feed_entries TO authenticated;
GRANT TRUNCATE ON public.threat_intel_feed_entries TO service_role;
GRANT TRUNCATE ON public.threat_intel_feeds TO anon;
GRANT TRUNCATE ON public.threat_intel_feeds TO authenticated;
GRANT TRUNCATE ON public.threat_intel_feeds TO service_role;
GRANT TRUNCATE ON public.threat_intel_report_detections TO anon;
GRANT TRUNCATE ON public.threat_intel_report_detections TO authenticated;
GRANT TRUNCATE ON public.threat_intel_report_detections TO service_role;
GRANT TRUNCATE ON public.threat_intel_reports TO anon;
GRANT TRUNCATE ON public.threat_intel_reports TO authenticated;
GRANT TRUNCATE ON public.threat_intel_reports TO service_role;
GRANT TRUNCATE ON public.threat_research_events TO anon;
GRANT TRUNCATE ON public.threat_research_events TO authenticated;
GRANT TRUNCATE ON public.threat_research_events TO service_role;
GRANT TRUNCATE ON public.threat_research_jobs TO anon;
GRANT TRUNCATE ON public.threat_research_jobs TO authenticated;
GRANT TRUNCATE ON public.threat_research_jobs TO service_role;
GRANT TRUNCATE ON public.threat_research_sessions TO anon;
GRANT TRUNCATE ON public.threat_research_sessions TO authenticated;
GRANT TRUNCATE ON public.threat_research_sessions TO service_role;
GRANT TRUNCATE ON public.user_dashboards TO anon;
GRANT TRUNCATE ON public.user_dashboards TO authenticated;
GRANT TRUNCATE ON public.user_dashboards TO service_role;
GRANT TRUNCATE ON public.user_invitations TO anon;
GRANT TRUNCATE ON public.user_invitations TO authenticated;
GRANT TRUNCATE ON public.user_invitations TO service_role;
GRANT TRUNCATE ON public.user_notifications TO anon;
GRANT TRUNCATE ON public.user_notifications TO authenticated;
GRANT TRUNCATE ON public.user_notifications TO service_role;
GRANT TRUNCATE ON public.v_group_recency TO anon;
GRANT TRUNCATE ON public.v_group_recency TO authenticated;
GRANT TRUNCATE ON public.v_group_recency TO service_role;
GRANT TRUNCATE ON public.v_mitigation_impact TO anon;
GRANT TRUNCATE ON public.v_mitigation_impact TO authenticated;
GRANT TRUNCATE ON public.v_mitigation_impact TO service_role;
GRANT TRUNCATE ON public.v_mitre_analytics TO anon;
GRANT TRUNCATE ON public.v_mitre_analytics TO authenticated;
GRANT TRUNCATE ON public.v_mitre_analytics TO service_role;
GRANT TRUNCATE ON public.v_mitre_analytics_with_strategy TO anon;
GRANT TRUNCATE ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT TRUNCATE ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT TRUNCATE ON public.v_mitre_data_components TO anon;
GRANT TRUNCATE ON public.v_mitre_data_components TO authenticated;
GRANT TRUNCATE ON public.v_mitre_data_components TO service_role;
GRANT TRUNCATE ON public.v_mitre_detection_strategies TO anon;
GRANT TRUNCATE ON public.v_mitre_detection_strategies TO authenticated;
GRANT TRUNCATE ON public.v_mitre_detection_strategies TO service_role;
GRANT TRUNCATE ON public.v_mitre_groups_with_stats TO anon;
GRANT TRUNCATE ON public.v_mitre_groups_with_stats TO authenticated;
GRANT TRUNCATE ON public.v_mitre_groups_with_stats TO service_role;
GRANT TRUNCATE ON public.v_mitre_groups_with_targeting TO anon;
GRANT TRUNCATE ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT TRUNCATE ON public.v_mitre_groups_with_targeting TO service_role;
GRANT TRUNCATE ON public.v_mitre_mitigations TO anon;
GRANT TRUNCATE ON public.v_mitre_mitigations TO authenticated;
GRANT TRUNCATE ON public.v_mitre_mitigations TO service_role;
GRANT TRUNCATE ON public.v_mitre_software_with_stats TO anon;
GRANT TRUNCATE ON public.v_mitre_software_with_stats TO authenticated;
GRANT TRUNCATE ON public.v_mitre_software_with_stats TO service_role;
GRANT TRUNCATE ON public.v_mitre_techniques_full TO anon;
GRANT TRUNCATE ON public.v_mitre_techniques_full TO authenticated;
GRANT TRUNCATE ON public.v_mitre_techniques_full TO service_role;
GRANT TRUNCATE ON public.v_pack_deployment_status TO anon;
GRANT TRUNCATE ON public.v_pack_deployment_status TO authenticated;
GRANT TRUNCATE ON public.v_pack_deployment_status TO service_role;
GRANT TRUNCATE ON public.v_pack_totals TO anon;
GRANT TRUNCATE ON public.v_pack_totals TO authenticated;
GRANT TRUNCATE ON public.v_pack_totals TO service_role;
GRANT TRUNCATE ON public.v_strategy_impact TO anon;
GRANT TRUNCATE ON public.v_strategy_impact TO authenticated;
GRANT TRUNCATE ON public.v_strategy_impact TO service_role;
GRANT TRUNCATE ON public.v_technique_importance TO anon;
GRANT TRUNCATE ON public.v_technique_importance TO authenticated;
GRANT TRUNCATE ON public.v_technique_importance TO service_role;
GRANT TRUNCATE ON public.v_technique_stats TO anon;
GRANT TRUNCATE ON public.v_technique_stats TO authenticated;
GRANT TRUNCATE ON public.v_technique_stats TO service_role;
GRANT TRUNCATE ON public.v_threat_actor_weights TO anon;
GRANT TRUNCATE ON public.v_threat_actor_weights TO authenticated;
GRANT TRUNCATE ON public.v_threat_actor_weights TO service_role;
GRANT UPDATE ON public.access_requests TO anon;
GRANT UPDATE ON public.access_requests TO authenticated;
GRANT UPDATE ON public.access_requests TO service_role;
GRANT UPDATE ON public.activity_log TO anon;
GRANT UPDATE ON public.activity_log TO authenticated;
GRANT UPDATE ON public.activity_log TO service_role;
GRANT UPDATE ON public.ai_budget_overrides TO anon;
GRANT UPDATE ON public.ai_budget_overrides TO authenticated;
GRANT UPDATE ON public.ai_budget_overrides TO service_role;
GRANT UPDATE ON public.ai_budgets TO anon;
GRANT UPDATE ON public.ai_budgets TO authenticated;
GRANT UPDATE ON public.ai_budgets TO service_role;
GRANT UPDATE ON public.ai_usage_daily TO anon;
GRANT UPDATE ON public.ai_usage_daily TO authenticated;
GRANT UPDATE ON public.ai_usage_daily TO service_role;
GRANT UPDATE ON public.ai_usage_events TO anon;
GRANT UPDATE ON public.ai_usage_events TO authenticated;
GRANT UPDATE ON public.ai_usage_events TO service_role;
GRANT UPDATE ON public.analysis_reports TO anon;
GRANT UPDATE ON public.analysis_reports TO authenticated;
GRANT UPDATE ON public.analysis_reports TO service_role;
GRANT UPDATE ON public.audit_events TO anon;
GRANT UPDATE ON public.audit_events TO authenticated;
GRANT UPDATE ON public.audit_events TO service_role;
GRANT UPDATE ON public.auto_digest_campaign_articles TO anon;
GRANT UPDATE ON public.auto_digest_campaign_articles TO authenticated;
GRANT UPDATE ON public.auto_digest_campaign_articles TO service_role;
GRANT UPDATE ON public.auto_digest_campaigns TO anon;
GRANT UPDATE ON public.auto_digest_campaigns TO authenticated;
GRANT UPDATE ON public.auto_digest_campaigns TO service_role;
GRANT UPDATE ON public.auto_digest_jobs TO anon;
GRANT UPDATE ON public.auto_digest_jobs TO authenticated;
GRANT UPDATE ON public.auto_digest_jobs TO service_role;
GRANT UPDATE ON public.auto_digest_run_events TO anon;
GRANT UPDATE ON public.auto_digest_run_events TO authenticated;
GRANT UPDATE ON public.auto_digest_run_events TO service_role;
GRANT UPDATE ON public.auto_digest_settings TO anon;
GRANT UPDATE ON public.auto_digest_settings TO authenticated;
GRANT UPDATE ON public.auto_digest_settings TO service_role;
GRANT UPDATE ON public.batch_embedding_jobs TO anon;
GRANT UPDATE ON public.batch_embedding_jobs TO authenticated;
GRANT UPDATE ON public.batch_embedding_jobs TO service_role;
GRANT UPDATE ON public.bulk_import_jobs TO anon;
GRANT UPDATE ON public.bulk_import_jobs TO authenticated;
GRANT UPDATE ON public.bulk_import_jobs TO service_role;
GRANT UPDATE ON public.curated_feed_sources TO anon;
GRANT UPDATE ON public.crowdstrike_finetune_runs TO service_role;
GRANT UPDATE ON public.crowdstrike_finetune_query_jobs TO service_role;
GRANT UPDATE ON public.curated_feed_sources TO authenticated;
GRANT UPDATE ON public.curated_feed_sources TO service_role;
GRANT UPDATE ON public.defender_xdr_columns TO anon;
GRANT UPDATE ON public.defender_xdr_columns TO authenticated;
GRANT UPDATE ON public.defender_xdr_columns TO service_role;
GRANT UPDATE ON public.defender_xdr_tables TO anon;
GRANT UPDATE ON public.defender_xdr_tables TO authenticated;
GRANT UPDATE ON public.defender_xdr_tables TO service_role;
GRANT UPDATE ON public.deployment_history TO anon;
GRANT UPDATE ON public.deployment_history TO authenticated;
GRANT UPDATE ON public.deployment_history TO service_role;
GRANT UPDATE ON public.detection_assignments TO anon;
GRANT UPDATE ON public.detection_assignments TO authenticated;
GRANT UPDATE ON public.detection_assignments TO service_role;
GRANT UPDATE ON public.detection_comments TO anon;
GRANT UPDATE ON public.detection_comments TO authenticated;
GRANT UPDATE ON public.detection_comments TO service_role;
GRANT UPDATE ON public.detection_decisions TO anon;
GRANT UPDATE ON public.detection_decisions TO authenticated;
GRANT UPDATE ON public.detection_decisions TO service_role;
GRANT UPDATE ON public.detection_drift TO anon;
GRANT UPDATE ON public.detection_drift TO authenticated;
GRANT UPDATE ON public.detection_drift TO service_role;
GRANT UPDATE ON public.detection_embeddings TO service_role;
GRANT UPDATE ON public.detection_finetune_runs TO anon;
GRANT UPDATE ON public.detection_finetune_runs TO authenticated;
GRANT UPDATE ON public.detection_finetune_runs TO service_role;
GRANT UPDATE ON public.detection_packs TO anon;
GRANT UPDATE ON public.detection_packs TO authenticated;
GRANT UPDATE ON public.detection_packs TO service_role;
GRANT UPDATE ON public.detection_patterns TO anon;
GRANT UPDATE ON public.detection_patterns TO authenticated;
GRANT UPDATE ON public.detection_patterns TO service_role;
GRANT UPDATE ON public.detection_preflight_runs TO anon;
GRANT UPDATE ON public.detection_preflight_runs TO authenticated;
GRANT UPDATE ON public.detection_preflight_runs TO service_role;
GRANT UPDATE ON public.detection_reviews TO anon;
GRANT UPDATE ON public.detection_reviews TO authenticated;
GRANT UPDATE ON public.detection_reviews TO service_role;
GRANT UPDATE ON public.detections TO anon;
GRANT UPDATE ON public.detections TO authenticated;
GRANT UPDATE ON public.detections TO service_role;
GRANT UPDATE ON public.enrichment_audit TO anon;
GRANT UPDATE ON public.enrichment_audit TO authenticated;
GRANT UPDATE ON public.enrichment_audit TO service_role;
GRANT UPDATE ON public.environment_profiles TO anon;
GRANT UPDATE ON public.environment_profiles TO authenticated;
GRANT UPDATE ON public.environment_profiles TO service_role;
GRANT UPDATE ON public.integration_credentials TO anon;
GRANT UPDATE ON public.integration_credentials TO authenticated;
GRANT UPDATE ON public.integration_credentials TO service_role;
GRANT UPDATE ON public.integrations TO anon;
GRANT UPDATE ON public.integrations TO authenticated;
GRANT UPDATE ON public.integrations TO service_role;
GRANT UPDATE ON public.mitre_campaign_techniques TO anon;
GRANT UPDATE ON public.mitre_campaign_techniques TO authenticated;
GRANT UPDATE ON public.mitre_campaign_techniques TO service_role;
GRANT UPDATE ON public.mitre_campaigns TO anon;
GRANT UPDATE ON public.mitre_campaigns TO authenticated;
GRANT UPDATE ON public.mitre_campaigns TO service_role;
GRANT UPDATE ON public.mitre_embeddings TO service_role;
GRANT UPDATE ON public.mitre_group_campaigns TO anon;
GRANT UPDATE ON public.mitre_group_campaigns TO authenticated;
GRANT UPDATE ON public.mitre_group_campaigns TO service_role;
GRANT UPDATE ON public.mitre_group_software TO anon;
GRANT UPDATE ON public.mitre_group_software TO authenticated;
GRANT UPDATE ON public.mitre_group_software TO service_role;
GRANT UPDATE ON public.mitre_group_techniques TO anon;
GRANT UPDATE ON public.mitre_group_techniques TO authenticated;
GRANT UPDATE ON public.mitre_group_techniques TO service_role;
GRANT UPDATE ON public.mitre_groups TO anon;
GRANT UPDATE ON public.mitre_groups TO authenticated;
GRANT UPDATE ON public.mitre_groups TO service_role;
GRANT UPDATE ON public.mitre_metadata TO anon;
GRANT UPDATE ON public.mitre_metadata TO authenticated;
GRANT UPDATE ON public.mitre_metadata TO service_role;
GRANT UPDATE ON public.mitre_mitigations TO anon;
GRANT UPDATE ON public.mitre_mitigations TO authenticated;
GRANT UPDATE ON public.mitre_mitigations TO service_role;
GRANT UPDATE ON public.mitre_objects TO anon;
GRANT UPDATE ON public.mitre_objects TO authenticated;
GRANT UPDATE ON public.mitre_objects TO service_role;
GRANT UPDATE ON public.mitre_relationships TO anon;
GRANT UPDATE ON public.mitre_relationships TO authenticated;
GRANT UPDATE ON public.mitre_relationships TO service_role;
GRANT UPDATE ON public.mitre_scoring_snapshot TO anon;
GRANT UPDATE ON public.mitre_scoring_snapshot TO authenticated;
GRANT UPDATE ON public.mitre_scoring_snapshot TO service_role;
GRANT UPDATE ON public.mitre_software TO anon;
GRANT UPDATE ON public.mitre_software TO authenticated;
GRANT UPDATE ON public.mitre_software TO service_role;
GRANT UPDATE ON public.mitre_software_techniques TO anon;
GRANT UPDATE ON public.mitre_software_techniques TO authenticated;
GRANT UPDATE ON public.mitre_software_techniques TO service_role;
GRANT UPDATE ON public.mitre_tactic_weights TO anon;
GRANT UPDATE ON public.mitre_tactic_weights TO authenticated;
GRANT UPDATE ON public.mitre_tactic_weights TO service_role;
GRANT UPDATE ON public.mitre_technique_data_sources TO anon;
GRANT UPDATE ON public.mitre_technique_data_sources TO authenticated;
GRANT UPDATE ON public.mitre_technique_data_sources TO service_role;
GRANT UPDATE ON public.mitre_technique_groups TO anon;
GRANT UPDATE ON public.mitre_technique_groups TO authenticated;
GRANT UPDATE ON public.mitre_technique_groups TO service_role;
GRANT UPDATE ON public.mitre_technique_platforms TO anon;
GRANT UPDATE ON public.mitre_technique_platforms TO authenticated;
GRANT UPDATE ON public.mitre_technique_platforms TO service_role;
GRANT UPDATE ON public.mitre_technique_tactics TO anon;
GRANT UPDATE ON public.mitre_technique_tactics TO authenticated;
GRANT UPDATE ON public.mitre_technique_tactics TO service_role;
GRANT UPDATE ON public.mitre_techniques TO anon;
GRANT UPDATE ON public.mitre_techniques TO authenticated;
GRANT UPDATE ON public.mitre_techniques TO service_role;
GRANT UPDATE ON public.pack_deploy_job_items TO anon;
GRANT UPDATE ON public.pack_deploy_job_items TO authenticated;
GRANT UPDATE ON public.pack_deploy_job_items TO service_role;
GRANT UPDATE ON public.pack_deploy_jobs TO anon;
GRANT UPDATE ON public.pack_deploy_jobs TO authenticated;
GRANT UPDATE ON public.pack_deploy_jobs TO service_role;
GRANT UPDATE ON public.pack_detections TO anon;
GRANT UPDATE ON public.pack_detections TO authenticated;
GRANT UPDATE ON public.pack_detections TO service_role;
GRANT UPDATE ON public.pack_versions TO anon;
GRANT UPDATE ON public.pack_versions TO authenticated;
GRANT UPDATE ON public.pack_versions TO service_role;
GRANT UPDATE ON public.profiles TO anon;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO service_role;
GRANT UPDATE ON public.promotion_requests TO anon;
GRANT UPDATE ON public.promotion_requests TO authenticated;
GRANT UPDATE ON public.promotion_requests TO service_role;
GRANT UPDATE ON public.rate_limits TO anon;
GRANT UPDATE ON public.rate_limits TO authenticated;
GRANT UPDATE ON public.rate_limits TO service_role;
GRANT UPDATE ON public.resumable_imports TO anon;
GRANT UPDATE ON public.resumable_imports TO authenticated;
GRANT UPDATE ON public.resumable_imports TO service_role;
GRANT UPDATE ON public.scoring_profiles TO anon;
GRANT UPDATE ON public.scoring_profiles TO authenticated;
GRANT UPDATE ON public.scoring_profiles TO service_role;
GRANT UPDATE ON public.threat_intel_feed_entries TO anon;
GRANT UPDATE ON public.threat_intel_feed_entries TO authenticated;
GRANT UPDATE ON public.threat_intel_feed_entries TO service_role;
GRANT UPDATE ON public.threat_intel_feeds TO anon;
GRANT UPDATE ON public.threat_intel_feeds TO authenticated;
GRANT UPDATE ON public.threat_intel_feeds TO service_role;
GRANT UPDATE ON public.threat_intel_report_detections TO anon;
GRANT UPDATE ON public.threat_intel_report_detections TO authenticated;
GRANT UPDATE ON public.threat_intel_report_detections TO service_role;
GRANT UPDATE ON public.threat_intel_reports TO anon;
GRANT UPDATE ON public.threat_intel_reports TO authenticated;
GRANT UPDATE ON public.threat_intel_reports TO service_role;
GRANT UPDATE ON public.threat_research_events TO anon;
GRANT UPDATE ON public.threat_research_events TO authenticated;
GRANT UPDATE ON public.threat_research_events TO service_role;
GRANT UPDATE ON public.threat_research_jobs TO anon;
GRANT UPDATE ON public.threat_research_jobs TO authenticated;
GRANT UPDATE ON public.threat_research_jobs TO service_role;
GRANT UPDATE ON public.threat_research_sessions TO anon;
GRANT UPDATE ON public.threat_research_sessions TO authenticated;
GRANT UPDATE ON public.threat_research_sessions TO service_role;
GRANT UPDATE ON public.user_dashboards TO anon;
GRANT UPDATE ON public.user_dashboards TO authenticated;
GRANT UPDATE ON public.user_dashboards TO service_role;
GRANT UPDATE ON public.user_invitations TO anon;
GRANT UPDATE ON public.user_invitations TO authenticated;
GRANT UPDATE ON public.user_invitations TO service_role;
GRANT UPDATE ON public.user_notifications TO anon;
GRANT UPDATE ON public.user_notifications TO authenticated;
GRANT UPDATE ON public.user_notifications TO service_role;
GRANT UPDATE ON public.v_group_recency TO anon;
GRANT UPDATE ON public.v_group_recency TO authenticated;
GRANT UPDATE ON public.v_group_recency TO service_role;
GRANT UPDATE ON public.v_mitigation_impact TO anon;
GRANT UPDATE ON public.v_mitigation_impact TO authenticated;
GRANT UPDATE ON public.v_mitigation_impact TO service_role;
GRANT UPDATE ON public.v_mitre_analytics TO anon;
GRANT UPDATE ON public.v_mitre_analytics TO authenticated;
GRANT UPDATE ON public.v_mitre_analytics TO service_role;
GRANT UPDATE ON public.v_mitre_analytics_with_strategy TO anon;
GRANT UPDATE ON public.v_mitre_analytics_with_strategy TO authenticated;
GRANT UPDATE ON public.v_mitre_analytics_with_strategy TO service_role;
GRANT UPDATE ON public.v_mitre_data_components TO anon;
GRANT UPDATE ON public.v_mitre_data_components TO authenticated;
GRANT UPDATE ON public.v_mitre_data_components TO service_role;
GRANT UPDATE ON public.v_mitre_detection_strategies TO anon;
GRANT UPDATE ON public.v_mitre_detection_strategies TO authenticated;
GRANT UPDATE ON public.v_mitre_detection_strategies TO service_role;
GRANT UPDATE ON public.v_mitre_groups_with_stats TO anon;
GRANT UPDATE ON public.v_mitre_groups_with_stats TO authenticated;
GRANT UPDATE ON public.v_mitre_groups_with_stats TO service_role;
GRANT UPDATE ON public.v_mitre_groups_with_targeting TO anon;
GRANT UPDATE ON public.v_mitre_groups_with_targeting TO authenticated;
GRANT UPDATE ON public.v_mitre_groups_with_targeting TO service_role;
GRANT UPDATE ON public.v_mitre_mitigations TO anon;
GRANT UPDATE ON public.v_mitre_mitigations TO authenticated;
GRANT UPDATE ON public.v_mitre_mitigations TO service_role;
GRANT UPDATE ON public.v_mitre_software_with_stats TO anon;
GRANT UPDATE ON public.v_mitre_software_with_stats TO authenticated;
GRANT UPDATE ON public.v_mitre_software_with_stats TO service_role;
GRANT UPDATE ON public.v_mitre_techniques_full TO anon;
GRANT UPDATE ON public.v_mitre_techniques_full TO authenticated;
GRANT UPDATE ON public.v_mitre_techniques_full TO service_role;
GRANT UPDATE ON public.v_pack_deployment_status TO anon;
GRANT UPDATE ON public.v_pack_deployment_status TO authenticated;
GRANT UPDATE ON public.v_pack_deployment_status TO service_role;
GRANT UPDATE ON public.v_pack_totals TO anon;
GRANT UPDATE ON public.v_pack_totals TO authenticated;
GRANT UPDATE ON public.v_pack_totals TO service_role;
GRANT UPDATE ON public.v_strategy_impact TO anon;
GRANT UPDATE ON public.v_strategy_impact TO authenticated;
GRANT UPDATE ON public.v_strategy_impact TO service_role;
GRANT UPDATE ON public.v_technique_importance TO anon;
GRANT UPDATE ON public.v_technique_importance TO authenticated;
GRANT UPDATE ON public.v_technique_importance TO service_role;
GRANT UPDATE ON public.v_technique_stats TO anon;
GRANT UPDATE ON public.v_technique_stats TO authenticated;
GRANT UPDATE ON public.v_technique_stats TO service_role;
GRANT UPDATE ON public.v_threat_actor_weights TO anon;
GRANT UPDATE ON public.v_threat_actor_weights TO authenticated;
GRANT UPDATE ON public.v_threat_actor_weights TO service_role;

-- ============================================================
-- Seed data — scoring tactic weights
-- ============================================================
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('collection','balanced',0.75);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('command-and-control','balanced',0.70);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('credential-access','balanced',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('defense-evasion','balanced',0.95);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('discovery','balanced',0.70);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('execution','balanced',1.00);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('exfiltration','balanced',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('impact','balanced',0.85);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('initial-access','balanced',0.75);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('lateral-movement','balanced',0.85);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('persistence','balanced',0.95);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('privilege-escalation','balanced',0.90);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('reconnaissance','balanced',0.50);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('resource-development','balanced',0.50);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('collection','impact_prevention',0.90);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('command-and-control','impact_prevention',0.75);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('credential-access','impact_prevention',0.75);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('defense-evasion','impact_prevention',0.85);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('discovery','impact_prevention',0.50);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('execution','impact_prevention',1.00);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('exfiltration','impact_prevention',0.95);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('impact','impact_prevention',1.00);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('initial-access','impact_prevention',0.60);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('lateral-movement','impact_prevention',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('persistence','impact_prevention',0.85);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('privilege-escalation','impact_prevention',0.90);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('reconnaissance','impact_prevention',0.30);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('resource-development','impact_prevention',0.30);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('collection','left_of_boom',0.60);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('command-and-control','left_of_boom',0.70);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('credential-access','left_of_boom',0.85);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('defense-evasion','left_of_boom',0.70);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('discovery','left_of_boom',0.95);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('execution','left_of_boom',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('exfiltration','left_of_boom',0.50);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('impact','left_of_boom',0.40);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('initial-access','left_of_boom',1.00);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('lateral-movement','left_of_boom',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('persistence','left_of_boom',0.75);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('privilege-escalation','left_of_boom',0.80);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('reconnaissance','left_of_boom',0.90);
INSERT INTO public.mitre_tactic_weights (tactic,profile,weight) VALUES ('resource-development','left_of_boom',0.85);

-- ============================================================
-- Seed data — scoring profiles
-- ============================================================
INSERT INTO public.scoring_profiles (name,description,is_default,weights) VALUES ('System Default','Default quality scoring weights balancing query completeness, MITRE mapping, and peer review as top priorities.',true,'{"references": 5, "peer_review": 15, "data_sources": 10, "threat_intel": 5, "mitre_mapping": 15, "test_coverage": 5, "query_completeness": 20, "description_quality": 10, "investigation_steps": 5, "false_positive_guidance": 10}'::jsonb);

-- ============================================================
-- Seed data — curated feed sources
-- ============================================================
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('The DFIR Report','The DFIR Report','https://thedfirreport.com/feed/','rss','threat_research','Deep-dive intrusion analyses with full kill-chain TTPs and timelines',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Microsoft Security Blog','Microsoft','https://www.microsoft.com/en-us/security/blog/feed/','rss','threat_research','Threat intelligence from Microsoft MSTIC, Defender, and Sentinel teams',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Palo Alto Unit 42','Palo Alto Networks','https://unit42.paloaltonetworks.com/feed/','rss','threat_research','Threat research on APTs, ransomware, vulnerabilities, and campaigns',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('CrowdStrike Blog','CrowdStrike','https://www.crowdstrike.com/blog/feed/','rss','threat_research','Threat intelligence and adversary tracking from CrowdStrike Falcon',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Cisco Talos Blog','Cisco Talos','https://blog.talosintelligence.com/rss/','rss','threat_research','Vulnerability research, malware campaigns, and threat landscape updates',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('SentinelOne Labs','SentinelOne','https://www.sentinelone.com/labs/feed/','rss','threat_research','Malware analysis, threat actor tracking, and detection research',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Elastic Security Labs','Elastic','https://www.elastic.co/security-labs/rss/feed.xml','rss','threat_research','Detection engineering research, malware analysis, and rule development',true,'direct');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Red Canary Blog','Red Canary','https://redcanary.com/blog/feed/','rss','threat_research','Detection-focused threat research and Atomic Red Team testing insights',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Huntress Blog','Huntress','https://www.huntress.com/blog/rss.xml','rss','threat_research','SMB-focused threat research, ransomware tracking, and incident analysis',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('CISA Advisories','CISA','https://www.cisa.gov/cybersecurity-advisories/all.xml','rss','government','US government cybersecurity advisories, alerts, and vulnerability notices',true,'direct');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Wiz Blog','Wiz','https://www.wiz.io/feed/rss.xml','rss','threat_research','Cloud security research — misconfiguration, identity risks, supply chain threats',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Google / Mandiant Threat Intel','Google / Mandiant','https://cloudblog.withgoogle.com/topics/threat-intelligence/rss/','rss','threat_research','APT research, malware analysis, zero-day tracking, and supply chain attacks from Google TAG and Mandiant',true,'jina_reader');
INSERT INTO public.curated_feed_sources (name,vendor,url,feed_type,category,description,is_active,extraction_method) VALUES ('Sophos X-Ops','Sophos','https://news.sophos.com/en-us/category/threat-research/feed/','rss','threat_research','Threat research covering ransomware, exploits, and attacker tradecraft',false,'jina_reader');

-- ============================================================
-- Security hardening (mirrors production advisor remediations)
-- ============================================================
-- Pin search_path on all project functions (prevents search_path injection on
-- SECURITY DEFINER functions). Behavior-preserving: public + extensions is the
-- subset of the default path these functions already run with.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END $$;

-- Restrict admin-check policies (those calling is_global_admin*) to signed-in
-- users, then revoke anon EXECUTE on the admin helper functions. anon never
-- satisfied these policies, so access is unchanged; anon just can't probe the
-- helpers via RPC anymore.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT cls.relname AS tbl, pol.polname AS pol
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public' AND 0 = ANY(pol.polroles)
      AND (COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%is_global_admin%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%is_global_admin%')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.pol, r.tbl);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.is_global_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_global_admin_or_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_global_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_global_admin_or_lead(uuid) TO authenticated, service_role;

-- ============================================================
-- Auto-digest durable queue snapshot (additive)
-- ============================================================
ALTER TABLE public.auto_digest_jobs
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_message_id bigint;
ALTER TABLE public.auto_digest_jobs DROP CONSTRAINT IF EXISTS auto_digest_jobs_status_check;
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_status_check CHECK (
  status = ANY (ARRAY['pending','processing','completed','partial','failed','timeout_partial','cancelled']::text[])
);
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_outcome_check CHECK (
  outcome IS NULL OR outcome = ANY (ARRAY['complete','partial','failed','cancelled']::text[])
);
ALTER TABLE public.auto_digest_jobs ADD CONSTRAINT auto_digest_jobs_id_user_id_key UNIQUE (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auto_digest_jobs_one_active_per_user
  ON public.auto_digest_jobs (user_id) WHERE status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS public.auto_digest_job_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_entry_id uuid NOT NULL REFERENCES public.threat_intel_feed_entries(id) ON DELETE CASCADE,
  report_id text REFERENCES public.threat_intel_reports(id) ON DELETE SET NULL,
  phase text NOT NULL DEFAULT 'digesting' CHECK (phase IN ('harvest','classify','rank','digest','story_link','finalize')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','skipped','quarantined','retained_previous')),
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
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_feed_entry_idx
  ON public.auto_digest_job_entries (feed_entry_id);
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_job_owner_idx
  ON public.auto_digest_job_entries (job_id, user_id);
CREATE INDEX IF NOT EXISTS auto_digest_job_entries_report_idx
  ON public.auto_digest_job_entries (report_id);
CREATE INDEX IF NOT EXISTS auto_digest_jobs_active_entry_idx
  ON public.auto_digest_jobs (active_entry_id);
CREATE INDEX IF NOT EXISTS auto_digest_jobs_cancelled_by_idx
  ON public.auto_digest_jobs (cancelled_by);
CREATE INDEX IF NOT EXISTS auto_digest_campaign_articles_report_idx
  ON public.auto_digest_campaign_articles (report_id);
CREATE INDEX IF NOT EXISTS auto_digest_campaigns_reviewed_by_idx
  ON public.auto_digest_campaigns (reviewed_by);
ALTER TABLE public.auto_digest_job_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS source_feed_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_modified timestamptz;
ALTER TABLE public.threat_intel_feeds
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS last_modified text,
  ADD COLUMN IF NOT EXISTS fetch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_http_status integer,
  ADD COLUMN IF NOT EXISTS last_discovered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
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
CREATE POLICY auto_digest_job_entries_select_own ON public.auto_digest_job_entries FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY auto_digest_job_entries_service_all ON public.auto_digest_job_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.auto_digest_jobs FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.auto_digest_job_entries FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.threat_intel_feed_entries FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.threat_intel_feeds FROM anon, authenticated;

-- Queue RPC projections kept in the canonical snapshot; pgmq delivery is
-- enabled by the durable-queue migration when the extension is available.
CREATE OR REPLACE FUNCTION public.request_auto_digest_job(
  p_user_id uuid DEFAULT auth.uid(), p_reason text DEFAULT 'manual'
) RETURNS TABLE(job_id uuid, status text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_job public.auto_digest_jobs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() AND current_user NOT IN ('postgres','supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Cannot create a digest job for another user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.auto_digest_jobs (user_id, status, result_summary)
  VALUES (p_user_id, 'pending', jsonb_build_object('reason', COALESCE(p_reason, 'manual')))
  ON CONFLICT (user_id) WHERE auto_digest_jobs.status IN ('pending','processing') DO NOTHING
  RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN
    SELECT j.* INTO v_job FROM public.auto_digest_jobs AS j
     WHERE j.user_id = p_user_id AND j.status IN ('pending','processing')
     ORDER BY j.created_at DESC LIMIT 1;
    RETURN QUERY SELECT v_job.id, v_job.status, false; RETURN;
  END IF;
  RETURN QUERY SELECT v_job.id, v_job.status, true;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_auto_digest_job(p_job_id uuid, p_reason text DEFAULT 'Cancelled by user')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_uid uuid := auth.uid(); v_job public.auto_digest_jobs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  UPDATE public.auto_digest_jobs SET status = 'cancelled', outcome = 'cancelled', phase = NULL,
    cancellation_requested = true, cancellation_requested_at = now(), cancelled_by = v_uid,
    completed_at = COALESCE(completed_at, now()), error = COALESCE(p_reason, 'Cancelled by user'),
    active_entry_id = NULL, pending_entry_ids = '[]'::jsonb
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
   WHERE e.feed_entry_id = p_entry_id AND e.job_id = p_job_id AND j.id = e.job_id AND j.status = 'processing'
     AND NOT j.cancellation_requested AND e.status = 'pending' AND e.attempt_count < e.max_attempts
   RETURNING e.*;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_auto_digest_entry(
  p_entry_id uuid, p_status text, p_report_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_status text := CASE WHEN p_status IN ('succeeded','failed','skipped','quarantined','retained_previous') THEN p_status ELSE 'failed' END;
BEGIN
  UPDATE public.auto_digest_job_entries SET status = v_status, report_id = COALESCE(p_report_id, report_id),
    last_error_code = p_error_code, last_error = p_error, completed_at = now(),
    lease_expires_at = NULL, heartbeat_at = now(), updated_at = now()
   WHERE id = p_entry_id AND status IN ('running','pending');
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_auto_digest_job(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog AS $$
DECLARE v_total int; v_success int; v_failed int; v_quarantined int; v_outcome text; v_status text;
BEGIN
  SELECT count(*)::int, count(*) FILTER (WHERE status = 'succeeded')::int,
    count(*) FILTER (WHERE status = 'failed')::int, count(*) FILTER (WHERE status = 'quarantined')::int
    INTO v_total, v_success, v_failed, v_quarantined FROM public.auto_digest_job_entries WHERE job_id = p_job_id;
  IF EXISTS (SELECT 1 FROM public.auto_digest_jobs WHERE id = p_job_id AND (status = 'cancelled' OR cancellation_requested)) THEN
    v_outcome := 'cancelled'; v_status := 'cancelled';
  ELSIF v_total = 0 OR (v_failed = 0 AND v_quarantined = 0) THEN
    v_outcome := 'complete'; v_status := 'completed';
  ELSIF v_success > 0 THEN v_outcome := 'partial'; v_status := 'partial';
  ELSE v_outcome := 'failed'; v_status := 'failed'; END IF;
  UPDATE public.auto_digest_jobs SET status = v_status, outcome = v_outcome, phase = NULL, completed_at = now(),
    active_entry_id = NULL, pending_entry_ids = '[]'::jsonb WHERE id = p_job_id AND status = 'processing';
  RETURN jsonb_build_object('job_id', p_job_id, 'status', v_status, 'outcome', v_outcome, 'entries_total', v_total, 'entries_succeeded', v_success, 'entries_failed', v_failed, 'entries_quarantined', v_quarantined);
END; $$;

GRANT EXECUTE ON FUNCTION public.request_auto_digest_job(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_auto_digest_job(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_auto_digest_entry(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_auto_digest_job(uuid) FROM PUBLIC, anon, authenticated;
-- Shared daily article reservations for scheduled and manual digest runs.
CREATE TABLE IF NOT EXISTS public.auto_digest_daily_quota (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date date NOT NULL,
  reserved_articles integer NOT NULL DEFAULT 0 CHECK (reserved_articles >= 0),
  completed_articles integer NOT NULL DEFAULT 0 CHECK (completed_articles >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quota_date)
);

ALTER TABLE public.auto_digest_daily_quota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auto_digest_daily_quota_select_own ON public.auto_digest_daily_quota;
CREATE POLICY auto_digest_daily_quota_select_own ON public.auto_digest_daily_quota
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS auto_digest_daily_quota_service_all ON public.auto_digest_daily_quota;
CREATE POLICY auto_digest_daily_quota_service_all ON public.auto_digest_daily_quota
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.auto_digest_daily_quota FROM anon, authenticated;
GRANT SELECT ON public.auto_digest_daily_quota TO authenticated;
GRANT ALL ON public.auto_digest_daily_quota TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_auto_digest_article_quota(
  p_user_id uuid,
  p_requested integer,
  p_daily_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_limit integer := greatest(0, least(coalesce(p_daily_limit, 0), 100));
  v_requested integer := greatest(0, least(coalesce(p_requested, 0), 100));
  v_reserved integer;
  v_granted integer;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_day::text, 0));
  INSERT INTO public.auto_digest_daily_quota (user_id, quota_date)
  VALUES (p_user_id, v_day)
  ON CONFLICT (user_id, quota_date) DO NOTHING;

  SELECT reserved_articles INTO v_reserved
    FROM public.auto_digest_daily_quota
   WHERE user_id = p_user_id AND quota_date = v_day
   FOR UPDATE;

  v_granted := least(v_requested, greatest(0, v_limit - coalesce(v_reserved, 0)));
  UPDATE public.auto_digest_daily_quota
     SET reserved_articles = reserved_articles + v_granted, updated_at = now()
   WHERE user_id = p_user_id AND quota_date = v_day;
  RETURN v_granted;
END;
$$;

-- Recover rows stranded by a failed ranking phase before pending_entry_ids
-- was persisted. Never touch a user's queued rows while that user has an
-- active job.
UPDATE public.threat_intel_feed_entries e
   SET digest_status = 'classified'
 WHERE e.digest_status = 'queued'
   AND NOT EXISTS (
     SELECT 1
       FROM public.auto_digest_jobs j
      WHERE j.user_id = e.user_id
        AND j.status IN ('pending', 'processing')
   );

-- Canonical tenant-policy and foreign-key-index parity for digest intelligence tables.
CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_auto_digest_report_idx
  ON public.threat_intel_feed_entries (auto_digest_report_id);
CREATE INDEX IF NOT EXISTS threat_intel_feed_entries_campaign_idx
  ON public.threat_intel_feed_entries (campaign_id);
CREATE INDEX IF NOT EXISTS threat_intel_reports_campaign_idx
  ON public.threat_intel_reports (campaign_id);

DO $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.auto_digest_campaigns', 'Users manage own campaigns');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.auto_digest_campaign_articles', 'Users manage own campaign articles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can view own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can create own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can update own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_reports', 'Users can delete own reports');
END $$;

CREATE POLICY auto_digest_campaigns_authenticated_all
  ON public.auto_digest_campaigns
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY auto_digest_campaigns_service_all
  ON public.auto_digest_campaigns
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY auto_digest_campaign_articles_authenticated_all
  ON public.auto_digest_campaign_articles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.auto_digest_campaigns c
    WHERE c.id = auto_digest_campaign_articles.campaign_id
      AND c.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.auto_digest_campaigns c
    WHERE c.id = auto_digest_campaign_articles.campaign_id
      AND c.user_id = (SELECT auth.uid())
  ));
CREATE POLICY auto_digest_campaign_articles_service_all
  ON public.auto_digest_campaign_articles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY threat_intel_reports_authenticated_select
  ON public.threat_intel_reports
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_insert
  ON public.threat_intel_reports
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_update
  ON public.threat_intel_reports
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_authenticated_delete
  ON public.threat_intel_reports
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY threat_intel_reports_service_all
  ON public.threat_intel_reports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Additive digest evidence-quality metadata. Legacy rows intentionally remain
-- readable and are marked legacy_unverified until reprocessed.
ALTER TABLE public.threat_intel_feed_entries
  ADD COLUMN IF NOT EXISTS source_quality text NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS source_content_hash text;
ALTER TABLE public.threat_intel_reports
  ADD COLUMN IF NOT EXISTS source_quality text NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS source_content_length integer,
  ADD COLUMN IF NOT EXISTS source_content_hash text,
  ADD COLUMN IF NOT EXISTS quality_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS possible_actor_mentions jsonb NOT NULL DEFAULT '[]'::jsonb;

REVOKE ALL ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_auto_digest_article_quota(uuid, integer, integer) TO authenticated, service_role;
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
       SET pending_entry_ids = jsonb_build_array(v_entry.feed_entry_id) ||
         COALESCE(pending_entry_ids, '[]'::jsonb),
           phase = 'digesting',
           phase_lease_expires_at = NULL,
           phase_started_at = NULL,
           phase_attempt_count = 0,
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
-- Atomic auto-digest report persistence. Analyst-owned review fields are not
-- part of the update set and therefore survive automated refreshes.
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
    deployment_readiness_percent, overlap_calculated_at
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
    (v_payload->>'deployment_readiness_percent')::integer, (v_payload->>'overlap_calculated_at')::timestamptz
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
    overlap_calculated_at = EXCLUDED.overlap_calculated_at, updated_at = now();

  RETURN QUERY SELECT v_target_id;
END;
$$;

-- Threat intelligence is shared within this single-organization deployment.
-- Authenticated users may read reports and their supporting story/link rows,
-- while mutations remain restricted to the user who owns the parent record.
DROP POLICY IF EXISTS threat_intel_reports_authenticated_select
  ON public.threat_intel_reports;
CREATE POLICY threat_intel_reports_authenticated_select
  ON public.threat_intel_reports
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_all
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_select
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_insert
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_update
  ON public.auto_digest_campaigns;
DROP POLICY IF EXISTS auto_digest_campaigns_authenticated_delete
  ON public.auto_digest_campaigns;
CREATE POLICY auto_digest_campaigns_authenticated_select
  ON public.auto_digest_campaigns
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY auto_digest_campaigns_authenticated_insert
  ON public.auto_digest_campaigns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY auto_digest_campaigns_authenticated_update
  ON public.auto_digest_campaigns
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY auto_digest_campaigns_authenticated_delete
  ON public.auto_digest_campaigns
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_all
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_select
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_insert
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_update
  ON public.auto_digest_campaign_articles;
DROP POLICY IF EXISTS auto_digest_campaign_articles_authenticated_delete
  ON public.auto_digest_campaign_articles;
CREATE POLICY auto_digest_campaign_articles_authenticated_select
  ON public.auto_digest_campaign_articles
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY auto_digest_campaign_articles_authenticated_insert
  ON public.auto_digest_campaign_articles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));
CREATE POLICY auto_digest_campaign_articles_authenticated_update
  ON public.auto_digest_campaign_articles
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));
CREATE POLICY auto_digest_campaign_articles_authenticated_delete
  ON public.auto_digest_campaign_articles
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.auto_digest_campaigns AS campaign
    WHERE campaign.id = auto_digest_campaign_articles.campaign_id
      AND campaign.user_id = (SELECT auth.uid())
  ));

DO $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can view detections for own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can link detections to own reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.threat_intel_report_detections', 'Users can unlink detections from own reports');
END $$;
DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_select
  ON public.threat_intel_report_detections;
DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_insert
  ON public.threat_intel_report_detections;
DROP POLICY IF EXISTS threat_intel_report_detections_authenticated_delete
  ON public.threat_intel_report_detections;
CREATE POLICY threat_intel_report_detections_authenticated_select
  ON public.threat_intel_report_detections
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY threat_intel_report_detections_authenticated_insert
  ON public.threat_intel_report_detections
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.threat_intel_reports AS report
    WHERE report.id = threat_intel_report_detections.report_id
      AND report.user_id = (SELECT auth.uid())
  ));
CREATE POLICY threat_intel_report_detections_authenticated_delete
  ON public.threat_intel_report_detections
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.threat_intel_reports AS report
    WHERE report.id = threat_intel_report_detections.report_id
      AND report.user_id = (SELECT auth.uid())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.threat_intel_reports, public.auto_digest_campaigns, public.auto_digest_campaign_articles
  TO authenticated;
GRANT SELECT, INSERT, DELETE
  ON public.threat_intel_report_detections
  TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_auto_digest_report(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_auto_digest_report(text, uuid, text, jsonb) TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'threat_intel_feeds_taxii_credential_id_fkey'
       AND conrelid = 'public.threat_intel_feeds'::regclass
  ) THEN
    ALTER TABLE public.threat_intel_feeds
      ADD CONSTRAINT threat_intel_feeds_taxii_credential_id_fkey
      FOREIGN KEY (taxii_credential_id) REFERENCES public.integration_credentials(id) ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.threat_intel_feeds
  DROP CONSTRAINT IF EXISTS threat_intel_feeds_max_items_per_fetch_check;
ALTER TABLE public.threat_intel_feeds
  ADD CONSTRAINT threat_intel_feeds_max_items_per_fetch_check
  CHECK (max_items_per_fetch BETWEEN 1 AND 200);
ALTER TABLE public.auto_digest_campaigns
  ADD COLUMN IF NOT EXISTS ai_link_rationale text,
  ADD COLUMN IF NOT EXISTS ai_link_confidence text,
  ADD COLUMN IF NOT EXISTS story_decision_version text;

ALTER TABLE public.auto_digest_campaigns
  DROP CONSTRAINT IF EXISTS auto_digest_campaigns_ai_link_confidence_check;
ALTER TABLE public.auto_digest_campaigns
  ADD CONSTRAINT auto_digest_campaigns_ai_link_confidence_check
  CHECK (ai_link_confidence IS NULL OR ai_link_confidence IN ('high', 'medium', 'low'));
-- A persisted report can be partial even when its article entry completed.
-- Keep the run outcome degraded when the phase result contains section errors.
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
    'entries_total', v_total, 'entries_succeeded', v_success, 'entries_failed', v_failed,
    'entries_quarantined', v_quarantined, 'entries_skipped', v_skipped);
END;
$$;

-- Mark a feed entry processed only after its persisted report belongs to the same user.
CREATE OR REPLACE FUNCTION public.complete_feed_entry_processing(
  p_entry_id uuid,
  p_report_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry_user_id uuid;
  v_report_user_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT user_id INTO v_entry_user_id
    FROM public.threat_intel_feed_entries
   WHERE id = p_entry_id
   FOR UPDATE;
  IF v_entry_user_id IS NULL OR v_entry_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Feed entry not found' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_report_user_id
    FROM public.threat_intel_reports
   WHERE id = p_report_id;
  IF v_report_user_id IS NULL OR v_report_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Persisted report not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.threat_intel_feed_entries
     SET is_processed = true,
         auto_digest_report_id = p_report_id
   WHERE id = p_entry_id AND user_id = v_user_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_feed_entry_processing(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_feed_entry_processing(uuid, text) TO authenticated, service_role;


-- Final effective definitions for linked-database lint repairs. These
-- overrides keep the snapshot aligned with the deployed database after the
-- historical team/workspace objects were removed.
CREATE OR REPLACE FUNCTION public.cleanup_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_team_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE v_current_user uuid := auth.uid(); v_role text; v_is_global_admin boolean;
BEGIN
  SELECT COALESCE(role, 'viewer'), role IN ('owner','admin')
    INTO v_role, v_is_global_admin
    FROM public.profiles WHERE id = v_current_user;
  RETURN jsonb_build_object(
    'user_id', v_current_user,
    'team_id', p_team_id,
    'role', COALESCE(v_role, 'viewer'),
    'is_global_admin', COALESCE(v_is_global_admin, false),
    'permissions', CASE COALESCE(v_role, 'viewer')
      WHEN 'owner' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true, 'team_manage', true, 'user_manage', true, 'user_invite', true, 'assign', true, 'review', true, 'publish_approve', true, 'view_activity', true, 'export_bulk', true)
      WHEN 'admin' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'detection_delete_any', true, 'user_manage', true, 'user_invite', true, 'assign', true, 'review', true, 'publish_approve', true, 'view_activity', true, 'export_bulk', true)
      WHEN 'lead' THEN jsonb_build_object('detection_create', true, 'detection_edit_any', true, 'assign', true, 'review', true, 'view_activity', true)
      WHEN 'analyst' THEN jsonb_build_object('detection_create', true, 'detection_edit_assigned', true, 'detection_delete_own', true, 'request_review', true)
      ELSE jsonb_build_object('detection_view', true, 'comment', true)
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_digest_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE v_hour integer := extract(hour from now() at time zone 'UTC')::integer; v_user record;
BEGIN
  FOR v_user IN
    SELECT user_id FROM public.auto_digest_settings
     WHERE is_enabled = true AND schedule_hour_utc = v_hour
  LOOP
    PERFORM public.request_auto_digest_job(v_user.user_id, 'scheduled');
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_coverage_summary(p_platform text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE v_total_techniques int; v_covered_techniques int; v_total_detections bigint; v_production_detections bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_covered), sum(detection_count), sum(production_count)
    INTO v_total_techniques, v_covered_techniques, v_total_detections, v_production_detections
    FROM public.mv_coverage_stats s
   WHERE s.is_subtechnique = false AND (p_platform IS NULL OR EXISTS (
     SELECT 1 FROM public.detections d
      WHERE s.technique_id = ANY(COALESCE(d."mitreAttackIds", '{}'::text[]))
        AND p_platform = ANY(COALESCE(d.platforms, '{}'::text[]))
   ));
  RETURN jsonb_build_object('summary', jsonb_build_object(
    'total_techniques', coalesce(v_total_techniques, 0),
    'covered_techniques', coalesce(v_covered_techniques, 0),
    'coverage_percent', CASE WHEN coalesce(v_total_techniques, 0) > 0 THEN round((v_covered_techniques::numeric / v_total_techniques) * 100) ELSE 0 END,
    'total_detections', coalesce(v_total_detections, 0),
    'production_detections', coalesce(v_production_detections, 0)
  ), 'by_tactic', '[]'::jsonb, 'top_covered', '[]'::jsonb, 'critical_gaps', '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_threat_actor_coverage(p_actor_stix_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
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
  RETURN jsonb_build_object('actor', v_actor, 'coverage', jsonb_build_object(
    'total', coalesce(v_total, 0), 'covered', coalesce(v_covered, 0),
    'percent', CASE WHEN coalesce(v_total, 0) > 0 THEN round((v_covered::numeric / v_total) * 100) ELSE 0 END
  ), 'coveredTechniques', coalesce(v_covered_techniques, '[]'::jsonb), 'gaps', coalesce(v_gaps, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_rate_limit(p_key text, p_window_start timestamptz, p_max_requests integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
DECLARE v_count int;
BEGIN
  IF p_max_requests IS NULL OR p_max_requests < 1 THEN
    RAISE EXCEPTION 'p_max_requests must be positive' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.rate_limits (key, request_count, window_start)
  VALUES (p_key, 1, date_trunc('minute', p_window_start))
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = public.rate_limits.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$function$;


-- Canonical snapshot override for the deployed report provenance upsert.
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
    extraction_completed_at = EXCLUDED.extraction_completed_at,
    source_quality = EXCLUDED.source_quality, source_content_length = EXCLUDED.source_content_length,
    source_content_hash = EXCLUDED.source_content_hash, quality_warnings = EXCLUDED.quality_warnings,
    possible_actor_mentions = EXCLUDED.possible_actor_mentions, updated_at = now();

  RETURN QUERY SELECT v_target_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto-digest quota release (mirrors 20260806101500_auto_digest_quota_release)
-- ---------------------------------------------------------------------------

-- Auto-digest daily quota: make reservations refundable, and start recording
-- completions.
--
-- reserve_auto_digest_article_quota was the ONLY function that ever touched
-- auto_digest_daily_quota.reserved_articles, and it only ever incremented. A
-- run that reserved N articles and then failed burned N against the day's cap
-- permanently -- the 2026-08-06 failure reserved 2 and never gave them back.
-- Enough retries in one day would lock the user out until UTC midnight.
--
-- completed_articles was never written by anything: it read 0 on every row,
-- including days where articles were digested successfully.
--
-- The cap is named max_articles_per_day and is documented as a limit on how
-- many reports get produced, so it counts SUCCESSFUL digests. An article that
-- ends skipped, quarantined, failed, or retained gives its reservation back.

-- Unrelated to quota, but a live trap in the same table: the phase column's
-- DEFAULT is 'digesting', which is absent from its own CHECK constraint
-- (harvest|classify|rank|digest|story_link|finalize). Any INSERT that omits
-- phase therefore fails outright. Every row production has ever written sets
-- 'digest' explicitly, so aligning the default changes no existing behaviour
-- and removes the trap for the next writer.
ALTER TABLE public.auto_digest_job_entries ALTER COLUMN phase SET DEFAULT 'digest';

CREATE OR REPLACE FUNCTION public.release_auto_digest_article_quota(
  p_user_id uuid,
  p_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_count integer := greatest(0, least(coalesce(p_count, 0), 100));
  v_reserved integer;
  v_released integer;
  v_jwt_role text := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Same lock key as reserve, so a release cannot interleave with a
  -- concurrent reservation for the same user and day.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_day::text, 0));

  SELECT reserved_articles INTO v_reserved
    FROM public.auto_digest_daily_quota
   WHERE user_id = p_user_id AND quota_date = v_day
   FOR UPDATE;

  IF v_reserved IS NULL THEN
    RETURN 0;
  END IF;

  -- Floor at zero. A double-release must never manufacture capacity.
  v_released := least(v_count, v_reserved);
  UPDATE public.auto_digest_daily_quota
     SET reserved_articles = reserved_articles - v_released, updated_at = now()
   WHERE user_id = p_user_id AND quota_date = v_day;

  RETURN v_released;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_auto_digest_article_quota(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_auto_digest_article_quota(uuid, integer)
  TO service_role;

-- complete_auto_digest_entry now settles the quota alongside the entry, so the
-- two can never drift: a success counts, anything else terminal refunds. The
-- decrement is inlined rather than calling the RPC above because this function
-- also runs from the watchdog as `postgres`, where the RPC's service_role JWT
-- check would not hold.
CREATE OR REPLACE FUNCTION public.complete_auto_digest_entry(
  p_entry_id uuid,
  p_status text,
  p_report_id text DEFAULT NULL::text,
  p_error_code text DEFAULT NULL::text,
  p_error text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_entry public.auto_digest_job_entries%ROWTYPE;
  v_status text;
  v_retry boolean := false;
  v_message_id bigint;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
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

  -- Quota settlement. Skipped while v_retry, because the article still holds
  -- its reservation for the retry that complete_auto_digest_entry enqueues
  -- below; the eventual terminal outcome settles it.
  IF NOT v_retry THEN
    IF v_status = 'succeeded' THEN
      UPDATE public.auto_digest_daily_quota
         SET completed_articles = completed_articles + 1, updated_at = now()
       WHERE user_id = v_entry.user_id AND quota_date = v_day;
    ELSE
      UPDATE public.auto_digest_daily_quota
         SET reserved_articles = greatest(0, reserved_articles - 1), updated_at = now()
       WHERE user_id = v_entry.user_id AND quota_date = v_day;
    END IF;
  END IF;

  IF v_retry THEN
    UPDATE public.auto_digest_jobs
       SET pending_entry_ids = jsonb_build_array(v_entry.feed_entry_id) ||
             COALESCE(pending_entry_ids, '[]'::jsonb),
           phase = 'digesting',
           phase_lease_expires_at = NULL,
           phase_started_at = NULL,
           phase_attempt_count = 0,
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

REVOKE EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_auto_digest_entry(uuid, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.release_auto_digest_article_quota(uuid, integer) IS
  'Returns unused daily article reservations. Floors at zero so a double-release cannot manufacture capacity.';

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER lockdown
-- ---------------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION, and Supabase's anon
-- role inherits PUBLIC. A SECURITY DEFINER function therefore runs with owner
-- privileges for an unauthenticated caller unless EXECUTE is explicitly
-- revoked. Production applied those revokes migration-by-migration and has
-- zero anon-executable SECURITY DEFINER functions; this consolidated file had
-- lost them, so a fresh clone or self-host stood up with 44 of them reachable
-- through /rest/v1/rpc.
--
-- Driven off the catalog rather than a hand-maintained list, so a function
-- added later is locked down by default instead of silently inheriting PUBLIC.
-- Runs last, after every CREATE FUNCTION above.
DO $lockdown$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$lockdown$;

-- Re-grant EXECUTE to authenticated for exactly the functions production
-- grants it to. Guarded by to_regprocedure so a signature that does not exist
-- in this file is skipped rather than aborting the whole schema load.
DO $regrant$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'public.approve_promotion(uuid,uuid,text,text)',
    'public.cancel_auto_digest_job(uuid,text)',
    'public.check_detection_write_permission(uuid,text)',
    'public.check_promotion_eligibility(text)',
    'public.complete_feed_entry_processing(uuid,text)',
    'public.complete_password_setup(text)',
    'public.find_similar_detections(text,double precision,integer,boolean)',
    'public.fork_to_development(text,uuid)',
    'public.get_current_spend(text,text,text)',
    'public.get_defensive_posture(uuid,text)',
    'public.get_filter_options(text)',
    'public.get_mitigation_techniques(text)',
    'public.get_strategy_analytics(text)',
    'public.get_technique_strategies_by_mitre_id(text)',
    'public.get_top_impact_mitigations(integer)',
    'public.get_top_impact_strategies(integer)',
    'public.is_global_admin(uuid)',
    'public.is_global_admin_or_lead(uuid)',
    'public.populate_scoring_snapshot(text)',
    'public.refresh_coverage_stats()',
    'public.request_auto_digest_job(uuid,text)',
    'public.reserve_auto_digest_article_quota(uuid,integer,integer)',
    'public.rollback_bulk_import(uuid,uuid)',
    'public.submit_for_promotion(text,uuid)',
    'public.submit_for_promotion(uuid,uuid)',
    'public.tr_patch_detection(uuid,text,text,text,jsonb)'
  ]) AS sig
  LOOP
    IF to_regprocedure(r.sig) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END
$regrant$;

-- ---------------------------------------------------------------------------
-- Migration-only rollback snapshot lockdown
-- ---------------------------------------------------------------------------
-- The one-off Aug 7/11 repair snapshots are intentionally absent from this
-- canonical snapshot, but may exist in databases upgraded through migrations.
-- If present, they must never become Data API resources.
DO $backup_lockdown$
DECLARE
  backup_table text;
BEGIN
  FOREACH backup_table IN ARRAY ARRAY[
    '_backup_iocs_d3_20260807',
    '_backup_rules_e2_20260807',
    '_backup_rules_e3_20260807',
    '_backup_rules_e4_20260807',
    '_backup_rules_e4b_20260811',
    '_backup_rules_e4c_20260811'
  ]
  LOOP
    CONTINUE WHEN to_regclass(format('public.%I', backup_table)) IS NULL;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', backup_table);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      backup_table
    );
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', backup_table);
    EXECUTE format(
      'DROP POLICY IF EXISTS backup_snapshot_service_select ON public.%I',
      backup_table
    );
    EXECUTE format(
      'CREATE POLICY backup_snapshot_service_select ON public.%I FOR SELECT TO service_role USING (true)',
      backup_table
    );
  END LOOP;
END
$backup_lockdown$;

-- Native SIEM library (20260914153559)
-- Native SIEM inventory. All operational writes are performed by the authorized backend.
ALTER TABLE public.detections ADD COLUMN IF NOT EXISTS native_provenance jsonb;
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE public.siem_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  provider_scope text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','partial','failed','cancelled')),
  phase text NOT NULL DEFAULT 'discovery' CHECK (phase IN ('discovery','hydration')),
  cursor_offset integer NOT NULL DEFAULT 0,
  -- Opaque continuation cursor for providers that page by URL/token rather than by integer
  -- offset (Sentinel/Defender's nextLink, Chronicle's pageToken). cursor_offset stays the home
  -- for offset/page-number providers (CrowdStrike, Splunk, Elastic); this column is simply
  -- never written for them, so their behaviour is unchanged.
  cursor_token text,
  discovery_complete boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz,
  completed_at timestamptz,
  kind text NOT NULL DEFAULT 'legacy_import' CHECK (kind IN ('legacy_import','inventory','refresh_tracked','import_selection')),
  protocol_version integer NOT NULL DEFAULT 1,
  source_run_id uuid REFERENCES public.siem_sync_runs(id),
  idempotency_key text
);
-- One active run per connection AND kind, so an inventory job and an import job may run at once.
CREATE UNIQUE INDEX siem_sync_one_active ON public.siem_sync_runs(integration_id, kind) WHERE status IN ('queued','running');
CREATE INDEX siem_sync_due ON public.siem_sync_runs(next_attempt_at) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX siem_import_idempotency ON public.siem_sync_runs(integration_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.siem_sync_items (
  run_id uuid NOT NULL REFERENCES public.siem_sync_runs(id) ON DELETE CASCADE,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','linked','unchanged','changed','ignored','unsupported','ambiguous','failed','observed','skipped','cancelled','changed_since_preview')),
  error_message text,
  frozen_content_hash text,
  detection_id text REFERENCES public.detections(id) ON DELETE SET NULL,
  PRIMARY KEY (run_id, vendor_rule_id)
);

CREATE TABLE public.siem_rule_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text NOT NULL REFERENCES public.detections(id) ON DELETE RESTRICT,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle'])),
  provider_scope text NOT NULL,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  selected_query_id text NOT NULL,
  query_language text NOT NULL CHECK (query_language = ANY (ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL','YARA','YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL'])),
  binding_status text NOT NULL DEFAULT 'active' CHECK (binding_status IN ('active','detached','ignored','tombstone')),
  availability text NOT NULL DEFAULT 'present' CHECK (availability IN ('present','missing','unknown')),
  observed_enabled boolean,
  desired_content jsonb NOT NULL,
  baseline_snapshot_id uuid,
  latest_remote_snapshot_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_run_id uuid REFERENCES public.siem_sync_runs(id),
  UNIQUE (integration_id, provider_scope, vendor_rule_id),
  UNIQUE (id, detection_id)
);
CREATE INDEX siem_binding_detection ON public.siem_rule_bindings(detection_id);
ALTER TABLE public.deployment_history ADD COLUMN IF NOT EXISTS native_binding_id uuid REFERENCES public.siem_rule_bindings(id);
ALTER TABLE public.siem_sync_items ADD COLUMN binding_id uuid REFERENCES public.siem_rule_bindings(id) ON DELETE SET NULL;
ALTER TABLE public.siem_rule_bindings ADD COLUMN pending_operation_id uuid REFERENCES public.deployment_history(id);

CREATE TABLE public.siem_rule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES public.siem_rule_bindings(id) ON DELETE RESTRICT,
  adapter_version text NOT NULL,
  content_hash text NOT NULL,
  raw_hash text NOT NULL,
  content jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(binding_id, adapter_version, content_hash, raw_hash),
  UNIQUE(binding_id, id)
);
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_baseline_owner
  FOREIGN KEY (id, baseline_snapshot_id) REFERENCES public.siem_rule_snapshots(binding_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.siem_rule_bindings ADD CONSTRAINT siem_latest_owner
  FOREIGN KEY (id, latest_remote_snapshot_id) REFERENCES public.siem_rule_snapshots(binding_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.siem_local_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text NOT NULL REFERENCES public.detections(id) ON DELETE RESTRICT,
  content jsonb NOT NULL,
  binding_contents jsonb NOT NULL DEFAULT '{}',
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX siem_revision_detection ON public.siem_local_revisions(detection_id, created_at DESC);

CREATE TABLE public.siem_rule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES public.siem_rule_bindings(id) ON DELETE RESTRICT,
  actor_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Revoke Supabase default grants as well as enabling RLS. Clients cannot forge observations or checkpoints.
ALTER TABLE public.siem_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_sync_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_local_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_rule_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events TO authenticated;
GRANT ALL ON public.siem_sync_runs, public.siem_sync_items, public.siem_rule_bindings,
  public.siem_rule_snapshots, public.siem_local_revisions, public.siem_rule_events TO service_role;
CREATE POLICY siem_runs_read ON public.siem_sync_runs FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_items_read ON public.siem_sync_items FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_sync_runs r WHERE r.id = run_id));
CREATE POLICY siem_bindings_read ON public.siem_rule_bindings FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_snapshots_read ON public.siem_rule_snapshots FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.id = binding_id));
CREATE POLICY siem_revisions_read ON public.siem_local_revisions FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.detection_id = siem_local_revisions.detection_id));
CREATE POLICY siem_events_read ON public.siem_rule_events FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_rule_bindings b WHERE b.id = binding_id));

CREATE OR REPLACE FUNCTION public.siem_can_import(p_actor uuid, p_integration uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM integrations i JOIN profiles p ON p.id = i.user_id
    WHERE i.id = p_integration AND i.user_id = p_actor AND i.archived_at IS NULL
      AND i.provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle'])
      AND coalesce(p.status,'active') <> 'deactivated'
      AND ((p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:import')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:import')
      AND ((p.role IN ('owner','admin','lead','analyst') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:create')
           AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:create')
  );
$$;

CREATE OR REPLACE FUNCTION public.siem_can_edit(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id=p_actor AND coalesce(p.status,'active')<>'deactivated'
    AND (((p.role IN ('owner','admin','lead','analyst') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:edit_own')
      AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:edit_own')
    OR ((p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'detection:edit_any')
      AND NOT coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'detection:edit_any')));
$$;
REVOKE ALL ON FUNCTION public.siem_can_edit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_can_edit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_start_sync(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM deployment_history WHERE integration_id=p_integration AND native_binding_id IS NOT NULL
    AND status='in_progress' AND started_at > now()-interval '90 seconds') THEN RAISE EXCEPTION 'Production operation in progress'; END IF;
  UPDATE deployment_history SET status='failed',error_message='Operation interrupted; sync required to verify production',
    completed_at=now() WHERE integration_id=p_integration AND native_binding_id IS NOT NULL AND status='in_progress';
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs WHERE integration_id = p_integration AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id,actor_id,provider_scope) VALUES(p_integration,p_actor,p_scope) RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.siem_claim_sync()
RETURNS SETOF public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM siem_sync_runs WHERE status IN ('queued','running') AND next_attempt_at <= now()
    AND (lease_expires_at IS NULL OR lease_expires_at < now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF rid IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE siem_sync_runs SET status='running', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '45 seconds', heartbeat_at=now() WHERE id=rid RETURNING *;
END;
$$;

-- One transaction checks the lease, imports all results and advances the durable checkpoint.
-- The one query language each provider's adapter emits, for commit paths that adopt content into
-- the library without being told a language by the caller. Provider identity always comes from
-- the connection (integrations.provider), never from a vendor payload.
CREATE OR REPLACE FUNCTION public.siem_provider_query_language(p_provider text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_provider
    WHEN 'crowdstrike' THEN 'CQL'
    WHEN 'splunk' THEN 'SPL'
    WHEN 'sentinel' THEN 'KQL'
    WHEN 'elastic' THEN 'EQL'
    WHEN 'defender_xdr' THEN 'KQL'
    WHEN 'chronicle' THEN 'YARA-L'
    ELSE NULL
  END;
$$;

-- The per-rule language, when the vendor payload carries a valid one (e.g. an Elastic rule's own
-- 'kuery'/'lucene'/'eql'/'esql'), falling back to siem_provider_query_language() only when the
-- payload has no language or one outside QUERY_LANGUAGES (src/constants.ts:5-20). Validating here
-- keeps a single malformed rule from writing a value the CHECK constraint would reject mid-import.
-- Matched case-INSENSITIVELY, returning the canonical spelling. Vendors name their languages in
-- their own casing -- Elastic's rules carry 'kuery'/'lucene'/'eql'/'esql' lowercase -- while the
-- column is CHECK-constrained to the app's canonical set. An exact-match-only test silently failed
-- every lowercase vendor value through to the provider default, which is the very bug this fix
-- exists to remove. A value that matches nothing still falls back to the provider default.
CREATE OR REPLACE FUNCTION public.siem_rule_query_language(p_provider text, p_content jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT coalesce(
    (SELECT canonical
       FROM unnest(ARRAY['SPL','KQL','Kuery','Sigma','EQL','ESQL','CQL','SQL',
         'YARA','YARA-L','Lucene','Carbon Black','Datadog','Elasticsearch DSL']) AS canonical
      WHERE lower(canonical) = lower(p_content ->> 'language')
      LIMIT 1),
    siem_provider_query_language(p_provider));
$$;

-- Native ATT&CK IDs are evidence from provider configuration, never inferred from query text.
CREATE OR REPLACE FUNCTION public.siem_native_attack_metadata(p_content jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH ids AS (
    SELECT DISTINCT match[1] AS id FROM regexp_matches(
      jsonb_build_array(p_content#>'{config,technique}', p_content#>'{config,techniques}',
        p_content#>'{config,mitreTechniques}', p_content#>'{config,threat}',
        p_content#>'{config,action.correlationsearch.annotations}', p_content#>'{config,fields,mitre_attack}')::text,
      '(T[0-9]{4}(?:\.[0-9]{3})?)', 'g') AS match
  ), techniques AS (
    SELECT o.stix_id,o.name FROM mitre_objects o JOIN ids ON ids.id=o.mitre_id
      WHERE o.type='attack-pattern'
  ), tactics AS (
    SELECT DISTINCT o.name FROM mitre_objects o
      WHERE o.type='x-mitre-tactic' AND (
        o.stix_id IN (SELECT mt.tactic_stix_id FROM mitre_technique_tactics mt JOIN techniques t ON t.stix_id=mt.technique_stix_id)
        OR o.mitre_id=p_content#>>'{config,tactic}'
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p_content#>'{config,tactics}')='array' THEN p_content#>'{config,tactics}' ELSE '[]'::jsonb END) AS x
          WHERE regexp_replace(lower(o.name),'[^a-z]','','g')=regexp_replace(lower(x),'[^a-z]','','g')))
  )
  SELECT jsonb_build_object('ids',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM ids),'[]'::jsonb),
    'techniques',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM techniques),'[]'::jsonb),
    'tactics',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM tactics),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.siem_native_attack_metadata(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_native_attack_metadata(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_commit_chunk(p_run uuid, p_lease uuid, p_ids text[], p_next integer,
  p_discovery_complete boolean, p_results jsonb, p_next_token text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; snap uuid; d detections;
  qid text; did text; candidates text[]; c jsonb; outcome text; old_hash text; prov text; qlang text; attack jsonb;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id=p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id,r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id=r.integration_id;
  IF r.phase='discovery' THEN
    INSERT INTO siem_sync_items(run_id,vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset=p_next, cursor_token=p_next_token, discovery_complete=p_discovery_complete,
      phase=CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id=r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=item->>'id' AND status='pending') THEN CONTINUE; END IF;
      IF item ? 'error' THEN
        UPDATE siem_sync_items SET status=coalesce(item->>'status','failed'), error_message=item->>'error'
          WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        -- A read that did not complete says nothing about production. Keeping the last
        -- 'present' shows a confident, stale answer; 'missing' would be a lie. Only a failed
        -- READ gets 'unknown' -- a rule we read but could not normalise ('unsupported') is
        -- still present, and last_seen_at is deliberately not advanced either way.
        IF coalesce(item->>'status','failed') = 'failed' THEN
          UPDATE siem_rule_bindings SET availability='unknown'
           WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
             AND vendor_rule_id=item->>'id' AND binding_status='active';
        END IF;
        CONTINUE;
      END IF;
      c := item->'content';
      -- Per-rule language first (e.g. an Elastic rule's own 'kuery'/'lucene'/'eql'/'esql'),
      -- falling back to the provider default only when the payload has none or an invalid one.
      qlang := siem_rule_query_language(prov, c);
    attack := siem_native_attack_metadata(c);
      SELECT * INTO b FROM siem_rule_bindings WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope AND vendor_rule_id=item->>'id' FOR UPDATE;
      outcome := 'unchanged';
      IF FOUND AND b.binding_status <> 'active' THEN
        UPDATE siem_sync_items SET status='ignored' WHERE run_id=r.id AND vendor_rule_id=item->>'id';
        CONTINUE;
      END IF;
      IF b.id IS NULL THEN
        -- A real, current deployment establishes scope. Legacy external_id alone does not.
        SELECT array_agg(DISTINCT h.detection_id) INTO candidates FROM deployment_history h
          JOIN detections x ON x.id=h.detection_id
          WHERE h.integration_id=r.integration_id AND h.vendor_rule_id=item->>'id' AND h.status='success'
          AND x.user_id=r.actor_id AND h.action <> 'delete'
          AND NOT EXISTS (SELECT 1 FROM deployment_history later WHERE later.integration_id=h.integration_id
            AND later.vendor_rule_id=h.vendor_rule_id AND later.status='success' AND later.created_at>h.created_at AND later.action='delete');
        IF cardinality(candidates)>1 OR (coalesce(cardinality(candidates),0)=0 AND EXISTS
          (SELECT 1 FROM detections WHERE user_id=r.actor_id AND external_id=item->>'id' AND native_provenance IS NULL)) THEN
          UPDATE siem_sync_items SET status='ambiguous',error_message='Existing library rule needs explicit connection matching'
            WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
        END IF;
        did := candidates[1]; qid := NULL;
        IF did IS NOT NULL THEN
          SELECT * INTO d FROM detections WHERE id=did FOR UPDATE;
          SELECT q->>'id' INTO qid FROM jsonb_array_elements(d.queries) q WHERE q->>'language'=qlang
            AND q->>'query'=c->>'query' LIMIT 1;
          IF qid IS NULL THEN
            UPDATE siem_sync_items SET status='ambiguous',error_message='Existing deployment query differs; review linkage before importing'
              WHERE run_id=r.id AND vendor_rule_id=item->>'id'; CONTINUE;
          END IF;
          outcome := 'linked';
        ELSE
          did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
          INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
            "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
            source,external_id,tags,native_provenance,"mitreAttackIds","mitreTechniques","mitreTactics")
          VALUES(did,r.actor_id,1,c->>'name',c->>'description',CASE WHEN c->>'enabled'='true' THEN 'Production' ELSE 'Draft' END,'Detection',c->>'severity','','',false,qlang,c->>'query',now(),
            jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
            'production','none','none','native_siem',item->>'id',ARRAY['native-siem',prov],
            jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
              (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()), ARRAY(SELECT jsonb_array_elements_text(attack->'ids')),
      ARRAY(SELECT jsonb_array_elements_text(attack->'techniques')), ARRAY(SELECT jsonb_array_elements_text(attack->'tactics')));
          SELECT * INTO d FROM detections WHERE id=did;
          outcome := 'imported';
        END IF;
        INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
          VALUES(did,r.integration_id,prov,r.provider_scope,item->>'id',qid,qlang,c) RETURNING * INTO b;
        INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(did,to_jsonb(d),jsonb_build_object(b.id::text,c),r.actor_id);
        INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,r.actor_id,outcome);
      END IF;
      SELECT content_hash INTO old_hash FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id;
      INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
        VALUES(b.id,item->>'adapter',item->>'hash',item->>'raw_hash',c,item->'raw') ON CONFLICT DO NOTHING;
      SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=item->>'adapter'
        AND content_hash=item->>'hash' AND raw_hash=item->>'raw_hash';
      -- Only adoption establishes a baseline. For a binding that already existed, this run is an
      -- observation, and an observation is not a reconciliation decision.
      UPDATE siem_rule_bindings SET latest_remote_snapshot_id=snap,
        baseline_snapshot_id=CASE WHEN outcome IN ('imported','linked')
                                  THEN coalesce(baseline_snapshot_id,snap) ELSE baseline_snapshot_id END,
        availability='present', observed_enabled=(c->>'enabled')::boolean,last_seen_at=now(),last_sync_run_id=r.id,
        pending_operation_id=NULL WHERE id=b.id;
      IF outcome='unchanged' AND old_hash IS DISTINCT FROM item->>'hash' THEN outcome:='changed'; END IF;
      UPDATE siem_sync_items SET status=outcome,error_message=NULL WHERE run_id=r.id AND vendor_rule_id=item->>'id';
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status='pending') THEN
      IF EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND status IN ('failed','unsupported','ambiguous')) THEN
        UPDATE siem_sync_runs SET status='partial',completed_at=now() WHERE id=r.id;
      ELSE
        UPDATE siem_sync_runs SET status='complete',completed_at=now() WHERE id=r.id;
        UPDATE siem_rule_bindings SET availability='missing',pending_operation_id=NULL WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
          AND binding_status='active' AND NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id=r.id AND vendor_rule_id=siem_rule_bindings.vendor_rule_id);
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token=NULL,lease_expires_at=NULL,heartbeat_at=now(),attempts=0,error_message=NULL WHERE id=r.id;
END;
$$;

CREATE SCHEMA IF NOT EXISTS siem_private;
REVOKE ALL ON SCHEMA siem_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION siem_private.guard_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM (SELECT provider FROM integrations WHERE id=NEW.integration_id) OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id
      AND q->>'id'=NEW.selected_query_id) <> 1 OR
    (SELECT count(*) FROM detections d, jsonb_array_elements(d.queries) q WHERE d.id=NEW.detection_id AND d.library_type='production'
      AND q->>'id'=NEW.selected_query_id AND q->>'language'=NEW.query_language AND length(trim(q->>'query'))>0) <> 1 THEN
    RAISE EXCEPTION 'Invalid SIEM query binding';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION siem_private.guard_binding() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER siem_binding_query BEFORE INSERT OR UPDATE OF detection_id,selected_query_id,query_language,provider,integration_id
  ON public.siem_rule_bindings FOR EACH ROW EXECUTE FUNCTION siem_private.guard_binding();
-- Trigger privilege is needed to enforce bindings even when a shared-library editor cannot SELECT them.
CREATE OR REPLACE FUNCTION siem_private.guard_detection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE b siem_rule_bindings;
BEGIN
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('service_role','none') THEN RAISE EXCEPTION 'Authentication required'; END IF;
  FOR b IN SELECT * FROM siem_rule_bindings WHERE detection_id=OLD.id AND binding_status='active' LOOP
    IF NEW.library_type <> 'production' OR (SELECT count(*) FROM jsonb_array_elements(NEW.queries) q WHERE q->>'id'=b.selected_query_id) <> 1 OR
      (SELECT count(*) FROM jsonb_array_elements(NEW.queries) q WHERE q->>'id'=b.selected_query_id
      AND q->>'language'=b.query_language AND length(trim(q->>'query'))>0) <> 1 THEN
      RAISE EXCEPTION 'Reassign or detach the SIEM binding before removing its selected query';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE detection_id=OLD.id) AND
    (NEW.version IS DISTINCT FROM OLD.version OR NEW.queries IS DISTINCT FROM OLD.queries OR NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description OR NEW.severity IS DISTINCT FROM OLD.severity) THEN
    NEW.version := greatest(NEW.version,OLD.version+1);
    INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(NEW.id,to_jsonb(NEW),
      coalesce((SELECT jsonb_object_agg(id::text,desired_content) FROM siem_rule_bindings WHERE detection_id=NEW.id),'{}'),auth.uid());
  END IF;
  IF NEW.status='Archived' AND OLD.status IS DISTINCT FROM 'Archived' THEN
    UPDATE siem_rule_bindings SET binding_status='tombstone' WHERE detection_id=OLD.id AND binding_status='active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION siem_private.guard_detection() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER siem_detection_revision BEFORE UPDATE ON public.detections FOR EACH ROW EXECUTE FUNCTION siem_private.guard_detection();

REVOKE ALL ON FUNCTION public.siem_can_import(uuid,uuid), public.siem_start_sync(uuid,uuid,text), public.siem_claim_sync(),
  public.siem_commit_chunk(uuid,uuid,text[],integer,boolean,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_can_import(uuid,uuid), public.siem_start_sync(uuid,uuid,text), public.siem_claim_sync(),
  public.siem_commit_chunk(uuid,uuid,text[],integer,boolean,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_accept_remote(p_actor uuid,p_binding uuid,p_snapshot uuid,p_version integer,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections; c jsonb;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Only an authorized detection owner can accept production changes'; END IF;
  IF d.version IS DISTINCT FROM p_version OR b.latest_remote_snapshot_id IS DISTINCT FROM p_snapshot OR b.pending_operation_id IS NOT NULL
    OR b.availability<>'present' THEN RAISE EXCEPTION 'Review is stale'; END IF;
  SELECT content INTO c FROM siem_rule_snapshots WHERE id=p_snapshot AND binding_id=b.id AND content_hash=p_hash;
  IF c IS NULL THEN RAISE EXCEPTION 'Review is stale'; END IF;
  UPDATE siem_rule_bindings SET desired_content=c WHERE id=b.id;
  UPDATE detections SET name=c->>'name',description=c->>'description',severity=c->>'severity',"updatedDate"=now(),version=version+1,
    queries=(SELECT jsonb_agg(CASE WHEN q->>'id'=b.selected_query_id THEN q || jsonb_build_object('query',c->>'query','updatedDate',now()) ELSE q END)
      FROM jsonb_array_elements(queries) q),
    "detectionQuery"=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(queries) q WHERE q->>'id'=b.selected_query_id AND (q->>'isPrimary')::boolean)
      THEN c->>'query' ELSE "detectionQuery" END
    WHERE id=d.id;
  UPDATE siem_rule_bindings SET baseline_snapshot_id=p_snapshot,desired_content=c WHERE id=b.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action,detail) VALUES(b.id,p_actor,'accepted_remote',jsonb_build_object('snapshot_id',p_snapshot));
END $$;

CREATE OR REPLACE FUNCTION public.siem_begin_deployment(p_actor uuid,p_binding uuid,p_version integer,p_hash text,p_content jsonb,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections; p profiles; op uuid;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding;
  IF NOT FOUND THEN RAISE EXCEPTION 'Binding not found'; END IF;
  PERFORM 1 FROM integrations WHERE id=b.integration_id FOR UPDATE;
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' OR b.availability<>'present' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO p FROM profiles WHERE id=p_actor;
  IF coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:sync' OR
    NOT (p.role IN ('owner','admin','lead') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:sync') THEN RAISE EXCEPTION 'Deploy permission denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Authorized detection owner required'; END IF;
  IF d.library_type<>'production' OR d.status NOT IN ('Review','Testing','Production') THEN RAISE EXCEPTION 'Review this detection before deploying'; END IF;
  IF b.pending_operation_id IS NOT NULL OR EXISTS(SELECT 1 FROM siem_sync_runs WHERE integration_id=b.integration_id AND status IN ('queued','running')) THEN RAISE EXCEPTION 'Sync or production operation in progress'; END IF;
  IF d.version IS DISTINCT FROM p_version OR NOT EXISTS(SELECT 1 FROM siem_rule_snapshots WHERE id=b.latest_remote_snapshot_id AND content_hash=p_hash)
    OR (p_action='update' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.queries) q WHERE q->>'id'=b.selected_query_id AND q->>'query'=p_content->>'query' AND q->>'language'=b.query_language)) THEN RAISE EXCEPTION 'Review is stale'; END IF;
  IF p_action NOT IN ('update','enable','disable','delete') THEN RAISE EXCEPTION 'Unsupported operation'; END IF;
  INSERT INTO deployment_history(user_id,integration_id,detection_id,native_binding_id,action,status,vendor_rule_id,query_language,deployed_query,rule_config,detection_version,started_at,response)
    VALUES(p_actor,b.integration_id,d.id,b.id,p_action,'in_progress',b.vendor_rule_id,b.query_language,p_content->>'query',p_content,p_version,now(),jsonb_build_object('verification','pending')) RETURNING id INTO op;
  UPDATE siem_rule_bindings SET pending_operation_id=op WHERE id=b.id;
  RETURN op;
END $$;

CREATE OR REPLACE FUNCTION public.siem_save_local(p_actor uuid,p_binding uuid,p_version integer,p_content jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b siem_rule_bindings; d detections;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id=p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor,b.integration_id) OR b.binding_status<>'active' THEN RAISE EXCEPTION 'Binding access denied'; END IF;
  SELECT * INTO d FROM detections WHERE id=b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) OR d.version IS DISTINCT FROM p_version OR b.pending_operation_id IS NOT NULL THEN RAISE EXCEPTION 'Local revision changed or access denied'; END IF;
  IF p_content->>'language' <> b.query_language OR length(trim(p_content->>'query'))=0 OR length(trim(p_content->>'name'))=0
    OR p_content->>'severity' NOT IN ('Critical','High','Medium','Low','Informational','Unknown') THEN RAISE EXCEPTION 'Invalid local rule'; END IF;
  UPDATE siem_rule_bindings SET desired_content=p_content WHERE id=b.id;
  UPDATE detections SET name=p_content->>'name',description=p_content->>'description',severity=p_content->>'severity',
    version=version+1,"updatedDate"=now(),
    queries=(SELECT jsonb_agg(CASE WHEN q->>'id'=b.selected_query_id THEN q || jsonb_build_object('query',p_content->>'query','updatedDate',now()) ELSE q END)
      FROM jsonb_array_elements(queries) q),
    "detectionQuery"=CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(queries) q WHERE q->>'id'=b.selected_query_id AND (q->>'isPrimary')::boolean)
      THEN p_content->>'query' ELSE "detectionQuery" END WHERE id=d.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,p_actor,'saved_local_revision');
END $$;
REVOKE ALL ON FUNCTION public.siem_save_local(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_save_local(uuid,uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_finish_deployment(p_operation uuid,p_actor uuid,p_content jsonb,p_raw jsonb,p_hash text,p_raw_hash text,p_adapter text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op deployment_history; b siem_rule_bindings; snap uuid;
BEGIN
  SELECT * INTO op FROM deployment_history WHERE id=p_operation AND user_id=p_actor AND status='in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operation no longer active'; END IF;
  SELECT * INTO b FROM siem_rule_bindings WHERE id=op.native_binding_id AND pending_operation_id=op.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operation superseded'; END IF;
  IF p_content IS NOT NULL THEN
    INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(b.id,p_adapter,p_hash,p_raw_hash,p_content,p_raw) ON CONFLICT DO NOTHING;
    SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=p_adapter AND content_hash=p_hash AND raw_hash=p_raw_hash;
    UPDATE siem_rule_bindings SET baseline_snapshot_id=snap,latest_remote_snapshot_id=snap,desired_content=p_content,
      observed_enabled=(p_content->>'enabled')::boolean,last_seen_at=now(),pending_operation_id=NULL WHERE id=b.id;
  ELSE
    UPDATE siem_rule_bindings SET availability='missing',pending_operation_id=NULL WHERE id=b.id;
  END IF;
  UPDATE deployment_history SET status='success',completed_at=now(),response=jsonb_build_object('verification','verified'),detection_hash=p_hash WHERE id=op.id;
  INSERT INTO siem_rule_events(binding_id,actor_id,action,detail) VALUES(b.id,p_actor,op.action,jsonb_build_object('deployment_id',op.id,'verification','verified'));
END $$;

CREATE OR REPLACE FUNCTION public.siem_fail_deployment(p_operation uuid,p_actor uuid,p_uncertain boolean,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op deployment_history;
BEGIN
  UPDATE deployment_history SET status='failed',completed_at=now(),error_message=p_error,
    response=jsonb_build_object('verification',CASE WHEN p_uncertain THEN 'unverified' ELSE 'not_applied' END)
    WHERE id=p_operation AND user_id=p_actor AND status='in_progress' RETURNING * INTO op;
  IF FOUND THEN
    UPDATE siem_rule_bindings SET pending_operation_id=CASE WHEN p_uncertain THEN p_operation ELSE NULL END
      WHERE id=op.native_binding_id AND pending_operation_id=p_operation;
  END IF;
END $$;
-- An explicit reconciliation decision, for a link whose query differs from production.
-- siem_link_existing leaves baseline_snapshot_id NULL in that case, which the comparison now
-- reports as 'no_baseline' rather than refusing to open. Two decisions can resolve it:
-- siem_accept_remote (take production's version, overwriting the library copy), or this one --
-- keep the library version and record that it was reconciled against this production revision.
-- Both set the baseline; only accept_remote changes content. Guards mirror siem_accept_remote.
CREATE OR REPLACE FUNCTION public.siem_reconcile_baseline(p_actor uuid, p_binding uuid, p_snapshot uuid,
  p_version integer, p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE b siem_rule_bindings; d detections;
BEGIN
  SELECT * INTO b FROM siem_rule_bindings WHERE id = p_binding FOR UPDATE;
  IF NOT FOUND OR NOT siem_can_import(p_actor, b.integration_id) OR b.binding_status <> 'active' THEN
    RAISE EXCEPTION 'Binding access denied';
  END IF;
  SELECT * INTO d FROM detections WHERE id = b.detection_id FOR UPDATE;
  IF d.user_id IS DISTINCT FROM p_actor OR NOT siem_can_edit(p_actor) THEN
    RAISE EXCEPTION 'Only an authorized detection owner can reconcile this rule';
  END IF;
  IF d.version IS DISTINCT FROM p_version OR b.latest_remote_snapshot_id IS DISTINCT FROM p_snapshot
     OR b.pending_operation_id IS NOT NULL OR b.availability <> 'present' THEN
    RAISE EXCEPTION 'Review is stale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM siem_rule_snapshots
                  WHERE id = p_snapshot AND binding_id = b.id AND content_hash = p_hash) THEN
    RAISE EXCEPTION 'Review is stale';
  END IF;

  -- Content is untouched on purpose: the user is keeping the library version and agreeing that
  -- this is the production revision they diverged from. The comparison then reads 'local_changed'.
  UPDATE siem_rule_bindings SET baseline_snapshot_id = p_snapshot WHERE id = b.id;
  INSERT INTO siem_rule_events(binding_id, actor_id, action, detail)
  VALUES(b.id, p_actor, 'reconciled_baseline', jsonb_build_object('snapshot_id', p_snapshot));
END $$;
REVOKE ALL ON FUNCTION public.siem_reconcile_baseline(uuid,uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_reconcile_baseline(uuid,uuid,uuid,integer,text) TO service_role;

REVOKE ALL ON FUNCTION public.siem_accept_remote(uuid,uuid,uuid,integer,text),
  public.siem_begin_deployment(uuid,uuid,integer,text,jsonb,text), public.siem_finish_deployment(uuid,uuid,jsonb,jsonb,text,text,text),
  public.siem_fail_deployment(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_accept_remote(uuid,uuid,uuid,integer,text),
  public.siem_begin_deployment(uuid,uuid,integer,text,jsonb,text), public.siem_finish_deployment(uuid,uuid,jsonb,jsonb,text,text,text),
  public.siem_fail_deployment(uuid,uuid,boolean,text) TO service_role;

-- Reuse the existing installation's Vault dispatcher secrets. Fresh installs can configure them later.
CREATE OR REPLACE FUNCTION public.siem_disconnect(p_actor uuid,p_integration uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p profiles;
BEGIN
  PERFORM 1 FROM integrations WHERE id=p_integration AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection access denied'; END IF;
  SELECT * INTO p FROM profiles WHERE id=p_actor;
  IF p.status='deactivated' OR coalesce(p.permission_overrides->'revoked','[]'::jsonb) ? 'integrations:configure' OR
    NOT (p.role IN ('owner','admin') OR coalesce(p.permission_overrides->'granted','[]'::jsonb) ? 'integrations:configure') THEN RAISE EXCEPTION 'Configure permission required'; END IF;
  IF EXISTS (SELECT 1 FROM deployment_history WHERE integration_id=p_integration AND native_binding_id IS NOT NULL
    AND status='in_progress' AND started_at > now()-interval '90 seconds') THEN RAISE EXCEPTION 'Production operation in progress'; END IF;
  UPDATE integrations SET archived_at=now(),is_default=false,status='disabled',config=config-'_dev_credentials' WHERE id=p_integration;
  DELETE FROM integration_credentials WHERE integration_id=p_integration;
  UPDATE siem_sync_runs SET status='cancelled',completed_at=now(),lease_token=NULL,lease_expires_at=NULL
    WHERE integration_id=p_integration AND status IN ('queued','running');
END $$;
REVOKE ALL ON FUNCTION public.siem_disconnect(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_disconnect(uuid,uuid) TO service_role;

-- Native SIEM retention schedule and worker health
-- Milestone 4: operational readiness.
--
-- siem_prune_remote_snapshots has existed since 20260915132000 but nothing ever called it, so the
-- retention policy was a function, not a policy: every observation of every rule accumulated
-- forever. This schedules it, records each run's outcome so a silent failure is visible, and gives
-- operators a way to see a stalled job -- the exit gate for this milestone is that they can
-- identify and recover one.

-- Outcome log. Deliberately holds counts and error text only: no rule content, no vendor payloads,
-- no credentials. Retention that leaks what it pruned would defeat its own purpose.
CREATE TABLE IF NOT EXISTS public.siem_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL CHECK (task IN ('snapshot_retention')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  connections_processed integer NOT NULL DEFAULT 0,
  connections_failed integer NOT NULL DEFAULT 0,
  snapshots_removed integer NOT NULL DEFAULT 0,
  error_message text
);
CREATE INDEX IF NOT EXISTS siem_maintenance_runs_recent
  ON public.siem_maintenance_runs(task, started_at DESC);

ALTER TABLE public.siem_maintenance_runs ENABLE ROW LEVEL SECURITY;
-- No policy for authenticated on purpose: these rows span every connection in the installation,
-- so there is no owner to scope them to. Operators read them as service_role.
REVOKE ALL ON public.siem_maintenance_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siem_maintenance_runs TO service_role;

-- Prunes superseded catalog observations across every connection, one connection at a time.
--
-- A failure on one connection must not abort the rest: the loop records it and carries on, and the
-- run is reported as partially failed rather than silently half-done. p_keep is passed through to
-- siem_prune_remote_snapshots, which already refuses to touch the snapshot a catalog row points
-- at, any snapshot belonging to a rule with a pending import, or any binding snapshot.
CREATE OR REPLACE FUNCTION public.siem_run_retention(p_keep integer DEFAULT 5)
RETURNS public.siem_maintenance_runs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE run siem_maintenance_runs; conn record; removed integer; total integer := 0;
  ok integer := 0; bad integer := 0; last_error text;
BEGIN
  INSERT INTO siem_maintenance_runs(task) VALUES('snapshot_retention') RETURNING * INTO run;

  FOR conn IN SELECT id FROM integrations
    WHERE provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle']) LOOP
    BEGIN
      removed := siem_prune_remote_snapshots(conn.id, p_keep);
      total := total + coalesce(removed, 0);
      ok := ok + 1;
    EXCEPTION WHEN OTHERS THEN
      -- SQLERRM only: a vendor payload must never reach this table.
      bad := bad + 1;
      last_error := SQLERRM;
    END;
  END LOOP;

  UPDATE siem_maintenance_runs
     SET finished_at = now(), connections_processed = ok, connections_failed = bad,
         snapshots_removed = total, error_message = last_error
   WHERE id = run.id
  RETURNING * INTO run;
  RETURN run;
END $$;
REVOKE ALL ON FUNCTION public.siem_run_retention(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_run_retention(integer) TO service_role;

-- What an operator needs to answer "is anything stuck, and what do I do about it".
--
-- A job holds a 45-second lease (siem_claim_sync) and is requeued by the worker's fenced catch on
-- failure. The states that need a human are: a run whose lease expired without the worker coming
-- back, and a run that has exhausted its attempts. Both are invisible in the product UI, which
-- only ever shows the LATEST run for a connection.
CREATE OR REPLACE VIEW public.siem_worker_health WITH (security_invoker = true) AS
SELECT r.id AS run_id, r.integration_id, i.name AS connection_name, r.kind, r.status, r.phase,
       r.attempts, r.created_at, r.heartbeat_at, r.next_attempt_at, r.error_message,
       (SELECT count(*) FROM siem_sync_items s WHERE s.run_id = r.id AND s.status = 'pending') AS pending_items,
       CASE
         WHEN r.status = 'running' AND r.lease_expires_at IS NOT NULL AND r.lease_expires_at <= now()
           THEN 'lease expired; the dispatcher will reclaim it, or retry the import'
         WHEN r.status = 'failed'
           THEN 'gave up after repeated failures; retry the import to resume its pending rules'
         WHEN r.status = 'queued' AND r.next_attempt_at > now()
           THEN 'backing off before the next attempt'
         ELSE 'healthy'
       END AS diagnosis
  FROM siem_sync_runs r
  JOIN integrations i ON i.id = r.integration_id
 WHERE r.status IN ('queued', 'running', 'failed');
REVOKE ALL ON public.siem_worker_health FROM PUBLIC, anon;
GRANT SELECT ON public.siem_worker_health TO authenticated, service_role;

-- Nightly, off the minute the sync dispatcher runs. Plain SQL with no vendor calls, so it is a
-- direct function call like ai_usage_rollup rather than a round trip through the Edge Function.
-- Guarded the same way native-siem-sync is: a database without pg_cron (a fresh clone, or the CI
-- Postgres image) must still apply this file cleanly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('native-siem-retention','17 3 * * *',
      $job$ SELECT public.siem_run_retention(5) $job$);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    PERFORM cron.schedule('native-siem-sync','* * * * *',$job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tr_supabase_url') || '/functions/v1/integration-ops',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='tr_service_role_key')),
        body := '{"action":"native_sync_tick"}'::jsonb
      ) WHERE EXISTS (SELECT 1 FROM public.siem_sync_runs WHERE status IN ('queued','running'))
        AND (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ('tr_supabase_url','tr_service_role_key'))=2;
    $job$);
  END IF;
END $$;

-- Native SIEM library deletion
-- Library deletion is local only. Existing detection DELETE RLS authorizes the row;
-- private trigger cleanup handles operational tables unavailable to ordinary editors.
CREATE OR REPLACE FUNCTION siem_private.delete_library_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE connection_id uuid;
BEGIN
  IF auth.uid() IS NULL AND current_setting('role',true) NOT IN ('service_role','none') THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  FOR connection_id IN SELECT DISTINCT integration_id FROM siem_rule_bindings WHERE detection_id=OLD.id ORDER BY integration_id LOOP
    PERFORM 1 FROM integrations WHERE id=connection_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM siem_sync_runs WHERE integration_id=connection_id AND status IN ('queued','running')) THEN
      RAISE EXCEPTION 'Rules are being fetched from this SIEM. Wait for the fetch to finish, then delete the library copy.';
    END IF;
  END LOOP;
  PERFORM 1 FROM siem_rule_bindings WHERE detection_id=OLD.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM siem_rule_bindings WHERE detection_id=OLD.id AND pending_operation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This rule has an unfinished SIEM operation. Fetch its latest SIEM state before deleting the library copy.';
  END IF;
  -- Keep actual deployment records (including remote identity), but unlink import tracking.
  UPDATE deployment_history SET native_binding_id=NULL WHERE native_binding_id IN
    (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  UPDATE siem_rule_bindings SET baseline_snapshot_id=NULL,latest_remote_snapshot_id=NULL WHERE detection_id=OLD.id;
  DELETE FROM siem_rule_events WHERE binding_id IN (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  DELETE FROM siem_rule_snapshots WHERE binding_id IN (SELECT id FROM siem_rule_bindings WHERE detection_id=OLD.id);
  DELETE FROM siem_local_revisions WHERE detection_id=OLD.id;
  DELETE FROM siem_rule_bindings WHERE detection_id=OLD.id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION siem_private.delete_library_rule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER siem_delete_library_rule BEFORE DELETE ON public.detections
  FOR EACH ROW EXECUTE FUNCTION siem_private.delete_library_rule();

-- Native SIEM inventory catalog (20260915120000)
-- Observation catalog: what exists in the connected SIEM, recorded without creating any
-- library detection. Adoption into the library happens only in an import_selection job.
CREATE TABLE public.siem_remote_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['crowdstrike','splunk','sentinel','elastic','defender_xdr','chronicle'])),
  provider_scope text NOT NULL,
  vendor_rule_id text NOT NULL CHECK (length(vendor_rule_id) > 0),
  rule_family text NOT NULL DEFAULT 'correlation',
  display_name text NOT NULL DEFAULT '',
  observed_enabled boolean,
  availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('present','missing','unknown')),
  normalization_error text,
  match_candidate_count integer NOT NULL DEFAULT 0,
  latest_snapshot_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_complete_run_id uuid REFERENCES public.siem_sync_runs(id),
  UNIQUE (integration_id, provider_scope, vendor_rule_id),
  UNIQUE (id, integration_id)
);
CREATE INDEX siem_remote_rules_connection ON public.siem_remote_rules(integration_id, display_name);
ALTER TABLE public.siem_sync_items ADD COLUMN remote_rule_id uuid REFERENCES public.siem_remote_rules(id) ON DELETE SET NULL;

CREATE TABLE public.siem_remote_rule_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_rule_id uuid NOT NULL REFERENCES public.siem_remote_rules(id) ON DELETE CASCADE,
  adapter_version text NOT NULL,
  content_hash text NOT NULL,
  raw_hash text NOT NULL,
  content jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (remote_rule_id, adapter_version, content_hash, raw_hash),
  UNIQUE (remote_rule_id, id)
);
ALTER TABLE public.siem_remote_rules ADD CONSTRAINT siem_remote_latest_owner
  FOREIGN KEY (id, latest_snapshot_id)
  REFERENCES public.siem_remote_rule_snapshots(remote_rule_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.siem_sync_items ADD COLUMN observed_snapshot_id uuid REFERENCES public.siem_remote_rule_snapshots(id) ON DELETE SET NULL;

ALTER TABLE public.siem_remote_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_remote_rule_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siem_remote_rules, public.siem_remote_rule_snapshots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_remote_rules, public.siem_remote_rule_snapshots TO authenticated;
GRANT ALL ON public.siem_remote_rules, public.siem_remote_rule_snapshots TO service_role;
CREATE POLICY siem_remote_rules_read ON public.siem_remote_rules FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = integration_id AND i.user_id = auth.uid()));
CREATE POLICY siem_remote_snapshots_read ON public.siem_remote_rule_snapshots FOR SELECT TO authenticated USING
  (EXISTS (SELECT 1 FROM public.siem_remote_rules r WHERE r.id = remote_rule_id));

-- Task 12: resolve ambiguous match_needed rows (mirrors migration 20260915140000).
-- One row per (candidate detection, compatible CQL query). Evidence is restricted to a current
-- successful deployment against this exact vendor rule, or a legacy external_id match on a
-- non-native detection — a matching display name alone is never evidence.
-- Legacy projections used Splunk saved-search names and Elastic saved-object IDs.
-- These aliases are candidate evidence only: linking still requires explicit selection,
-- detection ownership, a compatible selected query and the reviewed catalog snapshot.
CREATE OR REPLACE FUNCTION public.siem_legacy_rule_id(p_provider text,p_raw jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_provider WHEN 'splunk' THEN p_raw->>'name' WHEN 'elastic' THEN p_raw->>'id' ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.siem_legacy_rule_id(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siem_legacy_rule_id(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.siem_match_candidates(p_actor uuid, p_integration uuid, p_vendor_rule_id text)
RETURNS TABLE(detection_id text, detection_name text, evidence text, query_id text, query_language text,
  query_text text, detection_version integer)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE prov text; qlang text; rule_content jsonb; rule_raw jsonb; legacy_id text;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RETURN;
  END IF;
  SELECT provider INTO prov FROM integrations WHERE id = p_integration;
  SELECT s.content,s.raw_payload INTO rule_content,rule_raw
    FROM siem_remote_rules rr
    JOIN siem_remote_rule_snapshots s ON s.id = rr.latest_snapshot_id
   WHERE rr.integration_id = p_integration AND rr.vendor_rule_id = p_vendor_rule_id
   ORDER BY rr.last_seen_at DESC LIMIT 1;
  qlang := siem_rule_query_language(prov, coalesce(rule_content, '{}'::jsonb));
  legacy_id := siem_legacy_rule_id(prov,rule_raw);
  RETURN QUERY
  WITH deployed AS (
    SELECT DISTINCT h.detection_id
      FROM deployment_history h
      JOIN detections x ON x.id = h.detection_id
     WHERE h.integration_id = p_integration AND h.vendor_rule_id IN (p_vendor_rule_id,legacy_id)
       AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = p_actor
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ),
  legacy AS (
    SELECT d.id AS detection_id
      FROM detections d
     WHERE d.user_id = p_actor AND (d.external_id = p_vendor_rule_id OR (d.external_id=legacy_id AND d.source=prov)) AND d.native_provenance IS NULL
       AND d.id NOT IN (SELECT deployed.detection_id FROM deployed)
  ),
  evidenced AS (
    SELECT deployed.detection_id, 'Deployment history matches this connection; verify the remote scope'::text AS evidence FROM deployed
    UNION ALL
    SELECT legacy.detection_id, 'Legacy external ID matches'::text FROM legacy
  )
  SELECT d.id, d.name, e.evidence, q ->> 'id', q ->> 'language', q ->> 'query', d.version
    FROM evidenced e
    JOIN detections d ON d.id = e.detection_id AND d.user_id = p_actor AND d.library_type = 'production'
    CROSS JOIN LATERAL jsonb_array_elements(d.queries) q
   WHERE q ->> 'language' = qlang AND length(trim(q ->> 'query')) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.siem_match_candidates(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_match_candidates(uuid, uuid, text) TO service_role;

-- Links an already-authored library detection to a CrowdStrike rule as its native binding,
-- without rewriting the detection's own provenance. The adoption is recorded as a
-- siem_rule_events row, not as a change to source/external_id/user_id/native_provenance.
CREATE OR REPLACE FUNCTION public.siem_link_existing(
  p_actor uuid, p_integration uuid, p_vendor_rule_id text, p_detection text,
  p_query_id text, p_detection_version integer, p_snapshot uuid)
RETURNS public.siem_rule_bindings
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  d detections;
  rr siem_remote_rules;
  rrs siem_remote_rule_snapshots;
  qtext text;
  qcount integer;
  b siem_rule_bindings;
  new_snap uuid;
  evidence text;
  prov text;
  qlang text;
BEGIN
  IF NOT (siem_can_import(p_actor, p_integration) AND siem_can_edit(p_actor)) THEN
    RAISE EXCEPTION 'Linking this rule needs permission to import from this connection and edit the target rule';
  END IF;

  SELECT provider INTO prov FROM integrations WHERE id = p_integration FOR UPDATE;

  -- Pinned to the exact catalog row the snapshot belongs to, not just (integration, vendor_rule_id):
  -- the table's real uniqueness is (integration_id, provider_scope, vendor_rule_id), and this
  -- avoids needing provider_scope as a separate input. Fetched up front (not just before the
  -- insert) because the rule's own snapshot content is now also what determines qlang.
  SELECT * INTO rr FROM siem_remote_rules
   WHERE integration_id = p_integration AND vendor_rule_id = p_vendor_rule_id
     AND id = (SELECT remote_rule_id FROM siem_remote_rule_snapshots WHERE id = p_snapshot)
   FOR UPDATE;
  IF NOT FOUND OR rr.latest_snapshot_id IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'The rule changed in the SIEM. Fetch rules again.';
  END IF;
  SELECT * INTO rrs FROM siem_remote_rule_snapshots WHERE id = p_snapshot AND remote_rule_id = rr.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rule changed in the SIEM. Fetch rules again.';
  END IF;
  qlang := siem_rule_query_language(prov, rrs.content);

  SELECT * INTO d FROM detections WHERE id = p_detection FOR UPDATE;
  IF NOT FOUND OR d.user_id <> p_actor OR d.version <> p_detection_version THEN
    RAISE EXCEPTION 'The library rule changed. Reopen the match and try again.';
  END IF;

  SELECT count(*), max(q ->> 'query') INTO qcount, qtext
    FROM jsonb_array_elements(d.queries) q
   WHERE q ->> 'id' = p_query_id AND q ->> 'language' = qlang AND length(trim(q ->> 'query')) > 0;
  IF qcount <> 1 THEN
    RAISE EXCEPTION 'Choose the query this rule corresponds to';
  END IF;

  -- A matching name alone never authorises a link: re-derive evidence server-side rather than
  -- trusting that the caller only offers detections siem_match_candidates actually returned.
  IF EXISTS (
    SELECT 1 FROM deployment_history h
     WHERE h.integration_id = p_integration AND h.vendor_rule_id IN (p_vendor_rule_id,siem_legacy_rule_id(prov,rrs.raw_payload))
       AND h.detection_id = p_detection AND h.status = 'success' AND h.action <> 'delete'
       AND NOT EXISTS (
         SELECT 1 FROM deployment_history later
          WHERE later.integration_id = h.integration_id AND later.vendor_rule_id = h.vendor_rule_id
            AND later.status = 'success' AND later.action = 'delete' AND later.created_at > h.created_at)
  ) THEN
    evidence := 'Deployed to this connection as this rule';
  ELSIF (d.external_id = p_vendor_rule_id OR (d.external_id=siem_legacy_rule_id(prov,rrs.raw_payload) AND d.source=prov)) AND d.native_provenance IS NULL THEN
    evidence := 'Legacy external ID matches';
  END IF;
  IF evidence IS NULL THEN
    RAISE EXCEPTION 'This rule is not an eligible match for the selected library rule';
  END IF;

  BEGIN
    INSERT INTO siem_rule_bindings(
      detection_id, integration_id, provider, provider_scope, vendor_rule_id,
      selected_query_id, query_language, desired_content)
    VALUES(p_detection, p_integration, prov, rr.provider_scope, p_vendor_rule_id,
      p_query_id, qlang, rrs.content)
    RETURNING * INTO b;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This rule is already linked to a library rule.';
  END;

  -- Insert the copied snapshot after the binding exists, then point both snapshot FKs at it in
  -- one UPDATE — the binding's snapshot FKs are DEFERRABLE INITIALLY DEFERRED, so this ordering
  -- is safe within the transaction.
  INSERT INTO siem_rule_snapshots(binding_id, adapter_version, content_hash, raw_hash, content, raw_payload)
    VALUES(b.id, rrs.adapter_version, rrs.content_hash, rrs.raw_hash, rrs.content, rrs.raw_payload)
  RETURNING id INTO new_snap;

  UPDATE siem_rule_bindings
     SET latest_remote_snapshot_id = new_snap,
         -- No agreed baseline is invented: only set when the chosen query already matches the
         -- observed remote query. Otherwise NULL, surfaced by the UI as "Baseline not established".
         baseline_snapshot_id = CASE WHEN qtext = (rrs.content ->> 'query') THEN new_snap ELSE NULL END,
         observed_enabled = rr.observed_enabled, availability = rr.availability, last_seen_at = now()
   WHERE id = b.id
  RETURNING * INTO b;

  -- The existing rule's identity is untouched: no update to detections.source, external_id,
  -- user_id or native_provenance. The adoption is recorded only as this event.
  INSERT INTO siem_rule_events(binding_id, actor_id, action, detail)
  VALUES(b.id, p_actor, 'linked_existing',
    jsonb_build_object('evidence', evidence, 'source', d.source, 'vendor_rule_id', p_vendor_rule_id));

  RETURN b;
END;
$$;
REVOKE ALL ON FUNCTION public.siem_link_existing(uuid, uuid, text, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_link_existing(uuid, uuid, text, text, text, integer, uuid) TO service_role;

-- Task 12 fix (mirrors migration 20260915141000). "Import as a separate rule" IS the user
-- resolving the ambiguity: clear the candidate count so the ordinary, unmodified import path
-- (siem_start_import, applied and unchanged) sees the rule as not_in_library and can adopt it.
-- Keyed on the catalog row's own primary key, not (integration_id, vendor_rule_id): that pair
-- is not unique on its own -- the real constraint is (integration_id, provider_scope,
-- vendor_rule_id) -- and a non-STRICT SELECT INTO against it would silently take an arbitrary
-- matching row if a connection ever held two provider scopes sharing a vendor_rule_id.
CREATE OR REPLACE FUNCTION public.siem_dismiss_match_candidates(p_actor uuid, p_integration uuid,
  p_remote_rule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE rr siem_remote_rules;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF NOT siem_can_edit(p_actor) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  SELECT * INTO rr FROM siem_remote_rules
   WHERE id = p_remote_rule_id AND integration_id = p_integration FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fetch rules from CrowdStrike before importing'; END IF;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings
              WHERE integration_id = p_integration AND provider_scope = rr.provider_scope
                AND vendor_rule_id = rr.vendor_rule_id) THEN
    RAISE EXCEPTION 'This rule is already linked to a library rule.';
  END IF;
  UPDATE siem_remote_rules SET match_candidate_count = 0 WHERE id = rr.id;
END $$;
REVOKE ALL ON FUNCTION public.siem_dismiss_match_candidates(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_dismiss_match_candidates(uuid, uuid, uuid) TO service_role;

-- The ONE definition of a rule's relationship to the library. SQL owns it; the browser
-- reads the computed column. Order matters: an adopted rule is "already in library" even
-- if a later adapter version can no longer normalise it.
CREATE OR REPLACE FUNCTION public.siem_inventory_relationship(
  p_binding_status text, p_normalization_error text, p_match_candidate_count integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_binding_status = 'active' THEN 'already_in_library'
    WHEN p_binding_status IS NOT NULL THEN 'archived_in_library'
    WHEN p_normalization_error IS NOT NULL THEN 'unsupported'
    WHEN coalesce(p_match_candidate_count, 0) > 0 THEN 'match_needed'
    ELSE 'not_in_library' END;
$$;

CREATE VIEW public.siem_inventory_rows WITH (security_invoker = true) AS
SELECT r.id, r.integration_id, r.provider_scope, r.vendor_rule_id, r.rule_family, r.display_name,
       r.observed_enabled, r.availability, r.normalization_error, r.match_candidate_count,
       r.latest_snapshot_id, r.last_seen_at, r.first_seen_at,
       b.id AS binding_id, b.binding_status, b.detection_id,
       public.siem_inventory_relationship(b.binding_status, r.normalization_error,
         r.match_candidate_count) AS relationship
  FROM public.siem_remote_rules r
  LEFT JOIN public.siem_rule_bindings b
    ON b.integration_id = r.integration_id
   AND b.provider_scope = r.provider_scope
   AND b.vendor_rule_id = r.vendor_rule_id;
REVOKE ALL ON public.siem_inventory_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.siem_inventory_rows TO authenticated;

-- Classification counts for the filter chips. STABLE and SECURITY INVOKER so the caller's
-- RLS applies; the browser calls this directly rather than paying the Edge Function rate limit.
CREATE OR REPLACE FUNCTION public.siem_inventory_counts(p_integration uuid, p_search text DEFAULT NULL)
RETURNS TABLE(relationship text, rules bigint) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT v.relationship, count(*)
    FROM siem_inventory_rows v
   WHERE v.integration_id = p_integration
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
   GROUP BY v.relationship
  UNION ALL
  -- Not a relationship: the count the SELECTION BAR needs. The chips answer "what is this rule's
  -- relationship to the library", so not_in_library is the wrong number there -- a rule the last
  -- scan could not read, or one since deleted in CrowdStrike, is not_in_library but not
  -- importable. These are the same three conditions siem_start_import requires to freeze a row.
  SELECT 'importable', count(*)
    FROM siem_inventory_rows v
   WHERE v.integration_id = p_integration
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
     AND v.relationship = 'not_in_library'
     AND v.availability = 'present'
     AND v.latest_snapshot_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.siem_inventory_relationship(text,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.siem_inventory_counts(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siem_inventory_relationship(text,text,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.siem_inventory_counts(uuid,text) TO authenticated, service_role;

-- Backfill catalog identities from rules already adopted, so the inventory does not appear
-- empty on the migration boundary. Observed state comes from the binding's own last
-- observation; availability stays 'unknown' because this backfill read nothing from the
-- vendor. It creates no detection and fabricates no successful import. A real fetch fills
-- in display names, snapshots and availability.
INSERT INTO public.siem_remote_rules(integration_id, provider, provider_scope, vendor_rule_id,
  display_name, observed_enabled, availability, first_seen_at, last_seen_at)
SELECT b.integration_id, b.provider, b.provider_scope, b.vendor_rule_id,
       coalesce(d.name, b.vendor_rule_id), b.observed_enabled, 'unknown', b.first_seen_at, b.last_seen_at
  FROM public.siem_rule_bindings b
  LEFT JOIN public.detections d ON d.id = b.detection_id
ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO NOTHING;

-- Inventory jobs observe production. They never create a detection or a binding.
CREATE OR REPLACE FUNCTION public.siem_start_inventory(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope)
     OR EXISTS (SELECT 1 FROM siem_remote_rules WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND kind = 'inventory' AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version)
    VALUES(p_integration, p_actor, p_scope, 'inventory', 2) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.siem_commit_inventory_chunk(p_run uuid, p_lease uuid, p_ids text[],
  p_next integer, p_discovery_complete boolean, p_results jsonb, p_next_token text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; rr siem_remote_rules; snap uuid; cand integer; prov text;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'inventory'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id = r.integration_id;

  IF r.phase = 'discovery' THEN
    INSERT INTO siem_sync_items(run_id, vendor_rule_id) SELECT r.id, unnest(p_ids) ON CONFLICT DO NOTHING;
    UPDATE siem_sync_runs SET cursor_offset = p_next, cursor_token = p_next_token, discovery_complete = p_discovery_complete,
      phase = CASE WHEN p_discovery_complete THEN 'hydration' ELSE 'discovery' END WHERE id = r.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      IF NOT EXISTS (SELECT 1 FROM siem_sync_items
                      WHERE run_id = r.id AND vendor_rule_id = item->>'id' AND status = 'pending') THEN
        CONTINUE;
      END IF;

      -- Reset per item: snap is only assigned inside the content branch below, and an item
      -- without content must not inherit the previous iteration's snapshot.
      snap := NULL;

      -- Candidate evidence is computed once here, not per page render.
      SELECT count(DISTINCT h.detection_id) INTO cand FROM deployment_history h
        JOIN detections x ON x.id = h.detection_id
       WHERE h.integration_id = r.integration_id AND h.vendor_rule_id IN (item->>'id',siem_legacy_rule_id(prov,item->'raw'))
         AND h.status = 'success' AND h.action <> 'delete' AND x.user_id = r.actor_id
         AND NOT EXISTS (SELECT 1 FROM deployment_history later
                          WHERE later.integration_id = h.integration_id
                            AND later.vendor_rule_id = h.vendor_rule_id
                            AND later.status = 'success' AND later.action = 'delete'
                            AND later.created_at > h.created_at);
      IF cand = 0 AND EXISTS (SELECT 1 FROM detections
                               WHERE user_id = r.actor_id AND (external_id = item->>'id' OR (external_id=siem_legacy_rule_id(prov,item->'raw') AND source=prov))
                                 AND native_provenance IS NULL) THEN
        cand := 1;
      END IF;

      INSERT INTO siem_remote_rules(integration_id, provider, provider_scope, vendor_rule_id, rule_family,
        display_name, observed_enabled, availability, normalization_error, match_candidate_count, last_seen_at)
      VALUES(r.integration_id, prov, r.provider_scope, item->>'id',
        coalesce(item->>'family','correlation'), coalesce(item->>'name', item->>'id'),
        CASE WHEN item ? 'enabled' THEN (item->>'enabled')::boolean ELSE NULL END,
        'present', CASE WHEN item->>'status' = 'failed' THEN NULL ELSE item->>'error' END, cand, now())
      ON CONFLICT (integration_id, provider_scope, vendor_rule_id) DO UPDATE SET
        rule_family = excluded.rule_family,
        display_name = CASE WHEN item ? 'name' THEN excluded.display_name ELSE siem_remote_rules.display_name END,
        observed_enabled = excluded.observed_enabled,
        availability = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.availability ELSE 'present' END,
        normalization_error = CASE WHEN item->>'status' = 'failed' THEN siem_remote_rules.normalization_error ELSE excluded.normalization_error END,
        match_candidate_count = excluded.match_candidate_count, last_seen_at = now()
      RETURNING * INTO rr;

      -- The same observation the catalog just recorded, applied to the tracked binding. Without
      -- this the inventory table and the rule's own comparison disagree about the rule the user
      -- is looking at. desired_content and baseline_snapshot_id are deliberately untouched:
      -- local edits and agreed baselines are decisions, not observations.
      IF item->>'status' IS DISTINCT FROM 'failed' THEN
        UPDATE siem_rule_bindings SET availability='present',
          observed_enabled=CASE WHEN item ? 'enabled' THEN (item->>'enabled')::boolean ELSE observed_enabled END,
          last_seen_at=now(), last_sync_run_id=r.id
         WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
           AND vendor_rule_id=item->>'id' AND binding_status='active';
      ELSE
        UPDATE siem_rule_bindings SET availability='unknown'
         WHERE integration_id=r.integration_id AND provider_scope=r.provider_scope
           AND vendor_rule_id=item->>'id' AND binding_status='active';
      END IF;

      IF item ? 'content' THEN
        INSERT INTO siem_remote_rule_snapshots(remote_rule_id, adapter_version, content_hash, raw_hash,
          content, raw_payload)
          VALUES(rr.id, item->>'adapter', item->>'hash', item->>'raw_hash', item->'content', item->'raw')
          ON CONFLICT DO NOTHING;
        SELECT id INTO snap FROM siem_remote_rule_snapshots
          WHERE remote_rule_id = rr.id AND adapter_version = item->>'adapter'
            AND content_hash = item->>'hash' AND raw_hash = item->>'raw_hash';
        UPDATE siem_remote_rules SET latest_snapshot_id = snap WHERE id = rr.id;
      END IF;

      -- 'observed' (not 'unchanged') keeps job-outcome vocabulary distinct from library
      -- membership: an inventory scan never claims something was imported.
      -- The worker distinguishes "we read it but cannot normalise it" ('unsupported', a
      -- permanent property of the rule) from "CrowdStrike did not return it" ('failed', a
      -- transient read outcome). Only the latter blocks absence inference, so the hint is
      -- allowlisted rather than trusted verbatim.
      -- remote_rule_id / observed_snapshot_id are what make a completed run a reviewable
      -- artifact: siem_start_import freezes content from the snapshot THIS run saw, never from
      -- whatever the catalog happens to hold at submit time.
      UPDATE siem_sync_items
         SET status = CASE
               WHEN item->>'status' IN ('failed','unsupported') THEN item->>'status'
               WHEN item ? 'error' THEN 'unsupported'
               ELSE 'observed' END,
             error_message = item->>'error',
             remote_rule_id = rr.id,
             observed_snapshot_id = coalesce(snap, siem_sync_items.observed_snapshot_id)
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id = r.id AND status = 'pending') THEN
      -- Status and absence-inference are two different questions. Status reflects whether
      -- every item got a definite answer of any kind (matches legacy siem_commit_chunk's
      -- status IN ('failed','unsupported','ambiguous') reading of "partial").
      UPDATE siem_sync_runs
         SET status = CASE WHEN EXISTS (SELECT 1 FROM siem_sync_items
                                         WHERE run_id = r.id AND status IN ('failed','unsupported'))
                            THEN 'partial' ELSE 'complete' END,
             completed_at = now()
       WHERE id = r.id;
      -- Absence is a separate question from status. A rule we read but could not normalise
      -- ('unsupported') is still a definite answer that it exists, so it must not block the
      -- inference -- otherwise one permanently unsupported rule family would stop this
      -- connection from ever noticing a deleted rule. A 'failed' item is not a definite
      -- answer, so it does block it.
      IF r.discovery_complete AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                                               WHERE run_id = r.id AND status = 'failed') THEN
        UPDATE siem_remote_rules SET availability = 'missing'
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
           AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                            WHERE run_id = r.id AND vendor_rule_id = siem_remote_rules.vendor_rule_id);
        UPDATE siem_remote_rules SET last_complete_run_id = r.id
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope;
        -- Absence is only knowable from a job that enumerates production. refresh_tracked probes
        -- known ids one by one and pre-queues an item for each, so it can never observe that
        -- something is gone; a complete, failure-free discovery can.
        UPDATE siem_rule_bindings SET availability = 'missing', pending_operation_id = NULL
         WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
           AND binding_status = 'active'
           AND NOT EXISTS (SELECT 1 FROM siem_sync_items
                            WHERE run_id = r.id AND vendor_rule_id = siem_rule_bindings.vendor_rule_id);
      END IF;
    END IF;
  END IF;
  UPDATE siem_sync_runs SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(),
    attempts = 0, error_message = NULL WHERE id = r.id;
END $$;

REVOKE ALL ON FUNCTION public.siem_start_inventory(uuid,uuid,text),
  public.siem_commit_inventory_chunk(uuid,uuid,text[],integer,boolean,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_inventory(uuid,uuid,text),
  public.siem_commit_inventory_chunk(uuid,uuid,text[],integer,boolean,jsonb,text) TO service_role;

-- Re-observe rules already tracked in the library. Creates no detections: every queued id
-- already has an active binding.
CREATE OR REPLACE FUNCTION public.siem_start_refresh(p_actor uuid, p_integration uuid, p_scope text)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;
  IF EXISTS (SELECT 1 FROM siem_rule_bindings WHERE integration_id = p_integration AND provider_scope <> p_scope) THEN
    RAISE EXCEPTION 'Connection scope changed; create a new connection';
  END IF;
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND kind = 'refresh_tracked' AND status IN ('queued','running');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version, phase,
    discovery_complete)
    VALUES(p_integration, p_actor, p_scope, 'refresh_tracked', 2, 'hydration', true) RETURNING * INTO r;
  INSERT INTO siem_sync_items(run_id, vendor_rule_id)
    SELECT r.id, b.vendor_rule_id FROM siem_rule_bindings b
     WHERE b.integration_id = p_integration AND b.provider_scope = p_scope AND b.binding_status = 'active';
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_start_refresh(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_refresh(uuid,uuid,text) TO service_role;

-- Import jobs. Selection is frozen at submission into siem_sync_items; the worker adopts
-- only what was frozen, and only if production still matches what the user reviewed.
CREATE OR REPLACE FUNCTION public.siem_start_import(p_actor uuid, p_integration uuid, p_source_run uuid,
  p_ids text[], p_exclude text[], p_all_matching boolean, p_idempotency text,
  p_search text DEFAULT NULL, p_relationship text DEFAULT NULL)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; source siem_sync_runs; frozen integer;
BEGIN
  IF NOT siem_can_import(p_actor, p_integration) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency)) = 0 THEN
    RAISE EXCEPTION 'An import request key is required';
  END IF;
  PERFORM 1 FROM integrations WHERE id = p_integration FOR UPDATE;

  -- Repeating a submitted request returns the same job.
  SELECT * INTO r FROM siem_sync_runs
    WHERE integration_id = p_integration AND idempotency_key = p_idempotency;
  IF FOUND THEN RETURN r; END IF;

  SELECT * INTO source FROM siem_sync_runs WHERE id = p_source_run AND integration_id = p_integration;
  IF NOT FOUND OR source.kind <> 'inventory' THEN
    RAISE EXCEPTION 'Fetch rules from CrowdStrike before importing';
  END IF;
  IF p_all_matching AND (source.status <> 'complete' OR NOT source.discovery_complete) THEN
    RAISE EXCEPTION 'Importing every matching rule needs a completed check. Select the rules you can see instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = p_integration
               AND kind = 'import_selection' AND status IN ('queued','running')) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  INSERT INTO siem_sync_runs(integration_id, actor_id, provider_scope, kind, protocol_version, phase,
    discovery_complete, source_run_id, idempotency_key)
    VALUES(p_integration, p_actor, source.provider_scope, 'import_selection', 2, 'hydration', true,
           source.id, p_idempotency)
    RETURNING * INTO r;

  -- Freeze the identities and the exact content the user reviewed. Driving off the SOURCE RUN's
  -- items (not the catalog) is what binds the import to that scan: an identity the run never
  -- observed cannot be selected at all, by explicit id or by "all matching".
  --
  -- Relationship is deliberately read live from siem_inventory_rows rather than frozen: whether a
  -- rule is already in the library is a question about NOW, and re-importing something adopted
  -- since the scan would duplicate it. Content is the opposite -- it must be the reviewed
  -- revision -- so the hash comes from src.observed_snapshot_id.
  INSERT INTO siem_sync_items(run_id, vendor_rule_id, remote_rule_id, observed_snapshot_id,
    frozen_content_hash, status, error_message)
  SELECT r.id, v.vendor_rule_id, v.id, src.observed_snapshot_id, s.content_hash,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL
                   AND v.availability = 'present' AND src.status = 'observed'
              THEN 'pending' ELSE 'skipped' END,
         CASE WHEN v.relationship = 'not_in_library' AND s.content_hash IS NOT NULL
                   AND v.availability = 'present' AND src.status = 'observed' THEN NULL
              WHEN v.relationship = 'already_in_library' THEN 'Already in library'
              WHEN v.relationship = 'archived_in_library' THEN 'Archived in library'
              WHEN v.relationship = 'match_needed' THEN 'Match needed'
              WHEN v.relationship = 'unsupported' THEN coalesce(v.normalization_error, 'Not supported')
              WHEN v.availability <> 'present' THEN 'No longer in CrowdStrike'
              ELSE 'This rule has not been read from CrowdStrike yet' END
    FROM siem_sync_items src
    JOIN siem_inventory_rows v ON v.id = src.remote_rule_id
    LEFT JOIN siem_remote_rule_snapshots s ON s.id = src.observed_snapshot_id
   WHERE src.run_id = source.id
     AND v.integration_id = p_integration
     AND v.provider_scope = source.provider_scope
     -- The same predicate the table and the counts use, so "all N matching" imports exactly the
     -- N the user was shown.
     AND (p_relationship IS NULL OR p_relationship = 'all' OR v.relationship = p_relationship)
     AND (p_search IS NULL OR p_search = ''
          OR v.display_name ILIKE '%' || p_search || '%'
          OR v.vendor_rule_id ILIKE '%' || p_search || '%')
     AND (CASE WHEN p_all_matching
               THEN NOT (v.vendor_rule_id = ANY(coalesce(p_exclude, '{}')))
               ELSE v.vendor_rule_id = ANY(coalesce(p_ids, '{}')) END)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO frozen FROM siem_sync_items WHERE run_id = r.id AND status = 'pending';
  IF frozen = 0 THEN
    UPDATE siem_sync_runs SET status = 'complete', completed_at = now(),
      error_message = 'None of the selected rules can be imported right now' WHERE id = r.id
      RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_start_import(uuid,uuid,uuid,text[],text[],boolean,text,text,text) TO service_role;
-- Executes a frozen import selection in bounded chunks. Adoption creates the detection,
-- binding, first local revision, remote snapshot and import event in one transaction -- the
-- same set siem_commit_chunk creates today -- but content always comes from the frozen catalog
-- snapshot recorded at submission (Task 7), never from what the worker reads live.

CREATE OR REPLACE FUNCTION public.siem_commit_import_chunk(p_run uuid, p_lease uuid, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; item jsonb; b siem_rule_bindings; d detections; snap uuid;
  did text; qid text; c jsonb; frozen_hash text; prov text; qlang text; attack jsonb;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.status <> 'running' OR r.kind <> 'import_selection'
     OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Sync lease expired';
  END IF;
  IF NOT siem_can_import(r.actor_id, r.integration_id) THEN RAISE EXCEPTION 'Native import permission revoked'; END IF;
  SELECT provider INTO prov FROM integrations WHERE id = r.integration_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    IF NOT EXISTS (SELECT 1 FROM siem_sync_items
                    WHERE run_id = r.id AND vendor_rule_id = item->>'id' AND status = 'pending') THEN
      CONTINUE;
    END IF;

    IF item ? 'error' THEN
      UPDATE siem_sync_items SET status = 'failed', error_message = item->>'error'
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    SELECT frozen_content_hash INTO frozen_hash FROM siem_sync_items
     WHERE run_id = r.id AND vendor_rule_id = item->>'id';
    IF item->>'hash' IS DISTINCT FROM frozen_hash THEN
      UPDATE siem_sync_items SET status = 'changed_since_preview',
        error_message = 'Production changed after you reviewed this rule. Fetch rules again and reselect it.'
       WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    c := item->'content';
    -- Per-rule language first, falling back to the provider default only when the payload has
    -- none or an invalid one -- see siem_rule_query_language.
    qlang := siem_rule_query_language(prov, c);
    attack := siem_native_attack_metadata(c);

    -- A binding for this identity may have appeared since submission (another run, another
    -- actor). Adopting again would duplicate the detection.
    SELECT * INTO b FROM siem_rule_bindings
     WHERE integration_id = r.integration_id AND provider_scope = r.provider_scope
       AND vendor_rule_id = item->>'id' FOR UPDATE;
    IF FOUND THEN
      UPDATE siem_sync_items SET status = 'linked', detection_id = b.detection_id, binding_id = b.id,
        error_message = NULL WHERE run_id = r.id AND vendor_rule_id = item->>'id';
      CONTINUE;
    END IF;

    -- Set initial lifecycle from the observed vendor state; unknown/disabled stays Draft.
    -- Subsequent refreshes update the binding, not local workflow status or pending edits.
    did := gen_random_uuid()::text; qid := gen_random_uuid()::text;
    INSERT INTO detections(id,user_id,version,name,description,status,"detectionType",severity,"logSource",technology,
      "testedAndValidated","queryLanguage","detectionQuery","updatedDate",queries,library_type,promotion_status,review_status,
      source,external_id,tags,native_provenance,"mitreAttackIds","mitreTechniques","mitreTactics")
    VALUES(did,r.actor_id,1,c->>'name',c->>'description',CASE WHEN c->>'enabled'='true' THEN 'Production' ELSE 'Draft' END,'Detection',c->>'severity','','',false,qlang,c->>'query',now(),
      jsonb_build_array(jsonb_build_object('id',qid,'language',qlang,'query',c->>'query','isPrimary',true,'createdDate',now(),'updatedDate',now())),
      'production','none','none','native_siem',item->>'id',ARRAY['native-siem',prov],
      jsonb_build_object('kind','native_siem','provider',prov,'connection_name',
        (SELECT name FROM integrations WHERE id=r.integration_id),'imported_at',now()), ARRAY(SELECT jsonb_array_elements_text(attack->'ids')),
      ARRAY(SELECT jsonb_array_elements_text(attack->'techniques')), ARRAY(SELECT jsonb_array_elements_text(attack->'tactics')));
    SELECT * INTO d FROM detections WHERE id=did;
    INSERT INTO siem_rule_bindings(detection_id,integration_id,provider,provider_scope,vendor_rule_id,selected_query_id,query_language,desired_content)
      VALUES(did,r.integration_id,prov,r.provider_scope,item->>'id',qid,qlang,c) RETURNING * INTO b;
    INSERT INTO siem_local_revisions(detection_id,content,binding_contents,actor_id) VALUES(did,to_jsonb(d),jsonb_build_object(b.id::text,c),r.actor_id);
    -- Unlike siem_commit_chunk (which derives outcome from prior state), a chunk that reaches
    -- this point has already established there is no existing binding, so the action is always
    -- 'imported'.
    INSERT INTO siem_rule_events(binding_id,actor_id,action) VALUES(b.id,r.actor_id,'imported');

    INSERT INTO siem_rule_snapshots(binding_id,adapter_version,content_hash,raw_hash,content,raw_payload)
      VALUES(b.id,item->>'adapter',item->>'hash',item->>'raw_hash',c,item->'raw') ON CONFLICT DO NOTHING;
    SELECT id INTO snap FROM siem_rule_snapshots WHERE binding_id=b.id AND adapter_version=item->>'adapter'
      AND content_hash=item->>'hash' AND raw_hash=item->>'raw_hash';
    UPDATE siem_rule_bindings SET latest_remote_snapshot_id=snap, baseline_snapshot_id=coalesce(baseline_snapshot_id,snap),
      availability='present', observed_enabled=(c->>'enabled')::boolean, last_seen_at=now(), last_sync_run_id=r.id
     WHERE id=b.id;

    UPDATE siem_sync_items SET status = 'imported', detection_id = did, binding_id = b.id, error_message = NULL
     WHERE run_id = r.id AND vendor_rule_id = item->>'id';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM siem_sync_items WHERE run_id = r.id AND status = 'pending') THEN
    UPDATE siem_sync_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM siem_sync_items
        WHERE run_id = r.id AND status IN ('failed','changed_since_preview')) THEN 'partial' ELSE 'complete' END,
      completed_at = now() WHERE id = r.id;
  END IF;

  UPDATE siem_sync_runs SET lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(),
    attempts = 0, error_message = NULL WHERE id = r.id;
END $$;

-- Cancellation stops unclaimed work only; anything already adopted is left exactly as it is.
CREATE OR REPLACE FUNCTION public.siem_cancel_import(p_actor uuid, p_run uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'import_selection' THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT siem_can_import(p_actor, r.integration_id) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;
  IF r.status NOT IN ('queued','running') THEN RAISE EXCEPTION 'This import has already finished'; END IF;

  UPDATE siem_sync_items SET status = 'cancelled', error_message = NULL
   WHERE run_id = r.id AND status = 'pending';

  UPDATE siem_sync_runs SET status = 'cancelled', completed_at = now(),
    lease_token = NULL, lease_expires_at = NULL WHERE id = r.id;
END $$;

-- Retry resets only failed items. changed_since_preview needs a fresh inventory check and a
-- new selection; silently re-adopting it would import content the user never reviewed.
CREATE OR REPLACE FUNCTION public.siem_retry_import(p_actor uuid, p_run uuid)
RETURNS public.siem_sync_runs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r siem_sync_runs; resumable integer;
BEGIN
  SELECT * INTO r FROM siem_sync_runs WHERE id = p_run FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'import_selection' THEN RAISE EXCEPTION 'Import job not found'; END IF;
  IF NOT siem_can_import(p_actor, r.integration_id) THEN RAISE EXCEPTION 'Native import permission denied'; END IF;

  -- A run that exhausted its transient retries is 'failed' with its unprocessed items still
  -- 'pending'. Resetting only 'failed' items reported "No failed rules to retry" and stranded the
  -- whole remaining selection. changed_since_preview stays out: it needs a fresh check and a new
  -- selection, because silently re-adopting it would import content the user never reviewed.
  UPDATE siem_sync_items SET status = 'pending', error_message = NULL
   WHERE run_id = r.id AND status = 'failed';
  SELECT count(*) INTO resumable FROM siem_sync_items WHERE run_id = r.id AND status = 'pending';
  IF resumable = 0 THEN RAISE EXCEPTION 'No rules left to retry'; END IF;

  -- A partial run no longer blocks a fresh import_selection start (siem_start_import's
  -- concurrency check only sees 'queued'/'running'), so a second import may already be live
  -- for this connection by the time this one is retried. Requeuing into that collision would
  -- otherwise surface the raw siem_sync_one_active unique-constraint error to the user.
  IF EXISTS (SELECT 1 FROM siem_sync_runs WHERE integration_id = r.integration_id
               AND kind = 'import_selection' AND status IN ('queued','running') AND id <> r.id) THEN
    RAISE EXCEPTION 'An import is already running for this connection';
  END IF;

  UPDATE siem_sync_runs SET status = 'queued', next_attempt_at = now(), attempts = 0,
    completed_at = NULL, error_message = NULL, lease_token = NULL, lease_expires_at = NULL
    WHERE id = r.id
    RETURNING * INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.siem_commit_import_chunk(uuid,uuid,jsonb),
  public.siem_cancel_import(uuid,uuid), public.siem_retry_import(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_commit_import_chunk(uuid,uuid,jsonb),
  public.siem_cancel_import(uuid,uuid), public.siem_retry_import(uuid,uuid) TO service_role;

-- Prune superseded catalog observations. Never touches a snapshot the catalog still points at,
-- and never touches binding snapshots, which baselines and deployment history reference.
CREATE OR REPLACE FUNCTION public.siem_prune_remote_snapshots(p_integration uuid, p_keep integer DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE removed integer;
BEGIN
  IF p_keep < 1 THEN RAISE EXCEPTION 'Keep at least one observation per rule'; END IF;
  WITH ranked AS (
    SELECT s.id, row_number() OVER (PARTITION BY s.remote_rule_id ORDER BY s.observed_at DESC) AS position
      FROM siem_remote_rule_snapshots s
      JOIN siem_remote_rules r ON r.id = s.remote_rule_id
     WHERE r.integration_id = p_integration
       AND s.id IS DISTINCT FROM r.latest_snapshot_id
       AND NOT EXISTS (SELECT 1 FROM siem_sync_items i
                        WHERE i.remote_rule_id = r.id AND i.status = 'pending')
  )
  DELETE FROM siem_remote_rule_snapshots s USING ranked
   WHERE s.id = ranked.id AND ranked.position > p_keep;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.siem_prune_remote_snapshots(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siem_prune_remote_snapshots(uuid,integer) TO service_role;

-- Pack deployment durable queue (20260917192759)
-- All queue mutations go through the authenticated Edge API and service-only transactions.
ALTER TABLE public.pack_deploy_jobs
  ADD COLUMN IF NOT EXISTS request_key uuid,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS pack_deploy_request_key ON public.pack_deploy_jobs(created_by, request_key);
ALTER TABLE public.pack_deploy_job_items
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS write_started boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false;
ALTER TABLE public.deployment_history ADD COLUMN IF NOT EXISTS pack_item_id uuid REFERENCES public.pack_deploy_job_items(id);
CREATE INDEX IF NOT EXISTS deployment_history_pack_item ON public.deployment_history(pack_item_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pack_deploy_jobs,
  public.pack_deploy_job_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pack_deploy_jobs, public.pack_deploy_job_items TO authenticated;
DROP POLICY IF EXISTS "Users can create deploy jobs" ON public.pack_deploy_jobs;
DROP POLICY IF EXISTS "Users can update their own deploy jobs" ON public.pack_deploy_jobs;
DROP POLICY IF EXISTS "Users can insert their own deploy job items" ON public.pack_deploy_job_items;

-- Old jobs have no reviewed snapshot and must not be silently replayed after migration.
UPDATE public.pack_deploy_job_items SET status='failed', retryable=false,
  error_message='Legacy job: queue a new deployment to review current rules'
WHERE job_id IN (SELECT id FROM public.pack_deploy_jobs WHERE status IN ('queued','running'))
  AND status IN ('pending','running');
UPDATE public.pack_deploy_jobs SET status='failed', completed_at=now(), current_detection_id=NULL,
  error_message='Legacy job: queue a new deployment to review current rules',
  failed_count=(SELECT count(*) FROM public.pack_deploy_job_items i WHERE i.job_id=pack_deploy_jobs.id AND i.status='failed')
WHERE status IN ('queued','running');

CREATE OR REPLACE FUNCTION public.pack_deploy_recount(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s integer; f integer; k integer; outstanding integer;
BEGIN
  SELECT count(*) FILTER(WHERE status='succeeded'),count(*) FILTER(WHERE status='failed'),
    count(*) FILTER(WHERE status='skipped'),count(*) FILTER(WHERE status IN ('pending','running'))
    INTO s,f,k,outstanding FROM pack_deploy_job_items WHERE job_id=p_job;
  UPDATE pack_deploy_jobs SET succeeded_count=s,failed_count=f,skipped_count=k,
    status=CASE WHEN status='cancelled' THEN status WHEN outstanding>0 THEN status
      WHEN f>0 AND s>0 THEN 'partial' WHEN f>0 THEN 'failed' ELSE 'succeeded' END,
    completed_at=CASE WHEN outstanding=0 OR status='cancelled' THEN coalesce(completed_at,now()) ELSE NULL END,
    current_detection_id=CASE WHEN outstanding=0 OR status='cancelled' THEN NULL ELSE current_detection_id END
    WHERE id=p_job;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_create(p_actor uuid,p_integration uuid,p_pack uuid,
  p_request uuid,p_config jsonb,p_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE jid uuid;
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 1000
    THEN RAISE EXCEPTION 'Invalid deployment request'; END IF;
  PERFORM 1 FROM integrations WHERE id=p_integration AND user_id=p_actor AND status='connected' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connected integration not found'; END IF;
  SELECT id INTO jid FROM pack_deploy_jobs WHERE created_by=p_actor AND request_key=p_request;
  IF FOUND THEN RETURN jid; END IF;
  IF EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE integration_id=p_integration AND
    (status IN ('queued','running') OR lease_expires_at>now())) THEN
    RAISE EXCEPTION 'A pack deployment is already active on this connection'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x LEFT JOIN detections d ON d.id=x->>'detection_id'
    WHERE d.id IS NULL OR d.user_id<>p_actor) THEN RAISE EXCEPTION 'Detection access denied'; END IF;
  INSERT INTO pack_deploy_jobs(pack_id,integration_id,created_by,request_key,rule_config,total_items)
    VALUES(p_pack,p_integration,p_actor,p_request,p_config,jsonb_array_length(p_items)) RETURNING id INTO jid;
  INSERT INTO pack_deploy_job_items(job_id,detection_id,detection_name,status,error_message,payload)
    SELECT jid,x->>'detection_id',x->>'detection_name',
      CASE WHEN x->>'reason' IS NULL THEN 'pending' ELSE 'skipped' END,x->>'reason',x->'payload'
      FROM jsonb_array_elements(p_items) x;
  PERFORM pack_deploy_recount(jid);
  RETURN jid;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_claim(p_job uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE (p_job IS NULL OR id=p_job)
    AND status IN ('queued','running') AND next_attempt_at<=now()
    AND (lease_expires_at IS NULL OR lease_expires_at<now())
    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- A worker can live for 400 seconds. The ten-minute lease outlives it. Never replay an uncertain write.
  UPDATE pack_deploy_job_items SET status=CASE WHEN write_started THEN 'failed' ELSE 'pending' END,
    needs_reconciliation=write_started,retryable=NOT write_started,
    error_message=CASE WHEN write_started THEN 'Worker interrupted after dispatch. Check the SIEM before deploying this rule again.' ELSE NULL END
    WHERE job_id=j.id AND status='running';
  -- Recover a committed result if the worker died after integration-ops recorded success.
  UPDATE pack_deploy_job_items recovered SET status='succeeded',needs_reconciliation=false,retryable=false,
    error_message=NULL,vendor_rule_id=h.vendor_rule_id
    FROM deployment_history h WHERE recovered.job_id=j.id AND recovered.needs_reconciliation
      AND h.pack_item_id=recovered.id AND h.status='success' AND h.vendor_rule_id IS NOT NULL;
  PERFORM pack_deploy_recount(j.id);
  SELECT * INTO i FROM pack_deploy_job_items WHERE job_id=j.id AND status='pending' ORDER BY id LIMIT 1;
  IF NOT FOUND THEN
    UPDATE pack_deploy_jobs SET lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL WHERE id=j.id;
    RETURN NULL;
  END IF;
  UPDATE pack_deploy_jobs SET status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',
    started_at=coalesce(started_at,now()),current_detection_id=i.detection_id WHERE id=j.id RETURNING * INTO j;
  UPDATE pack_deploy_job_items SET status='running',attempted_at=now(),retry_count=retry_count+1,
    write_started=false,error_message=NULL WHERE id=i.id RETURNING * INTO i;
  RETURN jsonb_build_object('job',to_jsonb(j),'item',to_jsonb(i));
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_begin_write(p_job uuid,p_item uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_expires_at<=now()
    THEN RAISE EXCEPTION 'Deployment lease is no longer active'; END IF;
  UPDATE pack_deploy_job_items SET write_started=true WHERE id=p_item AND job_id=p_job AND status='running'
    AND NOT write_started RETURNING * INTO i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item already dispatched or no longer active'; END IF;
  RETURN jsonb_build_object('job',to_jsonb(j),'item',to_jsonb(i));
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_finish(p_job uuid,p_item uuid,p_lease uuid,p_result jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs; i pack_deploy_job_items; next_status text; delay_seconds integer;
BEGIN
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job FOR UPDATE;
  IF j.id IS NULL OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_expires_at<=now() THEN RETURN false; END IF;
  SELECT * INTO i FROM pack_deploy_job_items WHERE id=p_item AND job_id=p_job;
  IF NOT FOUND THEN RETURN false; END IF;
  next_status := p_result->>'status';
  IF next_status NOT IN ('succeeded','failed','skipped') THEN RAISE EXCEPTION 'Invalid item outcome'; END IF;
  IF next_status='succeeded' AND nullif(p_result->>'vendorRuleId','') IS NULL THEN RAISE EXCEPTION 'Missing vendor rule identity'; END IF;
  IF next_status='failed' AND coalesce((p_result->>'retryable')::boolean,false) AND
    NOT coalesce((p_result->>'uncertain')::boolean,false) AND i.retry_count<3 AND j.status<>'cancelled' THEN
    next_status := 'pending';
  END IF;
  UPDATE pack_deploy_job_items SET status=next_status,vendor_rule_id=p_result->>'vendorRuleId',
    error_message=p_result->>'error',retryable=coalesce((p_result->>'retryable')::boolean,false),
    needs_reconciliation=coalesce((p_result->>'uncertain')::boolean,false) WHERE id=p_item;
  delay_seconds := CASE WHEN next_status='pending' THEN greatest(5,least(300,coalesce((p_result->>'retryAfter')::integer,30))) ELSE 0 END;
  UPDATE pack_deploy_jobs SET status=CASE WHEN status='cancelled' THEN status ELSE 'queued' END,
    lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL,
    next_attempt_at=now()+make_interval(secs=>delay_seconds) WHERE id=p_job;
  PERFORM pack_deploy_recount(p_job);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.pack_deploy_control(p_actor uuid,p_job uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j pack_deploy_jobs;
BEGIN
  PERFORM 1 FROM integrations WHERE id=(SELECT integration_id FROM pack_deploy_jobs WHERE id=p_job AND created_by=p_actor) FOR UPDATE;
  SELECT * INTO j FROM pack_deploy_jobs WHERE id=p_job AND created_by=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment job not found'; END IF;
  IF p_action='cancel' THEN
    IF j.status NOT IN ('queued','running') THEN RETURN; END IF;
    UPDATE pack_deploy_jobs SET status='cancelled',completed_at=now(),current_detection_id=NULL WHERE id=p_job;
    UPDATE pack_deploy_job_items SET status='skipped',error_message='Cancelled before deployment'
      WHERE job_id=p_job AND status='pending';
    UPDATE pack_deploy_job_items SET status='failed',needs_reconciliation=write_started,retryable=false,
      error_message=CASE WHEN write_started THEN 'Cancelled during deployment. The in-flight request may still finish; check the SIEM.'
        ELSE 'Cancelled before deployment' END WHERE job_id=p_job AND status='running';
  ELSIF p_action='retry' THEN
    IF j.status NOT IN ('failed','partial') OR j.lease_expires_at>now() THEN RAISE EXCEPTION 'Job is not ready to retry'; END IF;
    IF EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE integration_id=j.integration_id AND id<>j.id AND
      (status IN ('queued','running') OR lease_expires_at>now())) THEN RAISE EXCEPTION 'Another pack deployment is active'; END IF;
    UPDATE pack_deploy_job_items SET status='pending',retry_count=0,error_message=NULL,write_started=false
      WHERE job_id=p_job AND status='failed' AND retryable AND NOT needs_reconciliation AND payload IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'No safely retryable items. Review the item errors and queue a new deployment.'; END IF;
    UPDATE pack_deploy_jobs SET status='queued',completed_at=NULL,error_message=NULL,next_attempt_at=now(),
      lease_token=NULL,lease_expires_at=NULL,current_detection_id=NULL WHERE id=p_job;
  ELSE RAISE EXCEPTION 'Unknown job action'; END IF;
  PERFORM pack_deploy_recount(p_job);
END $$;

REVOKE ALL ON FUNCTION public.pack_deploy_recount(uuid),public.pack_deploy_create(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.pack_deploy_claim(uuid),public.pack_deploy_begin_write(uuid,uuid,uuid),
  public.pack_deploy_finish(uuid,uuid,uuid,jsonb),public.pack_deploy_control(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_recount(uuid),public.pack_deploy_create(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.pack_deploy_claim(uuid),public.pack_deploy_begin_write(uuid,uuid,uuid),
  public.pack_deploy_finish(uuid,uuid,uuid,jsonb),public.pack_deploy_control(uuid,uuid,text) TO service_role;

-- The latest successful lifecycle action describes remote presence. Failed updates do not delete rules.
CREATE OR REPLACE VIEW public.v_pack_deployment_status WITH (security_invoker=true) AS
WITH latest_attempt AS (
  SELECT DISTINCT ON(detection_id,integration_id) * FROM deployment_history ORDER BY detection_id,integration_id,created_at DESC,id DESC
), latest_success AS (
  SELECT DISTINCT ON(detection_id,integration_id) * FROM deployment_history WHERE status='success'
    ORDER BY detection_id,integration_id,created_at DESC,id DESC
), targets AS (
  SELECT DISTINCT pd.pack_id,dh.integration_id FROM pack_detections pd JOIN deployment_history dh ON dh.detection_id=pd.detection_id
)
SELECT t.pack_id,t.integration_id,count(DISTINCT pd.detection_id) AS total_detections,
  count(DISTINCT pd.detection_id) FILTER(WHERE s.action IN ('create','update','enable','disable')) AS deployed_count,
  count(DISTINCT pd.detection_id) FILTER(WHERE a.status='failed') AS failed_count,
  max(a.created_at) AS last_deployed_at
FROM targets t JOIN pack_detections pd ON pd.pack_id=t.pack_id
LEFT JOIN latest_attempt a ON a.detection_id=pd.detection_id AND a.integration_id=t.integration_id
LEFT JOIN latest_success s ON s.detection_id=pd.detection_id AND s.integration_id=t.integration_id
GROUP BY t.pack_id,t.integration_id;

-- Existing installations already use these Vault values for Threat Research. No JWTs are persisted.
CREATE OR REPLACE FUNCTION public.pack_deploy_ready() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE configured boolean; scheduled boolean;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regclass('cron.job') IS NULL OR
    NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN false; END IF;
  EXECUTE 'SELECT count(*)=2 FROM vault.decrypted_secrets WHERE name IN (''tr_supabase_url'',''tr_service_role_key'') AND length(decrypted_secret)>0' INTO configured;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=''pack-deploy-dispatcher'' AND active)' INTO scheduled;
  RETURN configured AND scheduled;
END $$;
REVOKE ALL ON FUNCTION public.pack_deploy_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_ready() TO service_role;

CREATE OR REPLACE FUNCTION public.pack_deploy_dispatch() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE base_url text; service_key text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pack_deploy_jobs WHERE status IN ('queued','running')
    AND next_attempt_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now())) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='net') THEN RETURN; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1' INTO base_url USING 'tr_supabase_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1' INTO service_key USING 'tr_service_role_key';
  IF base_url IS NULL OR service_key IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
    USING base_url||'/functions/v1/pack-deploy-worker',
      jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),'{"action":"tick"}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.pack_deploy_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pack_deploy_dispatch() TO service_role;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('pack-deploy-dispatcher','* * * * *','select public.pack_deploy_dispatch()');
  END IF;
END $$;
