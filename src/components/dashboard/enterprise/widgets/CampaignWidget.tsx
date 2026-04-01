import React from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useLibrary } from '../../../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../../../hooks/useImpactScores';
import { useCommandCenterData } from '../../../../hooks/useCommandCenterData';
import WidgetEmptyState from './WidgetEmptyState';
import { withAlpha } from '../engine/colorUtils';

const CampaignWidget: React.FC<WidgetComponentProps> = ({ config, onNavigate }) => {
  const { detections, scopeFilter } = useDashboardDetections();
  const { userId } = useLibrary();
  const { posture } = useDefensivePosture(userId, scopeFilter);
  const { actors } = useThreatActorWeights();
  const { campaignReadiness } = useCommandCenterData(actors, detections, posture?.total_techniques);

  const maxItems = config.maxItems ?? 5;
  const campaigns = campaignReadiness.slice(0, maxItems);
  const accent = config.accentColor;

  if (campaigns.length === 0) return <WidgetEmptyState message="Sync MITRE data to see campaigns" />;

  return (
    <div className="p-5 h-full">
      <div>
        {campaigns.map((c, i) => (
          <div key={c.stixId} onClick={() => onNavigate('campaign-detail', { id: c.stixId })}
            className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 50}ms forwards` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accent ? withAlpha(accent, 0.1) : 'rgb(var(--md-sys-color-primary) / 0.1)' }}>
              <span className="text-[10px] font-brand font-bold" style={{ color: accent || 'rgb(var(--md-sys-color-primary))' }}>{c.coveragePct}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <div className="truncate">
                  <span className="text-[13px] font-brand font-medium text-on-surface">{c.name}</span>
                  {c.attributedGroup && <span className="text-[10px] text-on-surface-variant/20 ml-2">{c.attributedGroup}</span>}
                </div>
                <span className="text-[11px] font-brand font-semibold ml-2 flex-shrink-0" style={{ color: accent || 'rgb(var(--md-sys-color-primary))' }}>{c.covered}/{c.total}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: accent ? withAlpha(accent, 0.1) : 'rgb(var(--md-sys-color-primary) / 0.15)' }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(c.coveragePct, 3)}%`, backgroundColor: accent || 'rgb(var(--md-sys-color-primary))' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CampaignWidget;
