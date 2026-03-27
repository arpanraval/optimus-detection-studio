import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { withAlpha } from '../engine/colorUtils';
import WidgetEmptyState from './WidgetEmptyState';

const BUCKETS = [
  { label: '0-20', min: 0, max: 20 },
  { label: '20-40', min: 20, max: 40 },
  { label: '40-60', min: 40, max: 60 },
  { label: '60-80', min: 60, max: 80 },
  { label: '80-100', min: 80, max: 101 },
];

// Opacity ramp: low scores dim, high scores strong
const BUCKET_OPACITY = [0.2, 0.35, 0.5, 0.7, 1.0];

const QualityScoreWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
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

  const { bucketCounts, avg, scored } = useMemo(() => {
    const counts = new Array(BUCKETS.length).fill(0);
    let sum = 0;
    let n = 0;
    detections.forEach(d => {
      const q = d.qualityScore;
      if (q == null || typeof q !== 'number') return;
      n++;
      sum += q;
      const idx = BUCKETS.findIndex(b => q >= b.min && q < b.max);
      if (idx >= 0) counts[idx]++;
    });
    return { bucketCounts: counts, avg: n > 0 ? Math.round(sum / n) : 0, scored: n };
  }, [detections]);

  if (scored === 0) return <WidgetEmptyState message="No quality score data" />;
  const maxBucket = Math.max(...bucketCounts, 1);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-2xl font-brand font-bold" style={{ color: accent }}>{avg}</span>
        <span className="text-[10px] font-brand text-on-surface-variant/40">avg score</span>
      </div>
      <div className="flex-1 flex items-end gap-1.5 min-h-0">
        {BUCKETS.map((bucket, i) => {
          const count = bucketCounts[i];
          const heightPct = Math.max((count / maxBucket) * 100, 6);
          return (
            <div key={bucket.label} className="flex-1 flex flex-col items-center h-full">
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/60 flex-shrink-0">{count.toLocaleString()}</span>
              <div className="flex-1 w-full flex items-end">
                <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: withAlpha(accent, BUCKET_OPACITY[i]) }} />
              </div>
              <span className="text-[8px] font-brand text-on-surface-variant/40 flex-shrink-0">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QualityScoreWidget;
