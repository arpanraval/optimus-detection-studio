/**
 * useDriftSummary — aggregate upstream-drift counts for badges (library button,
 * sidebar entry, Data Sync header). Subscribes to detection_drift changes (with
 * a short debounce so a bulk re-check doesn't refetch hundreds of times).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getDriftSummary } from '../services/drift/driftService';
import type { DriftSummary } from '../services/drift/types';

export function useDriftSummary() {
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getDriftSummary());
    } catch (e) {
      console.warn('[useDriftSummary] failed to load summary:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!cancelled) refresh();
      }, 750);
    };

    refresh();
    // Unique topic per mount: this hook runs in several components at once
    // (sidebar, library, data-sync). supabase.channel() dedupes by topic, so a
    // shared topic hands back an already-subscribed channel and .on() throws.
    const channel = supabase
      .channel(`detection_drift_summary-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detection_drift' }, scheduleRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { summary, loading, refresh };
}
