-- Parameterized keyword search for detections. Replaces vulnerable
-- PostgREST .or() filter construction in optimus-tools/handleSearchLibrary.
-- All parameters are bound; no string interpolation possible.

CREATE OR REPLACE FUNCTION public.search_detections_keyword(
  p_query text,
  p_status text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  id text,
  name text,
  description text,
  status text,
  severity text,
  "mitreAttackIds" text[],
  "mitreTactics" text[],
  "queryLanguage" text,
  tags text[]
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.search_detections_keyword(text, text, text, int) TO authenticated;


-- Parameterized search for MITRE objects. Replaces vulnerable .or()
-- in optimus-tools/handleQueryMitre.

CREATE OR REPLACE FUNCTION public.search_mitre_objects(
  p_query text,
  p_entity_type text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  stix_id text,
  mitre_id text,
  name text,
  type text,
  description text,
  data jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $$
  SELECT mo.stix_id, mo.mitre_id, mo.name, mo.type, mo.description, mo.data
  FROM mitre_objects mo
  WHERE (
    mo.name ILIKE '%' || p_query || '%'
    OR mo.mitre_id ILIKE '%' || p_query || '%'
    OR mo.description ILIKE '%' || p_query || '%'
  )
  AND (p_entity_type IS NULL OR mo.type = p_entity_type)
  LIMIT LEAST(p_limit, 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_mitre_objects(text, text, int) TO authenticated;
