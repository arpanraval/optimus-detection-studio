import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const COLORS = {
  Production: 'rgb(var(--md-sys-color-primary))',
  Testing: 'rgb(var(--md-ext-color-amber))',
  Other: 'rgb(var(--md-sys-color-on-surface-variant))',
};

interface MonthBucket {
  label: string;
  production: number;
  testing: number;
  other: number;
}

const RuleMaturityGrowthWidget: React.FC<WidgetComponentProps> = () => {
  const { detections } = useDashboardDetections();

  const buckets = useMemo(() => {
    if (detections.length === 0) return [];

    // Sort detections by createdDate
    const sorted = [...detections].sort(
      (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
    );

    // Build month buckets with accumulated counts
    const monthMap = new Map<string, MonthBucket>();
    let accProd = 0, accTest = 0, accOther = 0;

    for (const d of sorted) {
      const date = new Date(d.createdDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (d.status === 'Production') accProd++;
      else if (d.status === 'Testing') accTest++;
      else accOther++;

      monthMap.set(key, {
        label: key,
        production: accProd,
        testing: accTest,
        other: accOther,
      });
    }

    return Array.from(monthMap.values());
  }, [detections]);

  if (buckets.length === 0) return <WidgetEmptyState message="No detection history available" />;

  const maxVal = Math.max(...buckets.map((b) => b.production + b.testing + b.other), 1);
  const chartW = 600;
  const chartH = 200;
  const padL = 40;
  const padB = 24;
  const padT = 10;
  const padR = 10;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padB - padT;

  const xStep = buckets.length > 1 ? plotW / (buckets.length - 1) : plotW;

  function buildPath(getValue: (b: MonthBucket) => number, baseline?: (b: MonthBucket) => number): string {
    const pts = buckets.map((b, i) => {
      const x = padL + i * xStep;
      const y = padT + plotH - (getValue(b) / maxVal) * plotH;
      return `${x},${y}`;
    });
    const basePts = buckets.map((b, i) => {
      const x = padL + i * xStep;
      const y = baseline ? padT + plotH - (baseline(b) / maxVal) * plotH : padT + plotH;
      return `${x},${y}`;
    }).reverse();
    return `M${pts.join('L')}L${basePts.join('L')}Z`;
  }

  // Grid lines
  const gridLines = [0.25, 0.5, 0.75].map((pct) => {
    const y = padT + plotH - pct * plotH;
    return { y, label: Math.round(maxVal * pct) };
  });

  // X-axis labels — show every Nth label
  const labelStep = Math.max(1, Math.floor(buckets.length / 6));

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Legend */}
      <div className="flex gap-4 mb-2">
        {Object.entries(COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-brand font-bold text-on-surface-variant/50">{label}</span>
          </div>
        ))}
      </div>
      {/* Chart */}
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="flex-1 w-full" preserveAspectRatio="none">
        {/* Grid */}
        {gridLines.map((gl) => (
          <g key={gl.y}>
            <line x1={padL} y1={gl.y} x2={chartW - padR} y2={gl.y} stroke="currentColor" strokeWidth="0.5" className="text-on-surface-variant/10" />
            <text x={padL - 4} y={gl.y + 3} textAnchor="end" fontSize="8" className="fill-on-surface-variant/30">{gl.label}</text>
          </g>
        ))}
        {/* Stacked areas — bottom to top: Other, Testing, Production */}
        <path
          d={buildPath((b) => b.other + b.testing + b.production)}
          fill={COLORS.Other}
          fillOpacity={0.6}
        />
        <path
          d={buildPath(
            (b) => b.testing + b.production,
          )}
          fill={COLORS.Testing}
          fillOpacity={0.6}
        />
        <path
          d={buildPath((b) => b.production)}
          fill={COLORS.Production}
          fillOpacity={0.6}
        />
        {/* X axis labels */}
        {buckets.map((b, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={padL + i * xStep} y={chartH - 4} textAnchor="middle" fontSize="7" className="fill-on-surface-variant/30">
              {b.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
};

export default RuleMaturityGrowthWidget;
