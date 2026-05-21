// ============================================================================
// VelocityComparisonWidget — rules created per bucket with prior-period overlay
//
// Bars: current period (full opacity).
// Ghost bars behind: prior equal-duration window for visual comparison.
// Header: total in current period, PoP %.
// ============================================================================

import React, { useCallback } from 'react';
import type { WidgetComponentProps } from './types';
import type { Detection } from '../../../../types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useTimeSeries } from './useTimeSeries';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const velocityReducer = (ds: Detection[]) => ds.length;

const VelocityComparisonWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const { detections } = useDashboardDetections();
  const reduce = useCallback(velocityReducer, []);

  const result = useTimeSeries(detections, timeRange, {
    reduce,
    cumulative: false,
    summary: 'sum',
    granularity: 'auto',
  });

  if (detections.length === 0 || result.current.length === 0) {
    return <WidgetEmptyState message="No detection creation history" />;
  }

  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';
  const current = result.current;
  const previous = result.previous;

  const total = result.totals.current;
  const prior = result.totals.previous;
  const delta = result.totals.deltaPct;

  // Pad shorter series with zeros so bars align
  const buckets = Math.max(current.length, previous.length);
  const currentVals = Array.from({ length: buckets }, (_, i) => current[i]?.value ?? 0);
  const previousVals = Array.from({ length: buckets }, (_, i) => previous[i]?.value ?? 0);

  const max = Math.max(...currentVals, ...previousVals, 1);
  const barH = 88; // px

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
            Rules Created
          </span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40 uppercase tracking-wider">
            {result.granularity}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-brand font-bold text-on-surface">{total.toLocaleString()}</span>
            <span className="text-[10px] font-brand font-medium text-on-surface-variant">in period</span>
          </div>
          {delta !== 0 && (
            <span className={`text-[11px] font-brand font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end gap-1" style={{ height: barH }}>
        {currentVals.map((v, i) => {
          const ch = max > 0 ? (v / max) * (barH - 4) : 0;
          const ph = max > 0 ? (previousVals[i] / max) * (barH - 4) : 0;
          return (
            <div key={i} className="flex-1 relative h-full flex items-end justify-center">
              {/* Prior bar — ghost behind */}
              <div
                className="absolute bottom-0 w-full rounded-t-md"
                style={{
                  height: Math.max(ph, 1),
                  backgroundColor: withAlpha(accent, 0.18),
                  border: `1px dashed ${withAlpha(accent, 0.35)}`,
                  borderBottom: 'none',
                }}
                title={`Prior: ${previousVals[i]}`}
              />
              {/* Current bar — solid in front */}
              <div
                className="relative w-[60%] rounded-t-md transition-all"
                style={{
                  height: Math.max(ch, 1),
                  backgroundColor: v > 0 ? accent : withAlpha(accent, 0.2),
                }}
                title={`${current[i]?.label ?? ''}: ${v} (prior: ${previousVals[i]})`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-1.5">
        {currentVals.length <= 12 ? (
          currentVals.map((_, i) => (
            <div key={i} className="flex-1 text-center">
              <span className="text-[8px] font-brand font-medium text-on-surface-variant/60">
                {current[i]?.label ?? ''}
              </span>
            </div>
          ))
        ) : (
          <>
            <span className="text-[8px] font-brand font-medium text-on-surface-variant/60">
              {current[0]?.label}
            </span>
            <span className="text-[8px] font-brand font-medium text-on-surface-variant/60">
              {current[current.length - 1]?.label}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 mt-2 text-[9px] font-brand font-bold text-on-surface-variant/50 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: accent }} />
          Current ({total})
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-sm"
            style={{ backgroundColor: withAlpha(accent, 0.18), border: `1px dashed ${withAlpha(accent, 0.35)}` }}
          />
          Prior ({prior})
        </span>
      </div>
    </div>
  );
};

export default VelocityComparisonWidget;
