import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const TOTAL_TECHNIQUES = 691;

const StrategyGapStatsWidget: React.FC<WidgetComponentProps> = () => {
  const { detections } = useDashboardDetections();

  const covered = useMemo(() => {
    const techs = new Set<string>();
    for (const d of detections) {
      if (d.mitreAttackIds) {
        for (const id of d.mitreAttackIds) {
          if (id) techs.add(id);
        }
      }
    }
    return techs.size;
  }, [detections]);

  if (detections.length === 0) return <WidgetEmptyState message="No detections available" />;

  const gaps = TOTAL_TECHNIQUES - covered;
  const pct = Math.round((covered / TOTAL_TECHNIQUES) * 100);

  const stats = [
    { label: 'Total Strategies', value: TOTAL_TECHNIQUES },
    { label: 'Covered', value: covered },
    { label: 'Gaps', value: gaps },
    { label: 'Techniques with Gaps', value: gaps },
  ];

  return (
    <div className="p-4 h-full flex flex-col justify-center gap-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center">
            <span className="text-2xl font-brand font-bold text-on-surface">
              {s.value.toLocaleString()}
            </span>
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/50 tracking-wide text-center">
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div className="px-2">
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.15)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: 'rgb(var(--md-sys-color-primary))' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] font-brand text-on-surface-variant/40">{pct}% covered</span>
          <span className="text-[9px] font-brand text-on-surface-variant/40">{covered}/{TOTAL_TECHNIQUES}</span>
        </div>
      </div>
    </div>
  );
};

export default StrategyGapStatsWidget;
