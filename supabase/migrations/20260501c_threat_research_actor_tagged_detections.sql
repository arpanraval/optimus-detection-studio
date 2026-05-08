-- Actor-tagged coverage seed: given a list of actor aliases (e.g.
-- ['Scattered Spider', 'Octo Tempest', 'UNC3944', 'G1015']), return the
-- detections from the library whose tags array overlaps with any alias.
--
-- Used by the threat-research orchestrator immediately after the Research
-- agent produces the subject, to seed the Detection Engineer with explicit
-- "user already has these" coverage signal — separate from the per-behaviour
-- vector similarity check, which is too narrow to surface broad actor coverage.

CREATE OR REPLACE FUNCTION public.tr_find_actor_tagged_detections(
  p_aliases text[],
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  id text,
  name text,
  severity text,
  mitre_technique_ids text[],
  matching_aliases text[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id,
    d.name,
    d.severity,
    d."mitreAttackIds" AS mitre_technique_ids,
    ARRAY(SELECT DISTINCT t FROM unnest(d.tags) t WHERE t = ANY(p_aliases))::text[] AS matching_aliases
  FROM public.detections d
  WHERE d.tags && p_aliases
  ORDER BY d."updatedDate" DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.tr_find_actor_tagged_detections(text[], int) TO authenticated, service_role;
