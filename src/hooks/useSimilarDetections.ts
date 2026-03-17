import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  findSimilarDetections,
  type SimilarDetection,
  type GroupedSimilarDetections,
  type SimilarDetectionsOptions,
} from '../lib/similarDetectionsService';

interface UseSimilarDetectionsResult {
  /** Flat list of similar detections sorted by similarity */
  similar: SimilarDetection[];
  /** Detections grouped by query language */
  grouped: GroupedSimilarDetections;
  /** Whether the query is loading */
  loading: boolean;
  /** Error message if the query failed */
  error: string | null;
  /** Refetch similar detections */
  refresh: () => void;
}

/**
 * Hook to fetch similar detections for a given detection ID.
 * Calls the find_similar_detections RPC via pgvector cosine similarity.
 * Derives grouped results from the flat list (single RPC call).
 */
export function useSimilarDetections(
  detectionId: string | null | undefined,
  options: SimilarDetectionsOptions = {}
): UseSimilarDetectionsResult {
  const [similar, setSimilar] = useState<SimilarDetection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSimilar = useCallback(async () => {
    if (!detectionId) {
      setSimilar([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await findSimilarDetections(detectionId, options);
      setSimilar(results);
    } catch (err: any) {
      console.error('useSimilarDetections error:', err);
      setError(err.message || 'Failed to fetch similar detections');
      setSimilar([]);
    } finally {
      setLoading(false);
    }
  }, [detectionId, options.matchThreshold, options.matchCount]);

  useEffect(() => {
    fetchSimilar();
  }, [fetchSimilar]);

  // Derive grouped from flat results (no extra RPC call)
  const grouped = useMemo(() => {
    const result: GroupedSimilarDetections = {};
    for (const detection of similar) {
      const lang = detection.query_language || 'Unknown';
      if (!result[lang]) result[lang] = [];
      result[lang].push(detection);
    }
    return result;
  }, [similar]);

  return {
    similar,
    grouped,
    loading,
    error,
    refresh: fetchSimilar,
  };
}
