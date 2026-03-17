import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const VelocityWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const { detections } = useAppData();

  const velocityData = useMemo(() => {
    if (detections.length === 0) return [];
    const reference = timeRange.endDate ? new Date(timeRange.endDate) : new Date();
    const weeks = 12;
    const buckets = new Array(weeks).fill(0);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const cutoff = reference.getTime() - weeks * msPerWeek;
    const rangeStart = timeRange.startDate ? new Date(timeRange.startDate).getTime() : 0;
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    detections.forEach(d => {
      if (!d.createdDate) return;
      const ts = new Date(d.createdDate).getTime();
      if (ts < cutoff || ts < rangeStart || ts > rangeEnd) return;
      const weekIdx = Math.min(Math.floor((reference.getTime() - ts) / msPerWeek), weeks - 1);
      buckets[weeks - 1 - weekIdx]++;
    });
    return buckets;
  }, [detections, timeRange]);

  if (velocityData.length === 0 || velocityData.every(v => v === 0)) {
    return <WidgetEmptyState message="No detection creation data" />;
  }

  const max = Math.max(...velocityData, 1);
  const total = velocityData.reduce((s, v) => s + v, 0);
  const recent = velocityData.slice(-4).reduce((s, v) => s + v, 0);
  const prior = velocityData.slice(-8, -4).reduce((s, v) => s + v, 0);
  const trend = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 100 : 0);
  const svgH = 64;
  const accent = config.accentColor;

  return (
    <div className="p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {trend !== 0 && (
            <span className={`text-[11px] font-brand font-bold ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend > 0 ? '\u2191' : '\u2193'} {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-brand font-bold text-on-surface">{total}</span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant">in 12 weeks</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: svgH }}>
        {velocityData.map((v, i) => {
          const h = max > 0 ? (v / max) * (svgH - 4) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t-md transition-all"
                style={{ height: Math.max(h, 2), backgroundColor: accent ? (v > 0 ? accent : withAlpha(accent, 0.2)) : `rgb(var(--md-sys-color-primary) / ${v > 0 ? 1 : 0.2})` }}
                title={`W${velocityData.length - i}: ${v} detections`} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {velocityData.map((_, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[8px] font-brand font-medium text-on-surface-variant/60">{i === 0 ? '12w' : i === velocityData.length - 1 ? 'now' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VelocityWidget;
