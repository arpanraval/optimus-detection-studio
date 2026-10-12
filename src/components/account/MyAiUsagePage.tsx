import React, { useState } from 'react';
import { PagePending } from '@/components/ui/PagePending';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useMyAiUsage, type MyUsageWindow } from '../../hooks/useMyAiUsage';
import { CostCenterTile } from '../cost-center/charts/CostCenterTile';
import { MetricStat } from '../cost-center/charts/MetricStat';
import { HorizontalBarChart } from '../cost-center/charts/HorizontalBarChart';
import { StackedAreaChart, type StackedSeries } from '../cost-center/charts/StackedAreaChart';
import { BudgetGauge } from '../cost-center/charts/BudgetGauge';
import { FEATURE_DISPLAY } from '../../lib/ai/featureCodes';

const WINDOWS: MyUsageWindow[] = [{ days: 7 }, { days: 30 }, { days: 90 }];
const SERIES: StackedSeries[] = [{ key: 'cost', label: 'Spend', color: 'rgb(var(--md-sys-color-primary))' }];

export const MyAiUsagePage: React.FC = () => {
  const [w, setW] = useState<MyUsageWindow>({ days: 30 });
  const { totalCostUsd, totalCalls, byFeature, byDay, myBudget, isLoading, hasLoaded, error, refetch } = useMyAiUsage(w);
  const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

  if (isLoading && !hasLoaded) return <PagePending layout="dashboard" />;
  if (error && !hasLoaded) return <LoadError onRetry={() => void refetch()} />;
  return (
    <div className="max-w-5xl mx-auto px-4 py-4 space-y-5">
      {isLoading && <LoadingStatus />}
      {error && <LoadError label="Couldn’t refresh usage. Showing previously loaded values." onRetry={() => void refetch()} />}
      {/* Window picker */}
      <div className="flex items-center gap-1 bg-surface-container border border-outline-variant/15 rounded-lg p-0.5 w-fit">
        {WINDOWS.map(opt => (
          <button
            key={opt.days}
            onClick={() => setW(opt)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
              w.days === opt.days ? 'bg-on-surface text-surface' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {opt.days}d
          </button>
        ))}
      </div>

      {/* Budget warning banner */}
      {myBudget && myBudget.current >= myBudget.budget.limit_usd && (
        <div className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
          ⚠ You're at {Math.round((myBudget.current / myBudget.budget.limit_usd) * 100)}% of your {myBudget.budget.period} limit.
          If hard enforcement is enabled, AI tools will start failing until the period resets or an admin grants a 24h override.
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CostCenterTile title={`Spend (${w.days}d)`} icon="dollar-sign">
          <MetricStat value={fmtUsd(totalCostUsd)} subLine={`${totalCalls.toLocaleString()} calls`} />
        </CostCenterTile>
        <CostCenterTile title={`Calls (${w.days}d)`} icon="activity">
          <MetricStat value={totalCalls.toLocaleString()} />
        </CostCenterTile>
        <CostCenterTile title="Budget remaining" icon="shield">
          {myBudget ? (
            <div className="px-4 py-3">
              <BudgetGauge currentUsd={myBudget.current} limitUsd={myBudget.budget.limit_usd} />
              <span className="text-[10px] text-on-surface-variant/60 mt-2 block">
                {myBudget.budget.period === 'daily' ? 'Resets daily UTC' :
                 myBudget.budget.period === 'monthly' ? 'Resets first of month UTC' :
                 'Rolling 30 days'}
              </span>
            </div>
          ) : (
            <MetricStat value="No personal limit" subLine="Org/feature limits may still apply" />
          )}
        </CostCenterTile>
      </div>

      {/* Per-feature bar */}
      <CostCenterTile title="My usage by feature" icon="zap">
        <HorizontalBarChart
          data={byFeature.map(f => ({
            label: FEATURE_DISPLAY[f.feature as keyof typeof FEATURE_DISPLAY]?.label ?? f.feature,
            value: f.cost,
          }))}
          formatValue={fmtUsd}
        />
      </CostCenterTile>

      {/* Daily trend */}
      <div className="h-56">
        <CostCenterTile title="Daily trend" icon="trending-up">
          <StackedAreaChart
            data={byDay.map(d => ({ label: d.day.slice(5), values: { cost: d.cost } }))}
            series={SERIES}
          />
        </CostCenterTile>
      </div>
    </div>
  );
};
