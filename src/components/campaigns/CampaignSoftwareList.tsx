
import React from 'react';
import { Link } from 'react-router-dom';
import { CampaignSoftware } from '../../hooks/useCampaignDetail';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';

interface CampaignSoftwareListProps {
  software: CampaignSoftware[];
  onNavigateToSoftware?: (mitreId: string) => void;
}

export const CampaignSoftwareList: React.FC<CampaignSoftwareListProps> = ({ 
  software,
  onNavigateToSoftware
}) => {
  if (software.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Icon name="package" className="w-20 h-20 text-on-surface-variant/40 mx-auto mb-4" />
        <p className="text-on-surface-variant text-lg mb-2">No software tracked</p>
        <p className="text-on-surface-variant/70 text-sm">
          This campaign has no associated malware or tools in the database
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {software.map((sw) => (
          <Link
            key={sw.stix_id}
            to={routeHelpers.softwareDetail(sw.mitre_id)}
            onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onNavigateToSoftware?.(sw.mitre_id); }}
            className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg p-5
                     hover:border-secondary hover:shadow-lg hover:shadow-secondary/20
                     transition-all cursor-pointer group"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-secondary-container text-secondary text-xs 
                               font-mono font-bold rounded border border-secondary/20">
                    {sw.mitre_id}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                    sw.software_type === 'malware'
                      ? 'bg-error-container text-error border border-error/20'
                      : 'bg-primary-container text-primary border border-primary/20'
                  }`}>
                    {sw.software_type}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-on-surface mb-2 group-hover:text-secondary transition-colors">{sw.name}</h3>
              </div>
            </div>

            {/* Description */}
            {sw.description && (
              <p className="text-sm text-on-surface-variant line-clamp-3 mb-3">
                {sw.description}
              </p>
            )}

            {/* Usage Context */}
            {sw.relationship_description && (
              <div className="mt-3 pt-3 border-t border-outline-variant/20">
                <div className="text-xs text-on-surface-variant/70 mb-1 uppercase tracking-wider">
                  Usage:
                </div>
                <p className="text-xs text-on-surface-variant italic line-clamp-2">
                  {sw.relationship_description}
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
};
