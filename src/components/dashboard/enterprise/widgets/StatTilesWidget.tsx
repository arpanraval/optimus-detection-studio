import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../../../hooks/useImpactScores';

const StatTile: React.FC<{ label: string; value: number; total?: number; suffix?: string; onClick?: () => void }> = ({ label, value, total, suffix, onClick }) => (
  <div onClick={onClick} className={`rounded-xl px-5 py-5 text-center transition-colors ${onClick ? 'cursor-pointer hover:bg-surface-container-low' : ''}`} style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-lowest))' }}>
    <div className="text-[12px] font-brand font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2">{label}</div>
    <div className="flex items-baseline justify-center gap-0.5">
      <span className="text-3xl font-brand font-bold text-on-surface">{value.toLocaleString()}</span>
      {total !== undefined && <span className="text-sm text-on-surface-variant font-brand font-bold">/{total.toLocaleString()}</span>}
      {suffix && <span className="text-sm text-on-surface-variant font-brand font-bold">{suffix}</span>}
    </div>
  </div>
);

const StatTilesWidget: React.FC<WidgetComponentProps> = ({ onNavigate, timeRange }) => {
  const { detections, scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture, loading } = useDefensivePosture(userId, scopeFilter);

  const filtered = useMemo(() => {
    if (!timeRange.startDate) return detections;
    const rangeStart = new Date(timeRange.startDate).getTime();
    const rangeEnd = timeRange.endDate ? new Date(timeRange.endDate).getTime() : Infinity;
    return detections.filter(d => {
      const ts = d.createdDate;
      if (!ts) return true;
      const t = new Date(ts).getTime();
      return t >= rangeStart && t <= rangeEnd;
    });
  }, [detections, timeRange]);

  const stats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) return null;
    const production = filtered.filter(d => d.status === 'Production').length;
    const validated = filtered.filter(d => d.testedAndValidated).length;
    const qualityTotal = filtered.reduce((s, d) => s + (d.qualityScore || 0), 0);
    return { total, production, validated, qualityAvg: Math.round(qualityTotal / total) };
  }, [filtered]);

  if (loading && !posture) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 w-full h-full items-center">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl p-5 animate-pulse" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
            <div className="h-8 bg-surface-container-high rounded w-16 mb-2" />
            <div className="h-4 bg-surface-container-high rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  const techCovered = posture?.techniques_covered ?? 0;
  const totalTech = posture?.total_techniques ?? 648;
  const groups = posture?.groups_defended ?? 0;
  const totalGroups = posture?.total_groups ?? 0;
  const campaigns = posture?.campaigns_defended ?? 0;
  const totalCampaigns = posture?.total_campaigns ?? 0;

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 p-2 w-full h-full items-center">
      <StatTile label="Techniques" value={techCovered} total={totalTech} onClick={() => onNavigate('mitre')} />
      <StatTile label="Groups" value={groups} total={totalGroups} onClick={() => onNavigate('groups')} />
      <StatTile label="Campaigns" value={campaigns} total={totalCampaigns} onClick={() => onNavigate('campaigns')} />
      <StatTile label="Production" value={stats?.production ?? 0} total={stats?.total} onClick={() => onNavigate('library', { status: 'Production' })} />
      <StatTile label="Validated" value={stats?.validated ?? 0} total={stats?.total} onClick={() => onNavigate('library', { testedAndValidated: 'true' })} />
      <StatTile label="Quality" value={stats?.qualityAvg ?? 0} suffix="%" onClick={() => onNavigate('library', { qualityGrade: 'A' })} />
    </div>
  );
};

export default StatTilesWidget;
