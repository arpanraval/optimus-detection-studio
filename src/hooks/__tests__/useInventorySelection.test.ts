import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInventorySelection } from '../useInventorySelection';
import type { InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';

const row = (id: string, relationship: InventoryRow['relationship'] = 'not_in_library'): InventoryRow => ({
  id, integration_id: 'c', vendor_rule_id: id, rule_family: 'correlation', display_name: id,
  observed_enabled: true, availability: 'present', normalization_error: null, match_candidate_count: 0,
  relationship, binding_id: null, binding_status: null, detection_id: null,
  last_seen_at: '2026-09-15T00:00:00Z',
});
const setup = (overrides = {}) => renderHook((props: Parameters<typeof useInventorySelection>[0]) =>
  useInventorySelection(props), { initialProps: { rows: [row('a'), row('b'), row('c', 'already_in_library')],
    eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true, ...overrides } });

describe('inventory selection', () => {
  it('selects nothing by default', () => {
    expect(setup().result.current.selectedCount).toBe(0);
  });

  it('refuses to select a rule that is already in the library', () => {
    const { result } = setup();
    act(() => result.current.toggle('c'));
    expect(result.current.selectedCount).toBe(0);
  });

  it('selects only the eligible rules on the current page', () => {
    const { result } = setup();
    act(() => result.current.togglePage());
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.pageAllSelected).toBe(true);
  });

  it('keeps selection across pagination', () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle('a'));
    rerender({ rows: [row('d')], eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true });
    expect(result.current.isSelected('a')).toBe(true);
  });

  it('clears selection when the filter changes, and says so', () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle('a'));
    rerender({ rows: [row('a')], eligibleTotal: 12, filterKey: 'not_in_library|proc',
      discoveryComplete: true });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.clearedByFilterChange).toBe(true);
  });

  it('will not offer all-matching selection while discovery is incomplete', () => {
    expect(setup({ discoveryComplete: false }).result.current.canSelectAllMatching).toBe(false);
  });

  it('counts all-matching minus exclusions', () => {
    const { result } = setup();
    act(() => result.current.selectAllMatching());
    expect(result.current.selectedCount).toBe(500);
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.selectedCount).toBe(498);
  });

  it('does not offer all-matching selection when nothing is eligible', () => {
    expect(setup({ eligibleTotal: 0 }).result.current.canSelectAllMatching).toBe(false);
  });
});
