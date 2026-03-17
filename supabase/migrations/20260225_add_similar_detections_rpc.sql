-- =============================================================================
-- Similar Detections RPC Function
-- Uses pgvector cosine similarity to find detections with similar embeddings
-- Scoped to detections owned by the calling user or in the universal library
-- =============================================================================

CREATE OR REPLACE FUNCTION find_similar_detections(
  p_detection_id TEXT,
  p_match_threshold FLOAT DEFAULT 0.3,
  p_match_count INT DEFAULT 10,
  p_exclude_self BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  detection_id TEXT,
  name TEXT,
  description TEXT,
  status TEXT,
  severity TEXT,
  query_language TEXT,
  similarity FLOAT,
  mitre_attack_ids TEXT[],
  source TEXT,
  library_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_embedding vector(1536);
  v_caller_id UUID;
BEGIN
  -- Get the calling user's ID from the JWT
  v_caller_id := auth.uid();

  -- Look up the embedding for the given detection
  -- Verify the caller owns the source detection or it's universal
  SELECT de.embedding INTO v_embedding
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE de.detection_id = p_detection_id
    AND (d.user_id = v_caller_id::text OR d.library_type = 'universal');

  -- If no embedding found (or unauthorized), return empty
  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.name,
    d.description,
    d.status,
    d.severity,
    d."queryLanguage" AS query_language,
    1 - (de.embedding <=> v_embedding) AS similarity,
    d."mitreAttackIds" AS mitre_attack_ids,
    d.source,
    d.library_type
  FROM detection_embeddings de
  JOIN detections d ON d.id = de.detection_id
  WHERE
    (NOT p_exclude_self OR de.detection_id != p_detection_id)
    AND 1 - (de.embedding <=> v_embedding) > p_match_threshold
    -- Only return detections the user can access
    AND (d.user_id = v_caller_id::text OR d.library_type = 'universal')
  ORDER BY de.embedding <=> v_embedding ASC
  LIMIT p_match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION find_similar_detections TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_detections TO service_role;

COMMENT ON FUNCTION find_similar_detections IS
  'Find semantically similar detections using pgvector cosine similarity.
   Scoped to detections owned by the calling user or in the universal library.';
