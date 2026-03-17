-- ============================================================
-- 04_views.sql - Regular views (dependency-ordered)
-- Run after: 03_indexes.sql
-- ============================================================

-- ============================================================
-- Layer 1: Base views (depend only on tables, no view dependencies)
-- ============================================================

CREATE OR REPLACE VIEW mitre_campaigns AS
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

CREATE OR REPLACE VIEW mitre_campaign_techniques AS
 SELECT DISTINCT r.source_ref AS campaign_stix_id,
    r.target_ref AS technique_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects c ON (((r.source_ref = c.stix_id) AND (c.type = 'campaign'::text))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);

CREATE OR REPLACE VIEW mitre_groups AS
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

CREATE OR REPLACE VIEW mitre_group_campaigns AS
 SELECT DISTINCT r.target_ref AS group_stix_id,
    r.source_ref AS campaign_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.target_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects c ON (((r.source_ref = c.stix_id) AND (c.type = 'campaign'::text))))
  WHERE (r.relationship_type = 'attributed-to'::text);

CREATE OR REPLACE VIEW mitre_group_software AS
 SELECT DISTINCT r.source_ref AS group_stix_id,
    r.target_ref AS software_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.source_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects s ON (((r.target_ref = s.stix_id) AND (s.type = ANY (ARRAY['malware'::text, 'tool'::text])))))
  WHERE (r.relationship_type = 'uses'::text);

CREATE OR REPLACE VIEW mitre_group_techniques AS
 SELECT DISTINCT r.source_ref AS group_stix_id,
    r.target_ref AS technique_stix_id,
    r.description AS usage_description
   FROM ((mitre_relationships r
     JOIN mitre_objects g ON (((r.source_ref = g.stix_id) AND (g.type = 'intrusion-set'::text))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);

CREATE OR REPLACE VIEW mitre_mitigations AS
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

CREATE OR REPLACE VIEW mitre_software AS
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

CREATE OR REPLACE VIEW mitre_software_techniques AS
 SELECT DISTINCT r.source_ref AS software_stix_id,
    r.target_ref AS technique_stix_id
   FROM ((mitre_relationships r
     JOIN mitre_objects s ON (((r.source_ref = s.stix_id) AND (s.type = ANY (ARRAY['malware'::text, 'tool'::text])))))
     JOIN mitre_objects t ON (((r.target_ref = t.stix_id) AND (t.type = 'attack-pattern'::text))))
  WHERE (r.relationship_type = 'uses'::text);

CREATE OR REPLACE VIEW mitre_techniques AS
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

CREATE OR REPLACE VIEW resumable_imports AS
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

CREATE OR REPLACE VIEW v_mitre_analytics AS
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

CREATE OR REPLACE VIEW v_mitre_data_components AS
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

CREATE OR REPLACE VIEW v_mitre_detection_strategies AS
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

CREATE OR REPLACE VIEW v_mitre_groups_with_stats AS
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

CREATE OR REPLACE VIEW v_mitre_groups_with_targeting AS
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

CREATE OR REPLACE VIEW v_mitre_mitigations AS
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

CREATE OR REPLACE VIEW v_mitre_software_with_stats AS
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

CREATE OR REPLACE VIEW v_mitre_techniques_full AS
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

-- ============================================================
-- Layer 2: Views that depend on other views
-- ============================================================

-- Depends on: mitre_groups, mitre_group_campaigns, mitre_campaigns
CREATE OR REPLACE VIEW v_group_recency AS
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

-- Depends on: v_mitre_detection_strategies (via mitre_objects join on type)
CREATE OR REPLACE VIEW v_mitre_analytics_with_strategy AS
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

-- Depends on: mitre_techniques, mitre_group_techniques, mitre_campaign_techniques,
--             mitre_software_techniques, v_mitre_detection_strategies
CREATE OR REPLACE VIEW v_technique_stats AS
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

-- ============================================================
-- Layer 3: Thin wrapper views over materialized views
-- These are created in 05_materialized_views.sql (after the MVs)
-- ============================================================
