import { useCallback, useEffect, useRef, useState } from 'react';
import { isImportEligible, type InventoryRow } from '../../supabase/functions/_shared/native-siem-model';

export type InventorySelection =
  | { mode: 'explicit'; ids: ReadonlySet<string> }
  | { mode: 'all_matching'; excluded: ReadonlySet<string> };

export interface UseInventorySelectionArgs {
  rows: InventoryRow[]; // current page
  eligibleTotal: number; // count of not_in_library under the active filter+search
  filterKey: string; // relationship + search; a change clears selection
  discoveryComplete: boolean;
}

export interface UseInventorySelectionResult {
  selection: InventorySelection;
  selectedCount: number;
  pageAllSelected: boolean;
  canSelectAllMatching: boolean;
  isSelected: (vendorRuleId: string) => boolean;
  toggle: (vendorRuleId: string) => void;
  togglePage: () => void;
  selectAllMatching: () => void;
  clear: () => void;
  clearedByFilterChange: boolean; // true for one render after an auto-clear
}

const EMPTY: InventorySelection = { mode: 'explicit', ids: new Set() };

export function useInventorySelection({
  rows,
  eligibleTotal,
  filterKey,
  discoveryComplete,
}: UseInventorySelectionArgs): UseInventorySelectionResult {
  const [selection, setSelection] = useState<InventorySelection>(EMPTY);
  const [clearedByFilterChange, setClearedByFilterChange] = useState(false);
  const filterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (filterKeyRef.current === filterKey) return;
    filterKeyRef.current = filterKey;
    setSelection(EMPTY);
    setClearedByFilterChange(true);
  }, [filterKey]);

  const eligibleRowIds = rows.filter((row) => isImportEligible(row.relationship)).map((row) => row.vendor_rule_id);

  const isSelected = useCallback(
    (vendorRuleId: string): boolean => {
      if (selection.mode === 'all_matching') return !selection.excluded.has(vendorRuleId);
      return selection.ids.has(vendorRuleId);
    },
    [selection],
  );

  const isEligibleId = useCallback(
    (vendorRuleId: string): boolean => {
      const row = rows.find((candidate) => candidate.vendor_rule_id === vendorRuleId);
      return row ? isImportEligible(row.relationship) : false;
    },
    [rows],
  );

  const toggle = useCallback(
    (vendorRuleId: string) => {
      if (!isEligibleId(vendorRuleId)) return;
      setClearedByFilterChange(false);
      setSelection((current) => {
        if (current.mode === 'all_matching') {
          const next = new Set(current.excluded);
          if (next.has(vendorRuleId)) next.delete(vendorRuleId);
          else next.add(vendorRuleId);
          return { mode: 'all_matching', excluded: next };
        }
        const next = new Set(current.ids);
        if (next.has(vendorRuleId)) next.delete(vendorRuleId);
        else next.add(vendorRuleId);
        return { mode: 'explicit', ids: next };
      });
    },
    [isEligibleId],
  );

  const togglePage = useCallback(() => {
    if (eligibleRowIds.length === 0) return;
    setClearedByFilterChange(false);
    setSelection((current) => {
      if (current.mode === 'all_matching') {
        const allExcluded = eligibleRowIds.every((id) => current.excluded.has(id));
        const next = new Set(current.excluded);
        if (allExcluded) eligibleRowIds.forEach((id) => next.delete(id));
        else eligibleRowIds.forEach((id) => next.add(id));
        return { mode: 'all_matching', excluded: next };
      }
      const allSelected = eligibleRowIds.every((id) => current.ids.has(id));
      const next = new Set(current.ids);
      if (allSelected) eligibleRowIds.forEach((id) => next.delete(id));
      else eligibleRowIds.forEach((id) => next.add(id));
      return { mode: 'explicit', ids: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const selectAllMatching = useCallback(() => {
    setClearedByFilterChange(false);
    setSelection({ mode: 'all_matching', excluded: new Set() });
  }, []);

  const clear = useCallback(() => {
    setClearedByFilterChange(false);
    setSelection(EMPTY);
  }, []);

  const selectedCount =
    selection.mode === 'all_matching' ? eligibleTotal - selection.excluded.size : selection.ids.size;

  const pageAllSelected = eligibleRowIds.length > 0 && eligibleRowIds.every((id) => isSelected(id));

  const canSelectAllMatching = discoveryComplete === true && eligibleTotal > 0;

  return {
    selection,
    selectedCount,
    pageAllSelected,
    canSelectAllMatching,
    isSelected,
    toggle,
    togglePage,
    selectAllMatching,
    clear,
    clearedByFilterChange,
  };
}
