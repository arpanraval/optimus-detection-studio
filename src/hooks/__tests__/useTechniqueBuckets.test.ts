import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTechniqueBuckets, __resetTechniqueBucketsCache } from '../useTechniqueBuckets';

const fetchRows = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => ({ select: () => ({ eq: fetchRows }) }) } }));
beforeEach(() => { __resetTechniqueBucketsCache(); fetchRows.mockReset(); });
afterEach(cleanup);
describe('technology mapping stays visible on navigation', () => {
  it('uses the resolved cached mapping immediately when the widget remounts', async () => {
    fetchRows.mockResolvedValue({ data: [{ mitre_id: 'T1059', platforms: ['Windows'] }], error: null });
    const first = renderHook(() => useTechniqueBuckets());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    const next = renderHook(() => useTechniqueBuckets());
    expect(next.result.current.loading).toBe(false);
    expect(next.result.current.buckets.get('T1059')?.has('endpoint')).toBe(true);
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });
  it('retries after a failed fetch instead of caching an empty successful result', async () => {
    fetchRows.mockResolvedValueOnce({ data: null, error: new Error('Offline') });
    const first = renderHook(() => useTechniqueBuckets());
    await waitFor(() => expect(first.result.current.error).toBe('Offline'));
    first.unmount();
    fetchRows.mockResolvedValueOnce({ data: [{ mitre_id: 'T1059', platforms: ['Windows'] }], error: null });
    const next = renderHook(() => useTechniqueBuckets());
    await waitFor(() => expect(next.result.current.buckets.size).toBe(1));
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });
});
