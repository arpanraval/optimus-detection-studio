import React, { useState, useEffect } from 'react';
import type { WidgetComponentProps } from './types';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../../../hooks/useImpactScores';
import { useCommandCenterData } from '../../../../hooks/useCommandCenterData';
import { useAppData } from '../../../../router/AppDataContext';
import { AnimatedNumber } from '../../../optimus/AnimatedNumber';

interface BreakdownItem { label: string; value: number; weight: string; }

const ReadinessBadgeWidget: React.FC<WidgetComponentProps> = ({ config }) => {
  const { userId } = useLibrary();
  const { detections } = useAppData();
  const { posture, loading: postureLoading } = useDefensivePosture(userId);
  const { actors, loading: actorsLoading } = useThreatActorWeights();
  const { } = useCommandCenterData(actors, detections, posture?.total_techniques);
  const supaLoading = postureLoading || actorsLoading;

  const groups = posture?.groups_defended ?? 0;
  const totalGroups = posture?.total_groups ?? 0;
  const campaigns = posture?.campaigns_defended ?? 0;
  const totalCampaigns = posture?.total_campaigns ?? 0;
  const techPct = posture?.technique_coverage_pct ?? 0;
  const groupPct = totalGroups > 0 ? Math.round((groups / totalGroups) * 100) : 0;
  const campPct = totalCampaigns > 0 ? Math.round((campaigns / totalCampaigns) * 100) : 0;
  const readiness = Math.round(groupPct * 0.3 + campPct * 0.2 + techPct * 0.3 + Math.min(detections.length / 5, 20));

  const breakdown: BreakdownItem[] = [
    { label: 'Groups', value: Math.round(groupPct * 0.3), weight: '30%' },
    { label: 'Techniques', value: Math.round(techPct * 0.3), weight: '30%' },
    { label: 'Campaigns', value: Math.round(campPct * 0.2), weight: '20%' },
    { label: 'Volume', value: Math.round(Math.min(detections.length / 5, 20)), weight: '20%' },
  ];

  const [animated, setAnimated] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(t); }, []);

  const SIZE = 180;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2 - 8;
  const C = R * 2 * Math.PI;
  const filled = animated && !supaLoading ? (readiness / 100) * C : 0;
  const accentColor = config.accentColor;

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="relative">
        <div
          className="relative flex-shrink-0 rounded-full cursor-pointer"
          onClick={() => setShowBreakdown(!showBreakdown)}
          style={{ width: SIZE, height: SIZE, backgroundColor: accentColor ? `${accentColor}14` : 'rgb(var(--md-sys-color-primary) / 0.08)' }}
        >
          <svg width={SIZE} height={SIZE} className="transform -rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE}
              style={{ stroke: accentColor ? `${accentColor}26` : 'rgb(var(--md-sys-color-primary) / 0.15)' }} />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
              className={accentColor ? '' : 'stroke-primary'} strokeWidth={STROKE} strokeLinecap="round"
              style={{
                ...(accentColor ? { stroke: accentColor } : {}),
                strokeDasharray: `${filled} ${C}`,
                transition: 'stroke-dasharray 1.4s cubic-bezier(0.05, 0.7, 0.1, 1.0)',
                filter: accentColor ? `drop-shadow(0 0 8px ${accentColor}66)` : 'drop-shadow(0 0 8px rgb(var(--md-sys-color-primary) / 0.4))',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {supaLoading ? (
              <div className="w-12 h-6 bg-primary/10 rounded animate-pulse" />
            ) : (
              <>
                <AnimatedNumber value={readiness} duration={1400} className="text-5xl font-brand font-bold text-on-surface" />
                <span className="text-[9px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-[0.25em]">Readiness</span>
              </>
            )}
          </div>
        </div>
        {showBreakdown && (
          <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 bg-surface-container rounded-xl border border-outline-variant/20 p-3 min-w-[200px] z-10 shadow-lg">
            {breakdown.map(b => (
              <div key={b.label} className="flex items-center justify-between py-1.5">
                <span className="text-[11px] font-brand font-medium text-on-surface-variant/60">{b.label} <span className="text-on-surface-variant/25">({b.weight})</span></span>
                <span className="text-[11px] font-brand font-bold text-on-surface">{b.value}pts</span>
              </div>
            ))}
            <div className="border-t border-outline-variant/10 mt-1 pt-1.5 flex items-center justify-between">
              <span className="text-[11px] font-brand font-bold text-on-surface">Total</span>
              <span className="text-[11px] font-brand font-bold text-on-surface">{readiness}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-[13px] text-on-surface-variant/50 mt-5 text-center max-w-xl font-brand font-medium tracking-wide">
        Defending <span className="text-on-surface font-bold">{groups}</span>
        <span className="text-on-surface-variant/25">/{totalGroups}</span> threat groups
        {' · '}<span className="text-on-surface font-bold">{campaigns}</span>
        <span className="text-on-surface-variant/25">/{totalCampaigns}</span> campaigns
        {' · '}<span className="text-on-surface font-bold">{techPct}%</span> technique coverage
      </p>
    </div>
  );
};

export default ReadinessBadgeWidget;
