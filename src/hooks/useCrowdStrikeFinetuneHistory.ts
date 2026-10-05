import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  CrowdStrikeFinetuneLadder,
  CrowdStrikeFinetuneStatus,
  CrowdStrikeFinetuneUsage,
} from '../types/crowdstrikeFinetune';

export interface CrowdStrikeFinetuneHistoryEntry {
  id: string;
  detection_id: string;
  integration_id: string;
  original_query: string;
  status: CrowdStrikeFinetuneStatus;
  repository: string;
  window_days: number;
  baseline_hit_count: number | null;
  query_count: number;
  result: CrowdStrikeFinetuneLadder | null;
  error_message: string | null;
  usage: CrowdStrikeFinetuneUsage | null;
  created_at: string;
  completed_at: string | null;
}

interface UseCrowdStrikeFinetuneHistoryReturn {
  entries: CrowdStrikeFinetuneHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCrowdStrikeFinetuneHistory(detectionId: string, limit = 20): UseCrowdStrikeFinetuneHistoryReturn {
  const [entries, setEntries] = useState<CrowdStrikeFinetuneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('crowdstrike_finetune_runs')
      .select(
        'id, detection_id, integration_id, original_query, status, repository, window_days, baseline_hit_count, query_count, result, error_message, usage, created_at, completed_at',
      )
      .eq('detection_id', detectionId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setEntries([]);
        } else {
          setEntries((data as CrowdStrikeFinetuneHistoryEntry[] | null) ?? []);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detectionId, limit, refreshKey]);

  return { entries, loading, error, refresh: () => setRefreshKey((key) => key + 1) };
}
