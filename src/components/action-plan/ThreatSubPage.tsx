import React from 'react';
import type { EnvironmentProfile } from '../../types/environment';

interface Props {
  profile: EnvironmentProfile;
  slug: string;
}

export const ThreatSubPage: React.FC<Props> = ({ slug }) => (
  <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
    <h1 className="text-xs font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
      Action Plan — Threat: {slug}
    </h1>
    <p className="mt-4 text-on-surface-variant">Coming in T6.</p>
  </div>
);
