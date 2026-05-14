-- Three-tier coverage based on library_type, not detection status.
-- Production = covered by library_type='production'
-- Development = covered by library_type='development' AND NOT in Production
-- Gap = neither
-- Tiers are mutually exclusive; a technique covered by both libraries counts as Production.
--
-- p_actor_stix_id: when non-null, restricts the technique universe to techniques
--   used by that actor (via mitre_relationships.relationship_type = 'uses').

CREATE OR REPLACE FUNCTION public.get_coverage_tiers(p_actor_stix_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_coverage_tiers(text) TO authenticated;
