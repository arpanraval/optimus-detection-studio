/**
 * useSourceDrift — last-known persisted drift for one source (no network).
 * Powers an expanded source row on the Data Sync page.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSourceDriftItems } from '../services/drift/driftService';
import type { DriftSource, DriftItem, SourceReachability } from '../services/drift/types';

export function useSourceDrift(source: DriftSource | null) {
  const [items, setItems] = useState<DriftItem[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [reachability, setReachability] = useState<SourceReachability>('ok');
  const [loading, setLoading] = useState(false);

  const sourceKey = source ? `${source.sourceUrl}::${source.targetLibrary}` : null;

  const refresh = useCallback(async () => {
    if (!source) {
      setItems([]);
      setLastCheckedAt(null);
      return;
    }
    setLoading(true);
    try {
      const r = await getSourceDriftItems(source);
      setItems(r.items);
      setReachability(r.reachability);
      setLastCheckedAt(r.lastCheckedAt);
    } catch (e) {
      console.warn('[useSourceDrift] failed to load:', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, lastCheckedAt, reachability, loading, refresh };
}
