import React from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture } from '../../../../hooks/useImpactScores';
import WidgetEmptyState from './WidgetEmptyState';

interface GaugeProps {
  label: string;
  value: number;
  subtitle: string;
  color: string;
}

function Gauge({ label, value, subtitle, color }: GaugeProps) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-container-low/30" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
          className="transition-all duration-700"
        />
        <text x="44" y="40" textAnchor="middle" className="fill-on-surface" fontSize="16" fontWeight="700">
          {pct.toFixed(0)}%
        </text>
        <text x="44" y="56" textAnchor="middle" className="fill-on-surface-variant/50" fontSize="9">
          {subtitle}
        </text>
      </svg>
      <span className="text-[10px] font-brand font-bold text-on-surface-variant/60 tracking-wide text-center">
        {label}
      </span>
    </div>
  );
}

const PostureGaugesWidget: React.FC<WidgetComponentProps> = () => {
  const { scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture, loading } = useDefensivePosture(userId, scopeFilter);

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-4 gap-4 h-full items-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-[88px] h-[88px] rounded-full bg-surface-container-low/30 animate-pulse" />
            <div className="w-16 h-3 rounded bg-surface-container-low/30 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!posture) return <WidgetEmptyState message="No posture data available" />;

  const gauges: GaugeProps[] = [
    {
      label: 'Technique Coverage',
      value: posture.technique_coverage_pct,
      subtitle: `${posture.techniques_covered}/${posture.total_techniques}`,
      color: 'rgb(var(--md-sys-color-primary))',
    },
    {
      label: 'Groups Defended',
      value: posture.group_coverage_pct,
      subtitle: `${posture.groups_defended}/${posture.total_groups}`,
      color: 'rgb(var(--md-sys-color-tertiary))',
    },
    {
      label: 'Campaigns Covered',
      value: posture.campaign_coverage_pct,
      subtitle: `${posture.campaigns_defended}/${posture.total_campaigns}`,
      color: 'rgb(var(--md-ext-color-indigo))',
    },
    {
      label: 'Threat Quality',
      value: posture.avg_taw_covered * 100,
      subtitle: `avg TAW ${posture.avg_taw_covered.toFixed(2)}`,
      color: 'rgb(var(--md-ext-color-green))',
    },
  ];

  return (
    <div className="p-4 grid grid-cols-4 gap-4 h-full items-center">
      {gauges.map((g) => (
        <Gauge key={g.label} {...g} />
      ))}
    </div>
  );
};

export default PostureGaugesWidget;
