import React from 'react';
import { Icon } from '../../Icon';

interface Props {
  impact: number | null | undefined;
}

/** Renders the Coverage Impact badge in the header. Hides when 0/null/undefined. */
export function CoverageImpactBadge({ impact }: Props) {
  if (!impact || impact <= 0) return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-tertiary-container px-3 py-1 text-sm font-medium text-on-tertiary-container">
      <Icon name="arrow-down" size={14} />
      <span>{impact.toFixed(1)} gap points</span>
    </div>
  );
}

export default CoverageImpactBadge;
