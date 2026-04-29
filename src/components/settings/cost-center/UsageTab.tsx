import React, { useState } from 'react';
import { useAiUsage, type GroupBy } from '../../../hooks/useAiUsage';
import { CostCenterTile } from '../../cost-center/charts/CostCenterTile';
import { FEATURE_DISPLAY } from '../../../lib/ai/featureCodes';

interface Props { range: { startDate: string; endDate: string } }

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'feature',  label: 'Feature' },
  { value: 'user',     label: 'User' },
  { value: 'model',    label: 'Model' },
  { value: 'day',      label: 'Day' },
  { value: 'category', label: 'Category' },
];

export const UsageTab: React.FC<Props> = ({ range }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('feature');
  const { isLoading, breakdown, totalCostUsd, totalCalls } = useAiUsage(range, groupBy);

  return (
    <CostCenterTile
      title={`Usage by ${groupBy}`}
      icon="list"
      action={
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as GroupBy)}
          className="text-[11px] bg-surface-container border border-outline-variant/15 rounded-md px-2 py-1 text-on-surface focus:outline-none"
        >
          {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
        </div>
      ) : breakdown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-on-surface-variant/40">No usage in this window</p>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider border-b border-outline-variant/5">
            <span className="col-span-4">{GROUP_OPTIONS.find(g => g.value === groupBy)?.label}</span>
            <span className="col-span-2 text-right">Calls</span>
            <span className="col-span-2 text-right">In tokens</span>
            <span className="col-span-2 text-right">Out tokens</span>
            <span className="col-span-1 text-right">Fail</span>
            <span className="col-span-1 text-right">Cost</span>
          </div>
          {breakdown.map(row => {
            const display = groupBy === 'feature'
              ? FEATURE_DISPLAY[row.group_key as keyof typeof FEATURE_DISPLAY]?.label ?? row.group_label
              : row.group_label;
            return (
              <div key={row.group_key} className="grid grid-cols-12 gap-3 px-4 py-2 text-xs hover:bg-surface-container-low/30 border-b border-outline-variant/5">
                <span className="col-span-4 text-on-surface truncate">{display}</span>
                <span className="col-span-2 text-right tabular-nums text-on-surface-variant">{row.call_count.toLocaleString()}</span>
                <span className="col-span-2 text-right tabular-nums text-on-surface-variant">{row.input_tokens.toLocaleString()}</span>
                <span className="col-span-2 text-right tabular-nums text-on-surface-variant">{row.output_tokens.toLocaleString()}</span>
                <span className={`col-span-1 text-right tabular-nums ${row.failure_count > 0 ? 'text-red-400' : 'text-on-surface-variant/40'}`}>
                  {row.failure_count}
                </span>
                <span className="col-span-1 text-right tabular-nums font-bold text-on-surface">${row.cost_usd.toFixed(2)}</span>
              </div>
            );
          })}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs bg-surface-container-low/30 border-t border-outline-variant/10">
            <span className="col-span-4 font-bold text-on-surface uppercase tracking-wider text-[10px]">Total</span>
            <span className="col-span-2 text-right tabular-nums font-bold text-on-surface">{totalCalls.toLocaleString()}</span>
            <span className="col-span-2"></span>
            <span className="col-span-2"></span>
            <span className="col-span-1"></span>
            <span className="col-span-1 text-right tabular-nums font-bold text-on-surface">${totalCostUsd.toFixed(2)}</span>
          </div>
        </div>
      )}
    </CostCenterTile>
  );
};
