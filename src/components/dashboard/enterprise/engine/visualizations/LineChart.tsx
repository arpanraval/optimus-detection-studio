import React from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

export const LineChart: React.FC<Props> = ({ data, config }) => {
  const gradientId = React.useId();
  const items = data.values;
  if (items.length === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  const maxVal = Math.max(...items.map(v => v.value), 1);
  const svgW = 100;
  const svgH = 100;
  const padL = 4;
  const padR = 1;

  const toX = (i: number) => (padL / 100) * svgW + (i / Math.max(items.length - 1, 1)) * ((100 - padL - padR) / 100) * svgW;
  const toY = (v: number) => svgH - (v / maxVal) * svgH * 0.9 - svgH * 0.05;

  const points = items.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
  const linePath = `M ${points.split(' ').join(' L ')}`;
  const fillPath = `M ${toX(0)},${svgH} ${points.split(' ').map(p => `L ${p}`).join(' ')} L ${toX(items.length - 1)},${svgH} Z`;

  // Comparison line (dashed)
  let compLinePath = '';
  if (data.comparison && data.comparison.length > 0) {
    const compPoints = data.comparison.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
    compLinePath = `M ${compPoints.split(' ').join(' L ')}`;
  }

  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative group">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.20" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          {compLinePath && (
            <path d={compLinePath} fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      <div className="flex justify-between mt-1.5" style={{ paddingLeft: `${padL}%`, paddingRight: `${padR}%` }}>
        {items.length <= 12 ? items.map((d, i) => (
          <span key={i} className="text-[8px] text-on-surface-variant/60">{d.label}</span>
        )) : (
          <>
            <span className="text-[8px] text-on-surface-variant/60">{items[0].label}</span>
            <span className="text-[8px] text-on-surface-variant/60">{items[items.length - 1].label}</span>
          </>
        )}
      </div>
    </div>
  );
};
