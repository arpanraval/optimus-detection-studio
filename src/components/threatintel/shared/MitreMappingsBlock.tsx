import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../Icon';
import { badgeSizes } from '../../../lib/ui/badges';
import { routeHelpers } from '../../../router/routes';
import { VendorChip } from './VendorChip';

export interface MitreMappingEntity {
  stixId: string;
  mitreId: string;
  name: string;
  /** Optional original match reason from the digest mapping. */
  matchReason?: string;
  /** Vendor names that mentioned this entity. Empty/undefined on digest. */
  sources?: string[];
}

interface MitreMappingsBlockProps {
  groups: MitreMappingEntity[];
  software: MitreMappingEntity[];
  campaigns: MitreMappingEntity[];
  /** When true, render vendor chips next to each entity. */
  showSources?: boolean;
  /** "compact" — narrow right-rail card. "wide" — full-width with each entity on its own row. */
  variant?: 'compact' | 'wide';
}

interface EntityRowProps {
  entity: MitreMappingEntity;
  to: string;
  toneClass: string;
  showSources?: boolean;
}

const EntityChip: React.FC<EntityRowProps> = ({ entity, to, toneClass, showSources }) => (
  <Link
    to={to}
    className={`${badgeSizes.sm} font-bold inline-flex items-center gap-1.5 ${toneClass} transition-colors cursor-pointer no-underline`}
    title={entity.matchReason || `View ${entity.name}`}
  >
    <span className="font-mono text-[9px]">{entity.mitreId}</span>
    <span>{entity.name}</span>
    {showSources && entity.sources && entity.sources.length > 1 && (
      <span className="ml-1 text-[9px] font-mono opacity-70">×{entity.sources.length}</span>
    )}
  </Link>
);

interface RowProps {
  icon: string;
  iconColor: string;
  label: string;
  entities: MitreMappingEntity[];
  linkFor: (mitreId: string) => string;
  toneClass: string;
  showSources?: boolean;
  variant: 'compact' | 'wide';
}

const Row: React.FC<RowProps> = ({ icon, iconColor, label, entities, linkFor, toneClass, showSources, variant }) => {
  if (entities.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2 flex items-center gap-1.5">
        <Icon name={icon} className={`w-3 h-3 ${iconColor}`} />
        {label}
      </div>
      {variant === 'compact' ? (
        <div className="flex flex-wrap gap-1.5">
          {entities.map(e => (
            <EntityChip
              key={e.stixId || e.mitreId}
              entity={e}
              to={linkFor(e.mitreId)}
              toneClass={toneClass}
              showSources={showSources}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entities.map(e => (
            <div key={e.stixId || e.mitreId} className="flex items-center flex-wrap gap-2">
              <EntityChip entity={e} to={linkFor(e.mitreId)} toneClass={toneClass} showSources={showSources} />
              {showSources && e.sources && e.sources.length > 0 && (
                <>
                  <span className="text-[10px] text-on-surface-variant/60">via</span>
                  {e.sources.map(s => <VendorChip key={s} name={s} size="xs" />)}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const groupTone    = 'bg-[#A63D40]/10 text-[#A63D40] border border-[#A63D40]/20 hover:bg-[#A63D40]/20 hover:border-[#A63D40]/40';
const softwareTone = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40';
const campaignTone = 'bg-[#0284C7]/10 text-[#0284C7] border border-[#0284C7]/20 hover:bg-[#0284C7]/20 hover:border-[#0284C7]/40';

export const MitreMappingsBlock: React.FC<MitreMappingsBlockProps> = ({
  groups, software, campaigns, showSources, variant = 'compact',
}) => {
  if (groups.length === 0 && software.length === 0 && campaigns.length === 0) return null;
  return (
    <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-6">
      <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 pb-2 border-b border-outline-variant/30">
        {variant === 'wide' ? 'MITRE Mappings (across all sources)' : 'MITRE Mappings'}
      </h3>
      <div className="space-y-4">
        <Row icon="users" iconColor="text-[#A63D40]" label="Threat Groups"
          entities={groups} linkFor={routeHelpers.groupDetail} toneClass={groupTone}
          showSources={showSources} variant={variant} />
        <Row icon="package" iconColor="text-orange-500" label="Software/Malware"
          entities={software} linkFor={routeHelpers.softwareDetail} toneClass={softwareTone}
          showSources={showSources} variant={variant} />
        <Row icon="flag" iconColor="text-[#0284C7]" label="Campaigns"
          entities={campaigns} linkFor={routeHelpers.campaignDetail} toneClass={campaignTone}
          showSources={showSources} variant={variant} />
      </div>
    </div>
  );
};
