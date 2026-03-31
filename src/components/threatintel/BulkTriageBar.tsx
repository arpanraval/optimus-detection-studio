import React from 'react';
import { Button } from '../ui/Button';

interface BulkTriageBarProps {
  selectedCount: number;
  onDismiss: () => void;
  onDefer: () => void;
  onMarkReviewed: () => void;
  onClearSelection: () => void;
}

export const BulkTriageBar: React.FC<BulkTriageBarProps> = ({
  selectedCount,
  onDismiss,
  onDefer,
  onMarkReviewed,
  onClearSelection,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="px-4 py-2 bg-surface-container-high rounded-xl border border-outline-variant/10 mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-on-surface">
          <span className="font-semibold">{selectedCount}</span> selected
        </span>
        <button
          onClick={onClearSelection}
          className="text-xs text-on-surface-variant hover:text-on-surface transition-colors underline"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="text" color="primary" size="sm" onClick={onMarkReviewed}>
          Mark Reviewed
        </Button>
        <Button variant="text" color="primary" size="sm" onClick={onDefer}>
          Defer
        </Button>
        <Button variant="tonal" color="error" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
};

export default BulkTriageBar;
