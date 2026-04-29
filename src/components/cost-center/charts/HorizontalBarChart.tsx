import React from 'react';
import { withAlpha } from '../../dashboard/enterprise/engine/colorUtils';

export interface BarItem { label: string; value: number; }

interface Props {
  data: BarItem[];
  accent?: string;
  formatValue?: (v: number) => string;
  onRowClick?: (label: string) => void;
  maxItems?: number;
}

export const HorizontalBarChart: React.FC<Props> = ({
  data,
  accent = 'rgb(var(--md-sys-color-primary))',
  formatValue = v => v.toLocaleString(),
  onRowClick,
  maxItems = 10,
}) => {
  const items = data.slice(0, maxItems);
  const remaining = data.length - maxItems;
  const maxVal = Math.max(...items.map(v => v.value), 1);

  if (items.length === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  return (
    <div className="h-full flex flex-col p-3">
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.label}
            onClick={() => onRowClick?.(item.label)}
            disabled={!onRowClick}
            className="w-full flex items-center gap-3 disabled:cursor-default text-left"
          >
            <span className="text-[11px] font-medium text-on-surface w-32 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(accent, 0.2) }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(item.value / maxVal) * 100}%`, backgroundColor: accent }} />
            </div>
            <span className="text-[11px] font-bold text-on-surface w-20 text-right flex-shrink-0 tabular-nums">{formatValue(item.value)}</span>
          </button>
        ))}
      </div>
      {remaining > 0 && (
        <div className="text-[10px] text-on-surface-variant mt-2">+{remaining} more</div>
      )}
    </div>
  );
};
