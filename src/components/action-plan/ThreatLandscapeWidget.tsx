import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import type { ThreatGroupSummary } from '../../hooks/useProfileIntelligence';

const HIGH_RISK = 50;
const MED_RISK = 80;
const VISIBLE = 5;

interface Props {
  groups: ThreatGroupSummary[];
  sectorLabel: string | null;
  loading: boolean;
}

function pct(group: ThreatGroupSummary): number {
  if (group.techniqueCount === 0) return 100;
  return Math.round(((group.coveredTechniqueCount ?? 0) / group.techniqueCount) * 100);
}

function risk(p: number): { label: string; bg: string; tx: string; bar: string } {
  if (p < HIGH_RISK) return { label: 'HIGH RISK', bg: 'bg-ext-coral/15', tx: 'text-ext-coral', bar: 'bg-ext-coral' };
  if (p < MED_RISK) return { label: 'MEDIUM', bg: 'bg-ext-amber/15', tx: 'text-ext-amber', bar: 'bg-ext-amber' };
  return { label: 'COVERED', bg: 'bg-ext-teal/15', tx: 'text-ext-teal', bar: 'bg-ext-teal' };
}

export const ThreatLandscapeWidget: React.FC<Props> = ({ groups, sectorLabel, loading }) => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => [...groups].sort((a, b) => pct(a) - pct(b)),
    [groups],
  );
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE);
  const remaining = Math.max(0, groups.length - VISIBLE);

  if (loading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-40 bg-surface-container rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-surface-container/50 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">Threat Landscape</h3>
        <p className="text-[12px] text-outline mt-3">
          Configure sectors or country to see threat groups targeting your organization.
        </p>
      </div>
    );
  }

  const headerLabel = sectorLabel
    ? `Top Threat Groups Targeting ${sectorLabel}`
    : 'Top Threat Groups';

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          {headerLabel}
        </h3>
        <span className="text-xs font-mono text-ext-rose tabular-nums">{groups.length}</span>
      </div>

      <div className="space-y-1.5">
        {visible.map(g => {
          const p = pct(g);
          const r = risk(p);
          return (
            <button
              key={g.stixId}
              onClick={() => navigate(routeHelpers.actionPlanThreat(g.stixId))}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-container-highest/30 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-on-surface truncate">{g.name}</span>
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${r.bg} ${r.tx}`}>
                      {r.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-on-surface-variant mt-0.5">
                    {g.originCountry} · {g.activityType}
                  </div>
                </div>
                <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${p}%` }} />
                </div>
                <span className={`text-[10px] font-mono font-bold tabular-nums ${r.tx}`}>{p}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-[10px] font-bold text-ext-teal uppercase tracking-wider hover:opacity-70 transition-opacity"
        >
          View all {groups.length} threat groups
        </button>
      )}
    </div>
  );
};
