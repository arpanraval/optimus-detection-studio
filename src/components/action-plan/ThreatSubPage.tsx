import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeasibilityLive } from '../settings/environment-wizard/useFeasibilityLive';
import { useProfileIntelligence, SIEM_TO_QUERY_LANGUAGES } from '../../hooks/useProfileIntelligence';
import { DetectionActionQueue } from '../settings/environment-wizard/DetectionActionQueue';
import { CriticalGapsList } from '../settings/environment-wizard/CriticalGapsList';
import { Icon } from '../Icon';
import { ROUTES } from '../../router/routes';
import {
  filterDetectionsByThreatGroup,
  filterGapsByThreatGroup,
} from './scopedActionPlan';
import type { EnvironmentProfile } from '../../types/environment';

interface Props {
  profile: EnvironmentProfile;
  slug: string;
}

const COUNTRY_RE = /^[A-Z]{2}$/;

export const ThreatSubPage: React.FC<Props> = ({ profile, slug }) => {
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

  const isLoading = feasibility.loading || intel.loading;

  const isCountry = COUNTRY_RE.test(slug);

  const matchedGroups = useMemo(() => {
    if (isCountry) return intel.threatGroups.filter(g => g.originCountryCode === slug);
    return intel.threatGroups.filter(g => g.stixId === slug || g.name === slug);
  }, [intel.threatGroups, slug, isCountry]);

  const groupNames = useMemo(() => matchedGroups.map(g => g.name), [matchedGroups]);

  const userQueryLanguages = useMemo(
    () => profile.siem_platforms.flatMap(s => SIEM_TO_QUERY_LANGUAGES[s] || []),
    [profile.siem_platforms],
  );

  const scopedDetections = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof intel.recommendedDetections = [];
    for (const name of groupNames) {
      for (const d of filterDetectionsByThreatGroup(intel.recommendedDetections, name)) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          out.push(d);
        }
      }
    }
    return out;
  }, [intel.recommendedDetections, groupNames]);

  const scopedGaps = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof intel.gapTechniques = [];
    for (const name of groupNames) {
      for (const g of filterGapsByThreatGroup(intel.gapTechniques, name)) {
        if (!seen.has(g.mitreId)) {
          seen.add(g.mitreId);
          out.push(g);
        }
      }
    }
    return out;
  }, [intel.gapTechniques, groupNames]);

  const headerLabel = isCountry
    ? `Threat actors from ${slug}`
    : matchedGroups[0]?.name ?? slug;

  const actionableGapCount = scopedGaps.filter(g => g.siemDetectable).length;

  const breadcrumb = (
    <div className="flex items-center gap-2 mb-6">
      <button
        onClick={() => navigate(ROUTES.ACTION_PLAN)}
        className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-wider flex items-center gap-1"
      >
        <Icon name="arrow-left" className="w-3 h-3" /> Action Plan
      </button>
      <span className="text-outline">/</span>
      <h1 className="text-xs font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
        {headerLabel}
      </h1>
    </div>
  );

  if (!isLoading && matchedGroups.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-background scrollbar-page">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          {breadcrumb}
          <p className="text-on-surface-variant">
            No threat groups matching <span className="font-mono">{slug}</span> for your profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
        {breadcrumb}

        {/* Compact metrics bar */}
        <div
          className="rounded-xl px-6 py-4 mb-6 grid grid-cols-2 md:grid-cols-3 gap-4"
          style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}
        >
          <div>
            <div className="text-xl font-brand font-bold text-ext-rose leading-none tabular-nums">
              {matchedGroups.length}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Threat Groups</div>
            {isCountry && (
              <div className="text-[8px] text-outline mt-0.5">in {slug}</div>
            )}
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-teal leading-none tabular-nums">
              {scopedDetections.length.toLocaleString()}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Matching Detections</div>
            <div className="text-[8px] text-outline mt-0.5">covering this scope</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-coral leading-none tabular-nums">
              {actionableGapCount}
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">Coverage Gaps</div>
            <div className="text-[8px] text-outline mt-0.5">actionable</div>
          </div>
        </div>

        <div className="mb-8">
          <DetectionActionQueue
            detections={scopedDetections}
            userQueryLanguages={userQueryLanguages}
            loading={isLoading}
          />
        </div>

        <CriticalGapsList
          gaps={scopedGaps}
          crownJewels={profile.crown_jewels || []}
          loading={isLoading}
        />
      </div>
    </div>
  );
};
