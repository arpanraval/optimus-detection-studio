import React from 'react';

interface TTPFeasibilityBadgeProps {
  feasibility: 'full' | 'partial' | 'none' | 'unknown';
  missingDataSources?: string[];
}

export const TTPFeasibilityBadge: React.FC<TTPFeasibilityBadgeProps> = ({
  feasibility, missingDataSources
}) => {
  const config = {
    full: { label: 'Feasible', color: 'text-emerald-400 bg-emerald-500/15', icon: '✓' },
    partial: { label: 'Partial', color: 'text-amber-400 bg-amber-500/15', icon: '~' },
    none: { label: 'No log sources', color: 'text-on-surface-variant/50 bg-surface-container-high', icon: '✗' },
    unknown: { label: 'Unknown', color: 'text-on-surface-variant/50 bg-surface-container-high', icon: '?' },
  };

  const c = config[feasibility];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.color}`}
      title={missingDataSources?.length ? `Missing: ${missingDataSources.join(', ')}` : undefined}
    >
      {c.icon} {c.label}
    </span>
  );
};
