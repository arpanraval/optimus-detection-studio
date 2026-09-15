import React from 'react';
import { Button } from '@/components/ui/Button';

export interface InventorySelectionBarProps {
  selectedCount: number;
  eligibleTotal: number;
  canSelectAllMatching: boolean;
  discoveryComplete: boolean;
  clearedByFilterChange: boolean;
  onSelectAllMatching: () => void;
  onClear: () => void;
  onSubmit: () => void;
  submitting?: boolean;
}

/** Sticky bar surfacing the current selection and the (stubbed) import action.
 *  Renders nothing while there is no selection to act on and no explanation to show. */
export function InventorySelectionBar({
  selectedCount,
  eligibleTotal,
  canSelectAllMatching,
  discoveryComplete,
  clearedByFilterChange,
  onSelectAllMatching,
  onClear,
  onSubmit,
  submitting = false,
}: InventorySelectionBarProps): React.JSX.Element | null {
  if (selectedCount === 0 && !clearedByFilterChange) return null;

  return (
    <div className="sticky bottom-0 z-10 border-t border-outline-variant/30 bg-surface-container-low px-5 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      {canSelectAllMatching && (
        <div className="mb-2 text-xs">
          <button
            type="button"
            onClick={onSelectAllMatching}
            className="font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {`Select all ${eligibleTotal} matching rules`}
          </button>
        </div>
      )}
      {!discoveryComplete && (
        <p className="mb-2 text-xs text-on-surface-variant">
          Still checking CrowdStrike. You can import the rules found so far.
        </p>
      )}
      {clearedByFilterChange && (
        <p role="status" className="mb-2 text-xs text-on-surface-variant">
          Selection cleared because the filter changed.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-on-surface-variant">
          <p className="font-medium text-on-surface">{`${selectedCount} selected`}</p>
          <p className="mt-0.5">Imported rules are added to the shared Production Library as unreviewed drafts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="text" onClick={onClear}>
            Clear selection
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting || selectedCount === 0}>
            {submitting ? 'Starting import…' : `Import selected (${selectedCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
