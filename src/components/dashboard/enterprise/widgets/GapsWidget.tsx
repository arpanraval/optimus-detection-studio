import React, { useState } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';

const GapsWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate }) => {
  const { scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture } = useDefensivePosture(userId, scopeFilter);
  const [showAll, setShowAll] = useState(false);

  const gaps = posture?.top_gaps ?? [];
  if (gaps.length === 0) return <WidgetEmptyState message="No coverage gaps detected" />;

  const maxGap = Math.max(...gaps.map((g: any) => g.gap_score), 1);
  const maxItems = config.maxItems ?? 5;
  const visible = showAll ? gaps : gaps.slice(0, maxItems);

  return (
    <div className="p-4 h-full">
      <div className="space-y-0.5">
        {visible.map((g: any) => (
          <div key={g.mitre_id} onClick={() => onNavigate('add_selection')}
            className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer hover:bg-surface-container-low/50 transition-colors">
            <span className="text-[10px] font-brand font-bold text-on-surface-variant/40 w-12 flex-shrink-0">{g.mitre_id}</span>
            <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{g.name}</span>
            <div className="w-16 h-1.5 bg-red-500/20 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-red-500/50" style={{ width: `${(g.gap_score / maxGap) * 100}%` }} />
            </div>
            <span className="text-[10px] font-brand font-bold text-red-400/70 w-8 text-right flex-shrink-0">{g.gap_score.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {gaps.length > maxItems && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide">
          {showAll ? 'SHOW LESS' : `SHOW ALL (${gaps.length})`}
        </button>
      )}
    </div>
  );
};

export default GapsWidget;
