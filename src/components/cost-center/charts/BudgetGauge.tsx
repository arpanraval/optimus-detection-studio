import React from 'react';
import { withAlpha } from '../../dashboard/enterprise/engine/colorUtils';

interface Props {
  currentUsd: number;
  limitUsd: number;
  formatValue?: (v: number) => string;
}

function tone(pct: number): { color: string; label: string; badgeBg: string; badgeText: string } {
  if (pct >= 1.0) return { color: 'rgb(var(--md-sys-color-error))', label: 'Exceeded',  badgeBg: 'bg-red-500/10',     badgeText: 'text-red-400' };
  if (pct >= 0.8) return { color: 'rgb(245 158 11)',                 label: 'Near limit', badgeBg: 'bg-amber-500/10',  badgeText: 'text-amber-400' };
  return                 { color: 'rgb(16 185 129)',                  label: 'OK',         badgeBg: 'bg-emerald-500/10', badgeText: 'text-emerald-400' };
}

export const BudgetGauge: React.FC<Props> = ({ currentUsd, limitUsd, formatValue = v => `$${v.toFixed(2)}` }) => {
  const pct = limitUsd > 0 ? currentUsd / limitUsd : 0;
  const t = tone(pct);
  const widthPct = Math.min(pct * 100, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-on-surface-variant tabular-nums">
          {formatValue(currentUsd)} / {formatValue(limitUsd)}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.badgeBg} ${t.badgeText}`}>
          {Math.round(pct * 100)}% — {t.label}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(t.color, 0.2) }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, backgroundColor: t.color }} />
      </div>
    </div>
  );
};
