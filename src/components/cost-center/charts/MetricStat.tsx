import React from 'react';

interface Props {
  value: string;             // pre-formatted (e.g. "$1,247.32")
  delta?: { pct: number; label?: string };
  subLine?: React.ReactNode;
  accent?: string;           // CSS color
}

// Cost-aware delta: up=red, down=green (opposite of growth dashboards).
export const MetricStat: React.FC<Props> = ({
  value,
  delta,
  subLine,
  accent = 'rgb(var(--md-sys-color-primary))',
}) => (
  <div className="flex flex-col justify-center px-4 py-3">
    <span className="text-3xl font-brand font-bold tabular-nums" style={{ color: accent }}>
      {value}
    </span>
    {delta != null && (
      <span className={`text-xs font-bold mt-1 ${delta.pct >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
        {delta.pct >= 0 ? '↑' : '↓'} {Math.abs(delta.pct)}% {delta.label ?? 'vs prior period'}
      </span>
    )}
    {subLine && <span className="text-[11px] text-on-surface-variant mt-1.5">{subLine}</span>}
  </div>
);
