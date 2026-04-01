import React from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';

const PriorityGapsTableWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture, loading } = useDefensivePosture(userId, scopeFilter);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 rounded bg-surface-container-low/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const gaps = posture?.top_gaps ?? [];
  if (gaps.length === 0) return <WidgetEmptyState message="No coverage gaps detected" />;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/10 text-[9px] font-brand font-bold text-on-surface-variant/40 tracking-wider uppercase">
        <span className="w-6">#</span>
        <span className="w-16">ID</span>
        <span className="flex-1">Technique</span>
        <span className="w-12 text-right">TIS</span>
        <span className="w-14 text-right">Gap</span>
        <span className="w-12" />
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {gaps.map((g, i) => (
          <div
            key={g.mitre_id}
            className="group flex items-center gap-2 px-4 py-1.5 hover:bg-surface-container-low/50 transition-colors"
          >
            <span className="text-[10px] font-brand font-bold text-on-surface-variant/30 w-6">
              {i + 1}
            </span>
            <span className="text-[10px] font-mono font-bold text-primary w-16 flex-shrink-0">
              {g.mitre_id}
            </span>
            <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">
              {g.name}
            </span>
            <span className="text-[10px] font-brand font-bold text-on-surface-variant/60 w-12 text-right">
              {g.tis.toFixed(1)}
            </span>
            <span className="text-[10px] font-brand font-bold text-error w-14 text-right">
              {g.gap_score.toFixed(1)}
            </span>
            <button
              onClick={() => onNavigate('add_selection', { prefillMitreIds: [g.mitre_id] })}
              className="w-12 text-[9px] font-brand font-bold text-primary/0 group-hover:text-primary transition-colors cursor-pointer"
            >
              BUILD
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PriorityGapsTableWidget;
