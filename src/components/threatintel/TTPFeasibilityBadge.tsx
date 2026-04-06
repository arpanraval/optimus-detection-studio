import React from 'react';
import { Icon } from '../Icon';

interface TTPFeasibilityBadgeProps {
  feasibility: 'full' | 'partial' | 'none' | 'unknown';
  missingDataSources?: string[];
}

export const TTPFeasibilityBadge: React.FC<TTPFeasibilityBadgeProps> = ({
  feasibility, missingDataSources
}) => {
  const config = {
    full: { label: 'Feasible', color: 'text-emerald-400 bg-emerald-500/15', iconName: 'check' },
    partial: { label: 'Partial', color: 'text-amber-400 bg-amber-500/15', iconName: 'minus' },
    none: { label: 'No log sources', color: 'text-on-surface-variant/50 bg-surface-container-high', iconName: 'x' },
    unknown: { label: 'Unknown', color: 'text-on-surface-variant/50 bg-surface-container-high', iconName: 'help-circle' },
  };

  const c = config[feasibility];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.color}`}
      title={missingDataSources?.length ? `Missing: ${missingDataSources.join(', ')}` : undefined}
      aria-label={`Feasibility: ${c.label}`}
    >
      <Icon name={c.iconName} className="w-3 h-3" />
      {c.label}
    </span>
  );
};
