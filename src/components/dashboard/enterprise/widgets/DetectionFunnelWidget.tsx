import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const STAGES = ['Draft', 'Development', 'Review', 'Testing', 'Production'] as const;
const STAGE_COLORS = ['rgb(var(--md-sys-color-tertiary))', 'rgb(var(--md-ext-color-amber))', 'rgb(var(--md-ext-color-blue))', 'rgb(var(--md-ext-color-indigo))', 'rgb(var(--md-ext-color-green))'];

const DetectionFunnelWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
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

  const stages = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(s => { counts[s] = 0; });
    detections.forEach(d => {
      if (d.status && counts[d.status] !== undefined) counts[d.status]++;
    });
    return STAGES.map((s, i) => ({ stage: s, count: counts[s], color: STAGE_COLORS[i] }));
  }, [detections]);

  const maxCount = Math.max(...stages.map(s => s.count), 1);
  const total = stages.reduce((s, v) => s + v.count, 0);

  if (total === 0) return <WidgetEmptyState message="No pipeline data" />;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex-1 flex flex-col justify-center space-y-1.5">
        {stages.map((s, i) => {
          const widthPct = Math.max((s.count / maxCount) * 100, 8);
          const prev = i > 0 ? stages[i - 1].count : null;
          const convRate = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
          return (
            <div key={s.stage} className="flex items-center gap-3"
              style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 60}ms forwards` }}>
              <span className="text-[10px] font-brand font-medium text-on-surface-variant w-20 text-right flex-shrink-0">{s.stage}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-6 rounded-md overflow-hidden bg-surface-container cursor-pointer hover:brightness-110 transition-all"
                  onClick={() => onNavigate('library', { status: s.stage })}>
                  <div className="h-full rounded-md flex items-center justify-end pr-2 transition-all duration-500"
                    style={{ width: `${widthPct}%`, backgroundColor: s.color }}>
                    <span className="text-[10px] font-brand font-bold text-white">{s.count}</span>
                  </div>
                </div>
                {convRate !== null && (
                  <span className="text-[9px] font-brand font-medium text-on-surface-variant/40 w-8 flex-shrink-0">{convRate}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DetectionFunnelWidget;
