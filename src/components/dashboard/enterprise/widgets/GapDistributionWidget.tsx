import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';

const SEVERITY_CONFIG = [
  { key: 'critical', label: 'Critical', range: '> 100', color: 'rgb(var(--md-sys-color-error))', bg: 'rgb(var(--md-sys-color-error) / 0.12)' },
  { key: 'high', label: 'High', range: '50 - 99', color: 'rgb(var(--md-ext-color-orange))', bg: 'rgb(var(--md-ext-color-orange) / 0.12)' },
  { key: 'medium', label: 'Medium', range: '20 - 49', color: 'rgb(var(--md-ext-color-amber))', bg: 'rgb(var(--md-ext-color-amber) / 0.12)' },
  { key: 'low', label: 'Low', range: '< 20', color: 'rgb(var(--md-sys-color-primary))', bg: 'rgb(var(--md-sys-color-primary) / 0.12)' },
] as const;

const GapDistributionWidget: React.FC<WidgetComponentProps> = () => {
  const { scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture, loading } = useDefensivePosture(userId, scopeFilter);

  const counts = useMemo(() => {
    const gaps = posture?.top_gaps ?? [];
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const g of gaps) {
      if (g.gap_score > 100) critical++;
      else if (g.gap_score >= 50) high++;
      else if (g.gap_score >= 20) medium++;
      else low++;
    }
    return { critical, high, medium, low };
  }, [posture]);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-2 gap-3 h-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-surface-container-low/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const gaps = posture?.top_gaps ?? [];
  if (gaps.length === 0) return <WidgetEmptyState message="No coverage gaps detected" />;

  return (
    <div className="p-4 grid grid-cols-2 gap-3 h-full">
      {SEVERITY_CONFIG.map((cfg) => (
        <div
          key={cfg.key}
          className="rounded-lg p-3 flex flex-col items-center justify-center"
          style={{ backgroundColor: cfg.bg }}
        >
          <span className="text-2xl font-brand font-bold" style={{ color: cfg.color }}>
            {counts[cfg.key as keyof typeof counts]}
          </span>
          <span className="text-[11px] font-brand font-bold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          <span className="text-[9px] font-brand text-on-surface-variant/40 mt-0.5">
            {cfg.range}
          </span>
        </div>
      ))}
    </div>
  );
};

export default GapDistributionWidget;
