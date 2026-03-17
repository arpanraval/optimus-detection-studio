import React from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';
import { withAlpha } from '../colorUtils';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

/** Generate slice colors from accent or fallback to primary palette */
function getSliceColors(accent?: string): string[] {
  if (accent) {
    return [
      accent,
      withAlpha(accent, 0.7),
      withAlpha(accent, 0.5),
      withAlpha(accent, 0.35),
      withAlpha(accent, 0.2),
      withAlpha(accent, 0.9),
      withAlpha(accent, 0.4),
      withAlpha(accent, 0.3),
    ];
  }
  return [
    'rgb(var(--md-sys-color-primary))',
    'rgb(var(--md-sys-color-primary) / 0.7)',
    'rgb(var(--md-sys-color-primary) / 0.5)',
    'rgb(var(--md-sys-color-primary) / 0.35)',
    'rgb(var(--md-sys-color-primary) / 0.2)',
    'rgb(var(--md-sys-color-tertiary))',
    'rgb(var(--md-sys-color-tertiary) / 0.7)',
    'rgb(var(--md-sys-color-tertiary) / 0.5)',
  ];
}

export const PieChart: React.FC<Props> = ({ data, config }) => {
  const items = data.values.slice(0, 8);
  const total = items.reduce((s, v) => s + v.value, 0);
  const colors = getSliceColors(config.accentColor);

  if (total === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="h-full flex items-center gap-4 p-3">
      <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {items.map((item, i) => {
            const pct = item.value / total;
            const dashLen = pct * circumference;
            const dashOffset = -offset * circumference;
            offset += pct;
            return (
              <circle
                key={item.label}
                cx="50" cy="50" r={radius}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="16"
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-[10px] text-on-surface truncate flex-1">{item.label}</span>
            <span className="text-[10px] font-bold text-on-surface-variant flex-shrink-0">{item.value}</span>
            <span className="text-[9px] text-on-surface-variant/60 flex-shrink-0 w-8 text-right">{Math.round((item.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
