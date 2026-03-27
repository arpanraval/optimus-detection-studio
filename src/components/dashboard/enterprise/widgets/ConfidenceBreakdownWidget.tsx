import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const CONFIDENCE_LEVELS = [
  { key: 'High', color: 'rgb(var(--md-ext-color-green))', label: 'High' },
  { key: 'Medium', color: 'rgb(var(--md-ext-color-amber))', label: 'Medium' },
  { key: 'Low', color: 'rgb(var(--md-ext-color-coral))', label: 'Low' },
];

const ConfidenceBreakdownWidget: React.FC<WidgetComponentProps> = ({ onNavigate, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);

  const data = useMemo(() => {
    const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    detections.forEach(d => {
      if (d.confidence && counts[d.confidence] !== undefined) counts[d.confidence]++;
    });
    return counts;
  }, [detections]);

  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return <WidgetEmptyState message="No confidence data" />;

  return (
    <div className="p-5 h-full flex flex-col">
      {/* Stacked bar */}
      <div className="flex h-5 rounded-full overflow-hidden mb-3">
        {CONFIDENCE_LEVELS.map(level => {
          const count = data[level.key];
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div key={level.key}
              className="h-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
              style={{ width: `${pct}%`, backgroundColor: level.color, minWidth: count > 0 ? 20 : 0 }}
              onClick={() => onNavigate('library', { confidence: level.key })}
              title={`${level.label}: ${count} (${Math.round(pct)}%)`}>
              {pct > 12 && <span className="text-[9px] font-brand font-bold text-white">{Math.round(pct)}%</span>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-around">
        {CONFIDENCE_LEVELS.map(level => (
          <div key={level.key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: level.color }} />
            <span className="text-[10px] font-brand font-medium text-on-surface">{level.label}</span>
            <span className="text-[10px] font-brand font-bold text-on-surface-variant">{data[level.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConfidenceBreakdownWidget;
