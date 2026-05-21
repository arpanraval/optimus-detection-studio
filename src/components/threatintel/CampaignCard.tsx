import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import type { DigestCampaignSummary } from '../../hooks/useDigestCampaigns';

interface CampaignCardProps {
  campaign: DigestCampaignSummary;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign }) => {
  const coverage = campaign.coveragePercent;
  const coverageColor =
    coverage >= 70 ? 'text-green-400' : coverage >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <Link
      to={routeHelpers.campaignDigestDetail(campaign.id)}
      className="group relative rounded-2xl p-5 cursor-pointer border border-primary/30
                 hover:border-primary/60 transition-all duration-200 overflow-hidden
                 bg-gradient-to-br from-primary/5 to-tertiary/5 flex flex-col h-full no-underline text-inherit"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-primary/20 text-primary inline-flex items-center gap-1">
          <Icon name="git-merge" className="w-2.5 h-2.5" />
          Story
        </span>
        {campaign.severity && (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-on-surface/5 text-on-surface-variant">
            {campaign.severity}
          </span>
        )}
        <span className="ml-auto text-xs text-on-surface-variant/60 font-mono">
          {campaign.articleCount} report{campaign.articleCount === 1 ? '' : 's'}
        </span>
      </div>

      <h3 className="text-base font-semibold text-on-surface line-clamp-2 leading-snug mb-3">
        {campaign.campaignName || campaign.threatActors?.[0] || 'Correlated activity'}
      </h3>

      {campaign.threatActors && campaign.threatActors.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {campaign.threatActors.slice(0, 3).map(actor => (
            <span key={actor} className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-red-500/10 text-red-400">
              {actor}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between pt-4 border-t border-outline-variant/10 mt-auto">
        <div className="flex items-end gap-6">
          <div>
            <div className="text-2xl font-mono font-bold text-tertiary">{campaign.ttpCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">TTPs</div>
          </div>
          {(campaign.feasibleGapCount + campaign.infeasibleGapCount) > 0 && (
            <div>
              <div className="text-2xl font-mono font-bold text-emerald-400">{campaign.feasibleGapCount}</div>
              <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">Actionable</div>
            </div>
          )}
        </div>
        <div className="text-right">
          {campaign.ttpCount > 0 ? (
            <div className={`text-2xl font-mono font-bold ${coverageColor}`}>{coverage}%</div>
          ) : (
            <div className="text-2xl font-mono font-bold text-on-surface-variant/40">—</div>
          )}
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant/40 font-semibold">Coverage</div>
        </div>
      </div>
    </Link>
  );
};
