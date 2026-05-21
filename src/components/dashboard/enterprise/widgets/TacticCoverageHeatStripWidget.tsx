// ============================================================================
// TacticCoverageHeatStripWidget — small-multiple sparkline per MITRE tactic
//
// 14 rows, one per tactic. Each row: a horizontal mini-sparkline of cumulative
// coverage % over the selected period + current %. Useful at a glance for
// spotting which tactics are improving vs stagnating.
// ============================================================================

import React, { useMemo } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import WidgetEmptyState from './WidgetEmptyState';

const TACTICS_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
] as const;

const TACTIC_LABELS: Record<string, string> = {
  reconnaissance: 'Recon',
  'resource-development': 'Resource Dev',
  'initial-access': 'Initial Access',
  execution: 'Execution',
  persistence: 'Persistence',
  'privilege-escalation': 'Priv Esc',
  'defense-evasion': 'Def Evasion',
  'credential-access': 'Cred Access',
  discovery: 'Discovery',
  'lateral-movement': 'Lateral Mov',
  collection: 'Collection',
  'command-and-control': 'C2',
  exfiltration: 'Exfiltration',
  impact: 'Impact',
};

const TACTIC_TOTALS: Record<string, number> = {
  reconnaissance: 45,
  'resource-development': 47,
  'initial-access': 25,
  execution: 70,
  persistence: 181,
  'privilege-escalation': 140,
  'defense-evasion': 262,
  'credential-access': 80,
  discovery: 50,
  'lateral-movement': 34,
  collection: 41,
  'command-and-control': 55,
  exfiltration: 21,
  impact: 38,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function chooseGranularity(spanMs: number): 'day' | 'week' | 'month' | 'quarter' {
  if (spanMs <= 14 * MS_PER_DAY) return 'day';
  if (spanMs <= 60 * MS_PER_DAY) return 'week';
  if (spanMs <= 540 * MS_PER_DAY) return 'month';
  return 'quarter';
}

function bucketStart(d: Date, g: 'day' | 'week' | 'month' | 'quarter'): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  if (g === 'day') return r;
  if (g === 'week') {
    const day = r.getDay();
    const diff = day === 0 ? 6 : day - 1;
    r.setDate(r.getDate() - diff);
    return r;
  }
  if (g === 'month') {
    r.setDate(1);
    return r;
  }
  const q = Math.floor(r.getMonth() / 3) * 3;
  r.setMonth(q);
  r.setDate(1);
  return r;
}

function bucketAdd(d: Date, g: 'day' | 'week' | 'month' | 'quarter'): Date {
  const r = new Date(d);
  if (g === 'day') r.setDate(r.getDate() + 1);
  else if (g === 'week') r.setDate(r.getDate() + 7);
  else if (g === 'month') r.setMonth(r.getMonth() + 1);
  else r.setMonth(r.getMonth() + 3);
  return r;
}

const TacticCoverageHeatStripWidget: React.FC<WidgetComponentProps> = ({ timeRange }) => {
  const { detections } = useDashboardDetections();

  const rows = useMemo(() => {
    const now = timeRange.endDate ? new Date(timeRange.endDate) : new Date();
    const start = timeRange.startDate
      ? new Date(timeRange.startDate)
      : (() => {
          const d = new Date(now);
          d.setMonth(d.getMonth() - 12);
          return d;
        })();
    const g = chooseGranularity(now.getTime() - start.getTime());

    const bucketEnds: number[] = [];
    let cur = bucketStart(start, g);
    const cap = 200;
    while (cur.getTime() < now.getTime() && bucketEnds.length < cap) {
      const next = bucketAdd(cur, g);
      bucketEnds.push(Math.min(next.getTime(), now.getTime()));
      cur = next;
    }

    return TACTICS_ORDER.map(tactic => {
      const total = TACTIC_TOTALS[tactic];
      const series = bucketEnds.map(ts => {
        const covered = new Set<string>();
        for (const d of detections) {
          if (!d.createdDate) continue;
          if (new Date(d.createdDate).getTime() > ts) continue;
          if (!d.mitreTactics || !d.mitreAttackIds) continue;
          for (let i = 0; i < d.mitreTactics.length; i++) {
            if (d.mitreTactics[i] === tactic && d.mitreAttackIds[i]) {
              covered.add(d.mitreAttackIds[i]);
            }
          }
        }
        return total > 0 ? Math.round((covered.size / total) * 1000) / 10 : 0;
      });
      const latest = series.length > 0 ? series[series.length - 1] : 0;
      const first = series.find(v => v > 0) ?? 0;
      const delta = first > 0 ? Math.round(((latest - first) / first) * 100) : (latest > 0 ? 100 : 0);
      return { tactic, label: TACTIC_LABELS[tactic], total, series, latest, delta };
    });
  }, [detections, timeRange.startDate, timeRange.endDate]);

  if (detections.length === 0) {
    return <WidgetEmptyState message="No detections to map" />;
  }

  const accent = 'rgb(var(--md-sys-color-primary))';
  const sparkH = 18;

  return (
    <div className="p-3 h-full overflow-y-auto">
      <div className="grid grid-cols-[110px_1fr_60px_44px] gap-x-3 gap-y-1 items-center">
        {rows.map(row => {
          const max = Math.max(...row.series, 1);
          const points = row.series;
          const path = points
            .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / Math.max(points.length - 1, 1)) * 100},${sparkH - (v / max) * sparkH}`)
            .join(' ');
          const fill = `M 0,${sparkH} L 0,${sparkH - (points[0] / max) * sparkH} ${points
            .map((v, i) => `L ${(i / Math.max(points.length - 1, 1)) * 100},${sparkH - (v / max) * sparkH}`)
            .join(' ')} L 100,${sparkH} Z`;

          return (
            <React.Fragment key={row.tactic}>
              <span className="text-[9px] font-brand font-bold text-on-surface-variant/60 truncate uppercase tracking-wider">
                {row.label}
              </span>
              <svg viewBox={`0 0 100 ${sparkH}`} preserveAspectRatio="none" className="w-full h-4">
                <path d={fill} fill={accent} fillOpacity="0.12" />
                <path
                  d={path}
                  fill="none"
                  stroke={accent}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[10px] font-brand font-bold text-on-surface text-right">
                {row.latest.toFixed(0)}%
              </span>
              {row.delta !== 0 ? (
                <span
                  className={`text-[9px] font-brand font-bold text-right ${
                    row.delta > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {row.delta > 0 ? '↑' : '↓'}{Math.abs(row.delta)}
                </span>
              ) : (
                <span className="text-[9px] font-brand font-medium text-on-surface-variant/30 text-right">—</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default TacticCoverageHeatStripWidget;
