import React from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const CARD_COLORS = [
  'rgb(var(--md-sys-color-primary))',
  'rgb(var(--md-sys-color-tertiary))',
  'rgb(var(--md-ext-color-indigo))',
];

const QuickWinsWidget: React.FC<WidgetComponentProps> = ({ onNavigate }) => {
  const { scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture, loading } = useDefensivePosture(userId, scopeFilter);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-3 gap-3 h-full">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-surface-container-low/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const gaps = posture?.top_gaps?.slice(0, 3) ?? [];
  if (gaps.length === 0) return <WidgetEmptyState message="No coverage gaps detected" />;

  return (
    <div className="p-4 grid grid-cols-3 gap-3 h-full">
      {gaps.map((g, i) => {
        const color = CARD_COLORS[i];
        return (
          <div
            key={g.mitre_id}
            className="rounded-lg p-3 flex flex-col justify-between"
            style={{ backgroundColor: withAlpha(color, 0.08) }}
          >
            <div className="flex items-start gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: withAlpha(color, 0.2), color }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold block" style={{ color }}>
                  {g.mitre_id}
                </span>
                <span className="text-[11px] font-brand font-medium text-on-surface truncate block">
                  {g.name}
                </span>
                <span className="text-[9px] font-brand text-on-surface-variant/50">
                  TIS {g.tis.toFixed(1)}
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigate('add_selection', { prefillMitreIds: [g.mitre_id] })}
              className="mt-2 text-[9px] font-brand font-bold tracking-wide py-1 px-2 rounded cursor-pointer transition-opacity hover:opacity-80"
              style={{ backgroundColor: withAlpha(color, 0.2), color }}
            >
              CREATE DETECTION
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default QuickWinsWidget;
