import React, { useState, useMemo } from 'react';
import { Icon } from '../Icon';
import { useAiUsage } from '../../hooks/useAiUsage';
import { useAiBudgets } from '../../hooks/useAiBudgets';
import { OverviewTab } from './cost-center/OverviewTab';
import { UsageTab } from './cost-center/UsageTab';
import { BudgetsTab } from './cost-center/BudgetsTab';
import { FailuresTab } from './cost-center/FailuresTab';
import type { IconName } from '../Icon';

type TabId = 'overview' | 'usage' | 'budgets' | 'failures';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'chart-bar' },
  { id: 'usage',    label: 'Usage',    icon: 'list' },
  { id: 'budgets',  label: 'Budgets',  icon: 'shield' },
  { id: 'failures', label: 'Failures', icon: 'alert-triangle' },
];

const TIME_PRESETS = [
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
] as const;
type TimePreset = typeof TIME_PRESETS[number]['value'];

function presetToRange(p: TimePreset): { startDate: string; endDate: string } {
  const ms: Record<TimePreset, number> = {
    '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, '90d': 90 * 86400e3,
  };
  const end = new Date();
  const start = new Date(end.getTime() - ms[p]);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export const CostCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [preset, setPreset] = useState<TimePreset>('30d');
  const range = useMemo(() => presetToRange(preset), [preset]);

  // Headline-only rollup for the toolbar chip. The Overview tab fetches its
  // own data for charts; this duplicate hook call is fine because both share
  // Supabase's request dedupe.
  const overviewData = useAiUsage({ startDate: range.startDate, endDate: range.endDate }, 'feature');
  const budgetsData = useAiBudgets();

  const nearLimitCount = budgetsData.budgets.filter(b => b.pct_used >= 0.8 && b.pct_used < 1).length;

  return (
    <div className="h-full flex flex-col">
      {/* ===== Toolbar ===== */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/40 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Time range pill group */}
          <div
            className="flex items-center gap-1 bg-surface-container border border-outline-variant/15 rounded-lg p-0.5"
            role="tablist"
            aria-label="Time range"
          >
            {TIME_PRESETS.map(p => (
              <button
                key={p.value}
                role="tab"
                aria-selected={preset === p.value}
                onClick={() => setPreset(p.value)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ease-emphasized ${
                  preset === p.value
                    ? 'bg-on-surface text-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Live spend chip: a small pulsing dot signals data is real-time */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant/15">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-40 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            <span className="text-[11px] font-medium tabular-nums text-on-surface-variant">
              {overviewData.totalCalls.toLocaleString()} calls
            </span>
            <span className="text-on-surface-variant/20">·</span>
            <span className="text-[11px] font-bold tabular-nums text-on-surface">
              ${overviewData.totalCostUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mt-3 -mb-3 border-b border-outline-variant/15" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 pb-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id ? 'text-on-surface' : 'text-on-surface-variant/60 hover:text-on-surface-variant'
              }`}
            >
              <Icon name={tab.icon} className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'budgets' && nearLimitCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">{nearLimitCount}</span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Tab content ===== */}
      <div key={activeTab} className="flex-1 overflow-y-auto p-5 animate-page-enter">
        {activeTab === 'overview' && <OverviewTab range={range} />}
        {activeTab === 'usage'    && <UsageTab range={range} />}
        {activeTab === 'budgets'  && <BudgetsTab />}
        {activeTab === 'failures' && <FailuresTab range={range} />}
      </div>
    </div>
  );
};

export default CostCenterPage;
