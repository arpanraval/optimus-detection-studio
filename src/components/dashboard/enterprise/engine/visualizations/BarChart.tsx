import React from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';
import { withAlpha } from '../colorUtils';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

export const BarChart: React.FC<Props> = ({ data, config }) => {
  const maxItems = 10;
  const items = data.values.slice(0, maxItems);
  const remaining = data.values.length - maxItems;
  const maxVal = Math.max(...items.map(v => v.value), 1);
  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';

  if (items.length === 0) {
    return <div className="flex items-center justify-center h-full text-[11px] text-on-surface-variant">No data</div>;
  }

  return (
    <div className="h-full flex flex-col p-3">
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-3"
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 30}ms forwards` }}>
            <span className="text-[11px] font-medium text-on-surface w-24 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(accent, 0.2) }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(item.value / maxVal) * 100}%`, backgroundColor: accent }} />
            </div>
            <span className="text-[11px] font-bold text-on-surface w-12 text-right flex-shrink-0">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <div className="text-[10px] text-on-surface-variant mt-2">+{remaining} more</div>
      )}
    </div>
  );
};
