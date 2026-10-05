import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { nativeSiemService, type InventoryPage, type NativeSyncRun } from '@/services/nativeSiemService';
import { useRemoteInventory } from '../useRemoteInventory';

vi.mock('@/services/nativeSiemService', () => ({
  nativeSiemService: {
    inventoryPage: vi.fn(),
    inventoryCounts: vi.fn(),
    startInventory: vi.fn(),
    refreshTracked: vi.fn(),
    latestRun: vi.fn(),
  },
}));

const emptyPage: InventoryPage = { rows: [], hasMore: false };
const zeroCounts = {
  not_in_library: 0,
  already_in_library: 0,
  archived_in_library: 0,
  match_needed: 0,
  unsupported: 0,
  importable: 0,
};
const queuedRun: NativeSyncRun = {
  id: 'run-1',
  status: 'queued',
  phase: 'discovery',
  created_at: '2026-09-15',
  completed_at: null,
  heartbeat_at: null,
  error_message: null,
};
const completeRun: NativeSyncRun = { ...queuedRun, status: 'complete', completed_at: '2026-09-15' };

describe('useRemoteInventory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(nativeSiemService.inventoryPage).mockResolvedValue(emptyPage);
    vi.mocked(nativeSiemService.inventoryCounts).mockResolvedValue(zeroCounts);
    vi.mocked(nativeSiemService.latestRun).mockResolvedValue(null);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets pageIndex to 0 when relationship or search changes', async () => {
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    act(() => result.current.setPageIndex(3));
    expect(result.current.pageIndex).toBe(3);

    act(() => result.current.setRelationship('not_in_library'));
    expect(result.current.pageIndex).toBe(0);

    act(() => result.current.setPageIndex(2));
    act(() => result.current.setSearch('proc'));
    expect(result.current.pageIndex).toBe(0);
  });

  it('debounces search before sending it to the server', async () => {
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    vi.mocked(nativeSiemService.inventoryPage).mockClear();
    vi.mocked(nativeSiemService.inventoryCounts).mockClear();

    act(() => result.current.setSearch('proc'));
    // Not yet — debounce window hasn't elapsed.
    expect(nativeSiemService.inventoryPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: 'proc' }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(nativeSiemService.inventoryPage).toHaveBeenCalledWith(expect.objectContaining({ search: 'proc' }));
    expect(nativeSiemService.inventoryCounts).toHaveBeenCalledWith('connection', 'proc');
  });

  it('sends the server-side relationship filter instead of fetching everything and filtering locally', async () => {
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    act(() => result.current.setRelationship('not_in_library'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(nativeSiemService.inventoryPage).toHaveBeenCalledWith(
      expect.objectContaining({ relationship: 'not_in_library' }),
    );
  });

  // The generation counter only changes when the CONNECTION changes, so it cannot order two
  // reads issued against the same connection. Typing a search fires overlapping requests and
  // whichever lands last used to win -- showing results for a query the user has moved past.
  it('ignores a stale page response that lands after a newer one', async () => {
    const stale: InventoryPage = { rows: [], hasMore: true };
    const fresh: InventoryPage = { rows: [], hasMore: false };
    let releaseStale: (value: InventoryPage) => void = () => {};
    vi.mocked(nativeSiemService.inventoryPage).mockImplementation((args: { search?: string }) =>
      args.search === 'a' ? new Promise<InventoryPage>((resolve) => { releaseStale = resolve; })
        : args.search === 'ab' ? Promise.resolve(fresh)
        : Promise.resolve(emptyPage));

    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    act(() => result.current.setSearch('a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.setSearch('ab'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.page).toEqual(fresh);

    await act(async () => { releaseStale(stale); await vi.runOnlyPendingTimersAsync(); });
    expect(result.current.page).toEqual(fresh);
  });

  it('ignores a stale counts response that lands after a newer one', async () => {
    const stale = { ...zeroCounts, not_in_library: 99 };
    const fresh = { ...zeroCounts, not_in_library: 1 };
    let releaseStale: (value: typeof zeroCounts) => void = () => {};
    vi.mocked(nativeSiemService.inventoryCounts).mockImplementation((_id: string, search?: string) =>
      search === 'a' ? new Promise<typeof zeroCounts>((resolve) => { releaseStale = resolve; })
        : search === 'ab' ? Promise.resolve(fresh)
        : Promise.resolve(zeroCounts));

    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    act(() => result.current.setSearch('a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.setSearch('ab'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.counts.not_in_library).toBe(1);

    await act(async () => { releaseStale(stale); await vi.runOnlyPendingTimersAsync(); });
    expect(result.current.counts.not_in_library).toBe(1);
  });

  it('exposes the latest inventory run separately from refresh_tracked status', async () => {
    const refresh: NativeSyncRun = { ...completeRun, id: 'refresh-9' };
    const inventory: NativeSyncRun = { ...completeRun, id: 'inventory-4' };
    vi.mocked(nativeSiemService.latestRun).mockImplementation(async (_id: string, kinds?: string[]) =>
      kinds?.length === 1 && kinds[0] === 'inventory' ? inventory : refresh);
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    // An import must be sourced from the scan it reviewed, never from a tracked-refresh run.
    expect(result.current.run?.id).toBe('refresh-9');
    expect(result.current.inventoryRun?.id).toBe('inventory-4');
  });

  it('picks up a run already in flight on mount, without starting one', async () => {
    vi.mocked(nativeSiemService.latestRun).mockResolvedValue(queuedRun);
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.running).toBe(true);
    expect(result.current.run).toEqual(queuedRun);
    expect(nativeSiemService.startInventory).not.toHaveBeenCalled();
    expect(nativeSiemService.refreshTracked).not.toHaveBeenCalled();
    expect(nativeSiemService.latestRun).toHaveBeenCalledWith('connection', ['inventory', 'refresh_tracked']);
  });

  it('polls status via latestRun (never a job starter) and stops once the run completes', async () => {
    vi.mocked(nativeSiemService.startInventory).mockResolvedValueOnce(queuedRun);
    vi.mocked(nativeSiemService.latestRun).mockResolvedValueOnce(null).mockResolvedValueOnce(completeRun);
    const { result } = renderHook(() => useRemoteInventory('connection'));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await result.current.startInventory();
    });
    expect(result.current.running).toBe(true);

    vi.mocked(nativeSiemService.inventoryPage).mockClear();
    vi.mocked(nativeSiemService.inventoryCounts).mockClear();
    vi.mocked(nativeSiemService.startInventory).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The regression guard for the endless-scan bug: status polling must go through
    // latestRun over PostgREST, and never re-invoke a job starter (which would create
    // a brand-new run once the previous one is no longer active).
    expect(nativeSiemService.startInventory).not.toHaveBeenCalled();
    expect(nativeSiemService.refreshTracked).not.toHaveBeenCalled();
    expect(nativeSiemService.latestRun).toHaveBeenCalledWith('connection', ['inventory', 'refresh_tracked']);
    expect(nativeSiemService.inventoryPage).toHaveBeenCalled();
    expect(nativeSiemService.inventoryCounts).toHaveBeenCalled();
    expect(result.current.running).toBe(false);

    // The run just transitioned to complete: no further poll tick should fire.
    vi.mocked(nativeSiemService.latestRun).mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(nativeSiemService.latestRun).not.toHaveBeenCalled();
  });
});
