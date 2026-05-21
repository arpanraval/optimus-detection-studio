// ============================================================================
// ThreatActorCoverageTrendWidget — top 5 actor coverage % over time
//
// For each of the top 5 threat actors by TAW, plot the cumulative % of their
// MITRE techniques covered by detections existing at each bucket end. Answers
// "are we getting better at the actors we care about most?"
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { WidgetComponentProps } from './types';
import { useDashboardDetections } from '../useDashboardDetections';
import { useThreatActorWeights } from '../../../../hooks/useImpactScores';
import { supabase } from '../../../../lib/supabaseClient';
import WidgetEmptyState from './WidgetEmptyState';

interface ActorTrend {
  name: string;
  taw: number;
  techniqueCount: number;
  series: { label: string; value: number }[];
  latest: number;
  delta: number;
}

const ACTOR_COLORS = [
  'rgb(var(--md-ext-color-coral))',
  'rgb(var(--md-ext-color-cyan))',
  'rgb(var(--md-ext-color-amber))',
  'rgb(var(--md-ext-color-indigo))',
  'rgb(var(--md-ext-color-teal))',
];

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

function formatLabel(d: Date, g: 'day' | 'week' | 'month' | 'quarter'): string {
  if (g === 'day' || g === 'week') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (g === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear().toString().slice(-2)}`;
}

const ThreatActorCoverageTrendWidget: React.FC<WidgetComponentProps> = ({ timeRange }) => {
  const { detections } = useDashboardDetections();
  const { actors } = useThreatActorWeights();
  const [actorTechs, setActorTechs] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  const topActors = useMemo(() => actors.slice(0, 5), [actors]);

  // Fetch technique sets for the top actors
  useEffect(() => {
    let cancelled = false;
    if (topActors.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const ids = topActors.map(a => a.stix_id);
        const { data: rels } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref')
          .eq('relationship_type', 'uses')
          .in('source_ref', ids);

        const techStixIds = [...new Set((rels || []).map(r => r.target_ref))];
        const map = new Map<string, string>();
        for (let i = 0; i < techStixIds.length; i += 100) {
          const { data } = await supabase
            .from('mitre_objects')
            .select('stix_id, mitre_id')
            .in('stix_id', techStixIds.slice(i, i + 100));
          (data || []).forEach(t => map.set(t.stix_id, t.mitre_id));
        }

        const byActor = new Map<string, Set<string>>();
        (rels || []).forEach(r => {
          const mid = map.get(r.target_ref);
          if (!mid) return;
          if (!byActor.has(r.source_ref)) byActor.set(r.source_ref, new Set());
          byActor.get(r.source_ref)!.add(mid);
        });

        if (!cancelled) {
          setActorTechs(byActor);
          setLoading(false);
        }
      } catch (err) {
        console.error('ThreatActorCoverageTrend: failed to fetch actor techniques', err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topActors]);

  const { trends, granularity, bucketCount } = useMemo(() => {
    const now = timeRange.endDate ? new Date(timeRange.endDate) : new Date();
    const start = timeRange.startDate ? new Date(timeRange.startDate) : (() => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return d;
    })();
    const g = chooseGranularity(now.getTime() - start.getTime());

    const buckets: { ts: number; label: string }[] = [];
    let cur = bucketStart(start, g);
    const cap = 200;
    while (cur.getTime() < now.getTime() && buckets.length < cap) {
      const next = bucketAdd(cur, g);
      buckets.push({ ts: Math.min(next.getTime(), now.getTime()), label: formatLabel(cur, g) });
      cur = next;
    }

    const trends: ActorTrend[] = topActors.map(actor => {
      const techSet = actorTechs.get(actor.stix_id) || new Set<string>();
      const techCount = techSet.size;
      const series = buckets.map(b => {
        const covered = new Set<string>();
        for (const d of detections) {
          if (!d.createdDate) continue;
          if (new Date(d.createdDate).getTime() > b.ts) continue;
          for (const id of d.mitreAttackIds || []) {
            if (techSet.has(id)) covered.add(id);
          }
        }
        const pct = techCount > 0 ? Math.round((covered.size / techCount) * 1000) / 10 : 0;
        return { label: b.label, value: pct };
      });
      const latest = series.length > 0 ? series[series.length - 1].value : 0;
      const firstNonZero = series.find(s => s.value > 0)?.value ?? 0;
      const delta = firstNonZero > 0 ? Math.round(((latest - firstNonZero) / firstNonZero) * 100) : (latest > 0 ? 100 : 0);
      return {
        name: actor.name,
        taw: actor.taw,
        techniqueCount: techCount,
        series,
        latest,
        delta,
      };
    });

    return { trends, granularity: g, bucketCount: buckets.length };
  }, [topActors, actorTechs, detections, timeRange.startDate, timeRange.endDate]);

  if (loading) {
    return (
      <div className="p-5 h-full flex items-center justify-center">
        <span className="text-[11px] font-brand text-on-surface-variant/40 animate-pulse">Loading actor coverage…</span>
      </div>
    );
  }

  if (topActors.length === 0 || trends.length === 0) {
    return <WidgetEmptyState message="No threat actors weighted yet" />;
  }

  const svgW = 100;
  const svgH = 100;
  const padL = 4;
  const padR = 1;
  const maxVal = 100;
  const toX = (i: number, len: number) =>
    (padL / 100) * svgW + (i / Math.max(len - 1, 1)) * ((100 - padL - padR) / 100) * svgW;
  const toY = (v: number) => svgH - (v / maxVal) * svgH * 0.92 - svgH * 0.04;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
            Top Actor Coverage
          </span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40 uppercase tracking-wider">
            {granularity}
          </span>
        </div>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant">
          {trends.length} actors · {bucketCount} buckets
        </span>
      </div>

      <div className="flex-1 relative min-h-[120px]">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          {[0, 50, 100].map(t => (
            <line
              key={t}
              x1={(padL / 100) * svgW}
              y1={toY(t)}
              x2={svgW - (padR / 100) * svgW}
              y2={toY(t)}
              stroke="currentColor"
              strokeOpacity={t === 0 ? 0.1 : 0.04}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {trends.map((trend, idx) => {
            const color = ACTOR_COLORS[idx % ACTOR_COLORS.length];
            const path = trend.series
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, trend.series.length).toFixed(2)},${toY(p.value).toFixed(2)}`)
              .join(' ');
            return (
              <path
                key={trend.name}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
        {[0, 50, 100].map(t => (
          <span
            key={t}
            className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none"
            style={{ left: 0, top: `${((100 - t) / 100) * 92 + 4}%`, transform: 'translateY(-50%)' }}
          >
            {t}%
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
        {trends.map((trend, idx) => {
          const color = ACTOR_COLORS[idx % ACTOR_COLORS.length];
          return (
            <div
              key={trend.name}
              className="flex items-start gap-1.5 px-2 py-1.5 rounded-md min-w-0"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-lowest))' }}
            >
              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0 mt-1" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-brand font-bold text-on-surface truncate" title={trend.name}>
                  {trend.name}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-brand font-bold text-on-surface">
                    {trend.latest.toFixed(0)}%
                  </span>
                  {trend.delta !== 0 && (
                    <span className={`text-[9px] font-brand font-bold ${trend.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trend.delta > 0 ? '↑' : '↓'}{Math.abs(trend.delta)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ThreatActorCoverageTrendWidget;
