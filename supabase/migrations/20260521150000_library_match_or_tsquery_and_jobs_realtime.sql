-- 20260521150000_library_match_or_tsquery_and_jobs_realtime.sql
--
-- Two unrelated fixes batched into one migration because both are minor and
-- both are needed for the next research session to behave correctly.
--
-- Fix 1: hybrid_search_detections keyword side was AND-by-default.
--   websearch_to_tsquery requires EVERY token in the query to be present in
--   detections.fts_vector. For multi-word opportunity queries (e.g.
--   "accessibility binary file replacement in System32"), a single missing
--   stem ("replac") collapses the whole match to zero — even though 9+
--   T1546.008 detections exist in the library with strong semantic overlap.
--   Verified: combined_score self-match on the closest detection landed at
--   0.500 (1.0 semantic × 0.5 + 0.0 keyword × 0.5), below the 0.6 threshold.
--   Library matches fired exactly 0 times in the 2026-05-20 lsass session
--   despite the library containing direct T1546.008 coverage.
--
--   The repair: rewrite the input as OR-joined tokens before feeding it to
--   websearch_to_tsquery. websearch supports the lowercase 'or' keyword,
--   so "accessibility or binary or replacement" yields the OR tsquery
--   ('access' | 'binari' | 'replac'). Any single stem hit is now enough to
--   match; rank_cd still scores relevance proportionally.
--
-- Fix 2: threat_research_jobs missing from supabase_realtime publication.
--   The UI subscribes to postgres_changes on jobs to drive the in-progress
--   pulse animation. The subscription handshake succeeded silently but no
--   change events ever delivered because the table wasn't published. Result:
--   leaves stayed static during a run — pulse only appeared after a page
--   refresh re-fetched job state. threat_research_events and _sessions are
--   already published; jobs was the missing entry.

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
DECLARE
  -- OR-tokenize: collapse all whitespace runs into ' or '. websearch_to_tsquery
  -- treats the lowercase keyword 'or' as the OR boolean operator and emits a
  -- tsquery joined by '|'. Empty input is safe — websearch returns an empty
  -- tsquery and the FTS match below yields no rows.
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
  order by c.total_score desc
  limit p_limit;
end;
$function$;

COMMENT ON FUNCTION public.hybrid_search_detections(text, vector, double precision, double precision, integer, text, text) IS
  'Hybrid semantic+keyword detection search. 2026-05-21: keyword side now OR-tokenizes the input (was AND-by-default via websearch_to_tsquery). Defaults: 0.5/0.5 weights, threshold paired with TS-side 0.6 (env-overridable).';

-- Publish jobs table for UI realtime. Idempotent guard so re-running the
-- migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threat_research_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.threat_research_jobs;
  END IF;
END
$$;
