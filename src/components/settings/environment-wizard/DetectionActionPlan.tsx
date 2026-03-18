import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileIntelligence, SIEM_TO_QUERY_LANGUAGES } from '../../../hooks/useProfileIntelligence';
import { useFeasibilityLive } from './useFeasibilityLive';
import { scoreToGrade } from '../../../lib/quality/scoringEngine';
import { supabase } from '../../../lib/supabaseClient';
import { useToast } from '../../../hooks/useToast';
import { useAppData } from '../../../router/AppDataContext';
import { ROUTES } from '../../../router/routes';
import { DetectionActionQueue } from './DetectionActionQueue';
import { ThreatGroupCards } from './ThreatGroupCards';
import { CriticalGapsList } from './CriticalGapsList';
import { TacticCoverageHeatmap } from './TacticCoverageHeatmap';
import { MiniMitreMatrix } from './MiniMitreMatrix';
import { SiemReadinessBar } from './SiemReadinessBar';
import { Icon } from '../../Icon';
import { computeMissingLogSourceSuggestions } from '../../../services/logSourceDiscovery';
import type { EnvironmentProfile } from '../../../types/environment';

interface DetectionActionPlanProps {
  profile: EnvironmentProfile;
  onEditProfile: () => void;
}

// Ring chart constants
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R; // ~326.7

export const DetectionActionPlan: React.FC<DetectionActionPlanProps> = ({
  profile,
  onEditProfile,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { detections: libraryDetections, user } = useAppData();

  // Dismissed gap items (persisted in localStorage)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('optimus:action-plan:dismissed');
    return new Set(stored ? JSON.parse(stored) : []);
  });
  const [showDismissed, setShowDismissed] = useState(false);

  // Batch selection for gap items
  const [selectedGapIds, setSelectedGapIds] = useState<Set<string>>(new Set());

  const handleDismissGap = useCallback((techniqueId: string) => {
    const dismissed = JSON.parse(localStorage.getItem('optimus:action-plan:dismissed') || '[]');
    if (!dismissed.includes(techniqueId)) {
      dismissed.push(techniqueId);
      localStorage.setItem('optimus:action-plan:dismissed', JSON.stringify(dismissed));
      setDismissedIds(new Set(dismissed));
    }
  }, []);

  const handleRestoreGap = useCallback((techniqueId: string) => {
    const dismissed: string[] = JSON.parse(localStorage.getItem('optimus:action-plan:dismissed') || '[]');
    const updated = dismissed.filter(id => id !== techniqueId);
    localStorage.setItem('optimus:action-plan:dismissed', JSON.stringify(updated));
    setDismissedIds(new Set(updated));
  }, []);

  const handleBatchCreateDrafts = useCallback(async (techniqueIds: Set<string>, gapTechniques: Array<{ mitreId: string; name: string }>) => {
    if (techniqueIds.size === 0) return;
    if (!window.confirm(`Create ${techniqueIds.size} draft detections?`)) return;
    try {
      const inserts = [];
      for (const techId of techniqueIds) {
        const gap = gapTechniques.find(g => g.mitreId === techId);
        if (!gap) continue;
        inserts.push({
          id: crypto.randomUUID(),
          name: `Detection for ${gap.name} (${techId})`,
          status: 'Draft',
          mitreTechniques: [gap.name],
          mitreAttackIds: [techId],
          createdBy: user?.id || '',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          library: 'user',
        });
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('detections').insert(inserts);
        if (error) throw error;
      }
      showToast('success', 'Drafts Created', `Created ${inserts.length} draft detections`);
      setSelectedGapIds(new Set());
    } catch (err) {
      showToast('error', 'Failed', err instanceof Error ? err.message : 'Could not create drafts');
    }
  }, [user, showToast]);

  const feasibility = useFeasibilityLive(
    profile.log_sources,
    profile.custom_log_sources || [],
    profile.edr_tools || [],
    profile.cloud_platforms || {}
  );

  const intel = useProfileIntelligence(
    profile.sectors || [],
    profile.siem_platforms,
    feasibility.matchResult,
    profile.user_country || null,
    profile.threat_origin_countries || [],
    profile.crown_jewels || []
  );

  const isLoading = feasibility.loading || intel.loading;

  const userQueryLanguages = useMemo(() =>
    profile.siem_platforms.flatMap(s => SIEM_TO_QUERY_LANGUAGES[s] || []),
    [profile.siem_platforms]
  );

  const deployReadyDetections = useMemo(() =>
    intel.recommendedDetections.filter(d => userQueryLanguages.includes(d.queryLanguage)),
    [intel.recommendedDetections, userQueryLanguages]
  );

  const coveragePct = feasibility.totalCount > 0
    ? Math.round((feasibility.matchedCount / feasibility.totalCount) * 100)
    : 0;

  const ringOffset = RING_C * (1 - coveragePct / 100);

  // Top 50 prioritized detections for Week 1
  const top50 = useMemo(() => {
    return [...intel.recommendedDetections]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 50);
  }, [intel.recommendedDetections]);

  // Week 1 impact projection: what happens if top 50 are deployed
  const weekOneImpact = useMemo(() => {
    const currentTechIds = new Set<string>();
    for (const d of intel.recommendedDetections) {
      for (const id of d.mitreAttackIds) if (id) currentTechIds.add(id);
    }
    const top50TechIds = new Set<string>();
    for (const d of top50) {
      for (const id of d.mitreAttackIds) if (id) top50TechIds.add(id);
    }
    // Gaps that would be closed by top 50
    const gapsClosedCount = intel.gapTechniques.filter(g =>
      g.siemDetectable && top50TechIds.has(g.mitreId)
    ).length;
    return {
      techniquesAdded: top50TechIds.size,
      totalTechniques: currentTechIds.size,
      gapsClosed: gapsClosedCount,
      totalActionableGaps: intel.gapTechniques.filter(g => g.siemDetectable).length,
    };
  }, [intel.recommendedDetections, top50, intel.gapTechniques]);

  // Quality breakdown of top 50
  const qualityBreakdown = useMemo(() => {
    let good = 0, poor = 0;
    for (const d of top50) {
      const grade = scoreToGrade(d.qualityScore ?? 0);
      if (grade === 'A' || grade === 'B') good++;
      else if (grade === 'D' || grade === 'F') poor++;
    }
    return { good, poor, total: top50.length };
  }, [top50]);

  const handleAddTop50ToBacklog = async () => {
    const ids = top50.map(d => d.id);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from('detections')
        .update({ status: 'Backlog' })
        .in('id', ids);
      if (error) throw error;
      showToast('success', 'Added to Backlog', `${ids.length} detections added to pipeline backlog`);
      navigate(ROUTES.PIPELINE);
    } catch (err) {
      showToast('error', 'Failed', err instanceof Error ? err.message : 'Could not deploy');
    }
  };

  const sectorLabel = profile.sectors && profile.sectors.length > 0
    ? profile.sectors.slice(0, 2).join(', ') + (profile.sectors.length > 2 ? ` +${profile.sectors.length - 2}` : '')
    : profile.industry || null;

  // Profile labels
  const profileTags = [
    profile.sectors?.slice(0, 2).join(', '),
    profile.user_country,
    profile.siem_platforms.join(', '),
    `${(profile.log_sources || []).length} log sources`,
  ].filter(Boolean);

  // Unique technique count from matched detections
  const uniqueTechniqueCount = useMemo(() => {
    const set = new Set<string>();
    for (const d of intel.recommendedDetections) {
      for (const id of d.mitreAttackIds) if (id) set.add(id);
    }
    return set.size;
  }, [intel.recommendedDetections]);

  const sigmaCount = useMemo(() =>
    intel.recommendedDetections.filter(d => d.queryLanguage === 'Sigma').length,
    [intel.recommendedDetections]
  );

  const missingLogSourceSuggestions = useMemo(() => {
    if (!feasibility.matchResult) return [];
    return computeMissingLogSourceSuggestions(feasibility.matchResult.unmatchedByGroup);
  }, [feasibility.matchResult]);

  const actionableGapCount = intel.gapTechniques.filter(g => g.siemDetectable).length;

  // Build set of technique IDs that have at least one detection in progress (Development+)
  const coveredTechniqueIds = useMemo(() => {
    const covered = new Set<string>();
    for (const d of libraryDetections) {
      const status = (d.status || '').toLowerCase();
      if (['development', 'review', 'testing', 'production'].includes(status)) {
        const techIds = d.mitreAttackIds || d.mitreTechniques || [];
        for (const id of techIds) {
          if (id) covered.add(id);
        }
      }
    }
    return covered;
  }, [libraryDetections]);

  // Progress: how many gap techniques are already addressed
  const addressedCount = useMemo(() => {
    return intel.gapTechniques.filter(g => coveredTechniqueIds.has(g.mitreId)).length;
  }, [intel.gapTechniques, coveredTechniqueIds]);

  const totalGapItems = intel.gapTechniques.length;

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background scrollbar-page">
        <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
          {/* Skeleton hero */}
          <div className="rounded-2xl p-8 mb-8" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
            <div className="flex items-center gap-10">
              <div className="w-36 h-36 rounded-full bg-surface-container animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-6 w-64 bg-surface-container rounded animate-pulse" />
                <div className="h-4 w-96 bg-surface-container rounded animate-pulse" />
                <div className="flex gap-8 mt-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="space-y-2">
                      <div className="h-8 w-16 bg-surface-container rounded animate-pulse" />
                      <div className="h-3 w-20 bg-surface-container rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Skeleton sections */}
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-surface-container-high/50 animate-pulse mb-6" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">

        {/* ═══════════════════════════════════════════
            HEADER: Title + Profile Context
            ═══════════════════════════════════════════ */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xs font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
              Detection Action Plan
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {profileTags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[10px] text-on-surface-variant bg-surface-container">
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={onEditProfile}
              className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded px-2.5 py-1 transition-colors uppercase tracking-wider"
            >
              Edit
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            PROGRESS TRACKING
            ═══════════════════════════════════════════ */}
        <div className="flex items-center gap-4 mb-6 px-1">
          <div className="flex-1 bg-surface-container rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary rounded-full h-2 transition-all duration-500"
              style={{ width: `${totalGapItems > 0 ? (addressedCount / totalGapItems) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-on-surface-variant whitespace-nowrap">
            {addressedCount}/{totalGapItems} addressed
          </span>
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
            <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} className="rounded" />
            Show dismissed ({dismissedIds.size})
          </label>
        </div>

        {/* ═══════════════════════════════════════════
            HERO FUNNEL: Library → Relevant → Week 1 → Impact
            ═══════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-6 lg:p-8 mb-6 relative overflow-hidden"
          style={{
            backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))',
            backgroundImage: `radial-gradient(ellipse at 0% 50%, rgb(var(--md-ext-color-teal) / 0.06), transparent 60%)`,
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
            {/* Step 1: Library Total */}
            <div className="text-center lg:text-left">
              <div className="text-3xl font-brand font-bold text-on-surface-variant leading-none">
                {feasibility.totalCount.toLocaleString()}
              </div>
              <div className="text-[10px] font-bold text-outline uppercase tracking-wider mt-1">
                In Library
              </div>
            </div>

            {/* Arrow + Step 2: Relevant to You */}
            <div className="flex items-center gap-3">
              <Icon name="chevron-right" className="w-5 h-5 text-outline hidden lg:block flex-shrink-0" />
              <div className="flex items-center gap-3 flex-1">
                <div className="relative flex-shrink-0">
                  <svg viewBox="0 0 120 120" className="w-20 h-20">
                    <circle cx="60" cy="60" r={RING_R} fill="none" stroke="rgb(var(--md-sys-color-surface-container))" strokeWidth="7" />
                    <circle
                      cx="60" cy="60" r={RING_R} fill="none"
                      stroke="rgb(var(--md-ext-color-teal))" strokeWidth="7"
                      strokeDasharray={RING_C} strokeDashoffset={ringOffset}
                      strokeLinecap="round" transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-brand font-bold text-on-surface leading-none">{coveragePct}%</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-brand font-bold text-ext-teal leading-none">
                    {feasibility.matchedCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-ext-teal uppercase tracking-wider mt-0.5">
                    Relevant to You
                  </div>
                  <div className="text-[9px] text-on-surface-variant mt-0.5">
                    Compatible with your {(profile.log_sources || []).length} log sources
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow + Step 3: Week 1 Priority */}
            <div className="flex items-center gap-3">
              <Icon name="chevron-right" className="w-5 h-5 text-outline hidden lg:block flex-shrink-0" />
              <div
                className="flex-1 rounded-xl p-4"
                style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.08)' }}
              >
                <div className="text-2xl font-brand font-bold text-ext-teal leading-none">
                  Top {top50.length}
                </div>
                <div className="text-[10px] font-bold text-on-surface mt-0.5">
                  Week 1 Priority
                </div>
                <div className="text-[9px] text-on-surface-variant mt-0.5">
                  Highest impact detections to deploy first
                </div>
                <button
                  onClick={handleAddTop50ToBacklog}
                  className="mt-2.5 w-full py-1.5 rounded-lg font-bold text-[10px] tracking-wide uppercase transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--md-ext-color-teal)), rgb(var(--md-ext-color-cyan)))',
                    color: 'rgb(var(--md-ext-color-on-teal))',
                  }}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Icon name="plus" className="w-3 h-3" />
                    Add All to Backlog
                  </span>
                </button>
              </div>
            </div>

            {/* Arrow + Step 4: After Week 1 Impact */}
            <div className="flex items-center gap-3">
              <Icon name="chevron-right" className="w-5 h-5 text-outline hidden lg:block flex-shrink-0" />
              <div
                className="flex-1 rounded-xl p-4"
                style={{ backgroundColor: 'rgb(var(--md-ext-color-green) / 0.06)' }}
              >
                <div className="text-[10px] font-bold text-ext-green uppercase tracking-wider mb-2">
                  After Week 1
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant">Techniques covered</span>
                    <span className="text-[11px] font-mono font-bold text-on-surface">{weekOneImpact.techniquesAdded}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant">Gaps closed</span>
                    <span className="text-[11px] font-mono font-bold text-ext-green">
                      {weekOneImpact.gapsClosed}/{weekOneImpact.totalActionableGaps}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant">Quality</span>
                    <span className="text-[11px] font-mono font-bold text-on-surface">
                      {qualityBreakdown.good} A/B
                      {qualityBreakdown.poor > 0 && (
                        <span className="text-ext-coral ml-1">{qualityBreakdown.poor} D/F</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Missing log source suggestions */}
          {missingLogSourceSuggestions.length > 0 && (
            <div className="text-[10px] text-on-surface-variant mt-4 px-1">
              <span className="text-outline">Unlock more:</span>{' '}
              {missingLogSourceSuggestions.map((s, i) => (
                <span key={s.groupKey}>
                  {i > 0 && ', '}
                  Add <span className="font-bold text-on-surface">{s.groupLabel}</span> (+{s.additionalDetections})
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            KEY METRICS BAR
            ═══════════════════════════════════════════ */}
        <div
          className="rounded-xl px-6 py-4 mb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
          style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}
        >
          <div>
            <div className="text-xl font-brand font-bold text-ext-rose leading-none">{intel.threatGroups.length}</div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Threat Groups
            </div>
            {sectorLabel && <div className="text-[8px] text-outline mt-0.5">targeting {sectorLabel}</div>}
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-coral leading-none">{actionableGapCount}</div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Coverage Gaps
            </div>
            <div className="text-[8px] text-outline mt-0.5">actionable from SIEM</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-teal leading-none">{deployReadyDetections.length}</div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Native Queries
            </div>
            <div className="text-[8px] text-outline mt-0.5">no conversion needed</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-ext-indigo leading-none">{sigmaCount.toLocaleString()}</div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Sigma Convertible
            </div>
            <div className="text-[8px] text-outline mt-0.5">need conversion</div>
          </div>
          <div>
            <div className="text-xl font-brand font-bold text-on-surface leading-none">{uniqueTechniqueCount}</div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Techniques Covered
            </div>
            <div className="text-[8px] text-outline mt-0.5">unique MITRE ATT&CK</div>
          </div>
          <div>
            <div className={`text-xl font-brand font-bold leading-none ${
              qualityBreakdown.good >= qualityBreakdown.total * 0.6 ? 'text-ext-green' : 'text-ext-amber'
            }`}>
              {qualityBreakdown.total > 0 ? Math.round((qualityBreakdown.good / qualityBreakdown.total) * 100) : 0}%
            </div>
            <div className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-1">
              Quality A/B
            </div>
            <div className="text-[8px] text-outline mt-0.5">of top {top50.length} detections</div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            PRIORITY QUEUE
            ═══════════════════════════════════════════ */}
        <div className="mb-8">
          <DetectionActionQueue
            detections={intel.recommendedDetections}
            userQueryLanguages={userQueryLanguages}
            loading={isLoading}
          />
        </div>

        {/* ═══════════════════════════════════════════
            THREAT LANDSCAPE: Groups + Gaps
            ═══════════════════════════════════════════ */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-[10px] font-brand font-bold text-on-surface-variant tracking-[0.2em] uppercase">
              Threat Landscape
            </h2>
            <div className="text-[9px] text-outline mt-0.5">
              Based on MITRE ATT&CK threat intelligence data
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3">
              <ThreatGroupCards
                groups={intel.threatGroups}
                groupTechniqueDetails={intel.groupTechniqueDetails}
                sectorLabel={sectorLabel}
                loading={isLoading}
              />
            </div>
            <div className="xl:col-span-2">
              <CriticalGapsList
                gaps={intel.gapTechniques}
                crownJewels={profile.crown_jewels || []}
                loading={isLoading}
                coveredTechniqueIds={coveredTechniqueIds}
                dismissedIds={dismissedIds}
                showDismissed={showDismissed}
                onDismiss={handleDismissGap}
                onRestore={handleRestoreGap}
                selectedIds={selectedGapIds}
                onSelectionChange={setSelectedGapIds}
                onBatchCreateDrafts={handleBatchCreateDrafts}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            MITRE ATT&CK THREAT MATRIX: Technique-level coverage
            ═══════════════════════════════════════════ */}
        <div className="mb-8">
          <MiniMitreMatrix
            tacticCoverage={intel.tacticThreatCoverage}
            loading={isLoading}
          />
        </div>

        {/* ═══════════════════════════════════════════
            COVERAGE POSTURE: MITRE Heatmap + SIEM
            ═══════════════════════════════════════════ */}
        <div>
          <h2 className="text-[10px] font-brand font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-4">
            Coverage Posture
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <TacticCoverageHeatmap
                tacticBreakdown={feasibility.tacticBreakdown}
                totalMatchedDetections={feasibility.matchedCount}
                loading={feasibility.loading}
              />
            </div>
            <div>
              <SiemReadinessBar
                readiness={intel.siemReadiness}
                totalMatched={feasibility.matchedCount}
                loading={isLoading}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
