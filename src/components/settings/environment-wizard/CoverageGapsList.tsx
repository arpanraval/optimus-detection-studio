import React, { useState } from 'react';
import type { GapTechnique } from '../../../hooks/useProfileIntelligence';

interface CoverageGapsListProps {
  gaps: GapTechnique[];
  loading: boolean;
}

const MAX_VISIBLE = 8;

const ShimmerRow: React.FC = () => (
  <div className="flex items-center gap-2 py-1 px-1.5">
    <div className="w-12 h-3 bg-on-surface/5 rounded animate-pulse flex-shrink-0" />
    <div className="h-3 bg-on-surface/5 rounded animate-pulse flex-1 min-w-0" />
    <div className="w-16 h-1.5 bg-on-surface/5 rounded-full animate-pulse flex-shrink-0" />
    <div className="w-8 h-3 bg-on-surface/5 rounded animate-pulse flex-shrink-0" />
  </div>
);

export const CoverageGapsList: React.FC<CoverageGapsListProps> = ({ gaps, loading }) => {
  const [expanded, setExpanded] = useState(false);

  if (!loading && gaps.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-4">
        <div className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider mb-3">
          Coverage Gaps
        </div>
        <p className="text-[11px] text-on-surface-variant/40">
          No coverage gaps detected — all feasible techniques have library detections.
        </p>
      </div>
    );
  }

  const visible = expanded ? gaps : gaps.slice(0, MAX_VISIBLE);
  const remaining = gaps.length - MAX_VISIBLE;
  const hasThreats = gaps.some(g => g.threatGroupCount > 0);
  const maxGroups = hasThreats ? Math.max(...gaps.map(g => g.threatGroupCount), 1) : 1;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
          Coverage Gaps
        </span>
        {!loading && gaps.length > 0 && (
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">
            {gaps.length}
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        {loading ? (
          <>
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
            <ShimmerRow />
          </>
        ) : (
          visible.map(gap => (
            <div
              key={gap.mitreId}
              className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-surface-container-low/50 transition-colors"
            >
              <span className="text-[10px] font-brand font-bold text-on-surface-variant/40 w-12 flex-shrink-0">
                {gap.mitreId}
              </span>
              <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">
                {gap.name}
              </span>
              {hasThreats && (
                <>
                  <div className="w-16 h-1.5 bg-red-500/20 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full bg-red-500/50"
                      style={{ width: `${(gap.threatGroupCount / maxGroups) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-brand font-bold text-red-400/70 w-8 text-right flex-shrink-0">
                    {gap.threatGroupCount}
                  </span>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {!loading && remaining > 0 && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
        >
          {expanded ? 'SHOW LESS' : `+${remaining} MORE`}
        </button>
      )}
    </div>
  );
};

export default CoverageGapsList;
