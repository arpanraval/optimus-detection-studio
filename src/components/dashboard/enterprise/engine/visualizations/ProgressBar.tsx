import React from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';
import { withAlpha } from '../colorUtils';
import { FONT_SIZE_CLASS, ALIGNMENT_CLASS, formatWidgetNumber } from '../../widgets/types';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

export const ProgressBar: React.FC<Props> = ({ data, config }) => {
  const value = data.total;
  const goal = config.goal?.value || 100;
  const pct = Math.min(Math.round((value / goal) * 100), 100);
  const label = config.goal?.label || 'Goal';
  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';
  const fontClass = FONT_SIZE_CLASS[config.fontSize || 'lg'];
  const alignClass = ALIGNMENT_CLASS[config.alignment || 'center'];

  return (
    <div className={`flex flex-col justify-center h-full gap-3 px-4 ${alignClass}`}>
      <div className="flex items-baseline gap-2">
        <span className={`${fontClass} font-brand font-bold`} style={{ color: accent }}>{formatWidgetNumber(value, config.numberFormat)}</span>
        <span className="text-sm text-on-surface-variant">/ {formatWidgetNumber(goal, config.numberFormat)}</span>
      </div>
      <div className="w-full max-w-[300px]">
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(accent, 0.2) }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-on-surface-variant">{label}</span>
          <span className="text-[10px] font-bold text-on-surface">{pct}%</span>
        </div>
      </div>
    </div>
  );
};
