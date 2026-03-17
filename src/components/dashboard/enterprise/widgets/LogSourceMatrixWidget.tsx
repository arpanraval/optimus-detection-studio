import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import { withAlpha } from '../engine/colorUtils';
import WidgetEmptyState from './WidgetEmptyState';

const LogSourceMatrixWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections: allDetections } = useAppData();
  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);

  const sources = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach(d => {
      (d.logSources || []).forEach((ls: string) => { counts[ls] = (counts[ls] || 0) + 1; });
      if (d.logSource) counts[d.logSource] = (counts[d.logSource] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.maxItems ?? 15)
      .map(([name, count]) => ({ name, count }));
  }, [detections, config.maxItems]);

  if (sources.length === 0) return <WidgetEmptyState message="No log source data" />;
  const maxCount = sources[0].count;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex-1 flex flex-wrap gap-1.5 content-start overflow-y-auto">
        {sources.map((s, i) => {
          const intensity = s.count / maxCount;
          return (
            <button key={s.name}
              onClick={() => onNavigate('library', { logSource: s.name })}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:scale-[1.02] cursor-pointer"
              style={{
                backgroundColor: withAlpha(accent, 0.06 + intensity * 0.18),
                opacity: 0, animation: `slideUp 150ms ease ${i * 30}ms forwards`,
              }}
              title={`${s.name}: ${s.count} detections`}>
              <span className="text-[10px] font-brand font-medium text-on-surface truncate max-w-[140px]">{s.name}</span>
              <span className="text-[10px] font-brand font-bold flex-shrink-0" style={{ color: accent }}>{s.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LogSourceMatrixWidget;
