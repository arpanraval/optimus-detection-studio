import React from 'react';
import { 
  UserGroupIcon, 
  FlagIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  PlusCircleIcon
} from '@heroicons/react/24/outline';
import { ImpactScoreBadge, ImpactScoreBar } from './ImpactScoreBadge';
import { StatCard, DefenseDepthIndicator } from './ImpactStatsRow';
import { DetectedGroupsTable } from './DisruptedGroupsTable';
import { 
  useStrategyImpactDetail, 
  getImpactLabel,
  StrategyImpactDetail 
} from '../../hooks/useImpactScores';

interface StrategyImpactPanelProps {
  strategyStixId: string;
  onGroupClick?: (mitreId: string) => void;
  onCreateDetection?: () => void;
  className?: string;
}

/**
 * Full impact analysis panel for a detection strategy
 * Shows impact score, stats, and threat actors that use this technique
 */
export function StrategyImpactPanel({
  strategyStixId,
  onGroupClick,
  onCreateDetection,
  className = ''
}: StrategyImpactPanelProps) {
  const { detail, loading, error } = useStrategyImpactDetail(strategyStixId);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowTrendingUpIcon className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-text-primary">Detection Impact</h3>
          </div>
          <span className="text-sm text-text-secondary">
            Technique: <span className="font-mono text-primary">{detail.technique_id}</span>
          </span>
        </div>
      </div>

      {/* Impact Score Section */}
      <div className="p-6 border-b border-border">
        <div className="flex items-start gap-6">
          <ImpactScoreBadge score={detail.impact_score} size="lg" />
          
          <div className="flex-1">
            <p className="text-text-secondary mb-3">
              {getStrategyImpactDescription(detail)}
            </p>
            <ImpactScoreBar score={detail.impact_score} height="md" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-6 border-b border-border">
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            value={detail.total_groups_detected}
            label="Groups"
            icon={<UserGroupIcon className="w-5 h-5" />}
            subLabel="Detected"
          />
          <StatCard
            value={detail.total_campaigns_detected}
            label="Campaigns"
            icon={<FlagIcon className="w-5 h-5" />}
            subLabel="Detected"
          />
          <StatCard
            value={detail.analytic_count}
            label="Analytics"
            icon={<DocumentTextIcon className="w-5 h-5" />}
            subLabel="Available"
          />
        </div>
      </div>

      {/* Defense in Depth Status */}
      {/* Note: We'd need to fetch whether mitigations exist for this technique */}
      {/* For now, showing a placeholder */}

      {/* Detected Groups */}
      <div className="p-6 border-b border-border">
        <DetectedGroupsTable
          groups={detail.top_groups}
          onGroupClick={onGroupClick}
          maxRows={6}
        />
      </div>

      {/* Create Detection CTA */}
      {onCreateDetection && (
        <div className="p-6 bg-surface-alt/20">
          <button
            onClick={onCreateDetection}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
              bg-primary text-on-primary hover:bg-primary-hover transition-colors
              font-medium"
          >
            <PlusCircleIcon className="w-5 h-5" />
            Create Detection from This Strategy
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Generate descriptive text based on strategy impact
 */
function getStrategyImpactDescription(detail: StrategyImpactDetail): string {
  const score = detail.impact_score;
  
  if (score >= 90) {
    return `This is a critical detection strategy. Implementing it helps detect attacks from ${detail.total_groups_detected} threat actors, including some of the most sophisticated groups tracked by MITRE.`;
  }
  if (score >= 75) {
    return `A high-value detection that covers technique ${detail.technique_id} used by ${detail.total_groups_detected} threat groups across ${detail.total_campaigns_detected} documented campaigns.`;
  }
  if (score >= 50) {
    return `This strategy provides solid detection coverage for ${detail.total_groups_detected} threat actors. ${detail.analytic_count > 0 ? `${detail.analytic_count} analytics are available to help with implementation.` : ''}`;
  }
  if (score >= 25) {
    return `A focused detection strategy targeting ${detail.total_groups_detected} specific threat groups that use ${detail.technique_id}.`;
  }
  return `This strategy addresses a specific technique used by ${detail.total_groups_detected} groups. Consider prioritizing higher-impact detections first.`;
}

/**
 * Compact card version for strategy lists
 */
export function StrategyImpactCard({
  strategyId,
  strategyName,
  techniqueId,
  impactScore,
  groupCount,
  analyticCount,
  hasCoverage,
  onClick,
  onCreateDetection,
  className = ''
}: {
  strategyId: string;
  strategyName: string;
  techniqueId: string;
  impactScore: number;
  groupCount: number;
  analyticCount: number;
  hasCoverage?: boolean;
  onClick?: () => void;
  onCreateDetection?: () => void;
  className?: string;
}) {
  return (
    <div className={`
      bg-surface rounded-lg border border-border overflow-hidden
      hover:border-border-hover transition-colors
      ${className}
    `}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <ImpactScoreBadge score={impactScore} size="md" />
          
          <div className="flex-1 min-w-0">
            <button
              onClick={onClick}
              className="text-left group"
            >
              <h4 className="font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-2">
                {strategyName}
              </h4>
            </button>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {techniqueId}
              </span>
              {hasCoverage !== undefined && (
                <span className={`
                  text-xs px-1.5 py-0.5 rounded font-medium
                  ${hasCoverage 
                    ? 'bg-tertiary/20 text-tertiary' 
                    : 'bg-warning/20 text-warning'
                  }
                `}>
                  {hasCoverage ? '✓ Covered' : '★ Gap'}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-3 flex items-center gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <UserGroupIcon className="w-3.5 h-3.5" />
            {groupCount} groups
          </span>
          <span className="flex items-center gap-1">
            <DocumentTextIcon className="w-3.5 h-3.5" />
            {analyticCount} analytics
          </span>
        </div>
      </div>
      
      {!hasCoverage && onCreateDetection && (
        <button
          onClick={onCreateDetection}
          className="w-full px-4 py-2.5 text-sm font-medium text-primary 
            bg-surface-alt/50 hover:bg-primary/10 transition-colors
            border-t border-border flex items-center justify-center gap-1.5"
        >
          <PlusCircleIcon className="w-4 h-4" />
          Create Detection
        </button>
      )}
    </div>
  );
}

/**
 * Mini version showing just score and key stats
 */
export function StrategyImpactMini({
  impactScore,
  groupCount,
  hasCoverage,
  className = ''
}: {
  impactScore: number;
  groupCount: number;
  hasCoverage?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ImpactScoreBadge score={impactScore} size="sm" showLabel={false} />
      <span className="text-xs text-text-secondary">
        {groupCount} groups
      </span>
      {hasCoverage !== undefined && (
        <span className={`
          text-xs px-1 py-0.5 rounded
          ${hasCoverage 
            ? 'bg-tertiary/20 text-tertiary' 
            : 'bg-warning/20 text-warning'
          }
        `}>
          {hasCoverage ? '✓' : '★'}
        </span>
      )}
    </div>
  );
}

export default StrategyImpactPanel;
