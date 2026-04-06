import React, { useState } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../../../hooks/useImpactScores';
import { useCommandCenterData } from '../../../../hooks/useCommandCenterData';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const OriginWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate }) => {
  const { detections, scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture } = useDefensivePosture(userId, scopeFilter);
  const { actors } = useThreatActorWeights();
  const { originCoverage: origins } = useCommandCenterData(actors, detections, posture?.total_techniques);
  const [expanded, setExpanded] = useState(false);

  if (origins.length === 0) return <WidgetEmptyState message="Sync MITRE data to see threat origins" />;

  const maxItems = config.maxItems ?? 5;
  const visible = expanded ? origins : origins.slice(0, maxItems);
  const hasMore = origins.length > maxItems;
  const accent = config.accentColor;

  return (
    <div className="p-5 h-full">
      <div className="space-y-0.5">
        {visible.map((o, i) => (
          <div key={o.country} onClick={() => onNavigate('mitre', { origin: o.country })}
            className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 40}ms forwards` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accent ? withAlpha(accent, 0.1) : 'rgb(var(--md-sys-color-primary) / 0.1)' }}>
              <span className="text-[10px] font-brand font-bold" style={{ color: accent || 'rgb(var(--md-sys-color-primary))' }}>{o.coveragePct}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-brand font-medium text-on-surface truncate">{o.country}</span>
                <span className="text-[11px] font-brand font-semibold ml-2 flex-shrink-0" style={{ color: accent || 'rgb(var(--md-sys-color-primary))' }}>{o.coveredTechniques}/{o.totalTechniques} TTPs</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: accent ? withAlpha(accent, 0.1) : 'rgb(var(--md-sys-color-primary) / 0.15)' }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(o.coveragePct, 3)}%`, backgroundColor: accent || 'rgb(var(--md-sys-color-primary))' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide">
          {expanded ? 'SHOW LESS' : `+${origins.length - maxItems} MORE`}
        </button>
      )}
    </div>
  );
};

export default OriginWidget;
