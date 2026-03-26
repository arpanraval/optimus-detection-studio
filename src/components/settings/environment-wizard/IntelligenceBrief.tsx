import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { supabase } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import { useProfileIntelligence } from '../../../hooks/useProfileIntelligence';
import { useFeasibilityLive } from './useFeasibilityLive';
import { IntelligenceStats } from './IntelligenceStats';
import { PriorityDetectionsTable } from './PriorityDetectionsTable';
import { ThreatGroupCards } from './ThreatGroupCards';
import { SiemReadinessBar } from './SiemReadinessBar';
import { TacticCoverageHeatmap } from './TacticCoverageHeatmap';
import { CoverageGapsList } from './CoverageGapsList';
import { Icon } from '../../Icon';
import type { EnvironmentProfile } from '../../../types/environment';

interface IntelligenceBriefProps {
  profile: EnvironmentProfile;
  onEditProfile: () => void;
  showSavedBadge?: boolean;
}

export const IntelligenceBrief: React.FC<IntelligenceBriefProps> = ({
  profile, onEditProfile, showSavedBadge = false,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);

  // v2: pass group keys instead of old log source names
  const feasibility = useFeasibilityLive(
    profile.log_sources,
    profile.custom_log_sources || [],
    profile.edr_tools || [],
    profile.cloud_platforms || {}
  );

  // v2: pass sectors, country, matchResult, crown jewels
  const intel = useProfileIntelligence(
    profile.sectors || [],
    profile.siem_platforms,
    feasibility.matchResult,
    profile.user_country || null,
    profile.threat_origin_countries || [],
    profile.crown_jewels || []
  );

  const handleAddToPipeline = useCallback(async (detectionIds: string[]) => {
    try {
      const { error } = await supabase
        .from('detections')
        .update({ status: 'Backlog' })
        .in('id', detectionIds)
        .in('status', ['Draft', 'Development']);

      if (error) throw error;
      showToast('success', 'Added to Pipeline', `${detectionIds.length} detection${detectionIds.length !== 1 ? 's' : ''} moved to Backlog`);
    } catch (err) {
      showToast('error', 'Failed', err instanceof Error ? err.message : 'Could not update detections');
    }
  }, [showToast]);

  const handleGenerateDeployQueue = useCallback(async () => {
    setIsGeneratingQueue(true);
    try {
      const top25Ids = intel.recommendedDetections.slice(0, 25).map(d => d.id);
      if (top25Ids.length === 0) {
        showToast('error', 'No Detections', 'No recommended detections available');
        return;
      }

      const { error } = await supabase
        .from('detections')
        .update({ status: 'Backlog' })
        .in('id', top25Ids);

      if (error) throw error;
      showToast('success', 'Deploy Queue Generated',
        `${top25Ids.length} priority detections added to your pipeline backlog`);
      navigate(ROUTES.DETECTION_BOARD);
    } catch (err) {
      showToast('error', 'Failed', err instanceof Error ? err.message : 'Could not generate queue');
    } finally {
      setIsGeneratingQueue(false);
    }
  }, [intel.recommendedDetections, showToast, navigate]);

  const handleViewAll = useCallback(() => {
    navigate(`${ROUTES.LIBRARY}?severity=Critical,High`);
  }, [navigate]);

  const isLoading = feasibility.loading || intel.loading;
  const siemMatchCount = intel.siemReadiness.reduce((sum, s) => sum + s.nativeCount, 0);

  // Build header text from profile
  const headerLabel = profile.sectors && profile.sectors.length > 0
    ? `${profile.sectors.slice(0, 2).join(', ')}${profile.sectors.length > 2 ? ` +${profile.sectors.length - 2}` : ''}`
    : profile.industry || 'Environment';
  const countryLabel = profile.user_country ? ` (${profile.user_country})` : '';

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="px-4 lg:px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {showSavedBadge && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary/10 border border-tertiary/20 text-tertiary text-[10px] font-brand font-bold uppercase tracking-wider flex-shrink-0">
                <Icon name="check-circle" className="w-3 h-3" />
                Saved
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
                {headerLabel}{countryLabel} Threat Intelligence
              </h1>
              <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                {intel.totalRecommended.toLocaleString()} detections cross-referenced with {intel.threatGroups.length} threat groups
              </p>
            </div>
          </div>
          <button
            onClick={onEditProfile}
            className="text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors tracking-wide flex-shrink-0"
          >
            EDIT PROFILE
          </button>
        </div>

        {/* Row 1: Stat Tiles (6-col) */}
        <div className="mb-2">
          <IntelligenceStats
            threatGroupCount={intel.threatGroups.length}
            recommendedCount={intel.totalRecommended}
            gapCount={intel.gapTechniqueCount}
            matchedCount={feasibility.matchedCount}
            totalDetections={feasibility.totalCount}
            siemMatchCount={siemMatchCount}
            loading={isLoading}
          />
        </div>

        {/* Row 2: Priority Detections + Threat Actors (2-col split) */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-1.5 mb-2">
          <div className="xl:col-span-3">
            <PriorityDetectionsTable
              detections={intel.recommendedDetections}
              totalCount={intel.totalRecommended}
              onAddToPipeline={handleAddToPipeline}
              onViewAll={handleViewAll}
              loading={isLoading}
            />
          </div>
          <div className="xl:col-span-2">
            <ThreatGroupCards
              groups={intel.threatGroups}
              groupTechniqueDetails={intel.groupTechniqueDetails}
              sectorLabel={profile.sectors.length > 0 ? profile.sectors.join(', ') : null}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Row 3: Tactic Heatmap (full width) */}
        <div className="mb-2">
          <TacticCoverageHeatmap
            tacticBreakdown={feasibility.tacticBreakdown}
            totalMatchedDetections={feasibility.matchedCount}
            loading={feasibility.loading}
          />
        </div>

        {/* Row 4: SIEM Readiness + Coverage Gaps + Deploy CTA (3-col) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 mb-2">
          <SiemReadinessBar
            readiness={intel.siemReadiness}
            totalMatched={feasibility.matchedCount}
            loading={isLoading}
          />
          <CoverageGapsList
            gaps={intel.gapTechniques}
            loading={isLoading}
          />
          {/* Deploy Queue CTA */}
          <div
            className="rounded-2xl p-5 flex flex-col justify-between"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-lowest))' }}
          >
            <div>
              <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">
                Deploy Queue
              </span>
              <p className="text-[11px] text-on-surface-variant/50 mt-2">
                Add the top 25 priority detections to your pipeline backlog for immediate deployment.
              </p>
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                  {intel.recommendedDetections.filter(d => d.severity === 'Critical').length} Critical detections
                </div>
                <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                  {intel.recommendedDetections.filter(d => d.severity === 'High').length} High detections
                </div>
                <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {siemMatchCount} SIEM-native rules
                </div>
              </div>
            </div>
            <button
              onClick={handleGenerateDeployQueue}
              disabled={isGeneratingQueue || intel.recommendedDetections.length === 0}
              className="w-full mt-4 px-3 py-2.5 text-xs font-semibold text-on-primary bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeneratingQueue ? (
                <>
                  <div className="animate-spin w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full" />
                  Generating...
                </>
              ) : (
                <>
                  <Icon name="zap" className="w-3.5 h-3.5" />
                  Generate Deploy Queue
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
