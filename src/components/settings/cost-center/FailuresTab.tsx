import React from 'react';
import { useAiUsage } from '../../../hooks/useAiUsage';
import { CostCenterTile } from '../../cost-center/charts/CostCenterTile';

interface Props { range: { startDate: string; endDate: string } }

export const FailuresTab: React.FC<Props> = ({ range }) => {
  const { isLoading, breakdown, totalCostUsd, totalCalls } = useAiUsage(
    {
      ...range,
      categories: ['failed'],
      statuses: ['provider_error', 'rate_limit', 'budget_blocked', 'timeout'],
    },
    'feature'
  );

  return (
    <CostCenterTile title="Failed calls (money lost)" icon="alert-triangle">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : breakdown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-emerald-400">No failures in this window 🎉</p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider border-b border-outline-variant/5">
            <span className="col-span-6">Feature</span>
            <span className="col-span-3 text-right">Failures</span>
            <span className="col-span-3 text-right">Money lost</span>
          </div>
          {breakdown.map(row => (
            <div key={row.group_key} className="grid grid-cols-12 gap-3 px-4 py-2 text-xs hover:bg-surface-container-low/30 border-b border-outline-variant/5">
              <span className="col-span-6 text-on-surface truncate">{row.group_label}</span>
              <span className="col-span-3 text-right tabular-nums text-red-400">{row.failure_count}</span>
              <span className="col-span-3 text-right tabular-nums font-bold text-on-surface">${row.cost_usd.toFixed(4)}</span>
            </div>
          ))}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs bg-surface-container-low/30 border-t border-outline-variant/10">
            <span className="col-span-6 font-bold text-on-surface uppercase tracking-wider text-[10px]">Total</span>
            <span className="col-span-3 text-right tabular-nums font-bold text-red-400">{totalCalls}</span>
            <span className="col-span-3 text-right tabular-nums font-bold text-on-surface">${totalCostUsd.toFixed(4)}</span>
          </div>
        </div>
      )}
    </CostCenterTile>
  );
};
