// ============================================================================
// ENTERPRISE DASHBOARD — Counter Panel Widget
// Reusable stat counter filtered by config.custom parameters.
// ============================================================================

import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { FONT_SIZE_CLASS, ALIGNMENT_CLASS, formatWidgetNumber } from './types';
import { useAppData } from '../../../../router/AppDataContext';
import { withAlpha } from '../engine/colorUtils';

// ---------------------------------------------------------------------------
// Simple SVG icon set for counter panels
// ---------------------------------------------------------------------------

const ICONS: Record<string, React.ReactNode> = {
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  alert: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  check: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  tag: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </>
  ),
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  box: (
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  cpu: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

function matchesFilter(d: any, field: string, op: string, value: any): boolean {
  const raw = d[field];

  switch (op) {
    case 'eq':
      if (typeof value === 'boolean') return Boolean(raw) === value;
      return Array.isArray(raw) ? raw.includes(value) : raw === value;

    case 'neq':
      return Array.isArray(raw) ? !raw.includes(value) : raw !== value;

    case 'lt':
      return typeof raw === 'number' && raw < Number(value);

    case 'contains':
      if (Array.isArray(raw)) {
        return raw.some(
          (v: string) =>
            typeof v === 'string' &&
            v.toLowerCase().includes(String(value).toLowerCase()),
        );
      }
      return (
        typeof raw === 'string' &&
        raw.toLowerCase().includes(String(value).toLowerCase())
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CounterPanelWidget: React.FC<WidgetComponentProps> = ({ config, timeRange }) => {
  const { detections: allDetections } = useAppData();

  const accent = config.accentColor || 'rgb(var(--md-sys-color-primary))';
  const custom = config.custom || {};
  const filterField = custom.filterField as string;
  const filterOp = (custom.filterOp as string) || 'eq';
  const filterValue = custom.filterValue;
  const label = (custom.counterLabel as string) || 'Count';
  const iconKey = (custom.counterIcon as string) || 'file';
  const invert = Boolean(custom.invertFilter);

  const { count, prevCount } = useMemo(() => {
    let detections = allDetections;

    // Time range filter
    if (timeRange.startDate) {
      const start = new Date(timeRange.startDate).getTime();
      const end = timeRange.endDate
        ? new Date(timeRange.endDate).getTime()
        : Infinity;

      detections = detections.filter((d) => {
        const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
        return ts >= start && ts <= end;
      });
    }

    // Apply counter filter
    let filtered: typeof detections;
    if (!filterField) {
      filtered = detections;
    } else {
      filtered = detections.filter((d) => {
        const matches = matchesFilter(d, filterField, filterOp, filterValue);
        return invert ? !matches : matches;
      });
    }

    // Compute previous period for trend
    let prev = 0;
    if (timeRange.startDate) {
      const start = new Date(timeRange.startDate).getTime();
      const end = timeRange.endDate
        ? new Date(timeRange.endDate).getTime()
        : Date.now();
      const duration = end - start;
      const prevStart = start - duration;

      let prevDetections = allDetections.filter((d) => {
        const ts = d.createdDate ? new Date(d.createdDate).getTime() : 0;
        return ts >= prevStart && ts < start;
      });

      if (filterField) {
        prevDetections = prevDetections.filter((d) => {
          const matches = matchesFilter(d, filterField, filterOp, filterValue);
          return invert ? !matches : matches;
        });
      }

      prev = prevDetections.length;
    }

    return { count: filtered.length, prevCount: prev };
  }, [allDetections, timeRange, filterField, filterOp, filterValue, invert]);

  const hasTrend = timeRange.startDate && prevCount > 0;
  const trendPct = hasTrend
    ? Math.round(((count - prevCount) / prevCount) * 100)
    : 0;
  const trendUp = trendPct > 0;
  const iconSvg = ICONS[iconKey] || ICONS.file;

  const fontClass = FONT_SIZE_CLASS[config.fontSize || 'xl'];
  const alignClass = ALIGNMENT_CLASS[config.alignment || 'center'];
  const showComp = config.showComparison !== false;

  return (
    <div className={`px-4 h-full flex justify-center flex-col ${alignClass}`}>
      <span className={`${fontClass} font-brand font-bold`} style={{ color: accent }}>
        {formatWidgetNumber(count, config.numberFormat)}
      </span>
      {showComp && hasTrend && trendPct !== 0 && (
        <span
          className={`mt-1 text-[12px] font-brand font-bold ${trendUp ? 'text-green-500' : 'text-red-400'}`}
        >
          {trendUp ? '+' : ''}
          {trendPct}%
        </span>
      )}
    </div>
  );
};

export default CounterPanelWidget;
