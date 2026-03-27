import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { withAlpha } from '../engine/colorUtils';
import WidgetEmptyState from './WidgetEmptyState';

const AGE_BUCKETS = [
  { label: '< 7d', maxDays: 7 },
  { label: '7-30d', maxDays: 30 },
  { label: '1-3mo', maxDays: 90 },
  { label: '3-6mo', maxDays: 180 },
  { label: '6mo-1y', maxDays: 365 },
  { label: '> 1y', maxDays: Infinity },
];

// Opacity ramp: fresh = bright, stale = dim
const BUCKET_OPACITY = [1.0, 0.8, 0.6, 0.45, 0.3, 0.2];

const MS_PER_DAY = 86400000;

const DetectionAgeWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
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

  const { buckets, medianDays } = useMemo(() => {
    const now = Date.now();
    const counts = new Array(AGE_BUCKETS.length).fill(0);
    const ages: number[] = [];
    detections.forEach(d => {
      if (!d.createdDate) return;
      const days = Math.floor((now - new Date(d.createdDate).getTime()) / MS_PER_DAY);
      ages.push(days);
      let prevMax = 0;
      for (let i = 0; i < AGE_BUCKETS.length; i++) {
        if (days < AGE_BUCKETS[i].maxDays && days >= prevMax) { counts[i]++; break; }
        prevMax = AGE_BUCKETS[i].maxDays;
      }
    });
    ages.sort((a, b) => a - b);
    const median = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 0;
    return { buckets: counts, medianDays: median };
  }, [detections]);

  const total = buckets.reduce((s, v) => s + v, 0);
  if (total === 0) return <WidgetEmptyState message="No age data available" />;
  const maxBucket = Math.max(...buckets, 1);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-xl font-brand font-bold text-on-surface">{medianDays}d</span>
        <span className="text-[10px] font-brand text-on-surface-variant/40">median age</span>
      </div>
      <div className="flex-1 flex items-end gap-1 min-h-0">
        {AGE_BUCKETS.map((bucket, i) => {
          const count = buckets[i];
          const heightPct = Math.max((count / maxBucket) * 100, 6);
          return (
            <div key={bucket.label} className="flex-1 flex flex-col items-center h-full">
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/60 flex-shrink-0">{count.toLocaleString()}</span>
              <div className="flex-1 w-full flex items-end">
                <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: withAlpha(accent, BUCKET_OPACITY[i]) }} />
              </div>
              <span className="text-[8px] font-brand text-on-surface-variant/40 whitespace-nowrap flex-shrink-0">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DetectionAgeWidget;
