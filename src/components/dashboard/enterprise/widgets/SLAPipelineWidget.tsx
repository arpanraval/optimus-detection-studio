import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const SLA_STAGES = ['Draft', 'Development', 'Review', 'Testing', 'Production'] as const;

const SLAPipelineWidget: React.FC<WidgetComponentProps> = ({ onNavigate, timeRange }) => {
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

  const stageData = useMemo(() => {
    if (detections.length === 0) return null;
    const now = Date.now();
    const byStage: Record<string, number[]> = {};
    SLA_STAGES.forEach(s => { byStage[s] = []; });
    detections.forEach(d => {
      if (!d.status || !d.createdDate) return;
      const stage = d.status as string;
      if (!(stage in byStage)) return;
      const created = new Date(d.createdDate).getTime();
      const updated = d.updatedDate ? new Date(d.updatedDate).getTime() : now;
      const days = Math.max(0, Math.round((updated - created) / (1000 * 60 * 60 * 24)));
      byStage[stage].push(days);
    });
    const result = SLA_STAGES.map(stage => {
      const vals = byStage[stage];
      const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
      return { stage, avg, count: vals.length };
    });
    const maxAvg = Math.max(...result.map(r => r.avg), 1);
    return { stages: result, maxAvg };
  }, [detections]);

  if (!stageData || stageData.stages.every(s => s.count === 0)) return <WidgetEmptyState message="No pipeline data" />;

  return (
    <div className="p-5 h-full">
      <div className="space-y-2">
        {stageData.stages.map((s, i) => (
          <div key={s.stage} onClick={() => onNavigate('library', { status: s.stage })}
            className="flex items-center gap-3 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 50}ms forwards` }}>
            <span className="text-[11px] font-brand font-medium text-on-surface-variant w-24 text-right flex-shrink-0">{s.stage}</span>
            <div className="flex-1 h-5 bg-primary/20 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary flex items-center justify-end pr-2"
                style={{ width: `${Math.max((s.avg / stageData.maxAvg) * 100, 8)}%`, transition: 'width 0.5s ease' }}>
                {s.avg > 0 && <span className="text-[9px] font-brand font-bold text-white">{s.avg}d</span>}
              </div>
            </div>
            <span className="text-[10px] font-brand font-medium text-on-surface-variant w-8 flex-shrink-0">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SLAPipelineWidget;
