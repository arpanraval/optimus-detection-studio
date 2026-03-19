import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { DetectionPattern } from '../types/intelligence';
import { extractPatternFromDetection } from '../lib/patterns/extractPatterns';

interface PatternQuery {
  techniqueId?: string;
  logSource?: string;
  queryLanguage?: string;
  category?: string;
  limit?: number;
}

export function useDetectionPatterns() {
  const [loading, setLoading] = useState(false);

  const queryPatterns = useCallback(async (query: PatternQuery): Promise<DetectionPattern[]> => {
    let q = supabase
      .from('detection_patterns')
      .select('*')
      .limit(query.limit || 20);

    if (query.techniqueId) q = q.contains('technique_ids', [query.techniqueId]);
    if (query.logSource) q = q.contains('log_sources', [query.logSource]);
    if (query.queryLanguage) q = q.contains('query_languages', [query.queryLanguage]);
    if (query.category) q = q.contains('detection_categories', [query.category]);

    const { data } = await q;
    return (data as DetectionPattern[]) || [];
  }, []);

  const extractAndStore = useCallback(async (detections: any[], userId: string): Promise<number> => {
    setLoading(true);
    let stored = 0;
    try {
      const patterns = detections.map(d => extractPatternFromDetection(d, userId));
      // Upsert in batches of 100
      for (let i = 0; i < patterns.length; i += 100) {
        const batch = patterns.slice(i, i + 100);
        const { error } = await supabase
          .from('detection_patterns')
          .upsert(batch, { onConflict: 'user_id,detection_id' });
        if (!error) stored += batch.length;
      }
    } finally {
      setLoading(false);
    }
    return stored;
  }, []);

  return { queryPatterns, extractAndStore, loading };
}
