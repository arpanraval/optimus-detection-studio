import React from 'react';
import { useCountUp } from '../../../hooks/useCountUp';

interface Props {
  /** Pre-formatted value for the static (non-animated) path. */
  value: string;
  delta?: { pct: number; label?: string };
  subLine?: React.ReactNode;
  accent?: string;           // CSS color
  /**
   * Provide the raw numeric value to enable a count-up animation. When set,
   * we render the animated number with `valuePrefix` + fixed `valueDecimals`
   * and ignore `value` for the display (still used as initial SSR fallback).
   */
  animateNumeric?: number;
  valuePrefix?: string;      // e.g. "$"
  valueDecimals?: number;
}

// Cost-aware delta: up=red, down=green (opposite of growth dashboards).
export const MetricStat: React.FC<Props> = ({
  value,
  delta,
  subLine,
  accent = 'rgb(var(--md-sys-color-primary))',
  animateNumeric,
  valuePrefix = '',
  valueDecimals = 0,
}) => {
  const animated = useCountUp(animateNumeric ?? 0);
  const displayValue =
    animateNumeric != null
      ? `${valuePrefix}${animated.toLocaleString(undefined, {
          minimumFractionDigits: valueDecimals,
          maximumFractionDigits: valueDecimals,
        })}`
      : value;

  return (
    <div className="flex flex-col justify-center px-4 py-3">
      <span
        className="text-3xl font-brand font-bold tabular-nums transition-colors"
        style={{ color: accent }}
      >
        {displayValue}
      </span>
      {delta != null && (
        <span className={`text-xs font-bold mt-1 ${delta.pct >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
          {delta.pct >= 0 ? '↑' : '↓'} {Math.abs(delta.pct)}% {delta.label ?? 'vs prior period'}
        </span>
      )}
      {subLine && <span className="text-[11px] text-on-surface-variant mt-1.5">{subLine}</span>}
    </div>
  );
};
