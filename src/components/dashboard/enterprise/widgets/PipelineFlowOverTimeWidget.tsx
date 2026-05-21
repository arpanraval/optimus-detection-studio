// ============================================================================
// PipelineFlowOverTimeWidget — stacked area of library state mix over time
//
// Each bucket shows the cumulative count of rules in each status (Production /
// Testing / Review / Development / Draft). Visualizes whether the team is
// converting drafts to production or accumulating pipeline debt.
//
// NOTE: status reflects current value, applied to historical createdDate
// snapshots — true status transitions require the snapshot table (planned).
// ============================================================================

import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

type StatusKey = 'Production' | 'Testing' | 'Review' | 'Development' | 'Draft';
const STATUS_ORDER: StatusKey[] = ['Draft', 'Development', 'Review', 'Testing', 'Production'];

const COLORS: Record<StatusKey, string> = {
  Draft: 'rgb(var(--md-sys-color-on-surface-variant))',
  Development: 'rgb(var(--md-ext-color-indigo))',
  Review: 'rgb(var(--md-ext-color-cyan))',
  Testing: 'rgb(var(--md-ext-color-amber))',
  Production: 'rgb(var(--md-ext-color-green))',
};

interface Bucket {
  label: string;
  counts: Record<StatusKey, number>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function chooseGranularity(startMs: number, endMs: number): 'day' | 'week' | 'month' | 'quarter' {
  const span = endMs - startMs;
  if (span <= 14 * MS_PER_DAY) return 'day';
  if (span <= 60 * MS_PER_DAY) return 'week';
  if (span <= 540 * MS_PER_DAY) return 'month';
  return 'quarter';
}

function bucketStart(date: Date, g: 'day' | 'week' | 'month' | 'quarter'): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (g === 'day') return d;
  if (g === 'week') {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }
  if (g === 'month') {
    d.setDate(1);
    return d;
  }
  const q = Math.floor(d.getMonth() / 3) * 3;
  d.setMonth(q);
  d.setDate(1);
  return d;
}

function bucketAdd(date: Date, g: 'day' | 'week' | 'month' | 'quarter'): Date {
  const d = new Date(date);
  if (g === 'day') {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (g === 'week') {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (g === 'month') {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  d.setMonth(d.getMonth() + 3);
  return d;
}

function formatLabel(date: Date, g: 'day' | 'week' | 'month' | 'quarter'): string {
  if (g === 'day') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (g === 'week') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (g === 'month') return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear().toString().slice(-2)}`;
}

const PipelineFlowOverTimeWidget: React.FC<WidgetComponentProps> = ({ timeRange }) => {
  const { detections } = useDashboardDetections();

  const { buckets, maxTotal, granularity } = useMemo(() => {
    const now = timeRange.endDate ? new Date(timeRange.endDate) : new Date();
    let start: Date;

    if (timeRange.startDate) {
      start = new Date(timeRange.startDate);
    } else {
      // Default to 12 months back
      start = new Date(now);
      start.setMonth(start.getMonth() - 12);
    }
    const g = chooseGranularity(start.getTime(), now.getTime());

    const result: Bucket[] = [];
    let cur = bucketStart(start, g);
    const cap = 365;
    while (cur.getTime() < now.getTime() && result.length < cap) {
      const next = bucketAdd(cur, g);
      const cutoff = Math.min(next.getTime(), now.getTime());

      const counts: Record<StatusKey, number> = {
        Draft: 0,
        Development: 0,
        Review: 0,
        Testing: 0,
        Production: 0,
      };
      for (const d of detections) {
        if (!d.createdDate) continue;
        const t = new Date(d.createdDate).getTime();
        if (t > cutoff) continue;
        const s = d.status as StatusKey | undefined;
        if (s && s in counts) counts[s]++;
      }

      result.push({ label: formatLabel(cur, g), counts });
      cur = next;
    }

    const maxT = Math.max(...result.map(b => STATUS_ORDER.reduce((s, k) => s + b.counts[k], 0)), 1);
    return { buckets: result, maxTotal: maxT, granularity: g };
  }, [detections, timeRange.startDate, timeRange.endDate]);

  if (detections.length === 0 || buckets.length === 0) {
    return <WidgetEmptyState message="No pipeline history yet" />;
  }

  const svgW = 600;
  const svgH = 180;
  const padL = 4;
  const padR = 4;
  const plotW = svgW - padL - padR;
  const plotH = svgH;

  const xStep = buckets.length > 1 ? plotW / (buckets.length - 1) : plotW;
  const toX = (i: number) => padL + i * xStep;
  const toY = (v: number) => plotH - (v / maxTotal) * plotH;

  // Build stacked areas — bottom (Production) → top (Draft).
  // For each status, the lower edge = sum of statuses below it, upper edge = lower + status value.
  function buildArea(getLower: (b: Bucket) => number, getUpper: (b: Bucket) => number): string {
    const upper = buckets.map((b, i) => `${toX(i).toFixed(2)},${toY(getUpper(b)).toFixed(2)}`);
    const lower = buckets
      .map((b, i) => `${toX(i).toFixed(2)},${toY(getLower(b)).toFixed(2)}`)
      .reverse();
    return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
  }

  const stackPaths = STATUS_ORDER.map((key, idx) => {
    const below = STATUS_ORDER.slice(0, idx);
    const lower = (b: Bucket) => below.reduce((s, k) => s + b.counts[k], 0);
    const upper = (b: Bucket) => lower(b) + b.counts[key];
    return { key, path: buildArea(lower, upper) };
  });

  const latest = buckets[buckets.length - 1].counts;
  const latestTotal = STATUS_ORDER.reduce((s, k) => s + latest[k], 0);
  const prodShare = latestTotal > 0 ? Math.round((latest.Production / latestTotal) * 100) : 0;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
            Pipeline Mix
          </span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40 uppercase tracking-wider">
            {granularity}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-brand font-bold text-on-surface">{prodShare}</span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant">% in production</span>
        </div>
      </div>

      <div className="flex-1 min-h-[120px]">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" preserveAspectRatio="none">
          {stackPaths.map(({ key, path }) => (
            <path key={key} d={path} fill={COLORS[key]} fillOpacity="0.78" />
          ))}
        </svg>
      </div>

      <div className="flex justify-between text-[8px] text-on-surface-variant/40 font-brand font-medium mt-1.5">
        {buckets.length <= 12 ? (
          buckets.map((b, i) => <span key={i}>{b.label}</span>)
        ) : (
          <>
            <span>{buckets[0].label}</span>
            <span>{buckets[Math.floor(buckets.length / 2)].label}</span>
            <span>{buckets[buckets.length - 1].label}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2">
        {STATUS_ORDER.slice().reverse().map(k => (
          <span key={k} className="flex items-center gap-1.5 text-[9px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[k] }} />
            {k} ({latest[k]})
          </span>
        ))}
      </div>
    </div>
  );
};

export default PipelineFlowOverTimeWidget;
