import { supabase } from './supabaseClient';

// =============================================================================
// Types
// =============================================================================

export interface SimilarDetection {
  detection_id: string;
  name: string;
  description: string;
  status: string;
  severity: string;
  query_language: string;
  similarity: number;
  mitre_attack_ids: string[];
  source: string;
  library_type: string;
}

export interface SimilarDetectionsOptions {
  matchThreshold?: number;
  matchCount?: number;
  excludeSelf?: boolean;
}

export interface GroupedSimilarDetections {
  [queryLanguage: string]: SimilarDetection[];
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Find detections similar to a given detection using pgvector cosine similarity.
 * Uses the find_similar_detections RPC which looks up the detection's embedding internally.
 */
export async function findSimilarDetections(
  detectionId: string,
  options: SimilarDetectionsOptions = {}
): Promise<SimilarDetection[]> {
  const {
    matchThreshold = 0.3,
    matchCount = 10,
    excludeSelf = true,
  } = options;

  const { data, error } = await supabase.rpc('find_similar_detections', {
    p_detection_id: detectionId,
    p_match_threshold: matchThreshold,
    p_match_count: matchCount,
    p_exclude_self: excludeSelf,
  });

  if (error) {
    console.error('Similar detections RPC error:', error);
    throw new Error(`Failed to find similar detections: ${error.message}`);
  }

  return (data as SimilarDetection[]) || [];
}

/**
 * Find similar detections grouped by query language.
 * Useful for showing cross-vendor coverage on the detection detail page.
 */
export async function findSimilarDetectionsGrouped(
  detectionId: string,
  options: SimilarDetectionsOptions = {}
): Promise<GroupedSimilarDetections> {
  const results = await findSimilarDetections(detectionId, options);

  const grouped: GroupedSimilarDetections = {};
  for (const detection of results) {
    const lang = detection.query_language || 'Unknown';
    if (!grouped[lang]) {
      grouped[lang] = [];
    }
    grouped[lang].push(detection);
  }

  return grouped;
}

