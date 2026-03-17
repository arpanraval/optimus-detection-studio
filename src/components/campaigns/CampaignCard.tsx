
import React from 'react';
import { Link } from 'react-router-dom';
import { Campaign } from '../../hooks/useCampaigns';
import { Icon } from '../Icon';

interface CampaignCardProps {
  campaign: Campaign;
  to: string;
  onClick?: () => void;
  onNavigateToGroup?: (mitreId: string) => void;
}

const YELLOW = '#EAB308';

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    });
  } catch {
    return dateStr;
  }
};

const isRecent = (lastSeen: string | null) => {
  if (!lastSeen) return false;
  const last = new Date(lastSeen);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  return last > twoYearsAgo;
};

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign, to, onClick, onNavigateToGroup }) => {
  const aliases = campaign.data.aliases || [];
  const allAliasCount = aliases.length;
  const recent = isRecent(campaign.last_seen);
  const techniqueCount = campaign.technique_count || 0;

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      aria-label={`View ${campaign.name} (${campaign.mitre_id})`}
      className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3
                 cursor-pointer transition-all duration-200 hover:border-outline-variant/60
                 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none flex flex-col h-full group"
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 20px ${YELLOW}25, 0 0 40px ${YELLOW}15`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      {/* Header: icon + status/name + ID */}
      <div className="flex items-start gap-2.5 mb-1.5">
        <div
          className="w-11 h-11 rounded-lg border flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#CA8A0420', borderColor: '#CA8A0430' }}
        >
          <Icon name="swords" className="w-6 h-6" style={{ color: '#CA8A04' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {recent && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold rounded uppercase"
                style={{ backgroundColor: `${YELLOW}18`, color: YELLOW }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: YELLOW }} />
                Active
              </span>
            )}
            {campaign.deprecated && (
              <span className="px-1.5 py-0.5 bg-error-container text-on-error-container text-[11px] font-bold rounded uppercase">
                DEPRECATED
              </span>
            )}
            <span
              className="text-xs font-mono text-on-surface-variant/50 ml-auto shrink-0 cursor-pointer hover:text-on-surface transition-colors"
              title="Click to copy"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(campaign.mitre_id); }}
            >{campaign.mitre_id}</span>
          </div>
          <h3 className="text-lg font-brand font-bold text-on-surface leading-tight line-clamp-2 m-0">
            {campaign.name}
          </h3>
        </div>
      </div>

      {/* Aliases */}
      {allAliasCount > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {aliases.slice(0, 5).map(alias => (
            <span key={alias} className="px-1.5 py-0.5 bg-[#4D7C6F]/10 text-[#4D7C6F] dark:text-[#6BA594] text-[11px] rounded border border-[#4D7C6F]/20">
              {alias}
            </span>
          ))}
          {allAliasCount > 5 && (
            <span className="px-1.5 py-0.5 text-on-surface-variant/50 text-[11px]">
              +{allAliasCount - 5}
            </span>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="mb-2 p-2.5 bg-surface-container rounded-lg border border-outline-variant/15">
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-on-surface-variant block mb-0.5">First Seen</span>
            <span className="text-on-surface font-mono">{formatDate(campaign.first_seen)}</span>
          </div>
          <div
            className="flex-1 mx-3 h-[2px] rounded-full"
            style={{ background: `linear-gradient(to right, ${YELLOW}80, ${YELLOW}30)` }}
          />
          <div className="text-right">
            <span className="text-on-surface-variant block mb-0.5">Last Seen</span>
            <span className="text-on-surface font-mono">{formatDate(campaign.last_seen)}</span>
          </div>
        </div>
      </div>

      {/* Attribution */}
      <div className="mb-2 h-9 flex items-center">
        {campaign.attributed_group ? (
          <div
            className={`flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 ${onNavigateToGroup ? 'hover:brightness-110 transition-all' : ''}`}
            style={{ backgroundColor: YELLOW, cursor: onNavigateToGroup ? 'pointer' : undefined }}
            onClick={onNavigateToGroup ? (e) => { e.preventDefault(); e.stopPropagation(); onNavigateToGroup(campaign.attributed_group!.mitre_id); } : undefined}
          >
            <Icon name="threat-actor" className="w-4 h-4 text-black/80 flex-shrink-0" />
            <span className="text-[11px] text-black/70 flex-shrink-0">Attributed to</span>
            <span className="text-xs font-bold text-black truncate">
              {campaign.attributed_group.name}
            </span>
            <span className="text-[11px] font-mono text-black/80 ml-auto flex-shrink-0">
              {campaign.attributed_group.mitre_id}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Icon name="help-circle" className="w-3.5 h-3.5 text-on-surface-variant/25" />
            <span className="text-xs text-on-surface-variant/40 italic">Unattributed</span>
          </div>
        )}
      </div>

      {/* Description */}
      {campaign.description && (
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-2 m-0">
          {campaign.description}
        </p>
      )}

      {/* Stats Footer */}
      <div className="grid grid-cols-1 mt-auto border-t border-outline-variant/20 pt-3">
        <div
          className="pl-2 border-l-[3px]"
          style={{ borderColor: YELLOW }}
        >
          <span className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold block">Techniques</span>
          <span className="text-2xl font-mono font-bold text-on-surface leading-tight">{techniqueCount}</span>
        </div>
      </div>
    </Link>
  );
};
