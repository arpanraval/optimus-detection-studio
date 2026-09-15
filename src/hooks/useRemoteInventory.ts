import { useCallback, useEffect, useRef, useState } from 'react';
import { nativeSiemService, type InventoryCounts, type InventoryPage, type NativeSyncRun }
  from '@/services/nativeSiemService';
import type { InventoryRelationship } from '../../supabase/functions/_shared/native-siem-model';

const ZERO_COUNTS: InventoryCounts = {
  not_in_library: 0,
  already_in_library: 0,
  archived_in_library: 0,
  match_needed: 0,
  unsupported: 0,
  importable: 0,
};

const RUN_KINDS = ['inventory', 'refresh_tracked'];

export function useRemoteInventory(integrationId: string) {
  const [page, setPage] = useState<InventoryPage | null>(null);
  const [counts, setCounts] = useState<InventoryCounts>(ZERO_COUNTS);
  const [run, setRun] = useState<NativeSyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [relationship, setRelationshipState] = useState<InventoryRelationship | 'all'>('all');
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageIndex, setPageIndexState] = useState(0);
  const [inventoryRun, setInventoryRun] = useState<NativeSyncRun | null>(null);
  const generation = useRef(0);
  // A generation only changes when the CONNECTION changes, so it cannot order two reads issued
  // against the same connection: typing a search fires overlapping requests whose responses can
  // arrive out of order, and the last one to land wins regardless of which was asked for last.
  // Each read stream therefore carries its own monotonic sequence, and only the newest applies.
  const pageSequence = useRef(0);
  const countsSequence = useRef(0);

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
    const sequence = ++pageSequence.current;
    const isCurrent = () => generation.current === current && sequence === pageSequence.current;
    setLoading(true);
    try {
      const result = await nativeSiemService.inventoryPage({
        integrationId,
        relationship,
        search: debouncedSearch,
        page: pageIndex,
      });
      if (isCurrent()) {
        setPage(result);
        setError(null);
      }
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : 'Could not load inventory');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [integrationId, relationship, debouncedSearch, pageIndex]);

  const loadCounts = useCallback(async () => {
    const current = generation.current;
    const sequence = ++countsSequence.current;
    try {
      const result = await nativeSiemService.inventoryCounts(integrationId, debouncedSearch);
      if (generation.current === current && sequence === countsSequence.current) setCounts(result);
    } catch {
      /* counts are supplementary; a failure here does not block the page from rendering */
    }
  }, [integrationId, debouncedSearch]);

  /** Reads the latest job's status over RLS-protected PostgREST. Never re-invokes a job
   *  starter to check status: the starters create a new run when none is active, so
   *  polling one would kick off a fresh scan every tick. */
  const loadRun = useCallback(async () => {
    const current = generation.current;
    try {
      const [latest, inventory] = await Promise.all([
        nativeSiemService.latestRun(integrationId, RUN_KINDS),
        nativeSiemService.latestRun(integrationId, ['inventory']),
      ]);
      if (generation.current === current) {
        setRun(latest);
        setInventoryRun(inventory);
      }
    } catch {
      /* run status is supplementary; a failure here does not block the page from rendering */
    }
  }, [integrationId]);

  // Reset on connection change and load the first page.
  useEffect(() => {
    const activeGeneration = ++generation.current;
    setPage(null);
    setRun(null);
    setInventoryRun(null);
    setCounts(ZERO_COUNTS);
    setPageIndexState(0);
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

  // Pick up a run already in flight when the page opens, not only one this hook started.
  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const running = starting || ['queued', 'running'].includes(run?.status || '');

  useEffect(() => {
    if (!running) return;
    // Sequential polling avoids overlapping reloads; the server owns job execution.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let stillRunning = true;
    const poll = async () => {
      try {
        const [result, inventory] = await Promise.all([
          nativeSiemService.latestRun(integrationId, RUN_KINDS),
          nativeSiemService.latestRun(integrationId, ['inventory']),
        ]);
        if (!cancelled) {
          setRun(result);
          setInventoryRun(inventory);
          stillRunning = ['queued', 'running'].includes(result?.status || '');
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
    inventoryRun,
    loading,
    error,
    running,
    relationship,
    setRelationship,
    search,
    setSearch,
    // The search the displayed page was actually fetched with. `search` is the keystroke-latest
    // value and runs ahead of it by the debounce interval, so a selection predicate built from
    // `search` can describe a filter the user has not been shown results for yet.
    appliedSearch: debouncedSearch,
    pageIndex,
    setPageIndex,
    reload,
    startInventory,
    refreshTracked,
  };
}
