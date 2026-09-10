import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, order, limit };
});

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { useCrowdStrikeFinetuneHistory } from '../useCrowdStrikeFinetuneHistory';

describe('useCrowdStrikeFinetuneHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the detection history from the CrowdStrike-only run table', async () => {
    const entry = {
      id: 'run-1',
      detection_id: 'detection-1',
      integration_id: 'integration-1',
      status: 'completed',
      repository: 'search-all',
      window_days: 30,
      baseline_hit_count: 200,
      query_count: 8,
      result: null,
      error_message: null,
      usage: null,
      created_at: '2026-08-12T14:46:01.000Z',
      completed_at: '2026-08-12T14:49:34.000Z',
    };
    mocks.limit.mockResolvedValueOnce({ data: [entry], error: null });

    const { result } = renderHook(() => useCrowdStrikeFinetuneHistory('detection-1', 10));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.from).toHaveBeenCalledWith('crowdstrike_finetune_runs');
    expect(mocks.eq).toHaveBeenCalledWith('detection_id', 'detection-1');
    expect(mocks.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(10);
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.error).toBeNull();
  });
});
