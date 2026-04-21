import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { DetectionPack } from '../types';

export function usePacksForDetection(detectionId: string | null) {
  const [packs, setPacks] = useState<DetectionPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!detectionId) {
      setPacks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('pack_detections')
        .select('pack_id, detection_packs(*)')
        .eq('detection_id', detectionId);

      if (fetchError) throw fetchError;

      const resolved = (data || [])
        .map((row: { detection_packs: unknown }) => row.detection_packs)
        .filter(Boolean) as unknown as DetectionPack[];
      setPacks(resolved);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load packs'));
    } finally {
      setLoading(false);
    }
  }, [detectionId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { packs, loading, error, refetch: fetch };
}
