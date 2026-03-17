-- ============================================================
-- 05_materialized_views.sql - Materialized views + indexes
-- Run after: 04_views.sql
-- ============================================================

-- ============================================================
-- 1. mv_threat_actor_weights (no materialized view dependencies)
--    Depends on views: mitre_groups, mitre_group_campaigns, mitre_group_software,
--                      mitre_group_techniques, mitre_techniques, v_group_recency
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_threat_actor_weights AS
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
     CROSS JOIN snapshot s);

CREATE UNIQUE INDEX IF NOT EXISTS mv_threat_actor_weights_stix_id_idx ON mv_threat_actor_weights USING btree (stix_id);
CREATE INDEX IF NOT EXISTS mv_threat_actor_weights_taw_idx ON mv_threat_actor_weights USING btree (taw DESC);

-- ============================================================
-- 2. mv_technique_importance (no materialized view dependencies)
--    Depends on views: mitre_techniques, mitre_group_techniques,
--                      mitre_campaign_techniques
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_technique_importance AS
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
   FROM percentiles p;

CREATE UNIQUE INDEX IF NOT EXISTS mv_technique_importance_stix_id_idx ON mv_technique_importance USING btree (stix_id);
CREATE INDEX IF NOT EXISTS mv_technique_importance_mitre_id_idx ON mv_technique_importance USING btree (mitre_id);
CREATE INDEX IF NOT EXISTS mv_technique_importance_tis_idx ON mv_technique_importance USING btree (tis DESC);

-- ============================================================
-- 3. mv_coverage_stats (no materialized view dependencies)
--    Depends on tables: detections, mitre_objects
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_coverage_stats AS
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
     LEFT JOIN technique_coverage tc ON ((mt.mitre_id = tc.technique_id)));

CREATE UNIQUE INDEX IF NOT EXISTS mv_coverage_stats_technique_id_idx ON mv_coverage_stats USING btree (technique_id);
CREATE INDEX IF NOT EXISTS mv_coverage_stats_is_covered_idx ON mv_coverage_stats USING btree (is_covered);
CREATE INDEX IF NOT EXISTS mv_coverage_stats_tactics_idx ON mv_coverage_stats USING btree (tactics);

-- ============================================================
-- 4. mv_mitigation_impact (depends on mv_technique_importance, mv_threat_actor_weights)
--    Also depends on views: mitre_mitigations, mitre_techniques, mitre_group_techniques
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_mitigation_impact AS
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
     CROSS JOIN score_stats ss);

CREATE UNIQUE INDEX IF NOT EXISTS mv_mitigation_impact_stix_id_idx ON mv_mitigation_impact USING btree (stix_id);
CREATE INDEX IF NOT EXISTS mv_mitigation_impact_mitre_id_idx ON mv_mitigation_impact USING btree (mitre_id);
CREATE INDEX IF NOT EXISTS mv_mitigation_impact_impact_score_idx ON mv_mitigation_impact USING btree (impact_score DESC);

-- ============================================================
-- 5. mv_strategy_impact (depends on mv_technique_importance, mv_threat_actor_weights)
--    Also depends on views: v_mitre_detection_strategies, mitre_group_techniques
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_strategy_impact AS
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
     CROSS JOIN score_stats st);

CREATE UNIQUE INDEX IF NOT EXISTS mv_strategy_impact_stix_id_idx ON mv_strategy_impact USING btree (stix_id);
CREATE INDEX IF NOT EXISTS mv_strategy_impact_mitre_id_idx ON mv_strategy_impact USING btree (mitre_id);
CREATE INDEX IF NOT EXISTS mv_strategy_impact_impact_score_idx ON mv_strategy_impact USING btree (impact_score DESC);
CREATE INDEX IF NOT EXISTS mv_strategy_impact_technique_stix_id_idx ON mv_strategy_impact USING btree (technique_stix_id);

-- ============================================================
-- Thin wrapper views over materialized views
-- ============================================================

CREATE OR REPLACE VIEW v_threat_actor_weights AS
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

CREATE OR REPLACE VIEW v_technique_importance AS
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

CREATE OR REPLACE VIEW v_mitigation_impact AS
 SELECT stix_id,
    mitre_id,
    name,
    description,
    technique_count,
    groups_disrupted,
    raw_score,
    impact_score
   FROM mv_mitigation_impact;

CREATE OR REPLACE VIEW v_strategy_impact AS
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
