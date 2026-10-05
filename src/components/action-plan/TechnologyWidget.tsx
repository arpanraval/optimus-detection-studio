import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechniqueBuckets } from '../../hooks/useTechniqueBuckets';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import { BUCKET_ORDER, BUCKET_LABELS, type TechBucket } from '../../lib/actionPlan/technologyBuckets';
import { bucketCountsFor, filterGapsByBucket, bucketCoverage } from './scopedActionPlan';
import type { RecommendedDetection, GapTechnique, TacticThreatCoverage } from '../../hooks/useProfileIntelligence';
import type { IconName } from '../Icon';

const HIGH_RISK = 50;
const MED_RISK = 80;

const BUCKET_ICON: Record<TechBucket, IconName> = {
  endpoint: 'monitor',
  cloud: 'cloud',
  identity: 'user',
  saas: 'grid',
  network: 'globe',
};

interface Props {
  detections: RecommendedDetection[];
  gaps: GapTechnique[];
  tacticCoverage: TacticThreatCoverage[];
  loading: boolean;
  explainMetrics?: boolean;
}

function risk(p: number): { tx: string; bar: string } {
  if (p < HIGH_RISK) return { tx: 'text-ext-coral', bar: 'bg-ext-coral' };
  if (p < MED_RISK) return { tx: 'text-ext-amber', bar: 'bg-ext-amber' };
  return { tx: 'text-ext-teal', bar: 'bg-ext-teal' };
}

export const TechnologyWidget: React.FC<Props> = ({ detections, gaps, tacticCoverage, loading, explainMetrics = false }) => {
  const navigate = useNavigate();
  const { buckets, loading: bucketsLoading } = useTechniqueBuckets();

  const isLoading = loading || bucketsLoading;

  const counts = useMemo(() => bucketCountsFor(detections, buckets), [detections, buckets]);
  const gapCounts = useMemo(() => {
    const out: Record<TechBucket, number> = { endpoint: 0, cloud: 0, identity: 0, saas: 0, network: 0 };
    for (const b of BUCKET_ORDER) {
      out[b] = filterGapsByBucket(gaps, b, buckets).filter(g => g.siemDetectable).length;
    }
    return out;
  }, [gaps, buckets]);
  const coverage = useMemo(() => {
    const out: Record<TechBucket, { covered: number; total: number; pct: number }> = {
      endpoint: { covered: 0, total: 0, pct: 100 },
      cloud: { covered: 0, total: 0, pct: 100 },
      identity: { covered: 0, total: 0, pct: 100 },
      saas: { covered: 0, total: 0, pct: 100 },
      network: { covered: 0, total: 0, pct: 100 },
    };
    for (const b of BUCKET_ORDER) {
      out[b] = bucketCoverage(tacticCoverage, b, buckets);
    }
    return out;
  }, [tacticCoverage, buckets]);

  if (isLoading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-32 bg-surface-container rounded animate-pulse mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-surface-container/50 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    );
  }

  // Sort buckets: lowest coverage first (matches Threat widget's "highest risk first")
  const sorted = [...BUCKET_ORDER].sort((a, b) => coverage[a].pct - coverage[b].pct);

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          By Technology
        </h3>
        <span className="text-xs font-mono text-ext-teal tabular-nums">{BUCKET_ORDER.length}</span>
      </div>

      <div className="space-y-1.5">
        {sorted.map(b => {
          const dCount = counts[b];
          const gCount = gapCounts[b];
          const { covered, total, pct } = coverage[b];
          const r = risk(pct);
          const empty = dCount === 0 && total === 0;

          return (
            <button
              key={b}
              onClick={() => !empty && navigate(routeHelpers.actionPlanTechnology(b))}
              disabled={empty}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors group ${
                empty ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-container-highest/30 cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name={BUCKET_ICON[b]} className="w-3.5 h-3.5 text-on-surface-variant flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-on-surface truncate">{BUCKET_LABELS[b]}</span>
                    {gCount > 0 && (
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 bg-ext-coral/15 text-ext-coral">
                        {gCount} gap{gCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-on-surface-variant mt-0.5 tabular-nums">
                    {dCount.toLocaleString()} {explainMetrics ? 'rules to review' : `candidate${dCount === 1 ? '' : 's'}`} · {covered}/{total} techniques covered
                  </div>
                </div>
                <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-[10px] font-mono font-bold tabular-nums ${r.tx}`}>{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
      {explainMetrics && <details className="mt-3 text-[10px] text-outline"><summary className="cursor-pointer text-primary">How to read this · click an area to act</summary><p className="mt-2">The bar shows the share of relevant attacker techniques mapped by enabled rules. Gaps are techniques needing coverage; candidates are library rules to review. A rule may apply to several areas, so do not add these rows together.</p></details>}
    </div>
  );
};
