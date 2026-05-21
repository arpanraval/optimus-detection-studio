// ============================================================================
// MetadataCompletenessTrendWidget — % of rules with full hygiene metadata
//
// Four series tracked cumulatively: % of rules at bucket-end with MITRE
// mapping, log source, platform, and tags. Rising lines mean newly created
// rules are arriving well-tagged; falling lines mean intake quality is
// slipping.
// ============================================================================

import React from 'react';
import type { WidgetComponentProps } from './types';
import type { Detection } from '../../../../types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useTimeSeries, type BucketPoint } from './useTimeSeries';
import WidgetEmptyState from './WidgetEmptyState';

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  predicate: (d: Detection) => boolean;
}

const SERIES: SeriesDef[] = [
  {
    key: 'mitre',
    label: 'MITRE',
    color: 'rgb(var(--md-ext-color-cyan))',
    predicate: d => (d.mitreAttackIds?.length ?? 0) > 0,
  },
  {
    key: 'logSource',
    label: 'Log Source',
    color: 'rgb(var(--md-ext-color-teal))',
    predicate: d => (d.logSources?.length ?? 0) > 0,
  },
  {
    key: 'platform',
    label: 'Platform',
    color: 'rgb(var(--md-ext-color-amber))',
    predicate: d => (d.platforms?.length ?? 0) > 0,
  },
  {
    key: 'tags',
    label: 'Tags',
    color: 'rgb(var(--md-ext-color-indigo))',
    predicate: d => (d.tags?.length ?? 0) > 0,
  },
];

// Module-scoped reducers so refs are stable across renders.
const mitreReducer = makePctReducer(SERIES[0].predicate);
const logSourceReducer = makePctReducer(SERIES[1].predicate);
const platformReducer = makePctReducer(SERIES[2].predicate);
const tagsReducer = makePctReducer(SERIES[3].predicate);

function makePctReducer(predicate: (d: Detection) => boolean) {
  return (ds: Detection[]) => {
    if (ds.length === 0) return 0;
    const matched = ds.filter(predicate).length;
    return Math.round((matched / ds.length) * 1000) / 10;
  };
}

const SVG_W = 100;
const SVG_H = 100;
const PAD_L = 4;
const PAD_R = 1;
const MAX_VAL = 100;
const Y_TICKS = [0, 50, 100];

const toX = (i: number, len: number) =>
  (PAD_L / 100) * SVG_W + (i / Math.max(len - 1, 1)) * ((100 - PAD_L - PAD_R) / 100) * SVG_W;
const toY = (v: number) => SVG_H - (v / MAX_VAL) * SVG_H * 0.92 - SVG_H * 0.04;

function buildPath(points: BucketPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, points.length).toFixed(2)},${toY(p.value).toFixed(2)}`)
    .join(' ');
}

const MetadataCompletenessTrendWidget: React.FC<WidgetComponentProps> = ({ timeRange }) => {
  const { detections } = useDashboardDetections();

  const mitre = useTimeSeries(detections, timeRange, { reduce: mitreReducer, cumulative: true, summary: 'latest', granularity: 'auto' });
  const logSource = useTimeSeries(detections, timeRange, { reduce: logSourceReducer, cumulative: true, summary: 'latest', granularity: 'auto' });
  const platform = useTimeSeries(detections, timeRange, { reduce: platformReducer, cumulative: true, summary: 'latest', granularity: 'auto' });
  const tags = useTimeSeries(detections, timeRange, { reduce: tagsReducer, cumulative: true, summary: 'latest', granularity: 'auto' });

  if (detections.length === 0) {
    return <WidgetEmptyState message="No detections" />;
  }

  const series = [
    { def: SERIES[0], result: mitre },
    { def: SERIES[1], result: logSource },
    { def: SERIES[2], result: platform },
    { def: SERIES[3], result: tags },
  ];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
          Metadata Completeness
        </span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/40 uppercase tracking-wider">
          % rules tagged
        </span>
      </div>

      <div className="flex-1 relative min-h-[120px]">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          {Y_TICKS.map(t => (
            <line
              key={t}
              x1={(PAD_L / 100) * SVG_W}
              y1={toY(t)}
              x2={SVG_W - (PAD_R / 100) * SVG_W}
              y2={toY(t)}
              stroke="currentColor"
              strokeOpacity={t === 0 ? 0.1 : 0.04}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map(({ def, result }) => (
            <path
              key={def.key}
              d={buildPath(result.current)}
              fill="none"
              stroke={def.color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {Y_TICKS.map(t => (
          <span
            key={t}
            className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none"
            style={{ left: 0, top: `${((100 - t) / 100) * 92 + 4}%`, transform: 'translateY(-50%)' }}
          >
            {t}%
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        {series.map(({ def, result }) => {
          const latest = result.current.length > 0 ? result.current[result.current.length - 1].value : 0;
          const delta = result.totals.deltaPct;
          return (
            <div key={def.key} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: def.color }} />
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/60 uppercase tracking-wider truncate">
                {def.label}
              </span>
              <span className="text-[10px] font-brand font-bold text-on-surface ml-auto">
                {latest.toFixed(0)}%
              </span>
              {delta !== 0 && (
                <span className={`text-[9px] font-brand font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MetadataCompletenessTrendWidget;
