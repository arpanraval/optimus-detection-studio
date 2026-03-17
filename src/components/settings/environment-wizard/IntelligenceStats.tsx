import React from 'react';
import { AnimatedNumber } from '../../optimus/AnimatedNumber';

interface IntelligenceStatsProps {
  threatGroupCount: number;
  recommendedCount: number;
  gapCount: number;
  matchedCount: number;
  totalDetections: number;
  siemMatchCount: number;
  loading: boolean;
}

export const IntelligenceStats: React.FC<IntelligenceStatsProps> = ({
  threatGroupCount,
  recommendedCount,
  gapCount,
  matchedCount,
  totalDetections,
  siemMatchCount,
  loading,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 animate-pulse"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
          >
            <div className="h-4 bg-surface-container-high rounded w-20 mx-auto mb-2" />
            <div className="h-8 bg-surface-container-high rounded w-12 mx-auto" />
          </div>
        ))}
      </div>
    );
  }

  const coveragePercent = totalDetections > 0
    ? Math.round((matchedCount / totalDetections) * 100)
    : 0;

  const tiles = [
    { label: 'Threat Groups', value: threatGroupCount, colorClass: 'text-red-400' },
    { label: 'Ready to Deploy', value: recommendedCount, colorClass: 'text-tertiary' },
    { label: 'Coverage Gaps', value: gapCount, colorClass: 'text-warning' },
    { label: 'Library Coverage', value: coveragePercent, suffix: '%', colorClass: 'text-primary' },
    { label: 'Detections', value: matchedCount, total: totalDetections, colorClass: 'text-on-surface' },
    { label: 'SIEM Native', value: siemMatchCount, colorClass: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl px-5 py-5 text-center"
          style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-lowest))' }}
        >
          <div className="text-[12px] font-brand font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2">
            {tile.label}
          </div>
          <div className="flex items-baseline justify-center gap-0.5">
            <AnimatedNumber
              value={tile.value}
              suffix={tile.suffix}
              className={`text-3xl font-brand font-bold ${tile.colorClass}`}
            />
            {tile.total !== undefined && (
              <span className="text-sm text-on-surface-variant font-brand font-bold">
                /{tile.total.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
