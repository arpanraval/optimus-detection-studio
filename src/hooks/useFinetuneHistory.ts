import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { FinetuneLadder, FinetuneStatus, FinetuneUsage } from '../types/finetune';

/**
 * A finetuning session as it appears in the history list. Mirrors the
 * `detection_finetune_runs` row but typed for client consumption.
 */
export interface FinetuneHistoryEntry {
  id: string;
  detection_id: string;
  integration_id: string;
  provider: string;
  status: FinetuneStatus;
  window_days: number;
  baseline_hit_count: number | null;
  query_count: number;
  result: FinetuneLadder | null;
  error_message: string | null;
  usage: FinetuneUsage | null;
  created_at: string;
  completed_at: string | null;
}

interface UseFinetuneHistoryReturn {
  entries: FinetuneHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches the most recent finetune sessions for a detection. RLS on
 * `detection_finetune_runs` restricts the result set to the caller's own rows.
 */
export function useFinetuneHistory(detectionId: string, limit = 20): UseFinetuneHistoryReturn {
  const [entries, setEntries] = useState<FinetuneHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('detection_finetune_runs')
      .select(
        'id, detection_id, integration_id, provider, status, window_days, baseline_hit_count, query_count, result, error_message, usage, created_at, completed_at',
      )
      .eq('detection_id', detectionId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setEntries([]);
        } else {
          setEntries((data as FinetuneHistoryEntry[] | null) ?? []);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detectionId, limit, refreshKey]);

  return { entries, loading, error, refresh: () => setRefreshKey((k) => k + 1) };
}
