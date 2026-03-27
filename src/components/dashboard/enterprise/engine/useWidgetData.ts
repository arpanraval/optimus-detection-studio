import { useMemo } from 'react';
import { useDashboardDetections } from '../useDashboardDetections';
import { getField } from './fieldRegistry';
import type { EngineWidgetConfig, WidgetDataResult, FilterClause } from './types';

interface TimeRange {
  startDate: string | null;
  endDate: string | null;
}

type DataPoint = { label: string; value: number };

export function useWidgetData(
  config: EngineWidgetConfig,
  timeRange: TimeRange,
): WidgetDataResult {
  const { detections } = useDashboardDetections();

  return useMemo(() => {
    try {
      // 1. Apply time range filter
      let filtered = detections;
      if (timeRange.startDate) {
        const start = new Date(timeRange.startDate).getTime();
        const end = timeRange.endDate
          ? new Date(timeRange.endDate).getTime()
          : Infinity;
        filtered = filtered.filter(d => {
          const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
          return ts >= start && ts <= end;
        });
      }

      // 2. Apply user-defined filters
      filtered = applyFilters(filtered, config.filters, config.filterLogic);

      // 3. Compute main result
      const values = computeResult(filtered, config);

      // 4. Compute comparison (previous period) if enabled
      let comparison: DataPoint[] | undefined;
      let previousTotal: number | undefined;
      if (config.comparison && timeRange.startDate) {
        const start = new Date(timeRange.startDate).getTime();
        const end = timeRange.endDate
          ? new Date(timeRange.endDate).getTime()
          : Date.now();
        const duration = end - start;
        const prevStart = new Date(start - duration).toISOString();
        const prevEnd = timeRange.startDate;
        let prevFiltered = detections.filter(d => {
          const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
          return (
            ts >= new Date(prevStart).getTime() &&
            ts < new Date(prevEnd).getTime()
          );
        });
        prevFiltered = applyFilters(prevFiltered, config.filters, config.filterLogic);
        comparison = computeResult(prevFiltered, config);
        previousTotal = comparison.reduce((s, v) => s + v.value, 0);
      }

      const total = values.reduce((s, v) => s + v.value, 0);
      return { values, comparison, total, previousTotal };
    } catch (err) {
      return { values: [], total: 0, error: (err as Error).message };
    }
  }, [detections, config, timeRange]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(detections: any[], filters: FilterClause[], logic: 'and' | 'or' = 'and'): any[] {
  if (filters.length === 0) return detections;

  return detections.filter(d => {
    const results = filters.map(clause => {
      const raw = d[clause.field];
      switch (clause.op) {
        case 'eq':
          if (typeof clause.value === 'boolean') {
            return Array.isArray(raw) ? raw.includes(clause.value) : Boolean(raw) === clause.value;
          }
          return Array.isArray(raw) ? raw.includes(clause.value) : raw === clause.value;
        case 'neq':
          return Array.isArray(raw) ? !raw.includes(clause.value) : raw !== clause.value;
        case 'gt':
          return typeof raw === 'number' && raw > (clause.value as number);
        case 'lt':
          return typeof raw === 'number' && raw < (clause.value as number);
        case 'gte':
          return typeof raw === 'number' && raw >= (clause.value as number);
        case 'lte':
          return typeof raw === 'number' && raw <= (clause.value as number);
        case 'in':
          return (
            Array.isArray(clause.value) &&
            (Array.isArray(raw)
              ? clause.value.some(v => raw.includes(v))
              : clause.value.includes(raw))
          );
        case 'contains':
          return (
            typeof raw === 'string' &&
            raw.toLowerCase().includes(String(clause.value).toLowerCase())
          );
        case 'is_empty':
          if (raw == null) return true;
          if (Array.isArray(raw)) return raw.length === 0;
          if (typeof raw === 'string') return raw.trim() === '';
          return false;
        case 'is_not_empty':
          if (raw == null) return false;
          if (Array.isArray(raw)) return raw.length > 0;
          if (typeof raw === 'string') return raw.trim() !== '';
          return true;
        default:
          return true;
      }
    });
    return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  });
}

function computeResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detections: any[],
  config: EngineWidgetConfig,
): DataPoint[] {
  // No groupBy -- single aggregate
  if (!config.groupBy) {
    return [
      {
        label: config.title || 'Total',
        value: aggregate(detections, config.metric),
      },
    ];
  }

  const fieldDef = getField(config.groupBy);

  // Date grouping
  if (fieldDef?.type === 'date') {
    return groupByDate(detections, config);
  }

  // String / boolean / array grouping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buckets = new Map<string, any[]>();

  detections.forEach(d => {
    const raw = d[config.groupBy!];
    const keys: string[] = Array.isArray(raw)
      ? raw
      : [String(raw ?? 'Unknown')];
    keys.forEach(key => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(d);
    });
  });

  return Array.from(buckets.entries())
    .map(([label, items]) => ({
      label,
      value: aggregate(items, config.metric),
    }))
    .sort((a, b) => b.value - a.value);
}

function aggregate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  metric: EngineWidgetConfig['metric'],
): number {
  if (metric.aggregation === 'count') return items.length;

  if (metric.aggregation === 'distinct_count') {
    const vals = new Set(items.map(d => d[metric.field]).flat().filter(v => v != null));
    return vals.size;
  }

  const nums = items
    .map(d => Number(d[metric.field]))
    .filter(n => !isNaN(n));
  if (nums.length === 0) return 0;

  switch (metric.aggregation) {
    case 'avg':
      return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
    case 'sum':
      return nums.reduce((s, n) => s + n, 0);
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    default:
      return 0;
  }
}

function groupByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detections: any[],
  config: EngineWidgetConfig,
): DataPoint[] {
  const granularity = config.dateGranularity || 'month';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buckets = new Map<string, any[]>();

  detections.forEach(d => {
    const raw = d[config.groupBy!];
    if (!raw) return;
    const date = new Date(raw);
    let key: string;

    switch (granularity) {
      case 'day':
        key = date.toISOString().slice(0, 10);
        break;
      case 'week': {
        const weekStart = new Date(date);
        const day = date.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday=0, Sunday=6
        weekStart.setDate(date.getDate() - diff);
        key = weekStart.toISOString().slice(0, 10);
        break;
      }
      case 'month':
        key = date.toISOString().slice(0, 7);
        break;
      case 'quarter': {
        const q = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${q}`;
        break;
      }
      default:
        key = date.toISOString().slice(0, 7);
    }

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(d);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({
      label,
      value: aggregate(items, config.metric),
    }));
}
