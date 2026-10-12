import { PagePending } from '@/components/ui/PagePending';
import { LoadError } from '@/components/ui/LoadError';
import React, { useMemo } from 'react';
import { useAiUsage } from '../../../hooks/useAiUsage';
import { useAiBudgets } from '../../../hooks/useAiBudgets';
import { useResolveUserLabel } from '../../../hooks/useResolveUserLabel';
import { CostCenterTile } from '../../cost-center/charts/CostCenterTile';
import { MetricStat } from '../../cost-center/charts/MetricStat';
import { StackedAreaChart, type StackedSeries, type StackedDataPoint } from '../../cost-center/charts/StackedAreaChart';
import { DonutChart } from '../../cost-center/charts/DonutChart';
import { HorizontalBarChart } from '../../cost-center/charts/HorizontalBarChart';
import { ImpactHero } from '../../cost-center/charts/ImpactHero';
import { ArtifactTile } from '../../cost-center/charts/ArtifactTile';
import { FEATURE_DISPLAY } from '../../../lib/ai/featureCodes';
import { BUCKET_DISPLAY, HEADLINE_BUCKETS, rollupByBucket } from '../../../lib/ai/featureImpact';

interface Props { range: { startDate: string; endDate: string } }

const CATEGORY_SERIES: StackedSeries[] = [
  { key: 'llm',       label: 'LLM',       color: 'rgb(var(--md-sys-color-primary))' },
  { key: 'embedding', label: 'Embedding', color: 'rgb(var(--md-sys-color-primary) / 0.5)' },
  { key: 'image',     label: 'Image',     color: 'rgb(var(--md-sys-color-tertiary))' },
  { key: 'failed',    label: 'Failed',    color: 'rgb(var(--md-sys-color-error))' },
];

function windowLabel(startISO: string, endISO: string): string {
  const days = Math.max(1, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 86400e3));
  if (days <= 1) return 'Last 24h';
  if (days <= 7) return 'Last 7 days';
  if (days <= 30) return 'Last 30 days';
  if (days <= 90) return 'Last 90 days';
  return `Last ${days} days`;
}

export const OverviewTab: React.FC<Props> = ({ range }) => {
  const byDay = useAiUsage(range, 'day');
  const byModel = useAiUsage(range, 'model');
  const byFeature = useAiUsage(range, 'feature');
  const byUser = useAiUsage(range, 'user');
  const { budgets } = useAiBudgets();
  const resolveUser = useResolveUserLabel();

  // ---- Impact rollup (feature-level → headline buckets) ----
  const bucketRollup = useMemo(
    () => rollupByBucket(
      byFeature.breakdown.map(r => ({
        feature: r.group_key,
        call_count: r.call_count,
        failure_count: r.failure_count,
        cost_usd: r.cost_usd,
      })),
    ),
    [byFeature.breakdown],
  );

  // Total minutes saved across all features (includes long-tail buckets that
  // aren't shown as their own tile; we still count them in the hero).
  const totalMinutesSaved = useMemo(() => {
    let m = 0;
    for (const r of bucketRollup.values()) m += r.minutesSaved;
    return m;
  }, [bucketRollup]);

  const successfulCalls = byDay.totalCalls - byDay.failedCalls;

  // ---- v1 stacked area (single layer; per-day-per-category split is a TODO) ----
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

  // Resolve user IDs to readable labels. We keep the top 5 by spend and
  // show "Name" with email as the inline detail (truncated for fit).
  const usersBar = useMemo(
    () => byUser.breakdown.slice(0, 5).map(r => {
      const u = resolveUser(r.group_key);
      return { label: u.label, value: r.cost_usd };
    }),
    [byUser.breakdown, resolveUser]
  );

  const modelsBar = useMemo(
    () => byModel.breakdown.slice(0, 5).map(r => ({ label: r.group_label, value: r.cost_usd })),
    [byModel.breakdown]
  );

  const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

  const nearLimit = budgets.filter(b => b.pct_used >= 0.8).length;

  if (byDay.isLoading && !byDay.hasLoaded) return <PagePending layout="dashboard" />;
  if (byDay.error && !byDay.hasLoaded) return <LoadError onRetry={() => void byDay.refetch()} />;

  return (
    <div className="space-y-5">
      {byDay.error && <LoadError label="Couldn’t refresh usage. Showing previously loaded values." onRetry={() => void byDay.refetch()} />}
      {/* ===== Hero: $ → time saved → ROI ===== */}
      <ImpactHero
        costUsd={byDay.totalCostUsd}
        totalCalls={byDay.totalCalls}
        successfulCalls={successfulCalls}
        minutesSaved={totalMinutesSaved}
        windowLabel={windowLabel(range.startDate, range.endDate)}
      />

      {/* ===== Artifact row (what we produced) ===== */}
      <div>
        <div className="flex items-baseline gap-3 mb-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/60">
            What we produced
          </span>
          <span className="h-px flex-1 bg-outline-variant/10" />
          <span className="text-[10px] text-on-surface-variant/40 tabular-nums">
            {byFeature.breakdown.length} feature{byFeature.breakdown.length === 1 ? '' : 's'} active
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {HEADLINE_BUCKETS.map((bucket, i) => {
            const def = BUCKET_DISPLAY[bucket];
            const r = bucketRollup.get(bucket);
            const count = r?.count ?? 0;
            const cost = r?.costUsd ?? 0;
            const minutes = r?.minutesSaved ?? 0;
            return (
              <ArtifactTile
                key={bucket}
                label={def.label}
                icon={def.icon}
                accent={def.accent}
                count={count}
                costUsd={cost}
                detail={minutes > 0 ? `~${formatMinutesSaved(minutes)} saved` : undefined}
                index={i}
              />
            );
          })}
        </div>
      </div>

      {/* ===== Spend at-a-glance ===== */}
      <div>
        <div className="flex items-baseline gap-3 mb-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/60">
            Spend
          </span>
          <span className="h-px flex-1 bg-outline-variant/10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CostCenterTile title="Spend" icon="dollar-sign">
            <MetricStat
              value={fmtUsd(byDay.totalCostUsd)}
              subLine={`${byDay.totalCalls.toLocaleString()} calls`}
              animateNumeric={byDay.totalCostUsd}
              valuePrefix="$"
              valueDecimals={2}
            />
          </CostCenterTile>
          <CostCenterTile title="Calls" icon="activity">
            <MetricStat
              value={byDay.totalCalls.toLocaleString()}
              animateNumeric={byDay.totalCalls}
              valueDecimals={0}
            />
          </CostCenterTile>
          <CostCenterTile title="Failed cost" icon="alert-triangle">
            <MetricStat
              value={fmtUsd(byDay.failedCostUsd)}
              subLine={`${byDay.failedCalls} failed calls`}
              accent="rgb(var(--md-sys-color-error))"
              animateNumeric={byDay.failedCostUsd}
              valuePrefix="$"
              valueDecimals={2}
            />
          </CostCenterTile>
          <CostCenterTile title="Active budgets" icon="shield">
            <MetricStat
              value={String(budgets.filter(b => b.enabled).length)}
              subLine={nearLimit > 0 ? `${nearLimit} near limit (>80%)` : 'all healthy'}
            />
          </CostCenterTile>
        </div>
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

function formatMinutesSaved(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 10) return `${h.toFixed(1)} h`;
  return `${Math.round(h)} h`;
}
