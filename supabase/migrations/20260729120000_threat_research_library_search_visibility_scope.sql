-- 20260729120000_threat_research_library_search_visibility_scope.sql
--
-- Cross-tenant leak fix. hybrid_search_detections and
-- tr_find_actor_tagged_detections are called by the threat-research
-- orchestrator using the service-role admin client (index.ts), which
-- bypasses RLS entirely (service_role_all ... USING (true) on detections).
-- Neither function re-implements the visibility check RLS would otherwise
-- enforce, so a threat-research session for User A could library-match
-- against User B's private, unshared development-library detection: if it
-- scored above the reuse threshold, Amendment 1's reuse-first logic would
-- copy User B's private query body verbatim into User A's tree.
--
-- Fix: add p_user_id, and require the same visibility rule development_select
-- already enforces for direct client access — production rows stay visible to
-- everyone (auth.uid() IS NOT NULL is implicit: both callers only ever run for
-- an authenticated session), development rows only when shared or owned by
-- the caller. p_user_id defaults to NULL, which (correctly) shows only
-- production rows if a caller ever forgets to pass it.

DROP FUNCTION IF EXISTS public.hybrid_search_detections(text, vector, double precision, double precision, integer, text, text);

CREATE OR REPLACE FUNCTION public.hybrid_search_detections(
  p_query           text,
  p_query_embedding vector,
  p_semantic_weight double precision DEFAULT 0.5,
  p_keyword_weight  double precision DEFAULT 0.5,
  p_limit           integer          DEFAULT 25,
  p_status          text             DEFAULT NULL::text,
  p_severity        text             DEFAULT NULL::text,
  p_user_id         uuid             DEFAULT NULL::uuid
)
 RETURNS TABLE(
   detection_id    text,
   name            text,
   description     text,
   mitre_ids       text[],
   status          text,
   severity        text,
   semantic_score  double precision,
   keyword_score   double precision,
   combined_score  double precision
 )
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

COMMENT ON FUNCTION public.hybrid_search_detections(text, vector, double precision, double precision, integer, text, text, uuid) IS
  'Hybrid semantic+keyword detection search. 2026-07-29: added p_user_id and a visibility filter (production always visible; development only when shared or owned by the caller) — this function is SECURITY INVOKER but the threat-research orchestrator calls it with the service-role client, which bypasses RLS, so the filter must be enforced here. Previously 2026-05-21: keyword side OR-tokenizes the input.';

-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.tr_find_actor_tagged_detections(text[], int);

CREATE OR REPLACE FUNCTION public.tr_find_actor_tagged_detections(
  p_aliases text[],
  p_limit int DEFAULT 200,
  p_user_id uuid DEFAULT NULL::uuid
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
    AND (
      d.library_type = 'production'
      OR (d.library_type = 'development' AND (d.visibility = 'shared' OR d.user_id = p_user_id))
    )
  ORDER BY d."updatedDate" DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.tr_find_actor_tagged_detections(text[], int, uuid) TO authenticated, service_role;
