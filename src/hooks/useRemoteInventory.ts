import { useCallback, useEffect, useRef, useState } from 'react';
import { nativeSiemService, type InventoryPage, type NativeSyncRun } from '@/services/nativeSiemService';
import type { InventoryRelationship } from '../../supabase/functions/_shared/native-siem-model';

const ZERO_COUNTS: Record<InventoryRelationship, number> = {
  not_in_library: 0,
  already_in_library: 0,
  archived_in_library: 0,
  match_needed: 0,
  unsupported: 0,
};

/** Which job starter last set `run` — the poll re-invokes it (idempotent status refresh)
 *  rather than calling a separate status endpoint, since none exists. */
type ActiveKind = 'start' | 'refresh' | null;

export function useRemoteInventory(integrationId: string) {
  const [page, setPage] = useState<InventoryPage | null>(null);
  const [counts, setCounts] = useState<Record<InventoryRelationship, number>>(ZERO_COUNTS);
  const [run, setRun] = useState<NativeSyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [relationship, setRelationshipState] = useState<InventoryRelationship | 'all'>('all');
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageIndex, setPageIndexState] = useState(0);
  const activeKind = useRef<ActiveKind>(null);
  const generation = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const setRelationship = useCallback((value: InventoryRelationship | 'all') => {
    setRelationshipState(value);
    setPageIndexState(0);
  }, []);
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPageIndexState(0);
  }, []);
  const setPageIndex = useCallback((value: number) => setPageIndexState(value), []);

  const loadPage = useCallback(async () => {
    const current = generation.current;
    try {
      const result = await nativeSiemService.inventoryPage({
        integrationId,
        relationship,
        search: debouncedSearch,
        page: pageIndex,
      });
      if (generation.current === current) {
        setPage(result);
        setError(null);
      }
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Could not load inventory');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [integrationId, relationship, debouncedSearch, pageIndex]);

  const loadCounts = useCallback(async () => {
    try {
      const result = await nativeSiemService.inventoryCounts(integrationId, debouncedSearch);
      setCounts(result);
    } catch {
      /* counts are supplementary; a failure here does not block the page from rendering */
    }
  }, [integrationId, debouncedSearch]);

  // Reset on connection change and load the first page.
  useEffect(() => {
    const activeGeneration = ++generation.current;
    setPage(null);
    setLoading(true);
    setError(null);
    return () => {
      generation.current = activeGeneration + 1;
    };
  }, [integrationId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const running = starting || ['queued', 'running'].includes(run?.status || '');

  useEffect(() => {
    if (!running || !activeKind.current) return;
    // Sequential polling avoids overlapping reloads; the server owns job execution.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let stillRunning = true;
    const poll = async () => {
      try {
        const result =
          activeKind.current === 'refresh'
            ? await nativeSiemService.refreshTracked(integrationId)
            : await nativeSiemService.startInventory(integrationId);
        if (!cancelled) {
          setRun(result);
          stillRunning = ['queued', 'running'].includes(result.status);
          await Promise.all([loadPage(), loadCounts()]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not refresh inventory status');
      }
      if (!cancelled && stillRunning) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, integrationId, loadPage, loadCounts]);

  const reload = useCallback(async () => {
    await Promise.all([loadPage(), loadCounts()]);
  }, [loadPage, loadCounts]);

  const startInventory = useCallback(async () => {
    setStarting(true);
    setError(null);
    activeKind.current = 'start';
    try {
      const result = await nativeSiemService.startInventory(integrationId);
      setRun(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start inventory');
    } finally {
      setStarting(false);
    }
  }, [integrationId]);

  const refreshTracked = useCallback(async () => {
    setStarting(true);
    setError(null);
    activeKind.current = 'refresh';
    try {
      const result = await nativeSiemService.refreshTracked(integrationId);
      setRun(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh tracked rules');
    } finally {
      setStarting(false);
    }
  }, [integrationId]);

  return {
    page,
    counts,
    run,
    loading,
    error,
    running,
    relationship,
    setRelationship,
    search,
    setSearch,
    pageIndex,
    setPageIndex,
    reload,
    startInventory,
    refreshTracked,
  };
}
