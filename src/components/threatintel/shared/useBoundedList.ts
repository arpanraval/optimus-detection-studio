import { useCallback, useState } from 'react';

/**
 * Default number of items shown before a list collapses.
 *
 * Ten is roughly a screenful in both call sites and leaves the summary line
 * above the fold, which is the point: the reader should see the count and the
 * strongest few without scrolling past everything else.
 */
export const BOUNDED_LIST_LIMIT = 10;

export interface BoundedList<T> {
  /** The slice to render. Equal to the whole list once expanded. */
  visible: readonly T[];
  /** How many are currently not rendered. The caller MUST state this. */
  hidden: number;
  total: number;
  expanded: boolean;
  /** False when the list is short enough that no control should render at all. */
  canExpand: boolean;
  toggle: () => void;
}

/**
 * Bounds a list whose length is set by the data rather than by design.
 *
 * Both call sites render collections with no natural ceiling: a report carries
 * up to 278 library matches (G1), and a single TTP can reference 238 covering
 * detections (G8). Rendering them flat is the defect being fixed.
 *
 * Truncating them silently would be a different defect -- constraint 1, "do not
 * hide data to fix a display problem", and E2's "no silent caps: if a workflow
 * bounds coverage, say what was dropped". So this hook deliberately returns
 * `hidden` rather than just a slice: the caller is expected to render that
 * number, and everything stays one click away. Nothing is dropped, and the
 * reader is never told a bounded list is the whole list.
 */
export function useBoundedList<T>(
  items: readonly T[],
  limit: number = BOUNDED_LIST_LIMIT,
): BoundedList<T> {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const canExpand = items.length > limit;
  const visible = expanded || !canExpand ? items : items.slice(0, limit);

  return {
    visible,
    hidden: items.length - visible.length,
    total: items.length,
    expanded,
    canExpand,
    toggle,
  };
}
