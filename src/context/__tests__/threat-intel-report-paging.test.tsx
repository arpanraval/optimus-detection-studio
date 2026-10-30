import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ ranges: [] as Array<[number, number]>, total: 0 }));

vi.mock('../../lib/supabaseClient', () => {
  // Chainable stand-in for the list query: order() twice, then range().
  const builder = {
    select: () => builder,
    order: () => builder,
    range: async (from: number, to: number) => {
      mocks.ranges.push([from, to]);
      const end = Math.min(to + 1, mocks.total);
      const data = Array.from({ length: Math.max(end - from, 0) }, (_, i) => ({
        id: `rep-${from + i}`,
        user_id: 'user-1',
        name: `Report ${from + i}`,
        updated_at: '2026-10-01T00:00:00Z',
      }));
      return { data, error: null };
    },
  };
  return { supabase: { from: () => builder } };
});
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import { ThreatIntelProvider, useThreatIntel } from '../ThreatIntelContext';

// The provider fetches more than once on mount; what matters is which pages
// it asks for, not how many times.
const distinctRanges = () => [...new Set(mocks.ranges.map(([a, b]) => `${a}-${b}`))];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThreatIntelProvider userId="user-1">{children}</ThreatIntelProvider>
);

describe('ThreatIntelProvider report list', () => {
  beforeEach(() => { mocks.ranges = []; });

  it('loads every report instead of stopping at the first 100', async () => {
    mocks.total = 1285;
    const { result } = renderHook(() => useThreatIntel(), { wrapper });
    await waitFor(() => expect(result.current.reports).toHaveLength(1285));
    expect(distinctRanges()).toEqual(['0-999', '1000-1999']);
  });

  it('stops after a short first page', async () => {
    mocks.total = 285;
    const { result } = renderHook(() => useThreatIntel(), { wrapper });
    await waitFor(() => expect(result.current.reports).toHaveLength(285));
    expect(distinctRanges()).toEqual(['0-999']);
  });
});
