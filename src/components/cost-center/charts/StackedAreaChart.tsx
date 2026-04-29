import React, { useId } from 'react';

export interface StackedSeries {
  key: string;
  label: string;
  color: string;             // CSS color (token-based)
}

export interface StackedDataPoint {
  label: string;             // x-axis label (e.g. "Apr 12")
  values: Record<string, number>;  // keyed by series.key
}

interface Props {
  data: StackedDataPoint[];
  series: StackedSeries[];   // bottom-to-top stack order
}

export const StackedAreaChart: React.FC<Props> = ({ data, series }) => {
  const gradId = useId();

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  // Compute stacked totals per data point
  const stacked = data.map(d => {
    let cum = 0;
    const layers: { key: string; from: number; to: number }[] = [];
    for (const s of series) {
      const v = d.values[s.key] ?? 0;
      layers.push({ key: s.key, from: cum, to: cum + v });
      cum += v;
    }
    return { label: d.label, total: cum, layers };
  });

  const maxVal = Math.max(...stacked.map(s => s.total), 1);
  const svgW = 100, svgH = 100;
  const padL = 4, padR = 1;
  const toX = (i: number) =>
    (padL / 100) * svgW + (i / Math.max(stacked.length - 1, 1)) * ((100 - padL - padR) / 100) * svgW;
  const toY = (v: number) => svgH - (v / maxVal) * svgH * 0.9 - svgH * 0.05;

  // Build a path per layer (bottom to top stacking)
  const layerPaths = series.map(s => {
    const tops = stacked.map((p, i) => `${toX(i)},${toY(p.layers.find(l => l.key === s.key)!.to)}`);
    const bottoms = stacked.map((p, i) => `${toX(i)},${toY(p.layers.find(l => l.key === s.key)!.from)}`).reverse();
    return `M ${tops.join(' L ')} L ${bottoms.join(' L ')} Z`;
  });

  return (
    <div className="h-full flex flex-col p-3">
      <div className="flex-1 relative">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gradId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.05" />
              </linearGradient>
            ))}
          </defs>
          {series.map((s, i) => (
            <path key={s.key} d={layerPaths[i]} fill={`url(#${gradId}-${i})`} stroke={s.color} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      {/* X-axis labels (corners only when many points) */}
      <div className="flex justify-between mt-1.5" style={{ paddingLeft: `${padL}%`, paddingRight: `${padR}%` }}>
        {stacked.length <= 12
          ? stacked.map((p, i) => <span key={i} className="text-[8px] text-on-surface-variant/60">{p.label}</span>)
          : (
            <>
              <span className="text-[8px] text-on-surface-variant/60">{stacked[0].label}</span>
              <span className="text-[8px] text-on-surface-variant/60">{stacked[stacked.length - 1].label}</span>
            </>
          )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-on-surface-variant">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
