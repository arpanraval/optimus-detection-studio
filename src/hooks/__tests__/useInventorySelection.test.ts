import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInventorySelection } from '../useInventorySelection';
import type { InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';

const row = (id: string, relationship: InventoryRow['relationship'] = 'not_in_library'): InventoryRow => ({
  id, integration_id: 'c', vendor_rule_id: id, rule_family: 'correlation', display_name: id,
  observed_enabled: true, availability: 'present', normalization_error: null, match_candidate_count: 0,
  relationship, binding_id: null, binding_status: null, detection_id: null,
  last_seen_at: '2026-09-15T00:00:00Z', latest_snapshot_id: `snap-${id}`,
});
const setup = (overrides = {}) => renderHook((props: Parameters<typeof useInventorySelection>[0]) =>
  useInventorySelection(props), { initialProps: { rows: [row('a'), row('b'), row('c', 'already_in_library')],
    eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true, scopeRunId: 'run-1', ...overrides } });

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
    rerender({ rows: [row('d')], eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true, scopeRunId: 'run-1' });
    expect(result.current.isSelected('a')).toBe(true);
  });

  it('clears selection when the filter changes, and says so', () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle('a'));
    rerender({ rows: [row('a')], eligibleTotal: 12, filterKey: 'not_in_library|proc',
      discoveryComplete: true, scopeRunId: 'run-1' });
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

  it('keeps a page-1 exclusion applied on a later page, in all-matching mode', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAllMatching());
    act(() => result.current.toggle('a'));
    expect(result.current.selectedCount).toBe(499);
    rerender({ rows: [row('d'), row('e')], eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true, scopeRunId: 'run-1' });
    expect(result.current.isSelected('d')).toBe(true);
    expect(result.current.selectedCount).toBe(499);
    act(() => result.current.toggle('d'));
    expect(result.current.selectedCount).toBe(498);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('un-excludes a row from a different page than where it was excluded', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAllMatching());
    act(() => result.current.toggle('a'));
    rerender({ rows: [row('d'), row('e')], eligibleTotal: 500, filterKey: 'all|', discoveryComplete: true, scopeRunId: 'run-1' });
    rerender({ rows: [row('a'), row('b'), row('c', 'already_in_library')], eligibleTotal: 500, filterKey: 'all|',
      discoveryComplete: true, scopeRunId: 'run-1' });
    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.selectedCount).toBe(500);
  });

  it('binds a selection to the run it was made against (G07/G08)', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    expect(result.current.boundRunId).toBe('run-1');
  });

  it('clears selection when a newer scan replaces the run it was bound to, even with the same filter (G07)', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAllMatching());
    expect(result.current.boundRunId).toBe('run-1');
    // A background re-scan finished: the same filter, a different (newer) run.
    rerender({ rows: [row('a'), row('b'), row('c', 'already_in_library')], eligibleTotal: 500, filterKey: 'all|',
      discoveryComplete: true, scopeRunId: 'run-2' });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.boundRunId).toBe(null);
    expect(result.current.clearedByFilterChange).toBe(true);
  });

  it('never lets a stale (slower) response reintroduce a cleared selection (G23)', () => {
    // Simulates an out-of-order response arriving after the scope already advanced: rerendering
    // with the OLD run id must not resurrect it, because the hook only reacts to combinedKey
    // transitions relative to its own ref, not to absolute ordering of props.
    const { result, rerender } = setup();
    act(() => result.current.toggle('a'));
    rerender({ rows: [row('a'), row('b'), row('c', 'already_in_library')], eligibleTotal: 500, filterKey: 'all|',
      discoveryComplete: true, scopeRunId: 'run-2' });
    expect(result.current.selectedCount).toBe(0);
    // A late, stale response for run-1 arrives and re-renders with the old scope again.
    rerender({ rows: [row('a'), row('b'), row('c', 'already_in_library')], eligibleTotal: 500, filterKey: 'all|',
      discoveryComplete: true, scopeRunId: 'run-1' });
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('allows an explicit selection pinned to a still-running (incomplete) inventory run (G09)', () => {
    const { result } = setup({ discoveryComplete: false });
    act(() => result.current.toggle('a'));
    expect(result.current.boundRunId).toBe('run-1');
    expect(result.current.canSelectAllMatching).toBe(false);
  });

  it('reflects a partial exclusion on the current page in pageAllSelected', () => {
    const { result } = setup({ rows: [row('a'), row('b')] });
    act(() => result.current.selectAllMatching());
    act(() => result.current.toggle('a'));
    expect(result.current.pageAllSelected).toBe(false);
    act(() => result.current.toggle('a'));
    expect(result.current.pageAllSelected).toBe(true);
  });
});
