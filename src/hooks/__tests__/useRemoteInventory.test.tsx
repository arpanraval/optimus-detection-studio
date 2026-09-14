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
