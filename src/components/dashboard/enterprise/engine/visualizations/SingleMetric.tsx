import React from 'react';
import type { WidgetDataResult, EngineWidgetConfig } from '../types';
import { withAlpha } from '../colorUtils';
import { FONT_SIZE_CLASS, ALIGNMENT_CLASS, formatWidgetNumber } from '../../widgets/types';

interface Props {
  data: WidgetDataResult;
  config: EngineWidgetConfig;
}

export const SingleMetric: React.FC<Props> = ({ data, config }) => {
  const value = data.total;
  const prev = data.previousTotal;
  const delta = prev != null && prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
  const goalPct = config.goal ? Math.min(Math.round((value / config.goal.value) * 100), 100) : null;
  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';
  const fontClass = FONT_SIZE_CLASS[config.fontSize || 'xl'];
  const alignClass = ALIGNMENT_CLASS[config.alignment || 'center'];
  const showComp = config.showComparison !== false;

  return (
    <div className={`flex flex-col justify-center h-full px-4 ${alignClass}`}>
      <span className={`${fontClass} font-brand font-bold`} style={{ color: accent }}>
        {formatWidgetNumber(value, config.numberFormat)}
      </span>
      {showComp && delta != null && (
        <span className={`text-sm font-bold mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? '\u2191' : '\u2193'} {Math.abs(delta)}% vs prev period
        </span>
      )}
      {goalPct != null && (
        <div className="w-full max-w-[200px] mt-3">
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(accent, 0.2) }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${goalPct}%`, backgroundColor: accent }} />
          </div>
          <span className="text-[10px] text-on-surface-variant mt-1">
            {goalPct}% of {config.goal!.label || 'goal'}
          </span>
        </div>
      )}
    </div>
  );
};
