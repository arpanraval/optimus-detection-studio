import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const TACTIC_COLORS = [
  'rgb(var(--md-ext-color-coral))', 'rgb(var(--md-ext-color-amber))', 'rgb(var(--md-ext-color-green))',
  'rgb(var(--md-ext-color-teal))', 'rgb(var(--md-ext-color-blue))', 'rgb(var(--md-ext-color-indigo))',
  'rgb(var(--md-ext-color-violet))', 'rgb(var(--md-ext-color-rose))', 'rgb(var(--md-ext-color-orange))',
  'rgb(var(--md-ext-color-cyan))', 'rgb(var(--md-sys-color-primary))', 'rgb(var(--md-sys-color-tertiary))',
  'rgb(var(--md-ext-color-amber))', 'rgb(var(--md-ext-color-green))',
];

function formatTactic(raw: string): string {
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const MitreTacticWheelWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate, timeRange }) => {
  const { detections: allDetections } = useDashboardDetections();

  const detections = useMemo(() => {
    if (!timeRange.startDate) return allDetections;
    const start = new Date(timeRange.startDate).getTime();
    const end = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return allDetections.filter(d => {
      const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
      return ts >= start && ts <= end;
    });
  }, [allDetections, timeRange]);

  const tactics = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach(d => {
      (d.mitreTactics || []).forEach((t: string) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, label: formatTactic(name), count, color: TACTIC_COLORS[i % TACTIC_COLORS.length] }));
  }, [detections]);

  const total = tactics.reduce((s, t) => s + t.count, 0);
  if (total === 0) return <WidgetEmptyState message="No MITRE tactic data" />;

  // SVG donut
  const R = 38;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="p-4 h-full flex items-center gap-3">
      <div className="flex-shrink-0" style={{ width: 100, height: 100 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {tactics.map((t) => {
            const pct = t.count / total;
            const dashLen = pct * C;
            const dashOffset = -offset * C;
            offset += pct;
            return (
              <circle
                key={t.name}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={t.color}
                strokeWidth="14"
                strokeDasharray={`${dashLen} ${C - dashLen}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" style={{ position: 'relative', marginTop: -100 }}>
          <span className="text-lg font-brand font-bold text-on-surface">{total}</span>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto max-h-full">
        {tactics.slice(0, config.maxItems ?? 8).map(t => (
          <div key={t.name} className="flex items-center gap-1.5 cursor-pointer hover:bg-surface-container-low/50 rounded px-1 py-0.5 transition-colors"
            onClick={() => onNavigate('library', { mitreTactics: t.name })}>
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: t.color }} />
            <span className="text-[10px] font-brand font-medium text-on-surface truncate flex-1">{t.label}</span>
            <span className="text-[10px] font-brand font-bold text-on-surface-variant flex-shrink-0">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MitreTacticWheelWidget;
