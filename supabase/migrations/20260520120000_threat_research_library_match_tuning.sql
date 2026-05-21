-- 20260520120000_threat_research_library_match_tuning.sql
--
-- Library-match short-circuit was not firing on threat-research opportunities
-- whose subject obviously already had coverage in the user's library. Live
-- trace audit (May 2026) showed combined_score landing in the ~0.65-0.70
-- band on real opportunity-vs-library pairs that, on inspection, were the
-- same detection — keyword-side was already strong (0.9+) thanks to the
-- OR-tsquery fix, but semantic-side under-delivered (real embeddings
-- against the full opportunity prose were ~0.55-0.65 cosine, not 1.0).
-- With 0.7 semantic / 0.3 keyword and a 0.75 threshold the short-circuit
-- couldn't clear.
--
-- Rebalance to 0.5 / 0.5 — keyword is now the reliable signal post-OR fix;
-- semantic still contributes but no longer dominates. The TS-side threshold
-- drops in lockstep from 0.75 → 0.6 (see detection-engineer.ts). Both
-- remain overridable per-deploy (callers pass explicit weights;
-- THREAT_RESEARCH_LIBRARY_MATCH_THRESHOLD env var for the TS clamp).
--
-- Callers: the threat-research-orchestrator's library-search tool is the
-- only consumer (verified by repo grep, May 2026). No other RPC consumers,
-- so changing the defaults is safe.

CREATE OR REPLACE FUNCTION public.hybrid_search_detections(
  p_query           text,
  p_query_embedding vector,
  p_semantic_weight double precision DEFAULT 0.5,
  p_keyword_weight  double precision DEFAULT 0.5,
  p_limit           integer          DEFAULT 25,
  p_status          text             DEFAULT NULL::text,
  p_severity        text             DEFAULT NULL::text
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
      ts_rank_cd(d.fts_vector, websearch_to_tsquery('english', p_query), 32)::float as score
    from detections d
    where d.fts_vector @@ websearch_to_tsquery('english', p_query)
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
  order by c.total_score desc
  limit p_limit;
end;
$function$;

COMMENT ON FUNCTION public.hybrid_search_detections(text, vector, double precision, double precision, integer, text, text) IS
  'Hybrid semantic+keyword detection search. 2026-05-20 retune: default weights are 0.5/0.5 (was 0.7/0.3). Keyword side is the reliable signal post-OR-tsquery fix; semantic embeddings against long opportunity prose under-delivered. Paired with detection-engineer.ts threshold drop 0.75 → 0.6.';
