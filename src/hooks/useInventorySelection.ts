import { useCallback, useEffect, useRef, useState } from 'react';
import { importBlockedReason, type InventoryRow } from '../../supabase/functions/_shared/native-siem-model';

export type InventorySelection =
  | { mode: 'explicit'; ids: ReadonlySet<string> }
  | { mode: 'all_matching'; excluded: ReadonlySet<string> };

export interface UseInventorySelectionArgs {
  rows: InventoryRow[]; // current page
  eligibleTotal: number; // count of IMPORTABLE rows under the active filter+search
  filterKey: string; // connection + relationship + search; a change clears selection
  discoveryComplete: boolean;
  /** The server run (scan) the current page/counts were read against. Binding the selection to
   *  this id — not to whatever run happens to be current at submission time — is what stops a
   *  newer scan from silently substituting its scope under an "all matching" selection made
   *  against an older one (G07). A change clears the selection, same as a filter change,
   *  because the eligible set it was built against no longer exists. */
  scopeRunId: string | null;
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
  /** The run id the current selection is bound to (null when the selection is empty and has not
   *  yet been bound). Submission must use this id as `sourceRunId`, never a live/current run
   *  reference, so a scan that finishes after selection but before submit cannot substitute a
   *  different scope underneath an already-made "all matching" choice. */
  boundRunId: string | null;
}

const EMPTY: InventorySelection = { mode: 'explicit', ids: new Set() };

export function useInventorySelection({
  rows,
  eligibleTotal,
  filterKey,
  discoveryComplete,
  scopeRunId,
}: UseInventorySelectionArgs): UseInventorySelectionResult {
  const [selection, setSelection] = useState<InventorySelection>(EMPTY);
  const [clearedByFilterChange, setClearedByFilterChange] = useState(false);
  const [boundRunId, setBoundRunId] = useState<string | null>(null);
  // The combined identity a selection is valid against: connection/filter AND the specific scan
  // (run) it was read from. Either changing invalidates the selection with an explanation;
  // paging alone changes neither.
  const combinedKey = `${filterKey}|${scopeRunId ?? ''}`;
  const combinedKeyRef = useRef(combinedKey);

  useEffect(() => {
    if (combinedKeyRef.current === combinedKey) return;
    combinedKeyRef.current = combinedKey;
    setSelection(EMPTY);
    setBoundRunId(null);
    setClearedByFilterChange(true);
  }, [combinedKey]);

  const eligibleRowIds = rows
    .filter((row) => importBlockedReason(row) === null)
    .map((row) => row.vendor_rule_id);

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
      return row ? importBlockedReason(row) === null : false;
    },
    [rows],
  );

  const toggle = useCallback(
    (vendorRuleId: string) => {
      if (!isEligibleId(vendorRuleId)) return;
      setClearedByFilterChange(false);
      setBoundRunId(scopeRunId);
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
    [isEligibleId, scopeRunId],
  );

  const togglePage = useCallback(() => {
    if (eligibleRowIds.length === 0) return;
    setClearedByFilterChange(false);
    setBoundRunId(scopeRunId);
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
  }, [rows, scopeRunId]);

  const selectAllMatching = useCallback(() => {
    setClearedByFilterChange(false);
    setBoundRunId(scopeRunId);
    setSelection({ mode: 'all_matching', excluded: new Set() });
  }, [scopeRunId]);

  const clear = useCallback(() => {
    setClearedByFilterChange(false);
    setBoundRunId(null);
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
    boundRunId,
  };
}
