import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechniqueBuckets } from '../../hooks/useTechniqueBuckets';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import { BUCKET_ORDER, BUCKET_LABELS, type TechBucket } from '../../lib/actionPlan/technologyBuckets';
import { bucketCountsFor, filterGapsByBucket } from './scopedActionPlan';
import type { RecommendedDetection, GapTechnique } from '../../hooks/useProfileIntelligence';

const BUCKET_ICON: Record<TechBucket, string> = {
  endpoint: 'monitor',
  cloud: 'cloud',
  identity: 'user',
  saas: 'grid',
  network: 'globe',
};

interface Props {
  detections: RecommendedDetection[];
  gaps: GapTechnique[];
  loading: boolean;
}

export const TechnologyWidget: React.FC<Props> = ({ detections, gaps, loading }) => {
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

  if (isLoading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-32 bg-surface-container rounded animate-pulse mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-container/50 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          By Technology
        </h3>
        <span className="text-[10px] text-on-surface-variant">Click a bucket for a focused plan</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {BUCKET_ORDER.map(b => {
          const dCount = counts[b];
          const gCount = gapCounts[b];
          const empty = dCount === 0 && gCount === 0;
          return (
            <button
              key={b}
              onClick={() => !empty && navigate(routeHelpers.actionPlanTechnology(b))}
              disabled={empty}
              className={`text-left rounded-xl p-3 transition-all ${
                empty
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:scale-[1.02] hover:bg-surface-container-highest/40 cursor-pointer'
              }`}
              style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon name={BUCKET_ICON[b]} className="w-4 h-4 text-ext-teal" />
                <Icon name="arrow-right" className="w-3 h-3 text-outline" />
              </div>
              <div className="text-[10px] font-bold text-on-surface uppercase tracking-wider">{BUCKET_LABELS[b]}</div>
              <div className="text-base font-brand font-bold text-on-surface leading-none mt-1 tabular-nums">
                {dCount.toLocaleString()}
              </div>
              <div className="text-[9px] text-on-surface-variant mt-0.5">detections</div>
              {gCount > 0 && (
                <div className="text-[9px] text-ext-coral mt-1 tabular-nums">{gCount} gap{gCount === 1 ? '' : 's'}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
