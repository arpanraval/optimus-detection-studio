import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUsageContext, useAiUsage, useAiUsageData } from '../useAiUsage';

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{ table: string; signal: AbortSignal; resolve: (r: unknown) => void }>,
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'gte', 'lt', 'lte', 'in']) query[method] = () => query;
      query.abortSignal = (signal: AbortSignal) =>
        new Promise((resolve) => mocks.queries.push({ table, signal, resolve }));
      return query;
    },
  },
}));
const filters = { startDate: '2026-09-01T00:00:00Z', endDate: '2026-10-06T00:00:00Z' };
const daily = {
  user_id: 'one',
  feature: 'research',
  model: 'model',
  day: '2026-10-01',
  category: 'llm',
  call_count: 4,
  cost_usd: 2,
  input_tokens: 10,
  output_tokens: 5,
  failure_count: 0,
};
function Group({ group }: { group: 'feature' | 'day' | 'model' | 'user' }) {
  const data = useAiUsage(filters, group);
  return (
    <p>
      {group}: {data.hasLoaded ? data.totalCalls : 'pending'}
    </p>
  );
}
function Shared() {
  const data = useAiUsageData(filters);
  return (
    <AiUsageContext.Provider value={data}>
      {(['feature', 'day', 'model', 'user'] as const).map((group) => (
        <Group key={group} group={group} />
      ))}
    </AiUsageContext.Provider>
  );
}
beforeEach(() => {
  mocks.queries = [];
});
describe('usage request ownership', () => {
  it('shares one pair of reads across all overview groupings', async () => {
    render(<Shared />);
    expect(mocks.queries.map((q) => q.table)).toEqual(['ai_usage_daily', 'ai_usage_events']);
    await act(async () => {
      mocks.queries[0].resolve({ data: [daily], error: null });
      mocks.queries[1].resolve({ data: [], error: null });
    });
    expect(screen.getByText('feature: 4')).toBeTruthy();
    expect(screen.getByText('day: 4')).toBeTruthy();
    expect(screen.getByText('model: 4')).toBeTruthy();
    expect(screen.getByText('user: 4')).toBeTruthy();
    expect(mocks.queries).toHaveLength(2);
  });

  it('ignores a superseded response and retains values during a failed refresh', async () => {
    const hook = renderHook(({ end }) => useAiUsageData({ ...filters, endDate: end }), {
      initialProps: { end: filters.endDate },
    });
    const old = [...mocks.queries];
    hook.rerender({ end: '2026-10-07T00:00:00Z' });
    expect(old[0].signal.aborted).toBe(true);
    await act(async () => {
      mocks.queries[2].resolve({ data: [daily], error: null });
      mocks.queries[3].resolve({ data: [], error: null });
    });
    await act(async () => {
      old[0].resolve({ data: [], error: null });
      old[1].resolve({ data: [], error: null });
    });
    expect(hook.result.current.rollupRows).toHaveLength(1);
    act(() => {
      void hook.result.current.refetch();
    });
    expect(hook.result.current.hasLoaded).toBe(true);
    expect(hook.result.current.isLoading).toBe(true);
    await act(async () => {
      mocks.queries[4].resolve({ data: null, error: new Error('offline') });
      mocks.queries[5].resolve({ data: [], error: null });
    });
    expect(hook.result.current.rollupRows).toHaveLength(1);
    expect(hook.result.current.error?.message).toBe('offline');
    expect(hook.result.current.isLoading).toBe(false);
  });

  it('does not convert a failed first load to a successful empty result', async () => {
    const hook = renderHook(() => useAiUsageData(filters));
    await act(async () => {
      for (const q of mocks.queries) q.resolve({ data: null, error: new Error('denied') });
    });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.hasLoaded).toBe(false);
    expect(hook.result.current.error).not.toBeNull();
  });
});
