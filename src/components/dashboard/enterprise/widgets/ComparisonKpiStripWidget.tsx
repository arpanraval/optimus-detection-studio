// ============================================================================
// ComparisonKpiStripWidget — top-of-dashboard KPI strip with PoP deltas
//
// Six tiles, each with: label, current value, delta vs prior period, sparkline.
// All metrics are cumulative (snapshot-at-end-of-bucket) so the sparkline shows
// the trajectory of the library, not bucket-by-bucket churn.
// ============================================================================

import React from 'react';
import type { WidgetComponentProps } from './types';
import type { Detection } from '../../../../types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useTimeSeries, type TimeSeriesResult } from './useTimeSeries';
import WidgetEmptyState from './WidgetEmptyState';

interface KpiDef {
  key: string;
  label: string;
  reduce: (ds: Detection[]) => number;
  cumulative: boolean;
  summary?: 'latest' | 'sum';
  suffix?: string;
  color: string;
  /** Direction that should render as "good" (green). Defaults to 'up'. */
  good?: 'up' | 'down';
}

const TOTAL_TECHNIQUES = 648;

const KPIS: KpiDef[] = [
  {
    key: 'total',
    label: 'Total Rules',
    reduce: ds => ds.length,
    cumulative: true,
    summary: 'latest',
    color: 'rgb(var(--md-sys-color-primary))',
  },
  {
    key: 'production',
    label: 'Production',
    reduce: ds => ds.filter(d => d.status === 'Production').length,
    cumulative: true,
    summary: 'latest',
    color: 'rgb(var(--md-ext-color-green))',
  },
  {
    key: 'coverage',
    label: 'Tech Cov',
    reduce: ds => {
      const techs = new Set<string>();
      for (const d of ds) (d.mitreAttackIds || []).forEach(id => techs.add(id));
      return Math.round((techs.size / TOTAL_TECHNIQUES) * 1000) / 10;
    },
    cumulative: true,
    summary: 'latest',
    suffix: '%',
    color: 'rgb(var(--md-ext-color-cyan))',
  },
  {
    key: 'avgQuality',
    label: 'Avg Quality',
    reduce: ds => {
      if (ds.length === 0) return 0;
      const total = ds.reduce((s, d) => s + (d.qualityScore || 0), 0);
      return Math.round(total / ds.length);
    },
    cumulative: true,
    summary: 'latest',
    color: 'rgb(var(--md-ext-color-amber))',
  },
  {
    key: 'validated',
    label: 'Validated',
    reduce: ds => {
      if (ds.length === 0) return 0;
      const v = ds.filter(d => d.testedAndValidated).length;
      return Math.round((v / ds.length) * 100);
    },
    cumulative: true,
    summary: 'latest',
    suffix: '%',
    color: 'rgb(var(--md-ext-color-teal))',
  },
  {
    key: 'velocity',
    label: 'New in Period',
    reduce: ds => ds.length,
    cumulative: false,
    summary: 'sum',
    color: 'rgb(var(--md-ext-color-indigo))',
  },
];

interface KpiTileProps {
  def: KpiDef;
  detections: Detection[];
  timeRange: WidgetComponentProps['timeRange'];
}

const KpiTile: React.FC<KpiTileProps> = ({ def, detections, timeRange }) => {
  // KPI_DEFS are module-scoped — def.reduce is a stable reference, so it's
  // safe to pass directly to the hook without useCallback.
  const result: TimeSeriesResult = useTimeSeries(detections, timeRange, {
    reduce: def.reduce,
    cumulative: def.cumulative,
    summary: def.summary,
    granularity: 'auto',
  });

  const value = result.totals.current;
  const delta = result.totals.deltaPct;
  const good = def.good ?? 'up';
  const positive = good === 'up' ? delta > 0 : delta < 0;
  const negative = good === 'up' ? delta < 0 : delta > 0;

  const points = result.current;
  const values = points.map(p => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 0.0001);

  const svgW = 100;
  const svgH = 22;
  const step = svgW / Math.max(points.length - 1, 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)},${(svgH - ((p.value - min) / range) * svgH).toFixed(2)}`)
    .join(' ');

  return (
    <div
      className="flex-1 min-w-0 px-4 py-3 rounded-xl"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-lowest))' }}
    >
      <div className="text-[10px] font-brand font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-1.5 truncate">
        {def.label}
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-2xl font-brand font-bold text-on-surface">{value.toLocaleString()}</span>
        {def.suffix && (
          <span className="text-sm text-on-surface-variant font-brand font-bold">{def.suffix}</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        {delta !== 0 ? (
          <span
            className={`text-[10px] font-brand font-bold flex-shrink-0 ${
              positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-on-surface-variant/40'
            }`}
          >
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
          </span>
        ) : (
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/30 flex-shrink-0">—</span>
        )}
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="flex-1 h-5"
        >
          <path
            d={path}
            fill="none"
            stroke={def.color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

const ComparisonKpiStripWidget: React.FC<WidgetComponentProps> = ({ timeRange }) => {
  const { detections } = useDashboardDetections();

  if (detections.length === 0) {
    return <WidgetEmptyState message="No detections to compare" />;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 p-2 w-full h-full">
      {KPIS.map(def => (
        <KpiTile key={def.key} def={def} detections={detections} timeRange={timeRange} />
      ))}
    </div>
  );
};

export default ComparisonKpiStripWidget;
