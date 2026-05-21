// ============================================================================
// useTimeSeries — shared time-series bucketing hook for over-time widgets
//
// Every over-time widget computes the same three things:
//   1. The selected time range, bucketed at an appropriate granularity
//   2. The previous equal-duration window (PoP overlay)
//   3. Optionally, the same window one year earlier (YoY overlay)
//
// The hook handles bucket boundaries, granularity auto-selection, and the
// total/delta math so widgets stay focused on rendering. Reducers run on the
// detection set that fell into each bucket (or accumulated up to the bucket
// end when `cumulative` is true) and return a single number.
//
// History model: this hook reconstructs trends from current `createdDate`
// values. The hybrid plan (snapshot table later) will swap the source without
// changing this contract.
// ============================================================================

import { useMemo } from 'react';
import type { Detection } from '../../../../types';

export type Granularity = 'day' | 'week' | 'month' | 'quarter';

export interface BucketPoint {
  /** ISO timestamp of bucket start */
  isoStart: string;
  /** Compact label for the X axis */
  label: string;
  /** Reduced value for this bucket */
  value: number;
}

export interface TimeSeriesResult {
  granularity: Granularity;
  /** Buckets covering the selected time range */
  current: BucketPoint[];
  /** Buckets covering the equal-duration window immediately prior */
  previous: BucketPoint[];
  /** Buckets covering the same window one year earlier (empty when not requested) */
  yoy: BucketPoint[];
  totals: {
    current: number;
    previous: number;
    yoy: number;
    deltaPct: number;
    yoyDeltaPct: number;
  };
}

export type Reducer = (detections: Detection[]) => number;

export interface UseTimeSeriesOpts {
  /** Granularity to bucket at. `auto` picks based on the span. Default: auto. */
  granularity?: Granularity | 'auto';
  /** Pure reducer — returns a single number for a set of detections. */
  reduce: Reducer;
  /** If true, the reducer sees ALL detections created up to the bucket end (cumulative snapshot style). */
  cumulative?: boolean;
  /** Include the YoY series. Default: false. */
  yoy?: boolean;
  /** How to compute the summary total: `latest` (last bucket) or `sum` (all buckets). Default: latest for cumulative, sum otherwise. */
  summary?: 'latest' | 'sum';
  /** When no time range is set on the dashboard, default to the last N buckets. Default: 12. */
  defaultBuckets?: number;
}

const MS = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
} as const;

function autoGranularity(spanMs: number): Granularity {
  if (spanMs <= 14 * MS.day) return 'day';
  if (spanMs <= 60 * MS.day) return 'week';
  if (spanMs <= 540 * MS.day) return 'month';
  return 'quarter';
}

function bucketStart(date: Date, g: Granularity): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  switch (g) {
    case 'day':
      return d;
    case 'week': {
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday=0
      d.setDate(d.getDate() - diff);
      return d;
    }
    case 'month':
      d.setDate(1);
      return d;
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) * 3;
      d.setMonth(q);
      d.setDate(1);
      return d;
    }
  }
}

function bucketAdd(date: Date, g: Granularity, n: number = 1): Date {
  const d = new Date(date);
  switch (g) {
    case 'day':
      d.setDate(d.getDate() + n);
      return d;
    case 'week':
      d.setDate(d.getDate() + 7 * n);
      return d;
    case 'month':
      d.setMonth(d.getMonth() + n);
      return d;
    case 'quarter':
      d.setMonth(d.getMonth() + 3 * n);
      return d;
  }
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / MS.day + 1) / 7);
}

function formatLabel(date: Date, g: Granularity): string {
  switch (g) {
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week':
      return `W${isoWeek(date)}`;
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    case 'quarter': {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `Q${q} ${date.getFullYear().toString().slice(-2)}`;
    }
  }
}

interface Bucket {
  isoStart: string;
  start: Date;
  end: Date;
  label: string;
}

function buildBuckets(start: Date, end: Date, g: Granularity): Bucket[] {
  const buckets: Bucket[] = [];
  let cur = bucketStart(start, g);
  // Guard against pathological inputs (e.g. equal start/end)
  const cap = 365;
  while (cur.getTime() < end.getTime() && buckets.length < cap) {
    const next = bucketAdd(cur, g);
    buckets.push({
      isoStart: cur.toISOString(),
      start: new Date(cur),
      end: new Date(Math.min(next.getTime(), end.getTime())),
      label: formatLabel(cur, g),
    });
    cur = next;
  }
  return buckets;
}

function computeSeries(
  detections: Detection[],
  start: Date,
  end: Date,
  g: Granularity,
  reduce: Reducer,
  cumulative: boolean,
): BucketPoint[] {
  const buckets = buildBuckets(start, end, g);
  if (buckets.length === 0) return [];

  return buckets.map(b => {
    const bucketEnd = b.end.getTime();
    const bucketStartTs = b.start.getTime();
    const filtered = detections.filter(d => {
      if (!d.createdDate) return false;
      const t = new Date(d.createdDate).getTime();
      if (cumulative) return t <= bucketEnd;
      return t >= bucketStartTs && t < bucketEnd;
    });
    return { isoStart: b.isoStart, label: b.label, value: reduce(filtered) };
  });
}

/**
 * Resolves the active time window. Falls back to the last N buckets at the
 * chosen granularity when the dashboard time range is "all".
 */
function resolveWindow(
  timeRange: { startDate: string | null; endDate: string | null },
  granularity: Granularity | 'auto' | undefined,
  defaultBuckets: number,
): { start: Date; end: Date; resolvedGranularity: Granularity } {
  const end = timeRange.endDate ? new Date(timeRange.endDate) : new Date();

  if (timeRange.startDate) {
    const start = new Date(timeRange.startDate);
    const span = end.getTime() - start.getTime();
    const g = granularity === 'auto' || !granularity ? autoGranularity(span) : granularity;
    return { start, end, resolvedGranularity: g };
  }

  // No range — default to last N buckets
  const g = granularity === 'auto' || !granularity ? 'month' : granularity;
  const start = bucketAdd(bucketStart(end, g), g, -defaultBuckets);
  return { start, end, resolvedGranularity: g };
}

export function useTimeSeries(
  detections: Detection[],
  timeRange: { startDate: string | null; endDate: string | null },
  opts: UseTimeSeriesOpts,
): TimeSeriesResult {
  const { granularity, reduce, cumulative, yoy, summary, defaultBuckets = 12 } = opts;
  // Pull primitives out of timeRange so the dep array tracks the underlying
  // dates rather than the object identity (which changes every render).
  const startDate = timeRange.startDate;
  const endDate = timeRange.endDate;

  return useMemo(() => {
    const { start, end, resolvedGranularity } = resolveWindow(
      { startDate, endDate },
      granularity,
      defaultBuckets,
    );
    const cumul = !!cumulative;
    const spanMs = end.getTime() - start.getTime();

    const current = computeSeries(detections, start, end, resolvedGranularity, reduce, cumul);

    const prevStart = new Date(start.getTime() - spanMs);
    const prevEnd = new Date(end.getTime() - spanMs);
    const previous = computeSeries(detections, prevStart, prevEnd, resolvedGranularity, reduce, cumul);

    let yoySeries: BucketPoint[] = [];
    if (yoy) {
      const yoyStart = new Date(start);
      yoyStart.setFullYear(yoyStart.getFullYear() - 1);
      const yoyEnd = new Date(end);
      yoyEnd.setFullYear(yoyEnd.getFullYear() - 1);
      yoySeries = computeSeries(detections, yoyStart, yoyEnd, resolvedGranularity, reduce, cumul);
    }

    const summaryMode = summary ?? (cumul ? 'latest' : 'sum');
    const latestOf = (arr: BucketPoint[]) => (arr.length > 0 ? arr[arr.length - 1].value : 0);
    const sumOf = (arr: BucketPoint[]) => arr.reduce((s, p) => s + p.value, 0);
    const reduceTotal = (arr: BucketPoint[]) =>
      summaryMode === 'latest' ? latestOf(arr) : sumOf(arr);

    const totalCurrent = reduceTotal(current);
    const totalPrevious = reduceTotal(previous);
    const totalYoy = reduceTotal(yoySeries);

    const pct = (a: number, b: number) => {
      if (b > 0) return Math.round(((a - b) / b) * 100);
      return a > 0 ? 100 : 0;
    };

    return {
      granularity: resolvedGranularity,
      current,
      previous,
      yoy: yoySeries,
      totals: {
        current: totalCurrent,
        previous: totalPrevious,
        yoy: totalYoy,
        deltaPct: pct(totalCurrent, totalPrevious),
        yoyDeltaPct: pct(totalCurrent, totalYoy),
      },
    };
  }, [detections, startDate, endDate, granularity, cumulative, yoy, summary, defaultBuckets, reduce]);
}
