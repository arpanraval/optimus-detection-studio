import React, { useState } from 'react';
import { 
  ChevronDownIcon, 
  ChevronUpIcon,
  ArrowTopRightOnSquareIcon 
} from '@heroicons/react/24/outline';
import { DisruptedGroup, DetectedGroup, getTawIndicator } from '../../hooks/useImpactScores';

interface DisruptedGroupsTableProps {
  groups: DisruptedGroup[];
  onGroupClick?: (mitreId: string) => void;
  maxRows?: number;
  title?: string;
  showTechniquesBlocked?: boolean;
  className?: string;
}

/**
 * Table showing threat groups disrupted by a mitigation
 */
export function DisruptedGroupsTable({
  groups,
  onGroupClick,
  maxRows = 8,
  title = 'Top Threat Actors Disrupted',
  showTechniquesBlocked = true,
  className = ''
}: DisruptedGroupsTableProps) {
  const [expanded, setExpanded] = useState(false);
  
  const displayGroups = expanded ? groups : groups.slice(0, maxRows);
  const hasMore = groups.length > maxRows;

  if (groups.length === 0) {
    return (
      <div className={`text-text-secondary text-sm p-4 text-center ${className}`}>
        No threat actor data available
      </div>
    );
  }

  return (
    <div className={`bg-surface rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-border bg-surface-alt/30">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt/20">
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                Threat Actor
              </th>
              {showTechniquesBlocked && (
                <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                  TTPs Blocked
                </th>
              )}
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wide">
                TAW
              </th>
            </tr>
          </thead>
          <tbody>
            {displayGroups.map((group, idx) => (
              <tr 
                key={group.stix_id}
                className="border-b border-border/50 last:border-0 hover:bg-surface-alt/30 transition-colors"
              >
                <td className="px-4 py-2.5 text-text-tertiary font-medium">
                  {idx + 1}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => onGroupClick?.(group.mitre_id)}
                    className="flex items-center gap-2 text-left hover:text-primary transition-colors group"
                  >
                    <span className="font-medium text-text-primary group-hover:text-primary">
                      {group.name}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {group.mitre_id}
                    </span>
                    {onGroupClick && (
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                </td>
                {showTechniquesBlocked && (
                  <td className="px-4 py-2.5 text-text-secondary">
                    {group.techniques_blocked}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">
                      {group.taw.toFixed(2)}
                    </span>
                    <span className="text-xs tracking-widest text-warning">
                      {getTawIndicator(group.taw)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-sm text-primary hover:bg-surface-alt/30 transition-colors flex items-center justify-center gap-1 border-t border-border"
        >
          {expanded ? (
            <>
              <ChevronUpIcon className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDownIcon className="w-4 h-4" />
              View All {groups.length} Groups
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface DetectedGroupsTableProps {
  groups: DetectedGroup[];
  onGroupClick?: (mitreId: string) => void;
  maxRows?: number;
  title?: string;
  className?: string;
}

/**
 * Table showing threat groups detected by a strategy
 */
export function DetectedGroupsTable({
  groups,
  onGroupClick,
  maxRows = 8,
  title = 'Threat Actors Using This Technique',
  className = ''
}: DetectedGroupsTableProps) {
  const [expanded, setExpanded] = useState(false);
  
  const displayGroups = expanded ? groups : groups.slice(0, maxRows);
  const hasMore = groups.length > maxRows;

  if (groups.length === 0) {
    return (
      <div className={`text-text-secondary text-sm p-4 text-center ${className}`}>
        No threat actor data available
      </div>
    );
  }

  return (
    <div className={`bg-surface rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-border bg-surface-alt/30">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      
      <div className="divide-y divide-border/50">
        {displayGroups.map((group) => (
          <div
            key={group.stix_id}
            className="px-4 py-3 hover:bg-surface-alt/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-surface-alt border border-border flex flex-col items-center justify-center">
                <span className="text-xs text-text-tertiary">{group.mitre_id}</span>
              </div>
              
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onGroupClick?.(group.mitre_id)}
                  className="text-left group"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                      {group.name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                      TAW: {group.taw.toFixed(2)}
                    </span>
                  </div>
                </button>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="tracking-widest text-warning">
                    {getTawIndicator(group.taw)}
                  </span>
                  <span>
                    {group.taw >= 0.8 ? 'Very High Threat' :
                     group.taw >= 0.6 ? 'High Threat' :
                     group.taw >= 0.4 ? 'Medium Threat' :
                     group.taw >= 0.2 ? 'Low Threat' : 'Minimal Threat'}
                  </span>
                </div>
              </div>
              
              {onGroupClick && (
                <button
                  onClick={() => onGroupClick(group.mitre_id)}
                  className="text-text-tertiary hover:text-primary transition-colors"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-sm text-primary hover:bg-surface-alt/30 transition-colors flex items-center justify-center gap-1 border-t border-border"
        >
          {expanded ? (
            <>
              <ChevronUpIcon className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDownIcon className="w-4 h-4" />
              +{groups.length - maxRows} more groups
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface TawBadgeProps {
  taw: number;
  showIndicator?: boolean;
  className?: string;
}

/**
 * Badge showing TAW score with visual indicator
 */
export function TawBadge({ taw, showIndicator = true, className = '' }: TawBadgeProps) {
  const getColorClass = () => {
    if (taw >= 0.8) return 'bg-error/20 text-error';
    if (taw >= 0.6) return 'bg-warning/20 text-warning';
    if (taw >= 0.4) return 'bg-primary/20 text-primary';
    return 'bg-surface-alt text-text-secondary';
  };

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium
      ${getColorClass()}
      ${className}
    `}>
      <span>{taw.toFixed(2)}</span>
      {showIndicator && (
        <span className="tracking-widest opacity-75">{getTawIndicator(taw)}</span>
      )}
    </span>
  );
}

export default DisruptedGroupsTable;
