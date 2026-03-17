
import React from 'react';
import { Link } from 'react-router-dom';
import { SoftwareGroup } from '../../hooks/useSoftwareDetail';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';

interface SoftwareGroupsListProps {
  groups: SoftwareGroup[];
  onSelectGroup?: (mitreId: string) => void;
}

export const SoftwareGroupsList: React.FC<SoftwareGroupsListProps> = ({ 
  groups,
  onSelectGroup 
}) => {
  if (groups.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Icon name="users" className="w-20 h-20 text-on-surface-variant/40 mx-auto mb-4" />
        <p className="text-on-surface-variant text-lg mb-2">No groups tracked</p>
        <p className="text-on-surface-variant/70 text-sm">
          No threat groups have been observed using this software
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <Link
            key={group.stix_id}
            to={routeHelpers.groupDetail(group.mitre_id)}
            onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onSelectGroup?.(group.mitre_id); }}
            className="block no-underline text-inherit bg-surface-container-low border border-outline-variant/30 rounded-lg p-5
                     hover:border-primary hover:shadow-lg hover:shadow-primary/20
                     transition-all cursor-pointer group"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-primary-container text-primary text-xs 
                           font-mono font-bold rounded border border-primary/20">
                {group.mitre_id}
              </span>
              <span className="text-xs text-on-surface-variant">
                {group.technique_count} techniques
              </span>
            </div>

            {/* Name */}
            <h3 className="text-lg font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">{group.name}</h3>

            {/* Description */}
            {group.description && (
              <p className="text-sm text-on-surface-variant line-clamp-3">
                {group.description}
              </p>
            )}

            {/* Usage Context */}
            {group.relationship_description && (
              <div className="mt-3 pt-3 border-t border-outline-variant/20">
                <div className="text-xs text-on-surface-variant/70 mb-1 uppercase tracking-wider">
                  Usage:
                </div>
                <p className="text-xs text-on-surface-variant italic line-clamp-2">
                  {group.relationship_description}
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
};
