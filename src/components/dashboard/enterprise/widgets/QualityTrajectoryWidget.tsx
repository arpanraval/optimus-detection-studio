// ============================================================================
// QualityTrajectoryWidget — average quality score over time
//
// Tracks the avg qualityScore of rules existing at each bucket end (cumulative
// snapshot). A rising line means newly added rules are pulling the avg up;
// a falling line means library health is regressing.
// ============================================================================

import React, { useCallback, useId } from 'react';
import type { WidgetComponentProps } from './types';
import type { Detection } from '../../../../types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useTimeSeries, type BucketPoint } from './useTimeSeries';
import WidgetEmptyState from './WidgetEmptyState';

const qualityReducer = (ds: Detection[]) => {
  if (ds.length === 0) return 0;
  const total = ds.reduce((s, d) => s + (d.qualityScore || 0), 0);
  return Math.round((total / ds.length) * 10) / 10;
};

const QualityTrajectoryWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const gradientId = useId();
  const { detections } = useDashboardDetections();
  const reduce = useCallback(qualityReducer, []);

  const result = useTimeSeries(detections, timeRange, {
    reduce,
    cumulative: true,
    summary: 'latest',
    granularity: 'auto',
  });

  if (detections.length === 0 || result.current.length === 0) {
    return <WidgetEmptyState message="No quality history yet" />;
  }

  const accent = config.accentColor || 'rgb(var(--md-ext-color-amber))';
  const current = result.current;
  const previous = result.previous;
  const latest = current[current.length - 1].value;
  const delta = result.totals.deltaPct;

  // Y axis 0-100 — quality scores live in that range
  const maxVal = 100;
  const svgW = 100;
  const svgH = 100;
  const padL = 4;
  const padR = 1;

  const toX = (i: number, len: number) =>
    (padL / 100) * svgW + (i / Math.max(len - 1, 1)) * ((100 - padL - padR) / 100) * svgW;
  const toY = (v: number) => svgH - (v / maxVal) * svgH * 0.92 - svgH * 0.04;

  const buildLine = (pts: BucketPoint[]) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, pts.length).toFixed(2)},${toY(p.value).toFixed(2)}`)
      .join(' ');

  const currentLine = buildLine(current);
  const fillPath =
    current.length > 0
      ? `${currentLine} L ${toX(current.length - 1, current.length).toFixed(2)},${svgH} L ${toX(0, current.length).toFixed(2)},${svgH} Z`
      : '';
  const previousLine = previous.length > 0 ? buildLine(previous) : '';
  const yTicks = [0, 50, 75, 100];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
          Avg Quality
        </span>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-brand font-bold text-on-surface">{latest.toFixed(1)}</span>
          {delta !== 0 && (
            <span className={`text-[11px] font-brand font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 relative min-h-[100px]">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map(t => (
            <line
              key={t}
              x1={(padL / 100) * svgW}
              y1={toY(t)}
              x2={svgW - (padR / 100) * svgW}
              y2={toY(t)}
              stroke="currentColor"
              strokeOpacity={t === 0 ? 0.1 : 0.04}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {fillPath && <path d={fillPath} fill={`url(#${gradientId})`} />}
          {previousLine && (
            <path
              d={previousLine}
              fill="none"
              stroke={accent}
              strokeWidth="1.5"
              strokeOpacity="0.45"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {currentLine && (
            <path
              d={currentLine}
              fill="none"
              stroke={accent}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
        {yTicks.map(t => (
          <span
            key={t}
            className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none"
            style={{ left: 0, top: `${((maxVal - t) / maxVal) * 92 + 4}%`, transform: 'translateY(-50%)' }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex justify-between text-[9px] text-on-surface-variant/40 font-brand font-medium mt-1.5"
           style={{ paddingLeft: `${padL}%`, paddingRight: `${padR}%` }}>
        {current.length <= 8 ? (
          current.map((p, i) => <span key={i}>{p.label}</span>)
        ) : (
          <>
            <span>{current[0].label}</span>
            <span>{current[current.length - 1].label}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default QualityTrajectoryWidget;
