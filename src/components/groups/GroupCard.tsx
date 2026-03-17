import React from 'react';
import { Link } from 'react-router-dom';
import { Group } from '../../hooks/useGroups';
import { Icon } from '../Icon';
import { getCountryCode, getFlagUrl } from '../../lib/countries';

const MAGENTA = '#783264';

interface GroupCardProps {
  group: Group;
  to: string;
  onClick?: () => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({ group, to, onClick }) => {
  const aliases = group.data.aliases || [];
  const targeting = group.data.targeting_intel;
  const originCountry = targeting?.origin_country;
  const originCode = targeting?.origin_country_code || (originCountry ? getCountryCode(originCountry) : null);
  const targetCountries = targeting?.target_countries || [];
  const targetSectors = targeting?.target_sectors || [];
  const hasTargets = targetCountries.length > 0 || targetSectors.length > 0;

  return (
    <Link
      to={to}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      aria-label={`View ${group.name} (${group.mitre_id})`}
      className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 cursor-pointer transition-all duration-200 hover:border-outline-variant/60 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none flex flex-col h-full group"
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 20px ${MAGENTA}25, 0 0 40px ${MAGENTA}15`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      {/* Header: icon + name/aliases + ID/country */}
      <div className="flex items-start gap-2.5 mb-2">
        <div
          className="w-12 h-12 rounded-lg border flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${MAGENTA}20`, borderColor: `${MAGENTA}30` }}
        >
          <Icon name="threat-actor" className="w-7 h-7" style={{ color: MAGENTA }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-brand font-bold text-on-surface leading-tight line-clamp-2 m-0">
            {group.name}
          </h3>
          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {aliases.slice(0, 5).map(alias => (
                <span key={alias} className="px-1.5 py-0.5 bg-[#4D7C6F]/10 text-[#4D7C6F] dark:text-[#6BA594] text-[11px] rounded border border-[#4D7C6F]/20">
                  {alias}
                </span>
              ))}
              {aliases.length > 5 && (
                <span className="px-1.5 py-0.5 text-on-surface-variant/50 text-[11px]">
                  +{aliases.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="text-xs font-mono text-on-surface-variant/50 cursor-pointer hover:text-on-surface transition-colors"
            title="Click to copy"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(group.mitre_id); }}
          >{group.mitre_id}</span>
          {originCountry && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-surface-container rounded text-xs text-on-surface-variant border border-outline-variant/20">
              {originCode && (
                <img src={getFlagUrl(originCode)} alt={originCountry} className="w-4 h-3 rounded-[1px] object-cover" />
              )}
              {originCountry}
            </span>
          )}
        </div>
      </div>

      {/* Targets Panel */}
      {hasTargets ? (
        <div className="mb-3 p-2.5 bg-surface-container rounded-lg border border-outline-variant/15">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon name="crosshairs" className="w-3.5 h-3.5" style={{ color: MAGENTA }} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Targets
            </span>
          </div>

          {targetCountries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {targetCountries.slice(0, 4).map(country => (
                <span key={country} className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded-full border border-outline-variant/15">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MAGENTA }} />
                  {country}
                </span>
              ))}
              {targetCountries.length > 4 && (
                <span className="px-1.5 py-0.5 text-on-surface-variant/60 text-xs">
                  +{targetCountries.length - 4}
                </span>
              )}
            </div>
          )}

          {targetCountries.length > 0 && targetSectors.length > 0 && (
            <div className="border-t border-outline-variant/10 my-1.5" />
          )}

          {targetSectors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {targetSectors.slice(0, 4).map(sector => (
                <span key={sector} className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded">
                  {sector}
                </span>
              ))}
              {targetSectors.length > 4 && (
                <span className="px-1.5 py-0.5 text-on-surface-variant/60 text-xs">
                  +{targetSectors.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 p-3 bg-surface-container/50 rounded-lg border border-outline-variant/10">
          <div className="flex flex-col items-center justify-center py-3 gap-2">
            <Icon name="threat-actor" className="w-6 h-6 text-on-surface-variant/15" />
            <span className="text-xs text-on-surface-variant/25">No targeting intel</span>
            <div className="flex gap-2 mt-1">
              <span className="h-1.5 w-12 bg-on-surface-variant/8 rounded-full" />
              <span className="h-1.5 w-16 bg-on-surface-variant/8 rounded-full" />
              <span className="h-1.5 w-10 bg-on-surface-variant/8 rounded-full" />
            </div>
            <div className="flex gap-2">
              <span className="h-1.5 w-14 bg-on-surface-variant/5 rounded-full" />
              <span className="h-1.5 w-10 bg-on-surface-variant/5 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {group.description && (
        <p className="text-xs text-on-surface-variant line-clamp-2 mb-2 m-0">
          {group.description}
        </p>
      )}

      {/* Stats Footer */}
      <div className="grid grid-cols-3 gap-2 mt-auto border-t border-outline-variant/20 pt-3">
        <div className="pl-2" style={{ borderLeft: `3px solid ${MAGENTA}` }}>
          <div className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">TTPs</div>
          <div className="text-2xl font-mono font-bold text-on-surface leading-tight">{group.technique_count || 0}</div>
        </div>
        <div className="pl-2 border-l-[3px] border-outline-variant/20">
          <div className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">Software</div>
          <div className="text-2xl font-mono font-bold text-on-surface leading-tight">{group.software_count || 0}</div>
        </div>
        <div className="pl-2 border-l-[3px] border-outline-variant/20">
          <div className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">Campaigns</div>
          <div className="text-2xl font-mono font-bold text-on-surface leading-tight">{group.campaign_count || 0}</div>
        </div>
      </div>
    </Link>
  );
};
