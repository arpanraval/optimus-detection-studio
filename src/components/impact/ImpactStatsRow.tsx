import React from 'react';
import { 
  ShieldCheckIcon, 
  UserGroupIcon, 
  FlagIcon,
  CpuChipIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

interface StatCardProps {
  value: number;
  label: string;
  icon?: React.ReactNode;
  subLabel?: string;
  className?: string;
}

/**
 * Single stat card with icon and value
 */
export function StatCard({ value, label, icon, subLabel, className = '' }: StatCardProps) {
  return (
    <div className={`
      flex flex-col items-center justify-center
      p-4 rounded-lg bg-surface-alt/50 border border-border
      ${className}
    `}>
      {icon && (
        <div className="text-text-secondary mb-1">
          {icon}
        </div>
      )}
      <span className="text-2xl font-bold text-text-primary">{value.toLocaleString()}</span>
      <span className="text-xs text-text-secondary uppercase tracking-wide">{label}</span>
      {subLabel && (
        <span className="text-[10px] text-text-tertiary mt-0.5">{subLabel}</span>
      )}
    </div>
  );
}

interface ImpactStatsRowProps {
  techniqueCount?: number;
  groupCount?: number;
  campaignCount?: number;
  softwareCount?: number;
  analyticCount?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Row of impact statistics
 */
export function ImpactStatsRow({
  techniqueCount,
  groupCount,
  campaignCount,
  softwareCount,
  analyticCount,
  compact = false,
  className = ''
}: ImpactStatsRowProps) {
  const stats = [
    techniqueCount !== undefined && {
      value: techniqueCount,
      label: 'Techniques',
      icon: <ShieldCheckIcon className="w-5 h-5" />
    },
    groupCount !== undefined && {
      value: groupCount,
      label: 'Groups',
      icon: <UserGroupIcon className="w-5 h-5" />
    },
    campaignCount !== undefined && {
      value: campaignCount,
      label: 'Campaigns',
      icon: <FlagIcon className="w-5 h-5" />
    },
    softwareCount !== undefined && {
      value: softwareCount,
      label: 'Malware',
      icon: <CpuChipIcon className="w-5 h-5" />
    },
    analyticCount !== undefined && {
      value: analyticCount,
      label: 'Analytics',
      icon: <DocumentTextIcon className="w-5 h-5" />
    }
  ].filter(Boolean) as { value: number; label: string; icon: React.ReactNode }[];

  if (compact) {
    return (
      <div className={`flex items-center gap-4 text-sm text-text-secondary ${className}`}>
        {stats.map((stat, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <span className="font-semibold text-text-primary">{stat.value}</span>
            <span className="lowercase">{stat.label}</span>
            {idx < stats.length - 1 && <span className="text-border ml-3">│</span>}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-${stats.length} gap-3 ${className}`}>
      {stats.map((stat, idx) => (
        <StatCard
          key={idx}
          value={stat.value}
          label={stat.label}
          icon={stat.icon}
        />
      ))}
    </div>
  );
}

interface DefenseDepthIndicatorProps {
  hasMitigation: boolean;
  hasDetection: boolean;
  mitigationCount?: number;
  detectionCount?: number;
  className?: string;
}

/**
 * Shows defense in depth status
 */
export function DefenseDepthIndicator({
  hasMitigation,
  hasDetection,
  mitigationCount = 0,
  detectionCount = 0,
  className = ''
}: DefenseDepthIndicatorProps) {
  const hasBoth = hasMitigation && hasDetection;
  
  return (
    <div className={`
      flex items-center gap-2 px-3 py-2 rounded-lg text-sm
      ${hasBoth 
        ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' 
        : 'bg-surface-alt text-text-secondary border border-border'
      }
      ${className}
    `}>
      {hasBoth ? (
        <>
          <ShieldCheckIcon className="w-4 h-4" />
          <span className="font-medium">Defense in Depth</span>
          <span className="text-xs opacity-75">
            ({mitigationCount} mitigation{mitigationCount !== 1 ? 's' : ''} + {detectionCount} detection{detectionCount !== 1 ? 's' : ''})
          </span>
        </>
      ) : hasMitigation ? (
        <>
          <ShieldCheckIcon className="w-4 h-4 text-primary" />
          <span>Prevention available ({mitigationCount})</span>
        </>
      ) : hasDetection ? (
        <>
          <DocumentTextIcon className="w-4 h-4 text-warning" />
          <span>Detection only ({detectionCount})</span>
        </>
      ) : (
        <>
          <span className="text-error">⚠</span>
          <span>No coverage</span>
        </>
      )}
    </div>
  );
}

export default ImpactStatsRow;
