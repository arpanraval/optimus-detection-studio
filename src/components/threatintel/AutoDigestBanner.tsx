import React from 'react';
import { Icon } from '../Icon';

interface AutoDigestBannerProps {
  pendingCount: number;
  lowCoverageCount: number;
  onView: () => void;
  onDismiss: () => void;
}

export const AutoDigestBanner: React.FC<AutoDigestBannerProps> = ({
  pendingCount,
  lowCoverageCount,
  onView,
  onDismiss,
}) => {
  if (pendingCount === 0) return null;

  return (
    <div className="px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl mb-4 flex items-center gap-3">
      <span className="text-sm text-on-surface flex-1">
        <span className="mr-1">&#9889;</span>
        <span className="font-semibold">{pendingCount}</span> new report{pendingCount !== 1 ? 's' : ''} auto-digested overnight.
        {lowCoverageCount > 0 && (
          <> <span className="font-semibold">{lowCoverageCount}</span> {lowCoverageCount !== 1 ? 'have' : 'has'} coverage gaps below 50%.</>
        )}
      </span>
      <button
        onClick={onView}
        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        View
      </button>
      <button
        onClick={onDismiss}
        className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
        aria-label="Dismiss banner"
      >
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  );
};

export default AutoDigestBanner;
