import React, { useMemo } from 'react';
import { Icon } from '../../Icon';
import type { ReportGap } from '../types';

interface Props {
  gaps: ReportGap[];
}

type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  Critical: 'bg-red-500/15 text-red-400',
  High: 'bg-orange-500/15 text-orange-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Low: 'bg-emerald-500/15 text-emerald-400',
};

interface PriorityThresholds {
  p75: number;
  p50: number;
  p25: number;
}

function computeThresholds(gaps: ReportGap[]): PriorityThresholds {
  if (gaps.length === 0) return { p75: 0, p50: 0, p25: 0 };

  const sorted = gaps.map((g) => g.priority).sort((a, b) => a - b);
  const at = (percentile: number): number => {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  return { p75: at(75), p50: at(50), p25: at(25) };
}

function assignPriorityLevel(priority: number, thresholds: PriorityThresholds): PriorityLevel {
  if (priority >= thresholds.p75) return 'Critical';
  if (priority >= thresholds.p50) return 'High';
  if (priority >= thresholds.p25) return 'Medium';
  return 'Low';
}

function tisColor(score: number): string {
  if (score >= 0.7) return 'text-red-400';
  if (score >= 0.5) return 'text-orange-400';
  if (score >= 0.3) return 'text-amber-400';
  return 'text-emerald-400';
}

export const GapAnalysis: React.FC<Props> = ({ gaps }) => {
  const thresholds = useMemo(() => computeThresholds(gaps), [gaps]);

  const gapsWithLevel = useMemo(
    () => gaps.map((g) => ({ ...g, level: assignPriorityLevel(g.priority, thresholds) })),
    [gaps, thresholds],
  );

  const criticalCount = useMemo(
    () => gapsWithLevel.filter((g) => g.level === 'Critical').length,
    [gapsWithLevel],
  );
  const highCount = useMemo(
    () => gapsWithLevel.filter((g) => g.level === 'High').length,
    [gapsWithLevel],
  );

  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon name="alert-triangle" className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-on-surface">Gap Analysis</h2>
          <span className="rounded-full px-3 py-0.5 text-xs font-medium bg-red-500/15 text-red-400">
            {gaps.length} uncovered techniques
          </span>
        </div>
      </div>

      {/* Summary */}
      {gaps.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
            <span className="text-on-surface-variant">
              {criticalCount} critical gap{criticalCount !== 1 ? 's' : ''}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-on-surface-variant">
              {highCount} high priority gap{highCount !== 1 ? 's' : ''}
            </span>
          </span>
        </div>
      )}

      {/* Table */}
      {gaps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/60">
          <Icon name="check-circle" className="w-8 h-8 mb-2 text-emerald-400" />
          <p className="text-sm">No coverage gaps detected</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-outline-variant/10">
                <th className="px-4 py-3 pl-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Technique ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Technique Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Tactic
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Groups Using
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  TIS Score
                </th>
                <th className="px-4 py-3 pr-6 text-left text-xs font-medium uppercase tracking-wider text-on-surface-variant/60">
                  Priority
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {gapsWithLevel.map((g) => (
                <tr key={`${g.techniqueId}-${g.tactic}`} className="hover:bg-surface-container/50 transition-colors">
                  <td className="px-4 py-3 pl-6">
                    <span className="font-mono text-sm font-medium text-on-surface">{g.techniqueId}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {g.techniqueName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-surface-container text-on-surface-variant">
                      {g.tactic}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {g.groupCount}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-mono font-medium ${tisColor(g.tisScore)}`}>
                      {g.tisScore.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-6">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE[g.level]}`}>
                      {g.level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
