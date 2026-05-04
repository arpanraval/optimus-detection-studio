import React from 'react';
import type { EnvironmentProfile } from '../../types/environment';
import type { TechBucket } from '../../lib/actionPlan/technologyBuckets';
import { BUCKET_LABELS } from '../../lib/actionPlan/technologyBuckets';

interface Props {
  profile: EnvironmentProfile;
  bucket: TechBucket;
}

export const TechnologySubPage: React.FC<Props> = ({ bucket }) => (
  <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
    <h1 className="text-xs font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
      Action Plan — {BUCKET_LABELS[bucket]}
    </h1>
    <p className="mt-4 text-on-surface-variant">Coming in T5.</p>
  </div>
);
