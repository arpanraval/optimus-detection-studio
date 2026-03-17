
import React from 'react';
import { Link } from 'react-router-dom';
import { GroupCampaign } from '../../hooks/useGroupDetail';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';

interface GroupCampaignsListProps {
  campaigns: GroupCampaign[];
  onNavigateToCampaign?: (mitreId: string) => void;
}

export const GroupCampaignsList: React.FC<GroupCampaignsListProps> = ({ campaigns, onNavigateToCampaign }) => {
  if (campaigns.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Icon name="flag" className="w-20 h-20 text-on-surface-variant/40 mx-auto mb-4" />
        <p className="text-on-surface-variant text-lg mb-2">No campaigns tracked</p>
        <p className="text-on-surface-variant/70 text-sm">
          This group has no attributed campaigns in the database
        </p>
      </div>
    );
  }

  // Sort by last_seen or first_seen (most recent first)
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const aTime = new Date(a.last_seen || a.first_seen || 0).getTime();
    const bTime = new Date(b.last_seen || b.first_seen || 0).getTime();
    return bTime - aTime;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="space-y-4">
        {sortedCampaigns.map((campaign) => (
          <Link
            key={campaign.stix_id}
            to={routeHelpers.campaignDetail(campaign.mitre_id)}
            onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onNavigateToCampaign?.(campaign.mitre_id); }}
            className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg p-6
                     hover:border-tertiary hover:shadow-lg hover:shadow-tertiary/20
                     transition-all cursor-pointer group"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-tertiary-container text-tertiary text-xs 
                               font-mono font-bold rounded border border-tertiary/20">
                    {campaign.mitre_id}
                  </span>
                  {campaign.first_seen && (
                    <span className="text-xs text-on-surface-variant">
                      {new Date(campaign.first_seen).toLocaleDateString()}
                      {campaign.last_seen && 
                        ` - ${new Date(campaign.last_seen).toLocaleDateString()}`
                      }
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-on-surface group-hover:text-tertiary transition-colors">{campaign.name}</h3>
              </div>
              <Icon name="flag" className="w-8 h-8 text-tertiary/30" />
            </div>

            {/* Description */}
            {campaign.description && (
              <p className="text-on-surface-variant leading-relaxed">{campaign.description}</p>
            )}

            {/* Timeline */}
            {(campaign.first_seen || campaign.last_seen) && (
              <div className="mt-4 pt-4 border-t border-outline-variant/20">
                <div className="flex items-center gap-6 text-sm">
                  {campaign.first_seen && (
                    <div>
                      <span className="text-on-surface-variant mr-2">First Seen:</span>
                      <span className="text-on-surface font-mono">
                        {new Date(campaign.first_seen).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {campaign.last_seen && (
                    <div>
                      <span className="text-on-surface-variant mr-2">Last Seen:</span>
                      <span className="text-on-surface font-mono">
                        {new Date(campaign.last_seen).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
};
