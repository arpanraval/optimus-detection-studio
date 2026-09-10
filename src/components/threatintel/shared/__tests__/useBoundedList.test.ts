import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOUNDED_LIST_LIMIT, useBoundedList } from '../useBoundedList';

const listOf = (n: number) => Array.from({ length: n }, (_, i) => `item-${i}`);

describe('useBoundedList', () => {
  it('renders a short list whole and offers no control', () => {
    const items = listOf(3);
    const { result } = renderHook(() => useBoundedList(items, 10));

    expect(result.current.visible).toEqual(items);
    expect(result.current.hidden).toBe(0);
    expect(result.current.canExpand).toBe(false);
  });

  it('treats a list exactly at the limit as complete', () => {
    // Off-by-one here would render a "Show all 10" control that reveals nothing.
    const { result } = renderHook(() => useBoundedList(listOf(10), 10));

    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hidden).toBe(0);
    expect(result.current.canExpand).toBe(false);
  });

  it('bounds a long list and reports how many are withheld', () => {
    const { result } = renderHook(() => useBoundedList(listOf(278), 10));

    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hidden).toBe(268);
    expect(result.current.total).toBe(278);
    expect(result.current.canExpand).toBe(true);
  });

  it('expands to the full list and collapses again', () => {
    const { result } = renderHook(() => useBoundedList(listOf(238), 10));

    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(true);
    expect(result.current.visible).toHaveLength(238);
    expect(result.current.hidden).toBe(0);

    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hidden).toBe(228);
  });

  it('preserves order rather than sampling', () => {
    const { result } = renderHook(() => useBoundedList(listOf(50), 3));
    expect(result.current.visible).toEqual(['item-0', 'item-1', 'item-2']);
  });

  it('never withholds anything without saying so', () => {
    // The contract this hook exists to enforce: a caller that renders `visible`
    // and states `hidden` cannot present a bounded list as a complete one.
    // Constraint 1 -- do not hide data to fix a display problem.
    for (const size of [0, 1, 9, 10, 11, 100, 278]) {
      const { result } = renderHook(() => useBoundedList(listOf(size), 10));
      expect(result.current.visible.length + result.current.hidden).toBe(size);
      expect(result.current.total).toBe(size);
      expect(result.current.hidden > 0).toBe(result.current.canExpand);
    }
  });

  it('handles an empty list without offering a control', () => {
    const { result } = renderHook(() => useBoundedList([], 10));
    expect(result.current.visible).toEqual([]);
    expect(result.current.hidden).toBe(0);
    expect(result.current.canExpand).toBe(false);
  });

  it('defaults to a limit both call sites share', () => {
    const { result } = renderHook(() => useBoundedList(listOf(BOUNDED_LIST_LIMIT + 1)));
    expect(result.current.visible).toHaveLength(BOUNDED_LIST_LIMIT);
    expect(result.current.hidden).toBe(1);
  });
});
