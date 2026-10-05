import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeSiemService, type NativeInventory } from '@/services/nativeSiemService';
import { useNativeSiemInventory } from '../useNativeSiemInventory';

vi.mock('@/services/nativeSiemService', () => ({ nativeSiemService: { inventory: vi.fn(), start: vi.fn() } }));
const saved: NativeInventory = {
  rules: [{ id: 'binding-1', detection_id: 'stable-detection' } as NativeInventory['rules'][number]],
  run: {
    id: 'run-1',
    status: 'complete',
    phase: 'hydration',
    created_at: '2026-09-14',
    completed_at: '2026-09-14',
    heartbeat_at: null,
    error_message: null,
  },
  lastCompleteAt: '2026-09-14',
  counts: { imported: 1 },
  issues: [],
};

describe('persisted native SIEM inventory', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads saved library bindings on mount without fetching production', async () => {
    vi.mocked(nativeSiemService.inventory).mockResolvedValue(saved);
    const { result, unmount } = renderHook(() => useNativeSiemInventory('connection'));
    await waitFor(() => expect(result.current.inventory?.rules[0].detection_id).toBe('stable-detection'));
    unmount();
    const reopened = renderHook(() => useNativeSiemInventory('connection'));
    await waitFor(() => expect(reopened.result.current.inventory?.rules[0].id).toBe('binding-1'));
    expect(nativeSiemService.start).not.toHaveBeenCalled();
  });
  it('retains saved inventory when refreshing fails', async () => {
    vi.mocked(nativeSiemService.inventory).mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useNativeSiemInventory('connection'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.reload());
    expect(result.current.inventory?.rules).toEqual(saved.rules);
    expect(result.current.error).toBe('offline');
  });
  it('does not let a delayed old-connection response replace the new connection', async () => {
    let resolveOld!: (data: NativeInventory) => void;
    vi.mocked(nativeSiemService.inventory)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce({ ...saved, rules: [] });
    const { result, rerender } = renderHook(({ id }) => useNativeSiemInventory(id), { initialProps: { id: 'old' } });
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => resolveOld(saved));
    expect(result.current.inventory?.rules).toEqual([]);
  });
});
