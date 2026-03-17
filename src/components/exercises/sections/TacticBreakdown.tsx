import React from 'react';
import { Icon } from '../../Icon';
import type { TacticCoverage } from '../types';

interface Props {
  breakdown: TacticCoverage[];
}

function barColor(percent: number): string {
  if (percent >= 76) return 'bg-emerald-500';
  if (percent >= 51) return 'bg-amber-500';
  if (percent >= 26) return 'bg-orange-500';
  return 'bg-red-500';
}

export const TacticBreakdown: React.FC<Props> = ({ breakdown }) => {
  return (
    <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/30 space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <Icon name="shield" className="w-5 h-5 text-on-surface-variant" />
        <h2 className="text-lg font-semibold text-on-surface">Tactic Coverage Breakdown</h2>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {breakdown.map((tactic) => {
          const percent = Math.round(tactic.coveragePercent);
          return (
            <div key={tactic.tactic} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-on-surface">{tactic.tactic}</span>
                <span className="text-xs text-on-surface-variant/60">
                  {tactic.coveredTechniques}/{tactic.totalTechniques} techniques ({percent}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(percent)} transition-all duration-300`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
