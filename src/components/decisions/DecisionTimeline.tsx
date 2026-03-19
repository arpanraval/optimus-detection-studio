import React from 'react';
import { useDetectionDecisions } from '../../hooks/useDetectionDecisions';
import type { DetectionDecision, DecisionType, QuickReason } from '../../types/intelligence';

// =============================================================================
// HELPERS
// =============================================================================

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function isStale(reviewBy: string | null): boolean {
  if (!reviewBy) return false;
  return new Date(reviewBy).getTime() < Date.now();
}

// =============================================================================
// BADGE CONFIGS
// =============================================================================

const DECISION_TYPE_CONFIG: Record<
  DecisionType,
  { label: string; dotClass: string; badgeClass: string }
> = {
  status_change: {
    label: 'Status Change',
    dotClass: 'bg-blue-500',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  query_tuning: {
    label: 'Query Tuning',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  gap_accepted: {
    label: 'Gap Accepted',
    dotClass: 'bg-green-500',
    badgeClass: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  gap_rejected: {
    label: 'Gap Rejected',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  review_decision: {
    label: 'Review Decision',
    dotClass: 'bg-purple-500',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  deprecation: {
    label: 'Deprecation',
    dotClass: 'bg-gray-500',
    badgeClass: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  },
  priority_change: {
    label: 'Priority Change',
    dotClass: 'bg-orange-500',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  deployment: {
    label: 'Deployment',
    dotClass: 'bg-cyan-500',
    badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  },
};

const QUICK_REASON_LABELS: Record<QuickReason, string> = {
  false_positive_fix: 'False Positive Fix',
  performance_optimization: 'Performance Optimization',
  log_source_change: 'Log Source Change',
  coverage_expansion: 'Coverage Expansion',
  vendor_update: 'Vendor Update',
  other: 'Other',
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const DecisionTypeBadge: React.FC<{ type: DecisionType }> = ({ type }) => {
  const config = DECISION_TYPE_CONFIG[type] ?? {
    label: type,
    dotClass: 'bg-gray-500',
    badgeClass: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${config.badgeClass}`}
    >
      {config.label}
    </span>
  );
};

const QuickReasonTag: React.FC<{ reason: QuickReason }> = ({ reason }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-container-highest text-on-surface-variant border border-outline-variant/30">
    {QUICK_REASON_LABELS[reason] ?? reason}
  </span>
);

const StaleWarning: React.FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
    title="Review date has passed"
  >
    &#9888; Review overdue
  </span>
);

// =============================================================================
// DECISION CARD
// =============================================================================

const DecisionCard: React.FC<{ decision: DetectionDecision; isLast: boolean }> = ({
  decision,
  isLast,
}) => {
  const config = DECISION_TYPE_CONFIG[decision.decision_type] ?? {
    label: decision.decision_type,
    dotClass: 'bg-gray-500',
    badgeClass: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  const stale = isStale(decision.review_by);

  return (
    <div className="relative flex gap-4">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`mt-1 w-3 h-3 rounded-full border-2 border-background flex-shrink-0 z-10 ${config.dotClass}`}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-outline-variant/30 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className={`pb-6 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <DecisionTypeBadge type={decision.decision_type} />
          {stale && <StaleWarning />}
          <span className="text-xs text-on-surface-variant ml-auto flex-shrink-0">
            {relativeTime(decision.created_at)}
          </span>
        </div>

        {/* Context / description */}
        {decision.decision_context && (
          <p className="text-sm text-on-surface mb-1">{decision.decision_context}</p>
        )}

        {/* Reasoning */}
        {decision.reasoning && (
          <p className="text-sm text-on-surface-variant italic mb-1.5">
            &ldquo;{decision.reasoning}&rdquo;
          </p>
        )}

        {/* Quick reason + user */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {decision.quick_reason && (
            <QuickReasonTag reason={decision.quick_reason} />
          )}
          {decision.previous_value && decision.new_value && (
            <span className="text-[11px] text-on-surface-variant">
              <span className="line-through opacity-60">{decision.previous_value}</span>
              {' '}&rarr;{' '}
              <span className="font-medium text-on-surface">{decision.new_value}</span>
            </span>
          )}
          <span className="text-[11px] text-on-surface-variant ml-auto font-mono">
            {decision.user_id.slice(0, 8)}
          </span>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface DecisionTimelineProps {
  detectionId: string;
}

export const DecisionTimeline: React.FC<DecisionTimelineProps> = ({ detectionId }) => {
  const { decisions, loading } = useDetectionDecisions(detectionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-on-surface-variant"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-sm text-on-surface-variant">
          No decisions recorded for this detection.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {decisions.map((decision, index) => (
        <DecisionCard
          key={decision.id}
          decision={decision}
          isLast={index === decisions.length - 1}
        />
      ))}
    </div>
  );
};
