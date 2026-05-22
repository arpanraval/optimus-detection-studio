-- ============================================================
-- 02_tables.sql - All public schema tables
-- Run after: 01_extensions.sql
-- ============================================================

-- ============================================================
-- TIER 0: Tables with no foreign keys
-- ============================================================

-- ----------------------------------------------------------
-- profiles
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid NOT NULL,
  email text,
  role text DEFAULT 'user'::text,
  full_name text,
  avatar_url text,
  phone text,
  timezone text DEFAULT 'UTC'::text,
  preferences jsonb DEFAULT '{}'::jsonb,
  permission_overrides jsonb,
  last_active_at timestamptz,
  status text DEFAULT 'active'::text,
  onboarding_completed boolean DEFAULT true,
  onboarding_step integer DEFAULT 0,
  password_set boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'lead'::text, 'analyst'::text, 'viewer'::text])),
  CONSTRAINT profiles_status_check CHECK (status = ANY (ARRAY['active'::text, 'away'::text, 'offline'::text, 'deactivated'::text]))
);

-- ----------------------------------------------------------
-- mitre_objects
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  type text NOT NULL,
  mitre_id text,
  name text NOT NULL,
  description text,
  created timestamptz NOT NULL,
  modified timestamptz NOT NULL,
  data jsonb NOT NULL,
  deprecated boolean DEFAULT false,
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT mitre_objects_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_objects_stix_id_key UNIQUE (stix_id)
);

-- ----------------------------------------------------------
-- mitre_metadata
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  framework_version text NOT NULL,
  stix_version text NOT NULL,
  last_updated timestamptz NOT NULL,
  total_techniques integer DEFAULT 0,
  total_groups integer DEFAULT 0,
  total_software integer DEFAULT 0,
  total_campaigns integer DEFAULT 0,
  total_mitigations integer DEFAULT 0,
  total_relationships integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT mitre_metadata_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------
-- mitre_scoring_snapshot
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_scoring_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
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
  is_active boolean DEFAULT true,

  CONSTRAINT mitre_scoring_snapshot_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------
-- mitre_tactic_weights
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_tactic_weights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tactic text NOT NULL,
  profile text NOT NULL,
  weight numeric NOT NULL,

  CONSTRAINT mitre_tactic_weights_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_tactic_weights_tactic_profile_key UNIQUE (tactic, profile),
  CONSTRAINT mitre_tactic_weights_weight_check CHECK ((weight >= (0)::numeric) AND (weight <= (1)::numeric))
);

-- ----------------------------------------------------------
-- batch_embedding_jobs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_embedding_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gemini_batch_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  request_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,

  CONSTRAINT batch_embedding_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT batch_embedding_jobs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'submitted'::text, 'running'::text, 'succeeded'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);

-- ----------------------------------------------------------
-- bulk_import_jobs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS bulk_import_jobs (
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
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  checkpoint_data jsonb,
  last_successful_batch integer DEFAULT 0,
  total_batches integer DEFAULT 0,
  reverted_at timestamptz,
  reverted_by uuid,

  CONSTRAINT bulk_import_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT bulk_import_jobs_source_type_check CHECK (source_type = ANY (ARRAY['github'::text, 'zip'::text, 'files'::text])),
  CONSTRAINT bulk_import_jobs_target_library_check CHECK (target_library = ANY (ARRAY['development'::text, 'production'::text])),
  CONSTRAINT bulk_import_jobs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'fetching'::text, 'parsing'::text, 'validating'::text, 'preview'::text, 'inserting'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'reverted'::text])),
  CONSTRAINT bulk_import_jobs_duplicate_strategy_check CHECK (duplicate_strategy = ANY (ARRAY['skip'::text, 'update'::text, 'create_new'::text])),
  CONSTRAINT bulk_import_jobs_source_vendor_check CHECK (source_vendor = ANY (ARRAY['sigma'::text, 'splunk_escu'::text, 'elastic'::text, 'kql'::text, 'chronicle'::text, 'mixed'::text]))
);

-- ----------------------------------------------------------
-- detection_packs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_packs (
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT detection_packs_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------
-- enrichment_audit
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  enrichment_type text NOT NULL DEFAULT 'misp_targeting_intel'::text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text,
  preview_hash text NOT NULL,
  affected_group_ids text[] NOT NULL,
  rollback_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'applied'::text,
  rolled_back_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enrichment_audit_pkey PRIMARY KEY (id),
  CONSTRAINT enrichment_audit_status_check CHECK (status = ANY (ARRAY['applied'::text, 'rolled_back'::text]))
);

-- ----------------------------------------------------------
-- threat_intel_reports
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS threat_intel_reports (
  id text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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

  CONSTRAINT threat_intel_reports_pkey PRIMARY KEY (id),
  CONSTRAINT threat_intel_reports_source_type_check CHECK (source_type = ANY (ARRAY['url'::text, 'paste'::text]))
);

-- ----------------------------------------------------------
-- user_dashboards
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_dashboards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Dashboard'::text,
  is_default boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_dashboards_pkey PRIMARY KEY (id)
);


-- ============================================================
-- TIER 1: Tables that reference only Tier 0 tables
-- ============================================================

-- ----------------------------------------------------------
-- mitre_relationships
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_relationships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  relationship_type text NOT NULL,
  source_ref text NOT NULL,
  target_ref text NOT NULL,
  description text,
  data jsonb,
  created timestamptz NOT NULL,
  modified timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT mitre_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_relationships_stix_id_key UNIQUE (stix_id),
  CONSTRAINT mitre_relationships_source_ref_fkey FOREIGN KEY (source_ref) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE,
  CONSTRAINT mitre_relationships_target_ref_fkey FOREIGN KEY (target_ref) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE,
  CONSTRAINT mitre_relationships_type_check CHECK (relationship_type = ANY (ARRAY['uses'::text, 'mitigates'::text, 'detects'::text, 'subtechnique-of'::text, 'attributed-to'::text, 'targets'::text, 'revoked-by'::text, 'related-to'::text]))
);

-- ----------------------------------------------------------
-- mitre_embeddings
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stix_id text NOT NULL,
  mitre_id text NOT NULL,
  type text NOT NULL,
  embedding vector(1536),
  content_hash text NOT NULL,
  embedded_text text,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT mitre_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_embeddings_stix_id_key UNIQUE (stix_id),
  CONSTRAINT mitre_embeddings_stix_id_fkey FOREIGN KEY (stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- mitre_technique_tactics
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_technique_tactics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  tactic_stix_id text NOT NULL,
  tactic_shortname text NOT NULL,

  CONSTRAINT mitre_technique_tactics_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_technique_tactics_technique_stix_id_tactic_stix_id_key UNIQUE (technique_stix_id, tactic_stix_id),
  CONSTRAINT mitre_technique_tactics_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE,
  CONSTRAINT mitre_technique_tactics_tactic_stix_id_fkey FOREIGN KEY (tactic_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- mitre_technique_platforms
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_technique_platforms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  platform text NOT NULL,

  CONSTRAINT mitre_technique_platforms_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_technique_platforms_technique_stix_id_platform_key UNIQUE (technique_stix_id, platform),
  CONSTRAINT mitre_technique_platforms_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- mitre_technique_data_sources
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS mitre_technique_data_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  technique_stix_id text NOT NULL,
  data_source text NOT NULL,

  CONSTRAINT mitre_technique_data_sources_pkey PRIMARY KEY (id),
  CONSTRAINT mitre_technique_data_sources_technique_stix_id_data_source_key UNIQUE (technique_stix_id, data_source),
  CONSTRAINT mitre_technique_data_sources_technique_stix_id_fkey FOREIGN KEY (technique_stix_id) REFERENCES mitre_objects(stix_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- user_invitations
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'analyst'::text,
  invited_by uuid NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
  expires_at timestamptz NOT NULL DEFAULT (now() + '7 days'::interval),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT user_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT user_invitations_token_key UNIQUE (token),
  CONSTRAINT user_invitations_role_check CHECK (role = ANY (ARRAY['admin'::text, 'lead'::text, 'analyst'::text, 'viewer'::text]))
);

-- ----------------------------------------------------------
-- activity_log
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_entity_type_check CHECK (entity_type = ANY (ARRAY['detection'::text, 'user'::text, 'pack'::text, 'review'::text, 'comment'::text]))
);

-- ----------------------------------------------------------
-- audit_events
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
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
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT audit_events_source_check CHECK (source = ANY (ARRAY['client'::text, 'edge_function'::text, 'migration'::text]))
);

-- ----------------------------------------------------------
-- scoring_profiles
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS scoring_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  weights jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scoring_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT scoring_profiles_weights_sum_100 CHECK (
    (((((((((((weights ->> 'query_completeness'::text))::integer
    + ((weights ->> 'mitre_mapping'::text))::integer)
    + ((weights ->> 'peer_review'::text))::integer)
    + ((weights ->> 'description_quality'::text))::integer)
    + ((weights ->> 'false_positive_guidance'::text))::integer)
    + ((weights ->> 'data_sources'::text))::integer)
    + ((weights ->> 'threat_intel'::text))::integer)
    + ((weights ->> 'test_coverage'::text))::integer)
    + ((weights ->> 'investigation_steps'::text))::integer)
    + ((weights ->> 'references'::text))::integer) = 100
  )
);

-- ----------------------------------------------------------
-- environment_profiles
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS environment_profiles (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT environment_profiles_pkey PRIMARY KEY (id)
);

-- ----------------------------------------------------------
-- integrations
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  auth_type text NOT NULL,
  status text NOT NULL DEFAULT 'configured'::text,
  last_tested_at timestamptz,
  last_test_result jsonb,
  last_synced_at timestamptz,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT integrations_pkey PRIMARY KEY (id),
  CONSTRAINT integrations_provider_check CHECK (provider = ANY (ARRAY['splunk'::text, 'sentinel'::text, 'defender_xdr'::text, 'elastic'::text, 'crowdstrike'::text, 'github'::text, 'gitlab'::text, 'azure_devops'::text, 'jira'::text, 'slack'::text])),
  CONSTRAINT integrations_category_check CHECK (category = ANY (ARRAY['siem'::text, 'version_control'::text, 'automation'::text])),
  CONSTRAINT integrations_auth_type_check CHECK (auth_type = ANY (ARRAY['basic'::text, 'token'::text, 'api_key'::text, 'oauth2_client_credentials'::text, 'webhook'::text])),
  CONSTRAINT integrations_status_check CHECK (status = ANY (ARRAY['configured'::text, 'testing'::text, 'connected'::text, 'error'::text, 'disabled'::text]))
);

-- Workspace tables removed (feature deprecated)

-- ----------------------------------------------------------
-- detections
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detections (
  id text NOT NULL,
  version integer NOT NULL,
  "createdDate" timestamptz NOT NULL DEFAULT now(),
  "updatedDate" timestamptz NOT NULL,
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
  "validationDate" timestamptz,
  "validationEnvironment" text DEFAULT ''::text,
  "testCases" text[] DEFAULT '{}'::text[],
  "qualityScore" integer DEFAULT 0,
  "auditLog" jsonb DEFAULT '[]'::jsonb,
  library_type text DEFAULT 'production'::text,
  visibility text DEFAULT 'private',
  source text DEFAULT 'custom'::text,
  source_rule_id text,
  source_url text,
  external_id text,
  promotion_status text DEFAULT 'none'::text,
  promoted_to_id text,
  promoted_at timestamptz,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  review_status text DEFAULT 'none'::text,
  reviewer_id uuid,
  review_requested_at timestamptz,
  reviewed_at timestamptz,
  review_notes text,
  bulk_import_id uuid,
  vendor_metadata jsonb DEFAULT '{}'::jsonb,
  fts_vector tsvector,

  CONSTRAINT detections_pkey PRIMARY KEY (id),
  CONSTRAINT detections_source_rule_id_fkey FOREIGN KEY (source_rule_id) REFERENCES detections(id) ON DELETE SET NULL,
  CONSTRAINT detections_promoted_to_id_fkey FOREIGN KEY (promoted_to_id) REFERENCES detections(id) ON DELETE SET NULL,
  CONSTRAINT detections_bulk_import_id_fkey FOREIGN KEY (bulk_import_id) REFERENCES bulk_import_jobs(id) ON DELETE SET NULL,
  CONSTRAINT detections_library_type_check CHECK (library_type = ANY (ARRAY['development'::text, 'production'::text])),
  CONSTRAINT detections_visibility_check CHECK (visibility = ANY (ARRAY['private'::text, 'shared'::text])),
  CONSTRAINT detections_promotion_status_check CHECK (promotion_status = ANY (ARRAY['none'::text, 'pending'::text, 'promoted'::text, 'rejected'::text])),
  CONSTRAINT detections_review_status_check CHECK (review_status = ANY (ARRAY['none'::text, 'requested'::text, 'in_review'::text, 'approved'::text, 'rejected'::text]))
);


-- ============================================================
-- TIER 2: Tables that reference Tier 1 tables
-- ============================================================

-- ----------------------------------------------------------
-- detection_assignments
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  unassigned_at timestamptz,
  unassigned_by uuid,
  notes text,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT detection_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT detection_assignments_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT detection_assignments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT detection_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT detection_assignments_unassigned_by_fkey FOREIGN KEY (unassigned_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------
-- detection_comments
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid,
  content text NOT NULL,
  comment_type text NOT NULL DEFAULT 'comment'::text,
  is_resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT detection_comments_pkey PRIMARY KEY (id),
  CONSTRAINT detection_comments_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT detection_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT detection_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES detection_comments(id) ON DELETE CASCADE,
  CONSTRAINT detection_comments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT detection_comments_type_check CHECK (comment_type = ANY (ARRAY['comment'::text, 'review_note'::text, 'status_change'::text, 'system'::text]))
);

-- ----------------------------------------------------------
-- detection_embeddings
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  embedding vector(1536),
  content_hash text NOT NULL,
  embedded_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT detection_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT detection_embeddings_detection_id_key UNIQUE (detection_id),
  CONSTRAINT detection_embeddings_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- detection_reviews
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz DEFAULT now(),
  reviewer_id uuid,
  assigned_at timestamptz,
  status text NOT NULL DEFAULT 'pending'::text,
  decision_at timestamptz,
  notes text,
  checklist jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT detection_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT detection_reviews_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT detection_reviews_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT detection_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT detection_reviews_status_check CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))
);

-- ----------------------------------------------------------
-- deployment_history
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployment_history (
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
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz DEFAULT now(),
  detection_version integer,
  detection_hash text,

  CONSTRAINT deployment_history_pkey PRIMARY KEY (id),
  CONSTRAINT deployment_history_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  CONSTRAINT deployment_history_action_check CHECK (action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'enable'::text, 'disable'::text])),
  CONSTRAINT deployment_history_status_check CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'success'::text, 'failed'::text, 'rolled_back'::text]))
);

-- ----------------------------------------------------------
-- detection_preflight_runs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_preflight_runs (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  integration_id    uuid NOT NULL,
  detection_id      text NOT NULL,
  provider          text NOT NULL,
  window_days       integer NOT NULL,
  status            text NOT NULL DEFAULT 'pending'::text,
  validation_passed boolean NOT NULL DEFAULT false,
  hit_count         bigint,
  window_applied    boolean NOT NULL DEFAULT true,
  error_message     text,
  error_guidance    text,
  schema_warnings   jsonb,
  query_text        text,
  query_language    text DEFAULT 'KQL'::text,
  sample            jsonb,
  breakdown         jsonb,
  duration_ms       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT detection_preflight_runs_pkey PRIMARY KEY (id),
  CONSTRAINT detection_preflight_runs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  CONSTRAINT detection_preflight_runs_provider_check CHECK (provider = ANY (ARRAY['defender_xdr'::text])),
  CONSTRAINT detection_preflight_runs_window_days_check CHECK (window_days >= 1 AND window_days <= 90),
  CONSTRAINT detection_preflight_runs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'success'::text, 'query_error'::text, 'connection_error'::text, 'timeout'::text, 'permission_denied'::text]))
);

CREATE INDEX IF NOT EXISTS detection_preflight_runs_detection_idx
  ON detection_preflight_runs (detection_id, created_at DESC);

-- ----------------------------------------------------------
-- detection_finetune_runs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_finetune_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  detection_id         text NOT NULL,
  integration_id       uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  preflight_run_id     uuid REFERENCES detection_preflight_runs(id) ON DELETE SET NULL,
  provider             text NOT NULL DEFAULT 'defender_xdr',
  anthropic_session_id text,
  status               text NOT NULL DEFAULT 'running',
  window_days          integer NOT NULL,
  original_query       text NOT NULL,
  baseline_hit_count   bigint,
  query_count          integer NOT NULL DEFAULT 0,
  nudged               boolean NOT NULL DEFAULT false,
  result               jsonb,
  error_message        text,
  usage                jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,

  CONSTRAINT detection_finetune_runs_provider_check
    CHECK (provider IN ('defender_xdr')),
  CONSTRAINT detection_finetune_runs_window_days_check
    CHECK (window_days BETWEEN 1 AND 30),
  CONSTRAINT detection_finetune_runs_status_check
    CHECK (status IN ('running','completed','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS detection_finetune_runs_detection_idx
  ON detection_finetune_runs (detection_id, created_at DESC);

-- At most one in-progress run per (detection, user) — prevents double-click /
-- concurrent-start races from creating duplicate running rows.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_finetune_run
  ON detection_finetune_runs (detection_id, user_id)
  WHERE (status = 'running');

ALTER TABLE detection_finetune_runs ENABLE ROW LEVEL SECURITY;

-- Atomic budget reservation: increments query_count iff it is still under budget.
-- Returns the new count, or NULL when the budget is already spent.
CREATE OR REPLACE FUNCTION reserve_finetune_query_slot(p_run_id uuid, p_budget int)
RETURNS int
LANGUAGE sql
AS $$
  UPDATE detection_finetune_runs
     SET query_count = query_count + 1,
         updated_at  = now()
   WHERE id = p_run_id
     AND query_count < p_budget
  RETURNING query_count;
$$;

-- The RPC must only be callable by the edge function (service_role), never by clients.
REVOKE ALL ON FUNCTION reserve_finetune_query_slot(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_finetune_query_slot(uuid, int) TO service_role;

-- ----------------------------------------------------------
-- integration_credentials
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  encrypted_data text NOT NULL,
  credential_type text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT integration_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT integration_credentials_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- pack_detections
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS pack_detections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL,
  detection_id text NOT NULL,
  added_at timestamptz DEFAULT now(),

  CONSTRAINT pack_detections_pkey PRIMARY KEY (id),
  CONSTRAINT pack_detections_pack_id_detection_id_key UNIQUE (pack_id, detection_id),
  CONSTRAINT pack_detections_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES detection_packs(id) ON DELETE CASCADE,
  CONSTRAINT pack_detections_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- promotion_requests
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotion_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  target_rule_id text,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  result_rule_id text,
  notification_sent boolean DEFAULT false,
  notification_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  reviewer_id uuid,

  CONSTRAINT promotion_requests_pkey PRIMARY KEY (id),
  CONSTRAINT promotion_requests_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT promotion_requests_target_rule_id_fkey FOREIGN KEY (target_rule_id) REFERENCES detections(id) ON DELETE SET NULL,
  CONSTRAINT promotion_requests_result_rule_id_fkey FOREIGN KEY (result_rule_id) REFERENCES detections(id) ON DELETE SET NULL,
  CONSTRAINT promotion_requests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE NO ACTION,
  CONSTRAINT promotion_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'approved_as_new'::text]))
);

-- ----------------------------------------------------------
-- threat_intel_report_detections
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS threat_intel_report_detections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id text NOT NULL,
  detection_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_from text NOT NULL,
  source_ttp_id text,
  source_rule_id text,
  detection_name text NOT NULL,
  mitre_ids text[] DEFAULT '{}'::text[],

  CONSTRAINT threat_intel_report_detections_pkey PRIMARY KEY (id),
  CONSTRAINT threat_intel_report_detections_report_id_detection_id_key UNIQUE (report_id, detection_id),
  CONSTRAINT threat_intel_report_detections_report_id_fkey FOREIGN KEY (report_id) REFERENCES threat_intel_reports(id) ON DELETE CASCADE,
  CONSTRAINT threat_intel_report_detections_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT threat_intel_report_detections_created_from_check CHECK (created_from = ANY (ARRAY['ttp'::text, 'rule'::text, 'manual'::text]))
);

-- Workspace member/invitation/activity/detection tables removed (feature deprecated)


-- ============================================================
-- TIER 3: Tables that reference Tier 2 tables
-- ============================================================

-- ----------------------------------------------------------
-- user_notifications
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  detection_id text,
  publish_request_id uuid,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT user_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT user_notifications_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE SET NULL,
  CONSTRAINT user_notifications_publish_request_id_fkey FOREIGN KEY (publish_request_id) REFERENCES promotion_requests(id) ON DELETE SET NULL
);

-- detection_drift: per-detection upstream-drift tracking for the GitHub-source
-- review feature. One row per local detection with a known upstream source.
CREATE TABLE IF NOT EXISTS detection_drift (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id          text NOT NULL,                                  -- detections.id is text
  user_id               uuid NOT NULL,                                  -- mirrors detections.user_id
  source_url            text NOT NULL,
  source_vendor         text NOT NULL,
  target_library        text NOT NULL,
  external_id           text NOT NULL,
  upstream_path         text,
  upstream_blob_sha     text,
  baseline_hash         text,
  upstream_hash         text,
  upstream_raw_snapshot text,
  drift_state           text NOT NULL DEFAULT 'unknown'
    CHECK (drift_state IN ('unknown','in_sync','upstream_changed','upstream_removed','conflict','dismissed')),
  field_diffs           jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at       timestamptz,
  resolved_at           timestamptz,
  resolved_by           uuid,
  resolution            text CHECK (resolution IN ('accepted','kept_mine','dismissed','reverted')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT detection_drift_detection_id_key UNIQUE (detection_id),
  CONSTRAINT detection_drift_detection_id_fkey FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE CASCADE,
  CONSTRAINT detection_drift_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT detection_drift_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS detection_drift_user_state_idx ON detection_drift (user_id, drift_state);
CREATE INDEX IF NOT EXISTS detection_drift_source_idx ON detection_drift (source_url, source_vendor, target_library);
CREATE INDEX IF NOT EXISTS detection_drift_detection_id_idx ON detection_drift (detection_id);
