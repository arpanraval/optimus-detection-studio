-- ============================================================
-- 03_indexes.sql - All indexes (excluding primary keys)
-- Run after: 02_tables.sql
-- ============================================================

-- ------------------------------------------------------------
-- activity_log
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_team ON public.activity_log USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON public.activity_log USING btree (user_id);

-- ------------------------------------------------------------
-- audit_events
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_events_changed_fields ON public.audit_events USING gin (changed_fields);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_team_time ON public.audit_events USING btree (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON public.audit_events USING btree (user_id);

-- ------------------------------------------------------------
-- batch_embedding_jobs
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_batch_embedding_jobs_status ON public.batch_embedding_jobs USING btree (status);

-- ------------------------------------------------------------
-- bulk_import_jobs
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_created_at ON public.bulk_import_jobs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_status ON public.bulk_import_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_user_id ON public.bulk_import_jobs USING btree (user_id);

-- ------------------------------------------------------------
-- deployment_history
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_deployment ON public.deployment_history USING btree (detection_id, integration_id) WHERE ((action = 'create'::text) AND (status = 'success'::text));
CREATE INDEX IF NOT EXISTS idx_deployment_history_detection_id ON public.deployment_history USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_integration_id ON public.deployment_history USING btree (integration_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_user_id ON public.deployment_history USING btree (user_id);

-- ------------------------------------------------------------
-- detection_assignments
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_detection_assignments_active ON public.detection_assignments USING btree (detection_id) WHERE (unassigned_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_detection_assignments_assigned_to ON public.detection_assignments USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_detection_assignments_detection ON public.detection_assignments USING btree (detection_id);

-- ------------------------------------------------------------
-- detection_comments
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_detection_comments_created ON public.detection_comments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detection_comments_detection ON public.detection_comments USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_detection_comments_parent ON public.detection_comments USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_detection_comments_user ON public.detection_comments USING btree (user_id);

-- ------------------------------------------------------------
-- detection_embeddings
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS detection_embeddings_detection_id_idx ON public.detection_embeddings USING btree (detection_id);
CREATE UNIQUE INDEX IF NOT EXISTS detection_embeddings_detection_id_key ON public.detection_embeddings USING btree (detection_id);
CREATE INDEX IF NOT EXISTS detection_embeddings_hnsw_idx ON public.detection_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');

-- ------------------------------------------------------------
-- detection_packs
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_detection_packs_active ON public.detection_packs USING btree (is_active);

-- ------------------------------------------------------------
-- detection_reviews
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_detection_reviews_detection ON public.detection_reviews USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_detection_reviews_requested_by ON public.detection_reviews USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_detection_reviews_reviewer ON public.detection_reviews USING btree (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_detection_reviews_status ON public.detection_reviews USING btree (status);

-- ------------------------------------------------------------
-- detections
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS detections_fts_idx ON public.detections USING gin (fts_vector);
CREATE INDEX IF NOT EXISTS idx_detections_assigned_to ON public.detections USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_detections_bulk_import_id ON public.detections USING btree (bulk_import_id) WHERE (bulk_import_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_detections_description_trgm ON public.detections USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_detections_external_id ON public.detections USING btree (external_id);
CREATE INDEX IF NOT EXISTS idx_detections_library_type ON public.detections USING btree (library_type);
CREATE INDEX IF NOT EXISTS idx_detections_linked_groups ON public.detections USING gin ("linkedGroups");
CREATE INDEX IF NOT EXISTS idx_detections_mitre_ids ON public.detections USING gin ("mitreAttackIds");
CREATE INDEX IF NOT EXISTS idx_detections_name_trgm ON public.detections USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_detections_publish_status ON public.detections USING btree (publish_status);
CREATE INDEX IF NOT EXISTS idx_detections_queries ON public.detections USING gin (queries);
CREATE INDEX IF NOT EXISTS idx_detections_review_status ON public.detections USING btree (review_status);
CREATE INDEX IF NOT EXISTS idx_detections_severity ON public.detections USING btree (severity);
CREATE INDEX IF NOT EXISTS idx_detections_source ON public.detections USING btree (source);
CREATE INDEX IF NOT EXISTS idx_detections_source_rule_id ON public.detections USING btree (source_rule_id);
CREATE INDEX IF NOT EXISTS idx_detections_status ON public.detections USING btree (status);
CREATE INDEX IF NOT EXISTS idx_detections_tags ON public.detections USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_detections_team ON public.detections USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_detections_user_id ON public.detections USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_detections_user_library ON public.detections USING btree (user_id, library_type);
CREATE INDEX IF NOT EXISTS idx_detections_vendor_metadata ON public.detections USING gin (vendor_metadata);

-- ------------------------------------------------------------
-- enrichment_audit
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_applied_at ON public.enrichment_audit USING btree (applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_status ON public.enrichment_audit USING btree (status);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_type ON public.enrichment_audit USING btree (enrichment_type);

-- ------------------------------------------------------------
-- environment_profiles
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_environment_profiles_team_id ON public.environment_profiles USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_environment_profiles_user_id ON public.environment_profiles USING btree (user_id);

-- ------------------------------------------------------------
-- integration_credentials
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_integration_credentials_integration_id ON public.integration_credentials USING btree (integration_id);

-- ------------------------------------------------------------
-- integrations
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON public.integrations USING btree (provider);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations USING btree (user_id);

-- ------------------------------------------------------------
-- mitre_embeddings
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS mitre_embeddings_hnsw_idx ON public.mitre_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX IF NOT EXISTS mitre_embeddings_mitre_id_idx ON public.mitre_embeddings USING btree (mitre_id);
CREATE INDEX IF NOT EXISTS mitre_embeddings_object_type_idx ON public.mitre_embeddings USING btree (type);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_embeddings_stix_id_key ON public.mitre_embeddings USING btree (stix_id);

-- ------------------------------------------------------------
-- mitre_objects
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mitre_objects_data_gin ON public.mitre_objects USING gin (data);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_deprecated ON public.mitre_objects USING btree (deprecated) WHERE (deprecated = false);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_description_trgm ON public.mitre_objects USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_mitre_id ON public.mitre_objects USING btree (mitre_id);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_name ON public.mitre_objects USING btree (name);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_name_trgm ON public.mitre_objects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_origin_country ON public.mitre_objects USING btree ((((data -> 'targeting_intel'::text) ->> 'origin_country'::text))) WHERE ((type = 'intrusion-set'::text) AND ((data -> 'targeting_intel'::text) IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_mitre_objects_revoked ON public.mitre_objects USING btree (revoked) WHERE (revoked = false);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_stix_id ON public.mitre_objects USING btree (stix_id);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_targeting_intel ON public.mitre_objects USING gin (((data -> 'targeting_intel'::text))) WHERE (type = 'intrusion-set'::text);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_type ON public.mitre_objects USING btree (type);
CREATE INDEX IF NOT EXISTS idx_mitre_objects_type_deprecated ON public.mitre_objects USING btree (type, deprecated);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_objects_stix_id_key ON public.mitre_objects USING btree (stix_id);

-- ------------------------------------------------------------
-- mitre_relationships
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mitre_relationships_source ON public.mitre_relationships USING btree (source_ref);
CREATE INDEX IF NOT EXISTS idx_mitre_relationships_source_type ON public.mitre_relationships USING btree (source_ref, relationship_type);
CREATE INDEX IF NOT EXISTS idx_mitre_relationships_target ON public.mitre_relationships USING btree (target_ref);
CREATE INDEX IF NOT EXISTS idx_mitre_relationships_target_type ON public.mitre_relationships USING btree (target_ref, relationship_type);
CREATE INDEX IF NOT EXISTS idx_mitre_relationships_type ON public.mitre_relationships USING btree (relationship_type);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_relationships_stix_id_key ON public.mitre_relationships USING btree (stix_id);

-- ------------------------------------------------------------
-- mitre_scoring_snapshot
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_snapshot_active ON public.mitre_scoring_snapshot USING btree (is_active) WHERE (is_active = true);

-- ------------------------------------------------------------
-- mitre_tactic_weights
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS mitre_tactic_weights_tactic_profile_key ON public.mitre_tactic_weights USING btree (tactic, profile);

-- ------------------------------------------------------------
-- mitre_technique_data_sources
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mitre_technique_data_sources_technique ON public.mitre_technique_data_sources USING btree (technique_stix_id);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_technique_data_sources_technique_stix_id_data_source_key ON public.mitre_technique_data_sources USING btree (technique_stix_id, data_source);

-- ------------------------------------------------------------
-- mitre_technique_platforms
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mitre_technique_platforms_technique ON public.mitre_technique_platforms USING btree (technique_stix_id);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_technique_platforms_technique_stix_id_platform_key ON public.mitre_technique_platforms USING btree (technique_stix_id, platform);

-- ------------------------------------------------------------
-- mitre_technique_tactics
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mitre_technique_tactics_tactic ON public.mitre_technique_tactics USING btree (tactic_stix_id);
CREATE INDEX IF NOT EXISTS idx_mitre_technique_tactics_technique ON public.mitre_technique_tactics USING btree (technique_stix_id);
CREATE UNIQUE INDEX IF NOT EXISTS mitre_technique_tactics_technique_stix_id_tactic_stix_id_key ON public.mitre_technique_tactics USING btree (technique_stix_id, tactic_stix_id);

-- Materialized view indexes are in 05_materialized_views.sql

-- ------------------------------------------------------------
-- pack_detections
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pack_detections_detection ON public.pack_detections USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_pack_detections_pack ON public.pack_detections USING btree (pack_id);
CREATE UNIQUE INDEX IF NOT EXISTS pack_detections_pack_id_detection_id_key ON public.pack_detections USING btree (pack_id, detection_id);

-- ------------------------------------------------------------
-- publish_requests
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_publish_requests_detection ON public.publish_requests USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_publish_requests_status ON public.publish_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_publish_requests_submitted_by ON public.publish_requests USING btree (submitted_by);

-- ------------------------------------------------------------
-- scoring_profiles
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_profiles_global_default ON public.scoring_profiles USING btree ((true)) WHERE ((is_default = true) AND (team_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoring_profiles_team_default ON public.scoring_profiles USING btree (team_id) WHERE ((is_default = true) AND (team_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_scoring_profiles_team_id ON public.scoring_profiles USING btree (team_id);

-- ------------------------------------------------------------
-- team_invitations
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON public.team_invitations USING btree (email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON public.team_invitations USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON public.team_invitations USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_token_key ON public.team_invitations USING btree (token);

-- ------------------------------------------------------------
-- team_members
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members USING btree (role);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.team_members USING btree (status);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_id_user_id_key ON public.team_members USING btree (team_id, user_id);

-- ------------------------------------------------------------
-- teams
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON public.teams USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON public.teams USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_key ON public.teams USING btree (slug);

-- ------------------------------------------------------------
-- threat_intel_report_detections
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_report_detections_detection ON public.threat_intel_report_detections USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_report_detections_report ON public.threat_intel_report_detections USING btree (report_id);
CREATE UNIQUE INDEX IF NOT EXISTS threat_intel_report_detections_report_id_detection_id_key ON public.threat_intel_report_detections USING btree (report_id, detection_id);

-- ------------------------------------------------------------
-- threat_intel_reports
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_threat_intel_reports_coverage ON public.threat_intel_reports USING btree (coverage_percent);
CREATE INDEX IF NOT EXISTS idx_threat_intel_reports_threat_level ON public.threat_intel_reports USING btree (threat_level);
CREATE INDEX IF NOT EXISTS idx_threat_intel_reports_updated ON public.threat_intel_reports USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_intel_reports_user ON public.threat_intel_reports USING btree (user_id);

-- ------------------------------------------------------------
-- user_dashboards
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_dashboards_user_id ON public.user_dashboards USING btree (user_id);

-- ------------------------------------------------------------
-- user_notifications
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON public.user_notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications USING btree (user_id);

-- ------------------------------------------------------------
-- workspace_activity_log
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspace_activity_action ON public.workspace_activity_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_created ON public.workspace_activity_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_entity ON public.workspace_activity_log USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_user ON public.workspace_activity_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_workspace ON public.workspace_activity_log USING btree (workspace_id);

-- ------------------------------------------------------------
-- workspace_detections
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspace_detections_assigned ON public.workspace_detections USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_workspace_detections_deployment ON public.workspace_detections USING btree (deployment_status);
CREATE INDEX IF NOT EXISTS idx_workspace_detections_detection ON public.workspace_detections USING btree (detection_id);
CREATE INDEX IF NOT EXISTS idx_workspace_detections_review ON public.workspace_detections USING btree (review_status);
CREATE INDEX IF NOT EXISTS idx_workspace_detections_sync ON public.workspace_detections USING btree (sync_status);
CREATE INDEX IF NOT EXISTS idx_workspace_detections_workspace ON public.workspace_detections USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_detections_workspace_id_detection_id_key ON public.workspace_detections USING btree (workspace_id, detection_id);

-- ------------------------------------------------------------
-- workspace_invitations
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON public.workspace_invitations USING btree (email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status ON public.workspace_invitations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token ON public.workspace_invitations USING btree (token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace ON public.workspace_invitations USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_token_key ON public.workspace_invitations USING btree (token);

-- ------------------------------------------------------------
-- workspace_members
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON public.workspace_members USING btree (role);
CREATE INDEX IF NOT EXISTS idx_workspace_members_status ON public.workspace_members USING btree (status);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON public.workspace_members USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_workspace_id_user_id_key ON public.workspace_members USING btree (workspace_id, user_id);

-- ------------------------------------------------------------
-- workspaces
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON public.workspaces USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_type ON public.workspaces USING btree (type);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_key ON public.workspaces USING btree (slug);
