import React, { useMemo } from 'react';
import { useAiUsage } from '../../../hooks/useAiUsage';
import { useAiBudgets } from '../../../hooks/useAiBudgets';
import { CostCenterTile } from '../../cost-center/charts/CostCenterTile';
import { MetricStat } from '../../cost-center/charts/MetricStat';
import { StackedAreaChart, type StackedSeries, type StackedDataPoint } from '../../cost-center/charts/StackedAreaChart';
import { DonutChart } from '../../cost-center/charts/DonutChart';
import { HorizontalBarChart } from '../../cost-center/charts/HorizontalBarChart';
import { FEATURE_DISPLAY } from '../../../lib/ai/featureCodes';

interface Props { range: { startDate: string; endDate: string } }

const CATEGORY_SERIES: StackedSeries[] = [
  { key: 'llm',       label: 'LLM',       color: 'rgb(var(--md-sys-color-primary))' },
  { key: 'embedding', label: 'Embedding', color: 'rgb(var(--md-sys-color-primary) / 0.5)' },
  { key: 'image',     label: 'Image',     color: 'rgb(var(--md-sys-color-tertiary))' },
  { key: 'failed',    label: 'Failed',    color: 'rgb(var(--md-sys-color-error))' },
];

export const OverviewTab: React.FC<Props> = ({ range }) => {
  const byDay = useAiUsage(range, 'day');
  const byModel = useAiUsage(range, 'model');
  const byFeature = useAiUsage(range, 'feature');
  const byUser = useAiUsage(range, 'user');
  const { budgets } = useAiBudgets();

  // v1: stacked-area shows daily totals only (single layer in 'llm' bucket).
  // True per-day-per-category split would require a second hook call grouped
  // by both 'day' and 'category' — left as follow-up.
  const stackedData: StackedDataPoint[] = useMemo(() => {
    return byDay.breakdown
      .slice()
      .sort((a, b) => a.group_label.localeCompare(b.group_label))
      .map(r => ({
        label: r.group_label.slice(5),
        values: { llm: r.cost_usd, embedding: 0, image: 0, failed: 0 },
      }));
  }, [byDay.breakdown]);

  const modelDonut = useMemo(
    () => byModel.breakdown.map(r => ({ label: r.group_label, value: r.cost_usd })),
    [byModel.breakdown]
  );

  const featuresBar = useMemo(
    () => byFeature.breakdown.slice(0, 5).map(r => ({
      label: FEATURE_DISPLAY[r.group_label as keyof typeof FEATURE_DISPLAY]?.label ?? r.group_label,
      value: r.cost_usd,
    })),
    [byFeature.breakdown]
  );

  const usersBar = useMemo(
    () => byUser.breakdown.slice(0, 5).map(r => ({
      label: r.group_key === 'system' ? 'System' : r.group_label.slice(0, 8),
      value: r.cost_usd,
    })),
    [byUser.breakdown]
  );

  const modelsBar = useMemo(
    () => byModel.breakdown.slice(0, 5).map(r => ({ label: r.group_label, value: r.cost_usd })),
    [byModel.breakdown]
  );

  const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

  const nearLimit = budgets.filter(b => b.pct_used >= 0.8).length;

  return (
    <div className="space-y-5">
      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CostCenterTile title="Spend" icon="dollar-sign">
          <MetricStat
            value={fmtUsd(byDay.totalCostUsd)}
            subLine={`${byDay.totalCalls.toLocaleString()} calls`}
          />
        </CostCenterTile>
        <CostCenterTile title="Calls" icon="activity">
          <MetricStat value={byDay.totalCalls.toLocaleString()} />
        </CostCenterTile>
        <CostCenterTile title="Failed cost" icon="alert-triangle">
          <MetricStat
            value={fmtUsd(byDay.failedCostUsd)}
            subLine={`${byDay.failedCalls} failed calls`}
            accent="rgb(var(--md-sys-color-error))"
          />
        </CostCenterTile>
        <CostCenterTile title="Active budgets" icon="shield">
          <MetricStat
            value={String(budgets.filter(b => b.enabled).length)}
            subLine={nearLimit > 0 ? `${nearLimit} near limit (>80%)` : 'all healthy'}
          />
        </CostCenterTile>
      </div>

      {/* Mid row: stacked area + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-72">
        <CostCenterTile title="Daily spend" icon="trending-up">
          <StackedAreaChart data={stackedData} series={CATEGORY_SERIES} />
        </CostCenterTile>
        <CostCenterTile title="Spend by model" icon="layers">
          <DonutChart data={modelDonut} formatValue={fmtUsd} />
        </CostCenterTile>
      </div>

      {/* Top spenders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-64">
        <CostCenterTile title="Top features" icon="zap">
          <HorizontalBarChart data={featuresBar} formatValue={fmtUsd} />
        </CostCenterTile>
        <CostCenterTile title="Top users" icon="users">
          <HorizontalBarChart data={usersBar} formatValue={fmtUsd} />
        </CostCenterTile>
        <CostCenterTile title="Top models" icon="cpu">
          <HorizontalBarChart data={modelsBar} formatValue={fmtUsd} />
        </CostCenterTile>
      </div>
    </div>
  );
};
