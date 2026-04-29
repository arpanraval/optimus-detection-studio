import React from 'react';
import { withAlpha } from '../../dashboard/enterprise/engine/colorUtils';

export interface DonutSlice { label: string; value: number; }

interface Props {
  data: DonutSlice[];
  accent?: string;
  formatValue?: (v: number) => string;
  onSliceClick?: (label: string) => void;
}

function paletteFor(accent: string): string[] {
  return [
    accent,
    withAlpha(accent, 0.7),
    withAlpha(accent, 0.5),
    withAlpha(accent, 0.35),
    withAlpha(accent, 0.2),
    'rgb(var(--md-sys-color-tertiary))',
    'rgb(var(--md-sys-color-tertiary) / 0.7)',
    'rgb(var(--md-sys-color-tertiary) / 0.5)',
  ];
}

export const DonutChart: React.FC<Props> = ({
  data,
  accent = 'rgb(var(--md-sys-color-primary))',
  formatValue = v => v.toLocaleString(),
  onSliceClick,
}) => {
  const items = data.slice(0, 8);
  const total = items.reduce((s, v) => s + v.value, 0);
  const colors = paletteFor(accent);

  if (total === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  const radius = 40;
  const circ = 2 * Math.PI * radius;
  let off = 0;

  return (
    <div className="h-full flex items-center gap-4 p-3">
      <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {items.map((item, i) => {
            const pct = item.value / total;
            const dashLen = pct * circ;
            const dashOff = -off * circ;
            off += pct;
            return (
              <circle
                key={item.label}
                cx="50" cy="50" r={radius}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="16"
                strokeDasharray={`${dashLen} ${circ - dashLen}`}
                strokeDashoffset={dashOff}
                style={{ cursor: onSliceClick ? 'pointer' : undefined }}
                onClick={() => onSliceClick?.(item.label)}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {items.map((item, i) => (
          <button
            key={item.label}
            onClick={() => onSliceClick?.(item.label)}
            className="w-full flex items-center gap-2 hover:bg-surface-container-high/30 rounded px-1 py-0.5 text-left"
          >
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-[10px] text-on-surface truncate flex-1">{item.label}</span>
            <span className="text-[10px] font-bold text-on-surface-variant flex-shrink-0">{formatValue(item.value)}</span>
            <span className="text-[9px] text-on-surface-variant/60 flex-shrink-0 w-8 text-right">{Math.round(item.value / total * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
};
