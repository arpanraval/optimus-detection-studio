import React from 'react';
import { 
  ShieldCheckIcon, 
  UserGroupIcon, 
  FlagIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { ImpactScoreBadge, ImpactScoreBar } from './ImpactScoreBadge';
import { StatCard } from './ImpactStatsRow';
import { DisruptedGroupsTable } from './DisruptedGroupsTable';
import { 
  useMitigationImpactDetail, 
  getImpactLabel,
  MitigationImpactDetail 
} from '../../hooks/useImpactScores';

interface MitigationImpactPanelProps {
  mitigationStixId: string;
  onGroupClick?: (mitreId: string) => void;
  className?: string;
}

/**
 * Full impact analysis panel for a mitigation
 * Shows impact score, stats, and disrupted threat actors
 */
export function MitigationImpactPanel({
  mitigationStixId,
  onGroupClick,
  className = ''
}: MitigationImpactPanelProps) {
  const { detail, loading, error } = useMitigationImpactDetail(mitigationStixId);

  if (loading) {
    return (
      <div className={`bg-surface rounded-lg border border-border p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-alt rounded w-1/3" />
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-surface-alt rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-alt rounded w-full" />
              <div className="h-4 bg-surface-alt rounded w-2/3" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 bg-surface-alt rounded-lg" />
            <div className="h-20 bg-surface-alt rounded-lg" />
            <div className="h-20 bg-surface-alt rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={`bg-surface rounded-lg border border-border p-6 ${className}`}>
        <div className="flex items-center gap-2 text-text-secondary">
          <InformationCircleIcon className="w-5 h-5" />
          <span>Impact analysis not available</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface rounded-lg border border-border overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface-alt/30">
        <div className="flex items-center gap-2">
          <ArrowTrendingUpIcon className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-text-primary">Defensive Impact</h3>
        </div>
      </div>

      {/* Impact Score Section */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start gap-6">
          <ImpactScoreBadge score={detail.impact_score} size="lg" />
          
          <div className="flex-1">
            <p className="text-text-secondary mb-3">
              {getImpactDescription(detail)}
            </p>
            <ImpactScoreBar score={detail.impact_score} height="md" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-6 border-b border-border">
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            value={detail.technique_count}
            label="Techniques"
            icon={<ShieldCheckIcon className="w-5 h-5" />}
            subLabel="Addressed"
          />
          <StatCard
            value={detail.total_groups_disrupted}
            label="Groups"
            icon={<UserGroupIcon className="w-5 h-5" />}
            subLabel="Disrupted"
          />
          <StatCard
            value={detail.total_campaigns_disrupted}
            label="Campaigns"
            icon={<FlagIcon className="w-5 h-5" />}
            subLabel="Disrupted"
          />
        </div>
      </div>

      {/* Disrupted Groups Table */}
      <div className="p-6">
        <DisruptedGroupsTable
          groups={detail.top_groups}
          onGroupClick={onGroupClick}
          maxRows={8}
        />
      </div>
    </div>
  );
}

/**
 * Generate descriptive text based on impact score
 */
function getImpactDescription(detail: MitigationImpactDetail): string {
  const score = detail.impact_score;
  const label = getImpactLabel(score);
  
  if (score >= 90) {
    return `Implementing this mitigation provides exceptional defense against ${detail.total_groups_disrupted} active threat actors across ${detail.technique_count} attack techniques. This is one of the highest-impact preventive controls available.`;
  }
  if (score >= 75) {
    return `This mitigation offers strong defensive value, disrupting ${detail.total_groups_disrupted} threat groups and addressing ${detail.technique_count} techniques used in ${detail.total_campaigns_disrupted} documented campaigns.`;
  }
  if (score >= 50) {
    return `A solid preventive control that addresses ${detail.technique_count} techniques and helps defend against ${detail.total_groups_disrupted} known threat actors.`;
  }
  if (score >= 25) {
    return `This mitigation provides targeted protection against ${detail.total_groups_disrupted} threat groups, covering ${detail.technique_count} specific techniques.`;
  }
  return `A focused mitigation addressing ${detail.technique_count} techniques. Consider combining with other controls for broader coverage.`;
}

/**
 * Compact version for list views
 */
export function MitigationImpactCompact({
  stixId,
  impactScore,
  techniqueCount,
  onClick,
  className = ''
}: {
  stixId: string;
  impactScore: number;
  techniqueCount: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3 p-3 rounded-lg border border-border
        bg-surface hover:bg-surface-alt/50 transition-colors text-left w-full
        ${className}
      `}
    >
      <ImpactScoreBadge score={impactScore} size="md" showLabel={false} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {getImpactLabel(impactScore)} Impact
        </div>
        <div className="text-xs text-text-tertiary">
          {techniqueCount} techniques addressed
        </div>
      </div>
    </button>
  );
}

export default MitigationImpactPanel;
