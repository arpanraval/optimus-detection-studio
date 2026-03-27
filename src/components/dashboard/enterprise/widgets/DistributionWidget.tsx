import React, { useState, useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const FILTER_MAP: Record<string, string> = {
  byLanguage: 'queryLanguage', byPlatform: 'platform', byLogSource: 'logSource', byStatus: 'status', bySeverity: 'severity',
};

const DistributionWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();
  const [expanded, setExpanded] = useState(false);

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);
  const distributionKey = (config.custom?.distributionKey as string) || 'byLanguage';
  const title = (config.custom?.distributionTitle as string) || config.titleOverride || 'Distribution';
  const accent = config.accentColor;

  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach(d => {
      if (distributionKey === 'byLanguage' && d.queryLanguage) counts[d.queryLanguage] = (counts[d.queryLanguage] || 0) + 1;
      else if (distributionKey === 'byPlatform') (d.platforms || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; });
      else if (distributionKey === 'byLogSource') (d.logSources || []).forEach(ls => { counts[ls] = (counts[ls] || 0) + 1; });
      else if (distributionKey === 'byStatus' && d.status) counts[d.status] = (counts[d.status] || 0) + 1;
      else if (distributionKey === 'bySeverity' && d.severity) counts[d.severity] = (counts[d.severity] || 0) + 1;
    });
    return counts;
  }, [detections, distributionKey]);

  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = sorted.length > 0 ? sorted[0][1] : 1;
  if (sorted.length === 0) return <WidgetEmptyState message={`No ${title.toLowerCase()} data`} />;

  const visible = expanded ? sorted : sorted.slice(0, 3);
  const hasMore = sorted.length > 3;
  const filterKey = FILTER_MAP[distributionKey] || 'filter';

  return (
    <div className="p-4 h-full">
      <div className="space-y-0.5">
        {visible.map(([name, count]) => (
          <div key={name} onClick={() => onNavigate('library', { [filterKey]: name })}
            className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer hover:bg-surface-container-low/50 transition-colors">
            <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{name}</span>
            <div className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: accent ? withAlpha(accent, 0.1) : 'rgb(var(--md-sys-color-primary) / 0.15)' }}>
              <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: accent || 'rgb(var(--md-sys-color-primary))' }} />
            </div>
            <span className="text-[11px] font-brand font-bold w-10 text-right flex-shrink-0" style={{ color: accent || 'rgb(var(--md-sys-color-primary))' }}>{count}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1.5 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide">
          {expanded ? 'SHOW LESS' : `+${sorted.length - 3} MORE`}
        </button>
      )}
    </div>
  );
};

export default DistributionWidget;
