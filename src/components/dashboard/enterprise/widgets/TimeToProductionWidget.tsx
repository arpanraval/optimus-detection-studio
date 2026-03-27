import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const MS_PER_DAY = 86400000;

const TimeToProductionWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();
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

  const { avgDays, buckets } = useMemo(() => {
    const prodDetections = detections.filter(d => d.status === 'Production' && d.createdDate && d.updatedDate);
    if (prodDetections.length === 0) return { avgDays: 0, buckets: [] };

    let totalDays = 0;
    const byMonth: Record<string, number[]> = {};

    prodDetections.forEach(d => {
      const created = new Date(d.createdDate!).getTime();
      const updated = new Date(d.updatedDate!).getTime();
      const days = Math.max(0, Math.round((updated - created) / MS_PER_DAY));
      totalDays += days;

      const month = new Date(d.updatedDate!).toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(days);
    });

    const sorted = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, days]) => ({
        label: new Date(month + '-01').toLocaleDateString('en', { month: 'short' }),
        avg: Math.round(days.reduce((s, v) => s + v, 0) / days.length),
        count: days.length,
      }));

    return { avgDays: Math.round(totalDays / prodDetections.length), buckets: sorted };
  }, [detections]);

  if (avgDays === 0 && buckets.length === 0) return <WidgetEmptyState message="No production detections" />;
  const maxAvg = Math.max(...buckets.map(b => b.avg), 1);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-2xl font-brand font-bold" style={{ color: accent }}>{avgDays}d</span>
        <span className="text-[10px] font-brand text-on-surface-variant/40">avg days to production</span>
      </div>
      {buckets.length > 0 && (
        <div className="flex-1 flex items-end gap-2 min-h-0">
          {buckets.map((b, i) => {
            const heightPct = Math.max((b.avg / maxAvg) * 100, 8);
            return (
              <div key={i} className="flex-1 flex flex-col items-center h-full">
                <span className="text-[9px] font-brand font-bold text-on-surface-variant/60 flex-shrink-0">{b.avg}d</span>
                <div className="flex-1 w-full flex items-end">
                  <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: accent }} />
                </div>
                <span className="text-[8px] font-brand text-on-surface-variant/40 flex-shrink-0">{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TimeToProductionWidget;
