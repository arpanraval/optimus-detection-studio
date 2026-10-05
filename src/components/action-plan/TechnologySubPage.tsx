import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeasibilityLive } from '../settings/environment-wizard/useFeasibilityLive';
import { useProfileIntelligence, SIEM_TO_QUERY_LANGUAGES } from '../../hooks/useProfileIntelligence';
import { useTechniqueBuckets } from '../../hooks/useTechniqueBuckets';
import { DetectionActionQueue } from '../settings/environment-wizard/DetectionActionQueue';
import { CriticalGapsList } from '../settings/environment-wizard/CriticalGapsList';
import { MiniMitreMatrix } from '../settings/environment-wizard/MiniMitreMatrix';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';
import { BUCKET_LABELS, type TechBucket } from '../../lib/actionPlan/technologyBuckets';
import {
  filterDetectionsByBucket,
  filterGapsByBucket,
} from './scopedActionPlan';
import type { EnvironmentProfile } from '../../types/environment';

interface Props {
  profile: EnvironmentProfile;
  bucket: TechBucket;
}

export const TechnologySubPage: React.FC<Props> = ({ profile, bucket }) => {
  const navigate = useNavigate();

  const feasibility = useFeasibilityLive(
    profile.log_sources,
    profile.custom_log_sources || [],
    profile.edr_tools || [],
    profile.cloud_platforms || {},
  );
  const intel = useProfileIntelligence(
    profile.sectors || [],
    profile.siem_platforms,
    feasibility.matchResult,
    profile.user_country || null,
    profile.threat_origin_countries || [],
    profile.crown_jewels || [],
  );
  const { buckets, loading: bucketsLoading } = useTechniqueBuckets();

  const isLoading = feasibility.loading || intel.loading || bucketsLoading;

  const userQueryLanguages = useMemo(
    () => profile.siem_platforms.flatMap(s => SIEM_TO_QUERY_LANGUAGES[s] || []),
    [profile.siem_platforms],
  );

  const scopedDetections = useMemo(
    () => filterDetectionsByBucket(intel.recommendedDetections, bucket, buckets),
    [intel.recommendedDetections, bucket, buckets],
  );
  const scopedGaps = useMemo(
    () => filterGapsByBucket(intel.gapTechniques, bucket, buckets),
    [intel.gapTechniques, bucket, buckets],
  );
  const scopedMatrix = useMemo(() => {
    return intel.tacticThreatCoverage
      .map(t => {
        const techniques = t.techniques.filter(
          tech => buckets.get(tech.mitreId)?.has(bucket) ?? false,
        );
        const coveredCount = techniques.filter(tech => tech.covered).length;
        return {
          ...t,
          techniques,
          coveredCount,
          totalCount: techniques.length,
        };
      })
      .filter(t => t.totalCount > 0);
  }, [intel.tacticThreatCoverage, bucket, buckets]);

  const actionableGapCount = scopedGaps.filter(g => g.siemDetectable).length;
  const techniquesInScope = new Set(scopedMatrix.flatMap(t => t.techniques.map(tech => tech.mitreId))).size;

  if (feasibility.error || intel.error) {
    return <div role="alert" className="p-6 text-error">{feasibility.error || intel.error}</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        {/* Breadcrumb + Title */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => navigate(ROUTES.ACTION_PLAN)}
            className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-wider flex items-center gap-1"
          >
            <Icon name="arrow-left" className="w-3 h-3" /> Action Plan
          </button>
          <span className="text-outline">/</span>
          <h1 className="text-xs font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
            {BUCKET_LABELS[bucket]}
          </h1>
        </div>

        {/* Compact metrics bar */}
        <div
          className="rounded-xl px-6 py-4 mb-6 grid grid-cols-2 md:grid-cols-3 gap-4"
          style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}
        >
          <div>
            <div className="text-xl font-brand font-bold text-ext-teal leading-none tabular-nums">
              {scopedDetections.length.toLocaleString()}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              {BUCKET_LABELS[bucket]} Candidates
            </div>
            <div className="text-[8px] text-outline mt-0.5">relevant to your environment</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-coral leading-none tabular-nums">
              {actionableGapCount}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Coverage Gaps</div>
            <div className="text-[8px] text-outline mt-0.5">actionable</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-on-surface leading-none tabular-nums">
              {techniquesInScope}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Techniques in Scope
            </div>
            <div className="text-[8px] text-outline mt-0.5">used by your threat groups</div>
          </div>
        </div>

        {/* Top-N priority queue (scoped) */}
        <div className="mb-8">
          <DetectionActionQueue
            detections={scopedDetections}
            userQueryLanguages={userQueryLanguages}
            loading={isLoading}
          />
        </div>

        {/* Gaps + matrix */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <MiniMitreMatrix tacticCoverage={scopedMatrix} loading={isLoading} />
          </div>
          <div>
            <CriticalGapsList
              gaps={scopedGaps}
              crownJewels={profile.crown_jewels || []}
              loading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
