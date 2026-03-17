import React from 'react';
import { Icon } from '../Icon';
import { useDefensivePosture, TechniqueGap } from '../../hooks/useImpactScores';

interface DefensivePostureDashboardProps {
  userId: string;
  onTechniqueClick?: (mitreId: string) => void;
  onGroupClick?: (groupMitreId: string) => void;
  onViewAllGaps?: () => void;
  onBuildDetection?: (techniqueId: string) => void;
  className?: string;
}

export function DefensivePostureDashboard({
  userId,
  onTechniqueClick,
  onGroupClick,
  onViewAllGaps,
  onBuildDetection,
  className = ''
}: DefensivePostureDashboardProps) {
  const { posture, loading, error } = useDefensivePosture(userId);

  if (loading) {
    return <PostureLoadingSkeleton />;
  }

  if (error || !posture) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-tertiary/20 flex items-center justify-center">
                <Icon name="shield-check" className="w-5 h-5 text-tertiary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-on-surface">Defensive Posture</h1>
                <p className="text-sm text-on-surface-variant/60">
                  Your coverage against active threats
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <Icon name="alert-triangle" className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-on-surface mb-2">Unable to Calculate Posture</h3>
            <p className="text-sm text-on-surface-variant/60">
              Add detections with MITRE technique mappings to see your defensive coverage analysis.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col bg-background ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-tertiary/20 flex items-center justify-center">
                <Icon name="shield-check" className="w-5 h-5 text-tertiary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-on-surface">Defensive Posture</h1>
                <p className="text-sm text-on-surface-variant/60">
                  Based on {posture.total_detections} detections • Your coverage against active threats
                </p>
              </div>
            </div>
            {onViewAllGaps && (
              <button
                onClick={onViewAllGaps}
                className="px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors"
              >
                View All Gaps
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 space-y-6">
          
          {/* Coverage Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <CoverageCard
              value={posture.technique_coverage_pct}
              label="Technique Coverage"
              detail={`${posture.techniques_covered} of ${posture.total_techniques}`}
              icon="crosshair"
            />
            <CoverageCard
              value={posture.group_coverage_pct}
              label="Groups Defended"
              detail={`${posture.groups_defended} of ${posture.total_groups}`}
              icon="users"
            />
            <CoverageCard
              value={posture.campaign_coverage_pct}
              label="Campaigns Covered"
              detail={`${posture.campaigns_defended} of ${posture.total_campaigns}`}
              icon="flag"
            />
            <CoverageCard
              value={posture.avg_taw_covered ? posture.avg_taw_covered * 100 : 0}
              label="Threat Quality"
              detail="Avg TAW of defended groups"
              icon="trending-up"
              showPercent={false}
            />
          </div>

          {/* Priority Gaps */}
          {posture.top_gaps && posture.top_gaps.length > 0 && (
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/10">
                <h2 className="text-base font-semibold text-on-surface">Priority Gaps</h2>
                <p className="text-sm text-on-surface-variant/60 mt-0.5">
                  High-impact techniques without detection coverage
                </p>
              </div>
              
              <div className="divide-y divide-outline-variant/5">
                {posture.top_gaps.slice(0, 5).map((gap, idx) => (
                  <GapRow
                    key={gap.mitre_id}
                    rank={idx + 1}
                    gap={gap}
                    onTechniqueClick={onTechniqueClick}
                    onBuildDetection={onBuildDetection}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Quick Wins */}
          {posture.top_gaps && posture.top_gaps.length > 0 && (
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/10 bg-gradient-to-r from-primary/5 to-tertiary/5">
                <h2 className="text-base font-semibold text-on-surface">Quick Wins</h2>
                <p className="text-sm text-on-surface-variant/60 mt-0.5">
                  Maximum impact improvements for your detection coverage
                </p>
              </div>
              
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {posture.top_gaps.slice(0, 3).map((gap, idx) => (
                  <QuickWinCard
                    key={gap.mitre_id}
                    rank={idx + 1}
                    gap={gap}
                    onBuildDetection={onBuildDetection}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state if no gaps */}
          {(!posture.top_gaps || posture.top_gaps.length === 0) && (
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-8 text-center">
              <Icon name="shield-check" className="w-12 h-12 text-tertiary/40 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-on-surface mb-1">Excellent Coverage</h3>
              <p className="text-sm text-on-surface-variant/60">
                No significant gaps detected in your detection coverage
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Coverage metric card with circular progress
 */
function CoverageCard({
  value,
  label,
  detail,
  icon,
  showPercent = true
}: {
  value: number;
  label: string;
  detail: string;
  icon: string;
  showPercent?: boolean;
}) {
  // Calculate circle properties
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value, 100);
  const offset = circumference - (progress / 100) * circumference;
  
  // Color based on value
  const getColorClass = () => {
    if (value >= 70) return { stroke: '#10b981', text: 'text-tertiary', bg: 'bg-tertiary/10' };
    if (value >= 40) return { stroke: '#f59e0b', text: 'text-warning', bg: 'bg-warning/10' };
    return { stroke: '#ef4444', text: 'text-error', bg: 'bg-error/10' };
  };
  
  const color = getColorClass();

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
      <div className="flex items-start gap-4">
        {/* Circle */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg className="transform -rotate-90" width={size} height={size}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-outline-variant/20"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color.stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${color.text}`}>
              {Math.round(value)}{showPercent ? '%' : ''}
            </span>
          </div>
        </div>
        
        {/* Text */}
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon name={icon} className={`w-4 h-4 ${color.text}`} />
            <span className="text-sm font-medium text-on-surface">{label}</span>
          </div>
          <p className="text-xs text-on-surface-variant/60">{detail}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Gap row in priority gaps table
 */
function GapRow({
  rank,
  gap,
  onTechniqueClick,
  onBuildDetection
}: {
  rank: number;
  gap: TechniqueGap;
  onTechniqueClick?: (mitreId: string) => void;
  onBuildDetection?: (techniqueId: string) => void;
}) {
  return (
    <div className="px-6 py-3.5 flex items-center gap-4 hover:bg-surface-container-high/50 transition-colors">
      <span className="text-base font-bold text-on-surface-variant/40 w-6 text-center tabular-nums">
        {rank}
      </span>
      
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onTechniqueClick?.(gap.mitre_id)}
          className="text-left group flex items-center gap-2"
        >
          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
            {gap.mitre_id}
          </span>
          <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors truncate">
            {gap.name}
          </span>
        </button>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm font-medium text-on-surface tabular-nums">
            {gap.tis.toFixed(2)}
          </div>
          <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider">
            TIS Score
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-sm font-medium text-warning tabular-nums">
            {gap.gap_score.toFixed(1)}
          </div>
          <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider">
            Gap Score
          </div>
        </div>
        
        {onBuildDetection && (
          <button
            onClick={() => onBuildDetection(gap.mitre_id)}
            className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
          >
            Build
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Quick win recommendation card
 */
function QuickWinCard({
  rank,
  gap,
  onBuildDetection
}: {
  rank: number;
  gap: TechniqueGap;
  onBuildDetection?: (techniqueId: string) => void;
}) {
  return (
    <div className="bg-surface-container-high/50 rounded-xl p-4 border border-outline-variant/10">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
          {rank}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm text-on-surface">
            Build detection for{' '}
            <span className="font-mono text-primary font-medium">{gap.mitre_id}</span>
          </p>
          <p className="text-xs text-on-surface-variant/60 mt-0.5 truncate">
            {gap.name}
          </p>
          <p className="text-xs text-tertiary mt-1.5">
            TIS {gap.tis.toFixed(2)} • High-value gap
          </p>
        </div>
      </div>
      
      {onBuildDetection && (
        <button
          onClick={() => onBuildDetection(gap.mitre_id)}
          className="w-full mt-3 px-3 py-2 text-xs font-semibold text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors"
        >
          Create Detection
        </button>
      )}
    </div>
  );
}

/**
 * Loading skeleton
 */
function PostureLoadingSkeleton() {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high animate-pulse" />
            <div>
              <div className="h-5 w-40 bg-surface-container-high rounded animate-pulse" />
              <div className="h-4 w-64 bg-surface-container-high rounded animate-pulse mt-2" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-surface-container rounded-xl h-32 animate-pulse" />
            ))}
          </div>
          <div className="bg-surface-container rounded-xl h-64 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default DefensivePostureDashboard;
