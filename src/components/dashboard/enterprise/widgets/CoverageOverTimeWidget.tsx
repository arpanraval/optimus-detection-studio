// ============================================================================
// CoverageOverTimeWidget — MITRE technique coverage % over time
//
// Three series rendered together:
//   • Current period (solid line + area fill)
//   • Prior equal-duration period (dashed overlay, dimmed)
//   • Same period one year earlier (dotted overlay, dimmed) — YoY
//
// Header shows current coverage %, PoP delta, and YoY delta.
// ============================================================================

import React, { useCallback, useId } from 'react';
import type { WidgetComponentProps } from './types';
import type { Detection } from '../../../../types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useTimeSeries, type BucketPoint } from './useTimeSeries';
import WidgetEmptyState from './WidgetEmptyState';

const TOTAL_TECHNIQUES = 648;

const coverageReducer = (ds: Detection[]) => {
  const techs = new Set<string>();
  for (const d of ds) (d.mitreAttackIds || []).forEach(id => techs.add(id));
  return Math.round((techs.size / TOTAL_TECHNIQUES) * 1000) / 10;
};

const CoverageOverTimeWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const gradientId = useId();
  const { detections } = useDashboardDetections();
  const reduce = useCallback(coverageReducer, []);

  const result = useTimeSeries(detections, timeRange, {
    reduce,
    cumulative: true,
    yoy: true,
    summary: 'latest',
    granularity: 'auto',
  });

  if (detections.length === 0 || result.current.length === 0) {
    return <WidgetEmptyState message="No coverage history yet" />;
  }

  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';
  const current = result.current;
  const previous = result.previous;
  const yoy = result.yoy;

  // Y-axis is always 0-100 for percentage
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
  const yoyLine = yoy.length > 0 ? buildLine(yoy) : '';

  const latest = current[current.length - 1].value;
  const delta = result.totals.deltaPct;
  const yoyDelta = result.totals.yoyDeltaPct;
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
            Technique Coverage
          </span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40 uppercase tracking-wider">
            {result.granularity}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-brand font-bold text-on-surface">{latest.toFixed(1)}</span>
            <span className="text-xs text-on-surface-variant font-brand font-bold">%</span>
          </div>
          {delta !== 0 && (
            <span className={`text-[11px] font-brand font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}% PoP
            </span>
          )}
          {yoyDelta !== 0 && yoy.length > 0 && (
            <span className={`text-[10px] font-brand font-bold ${yoyDelta > 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
              {yoyDelta > 0 ? '↑' : '↓'} {Math.abs(yoyDelta)}% YoY
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 relative group min-h-[100px]">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="absolute inset-0 w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map(pct => (
            <line
              key={pct}
              x1={(padL / 100) * svgW}
              y1={toY(pct)}
              x2={svgW - (padR / 100) * svgW}
              y2={toY(pct)}
              stroke="currentColor"
              strokeOpacity={pct === 0 ? 0.1 : 0.04}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {fillPath && <path d={fillPath} fill={`url(#${gradientId})`} />}
          {yoyLine && (
            <path
              d={yoyLine}
              fill="none"
              stroke={accent}
              strokeWidth="1.25"
              strokeOpacity="0.35"
              strokeDasharray="1 2"
              vectorEffect="non-scaling-stroke"
            />
          )}
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
        {yTicks.map(pct => (
          <span
            key={pct}
            className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none"
            style={{ left: 0, top: `${((maxVal - pct) / maxVal) * 92 + 4}%`, transform: 'translateY(-50%)' }}
          >
            {pct}%
          </span>
        ))}
      </div>

      <div className="flex justify-between text-[9px] text-on-surface-variant/40 font-brand font-medium mt-1.5"
           style={{ paddingLeft: `${padL}%`, paddingRight: `${padR}%` }}>
        {current.length <= 12 ? (
          current.map((p, i) => <span key={i}>{p.label}</span>)
        ) : (
          <>
            <span>{current[0].label}</span>
            <span>{current[Math.floor(current.length / 2)].label}</span>
            <span>{current[current.length - 1].label}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 text-[9px] font-brand font-bold text-on-surface-variant/50 uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5" style={{ backgroundColor: accent }} />
          Current
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ borderTop: `1.5px dashed ${accent}`, opacity: 0.45 }}
          />
          Prior period
        </span>
        {yoy.length > 0 && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5"
              style={{ borderTop: `1.25px dotted ${accent}`, opacity: 0.45 }}
            />
            YoY
          </span>
        )}
      </div>
    </div>
  );
};

export default CoverageOverTimeWidget;
