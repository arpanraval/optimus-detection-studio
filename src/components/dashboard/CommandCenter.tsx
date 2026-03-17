import React, { useMemo, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Detection } from '../../types';
import { useLibrary } from '../../context/LibraryContext';
import { useDefensivePosture, useThreatActorWeights } from '../../hooks/useImpactScores';
import { useCommandCenterData, ThreatLandscapeEntry, CampaignReadiness as CampaignReadinessType, SectorCoverage, OriginCoverage } from '../../hooks/useCommandCenterData';
import { useMitreMatrix } from '../../hooks/useMitreMatrix';
import { useActivityLog } from '../../hooks/useActivityLog';
import { AnimatedNumber } from '../optimus/AnimatedNumber';
import { EmptyState } from '../ui';

const TACTICS = [
  { id: 'TA0043', name: 'Reconnaissance', totalTechniques: 10 },
  { id: 'TA0042', name: 'Resource Development', totalTechniques: 8 },
  { id: 'TA0001', name: 'Initial Access', totalTechniques: 10 },
  { id: 'TA0002', name: 'Execution', totalTechniques: 14 },
  { id: 'TA0003', name: 'Persistence', totalTechniques: 20 },
  { id: 'TA0004', name: 'Privilege Escalation', totalTechniques: 14 },
  { id: 'TA0005', name: 'Defense Evasion', totalTechniques: 43 },
  { id: 'TA0006', name: 'Credential Access', totalTechniques: 17 },
  { id: 'TA0007', name: 'Discovery', totalTechniques: 32 },
  { id: 'TA0008', name: 'Lateral Movement', totalTechniques: 9 },
  { id: 'TA0009', name: 'Collection', totalTechniques: 17 },
  { id: 'TA0011', name: 'Command & Control', totalTechniques: 16 },
  { id: 'TA0010', name: 'Exfiltration', totalTechniques: 9 },
  { id: 'TA0040', name: 'Impact', totalTechniques: 14 },
];

interface CommandCenterProps {
  detections: Detection[];
  onNavigate: (view: string, filter?: any) => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ detections, onNavigate }) => {
  const { isLoading, userId } = useLibrary();
  const location = useLocation();
  const { posture, loading: postureLoading } = useDefensivePosture(userId);
  const { actors, loading: actorsLoading } = useThreatActorWeights();
  const { campaignReadiness, threatLandscape, sectorCoverage, originCoverage, coverageTrend, error: dataError } = useCommandCenterData(actors, detections, posture?.total_techniques);
  const { techniques: mitreTechniques, loading: mitreLoading } = useMitreMatrix();
  const { activities, isLoading: activityLoading } = useActivityLog({ limit: 8, autoFetch: true });
  const supaLoading = postureLoading || actorsLoading;

  const stats = useMemo(() => {
    const total = detections.length;
    if (total === 0) return null;
    const production = detections.filter(d => d.status === 'Production').length;
    const validated = detections.filter(d => d.testedAndValidated).length;
    const qualityTotal = detections.reduce((s, d) => s + (d.qualityScore || 0), 0);
    const byTactic: Record<string, number> = {};
    // Build a lookup from normalized tactic name → tactic ID
    const tacticLookup = new Map<string, string>();
    TACTICS.forEach(t => {
      tacticLookup.set(t.name.toLowerCase().replace(/ /g, '-'), t.id);
      tacticLookup.set(t.name.toLowerCase(), t.id);
      tacticLookup.set(t.name, t.id);
    });
    // Also map legacy short names
    tacticLookup.set('resource dev', 'TA0042');
    tacticLookup.set('resource-dev', 'TA0042');
    tacticLookup.set('priv escalation', 'TA0004');
    tacticLookup.set('priv-escalation', 'TA0004');
    tacticLookup.set('c2', 'TA0011');
    tacticLookup.set('command-and-control', 'TA0011');

    const byLanguage: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byLogSource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    // Unique techniques per tactic (for coverage fractions)
    const tacticTechniques: Record<string, Set<string>> = {};

    detections.forEach(d => {
      const tacticIds: string[] = [];
      (d.mitreTactics || []).forEach(t => {
        const id = tacticLookup.get(t) || tacticLookup.get(t.toLowerCase()) || tacticLookup.get(t.toLowerCase().replace(/ /g, '-'));
        if (id) {
          byTactic[id] = (byTactic[id] || 0) + 1;
          tacticIds.push(id);
        }
      });
      // Associate this detection's techniques with its tactics
      if (tacticIds.length > 0 && d.mitreAttackIds) {
        for (const tacId of tacticIds) {
          if (!tacticTechniques[tacId]) tacticTechniques[tacId] = new Set();
          for (const techId of d.mitreAttackIds) {
            tacticTechniques[tacId].add(techId);
          }
        }
      }
      if (d.queryLanguage) byLanguage[d.queryLanguage] = (byLanguage[d.queryLanguage] || 0) + 1;
      (d.platforms || []).forEach(p => { byPlatform[p] = (byPlatform[p] || 0) + 1; });
      if (d.severity) bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      (d.logSources || []).forEach(ls => { byLogSource[ls] = (byLogSource[ls] || 0) + 1; });
      if (d.status) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    });
    // Convert technique sets to counts
    const tacticTechCount: Record<string, number> = {};
    for (const [tacId, techSet] of Object.entries(tacticTechniques)) {
      tacticTechCount[tacId] = techSet.size;
    }
    return { total, production, validated, qualityAvg: Math.round(qualityTotal / total), byTactic, tacticTechCount, byLanguage, byPlatform, bySeverity, byLogSource, byStatus };
  }, [detections]);

  // Velocity sparkline: bucket detections by week (last 12 weeks)
  const velocityData = useMemo(() => {
    if (detections.length === 0) return [];
    const now = new Date();
    const weeks = 12;
    const buckets = new Array(weeks).fill(0);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const cutoff = now.getTime() - weeks * msPerWeek;

    detections.forEach(d => {
      if (!d.createdDate) return;
      const ts = new Date(d.createdDate).getTime();
      if (ts < cutoff) return;
      const weekIdx = Math.min(Math.floor((now.getTime() - ts) / msPerWeek), weeks - 1);
      buckets[weeks - 1 - weekIdx]++;
    });
    return buckets;
  }, [detections]);
  const userTechniqueIds = useMemo(() => {
    const ids = new Set<string>();
    detections.forEach(d => (d.mitreAttackIds || []).forEach(id => ids.add(id)));
    return ids;
  }, [detections]);

  if (!isLoading && detections.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-background p-6">
        <div className="mx-auto max-w-xl">
          <EmptyState icon="dashboard" title="No detections yet"
            description="Your command center activates when you start building detection content."
            action={{ label: "New Detection", onClick: () => onNavigate('add_selection'), icon: "plus" }}
            secondaryAction={{ label: "Bulk Import", onClick: () => onNavigate('bulk_import') }}
            size="lg" />
        </div>
      </div>
    );
  }

  const groups = posture?.groups_defended ?? 0;
  const totalGroups = posture?.total_groups ?? 0;
  const campaigns = posture?.campaigns_defended ?? 0;
  const totalCampaigns = posture?.total_campaigns ?? 0;
  const techCovered = posture?.techniques_covered ?? 0;
  const totalTech = posture?.total_techniques ?? 648;
  const techPct = posture?.technique_coverage_pct ?? 0;
  const groupPct = totalGroups > 0 ? Math.round((groups / totalGroups) * 100) : 0;
  const campPct = totalCampaigns > 0 ? Math.round((campaigns / totalCampaigns) * 100) : 0;
  const readiness = Math.round(groupPct * 0.3 + campPct * 0.2 + techPct * 0.3 + Math.min((stats?.total ?? 0) / 5, 20));
  const prodPct = stats ? Math.round((stats.production / stats.total) * 100) : 0;
  const valPct = stats ? Math.round((stats.validated / stats.total) * 100) : 0;

  const hasActors = threatLandscape.length > 0;
  const hasCampaigns = campaignReadiness.length > 0;
  const topGaps = posture?.top_gaps ?? [];

  return (
    <div className="h-full overflow-y-auto bg-background scrollbar-page animate-page-enter">
      <div className="px-4 lg:px-6 py-4">

        <div className="flex justify-end mb-3">
          <TabSwitcher currentPath={location.pathname} />
        </div>

        {dataError && (
          <div className="bg-error-container text-on-error-container rounded-2xl px-5 py-3 flex items-center gap-3 mb-2">
            <span className="text-sm font-medium">{dataError}</span>
            <button onClick={() => window.location.reload()} className="ml-auto text-sm font-bold underline">Retry</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            QUICK ACTIONS BAR
            ═══════════════════════════════════════════ */}
        <QuickActionsBar onNavigate={onNavigate} />

        {/* ═══════════════════════════════════════════
            HERO — Centered readiness badge
            ═══════════════════════════════════════════ */}
        <div className="bg-surface-container-lowest rounded-2xl p-8 mb-2 flex flex-col items-center">
          <ReadinessBadge
            value={readiness}
            loading={supaLoading && !posture}
            breakdown={[
              { label: 'Groups', value: Math.round(groupPct * 0.3), weight: '30%' },
              { label: 'Techniques', value: Math.round(techPct * 0.3), weight: '30%' },
              { label: 'Campaigns', value: Math.round(campPct * 0.2), weight: '20%' },
              { label: 'Volume', value: Math.round(Math.min((stats?.total ?? 0) / 5, 20)), weight: '20%' },
            ]}
          />
          <p className="text-[13px] text-on-surface-variant/50 mt-5 text-center max-w-xl font-brand font-medium tracking-wide">
            Defending <span className="text-primary font-bold">{groups}</span>
            <span className="text-on-surface-variant/25">/{totalGroups}</span> threat groups
            {' · '}<span className="text-primary font-bold">{campaigns}</span>
            <span className="text-on-surface-variant/25">/{totalCampaigns}</span> campaigns
            {' · '}<span className="text-primary font-bold">{techPct}%</span> technique coverage
          </p>
        </div>

        {/* ═══════════════════════════════════════════
            STATS — Bold number tiles, no gauges
            ═══════════════════════════════════════════ */}
        {postureLoading ? (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 animate-pulse">
                <div className="h-8 bg-surface-container-high rounded w-16 mb-2" />
                <div className="h-4 bg-surface-container-high rounded w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-2">
            <StatTile label="Techniques" value={techCovered} total={totalTech} onClick={() => onNavigate('mitre')} />
            <StatTile label="Groups" value={groups} total={totalGroups} onClick={() => onNavigate('coverage')} />
            <StatTile label="Campaigns" value={campaigns} total={totalCampaigns} onClick={() => onNavigate('coverage')} />
            <StatTile label="Production" value={stats?.production ?? 0} total={stats?.total} onClick={() => onNavigate('library', { status: 'Production' })} />
            <StatTile label="Validated" value={stats?.validated ?? 0} total={stats?.total} onClick={() => onNavigate('library', { testedAndValidated: 'true' })} />
            <StatTile label="Quality" value={stats?.qualityAvg ?? 0} suffix="%" onClick={() => onNavigate('library', { qualityGrade: 'A' })} />
          </div>
        )}

        {/* ═══════════════════════════════════════════
            COVERAGE TREND — 12-month technique coverage
            ═══════════════════════════════════════════ */}
        <CoverageTrendChart data={coverageTrend} />

        {/* ═══════════════════════════════════════════
            VELOCITY — Detection creation trend (12 weeks)
            ═══════════════════════════════════════════ */}
        {velocityData.length > 0 && velocityData.some(v => v > 0) && (
          <VelocitySparkline data={velocityData} />
        )}

        {/* ═══════════════════════════════════════════
            INTEL — Actors, Campaigns, Sectors, Origins
            ═══════════════════════════════════════════ */}
        {supaLoading && !hasActors && !hasCampaigns ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-1.5 mb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-surface-container-high rounded w-24 mb-4" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-3 bg-surface-container-high rounded w-full mb-2" />
                ))}
              </div>
            ))}
          </div>
        ) : (hasActors || hasCampaigns || sectorCoverage.length > 0 || originCoverage.length > 0) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-1.5 mb-2">
            {hasActors && <ThreatActorsPanel entries={threatLandscape} onNavigate={onNavigate} />}
            {hasCampaigns && <CampaignPanel campaigns={campaignReadiness} onNavigate={onNavigate} />}
            {sectorCoverage.length > 0 && <SectorPanel sectors={sectorCoverage} onNavigate={onNavigate} />}
            {originCoverage.length > 0 && <OriginPanel origins={originCoverage} onNavigate={onNavigate} />}
          </div>
        ) : !supaLoading && stats && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 mb-2 text-center">
            <p className="text-[12px] font-brand font-medium text-on-surface-variant/40 tracking-wide">
              Sync MITRE ATT&CK data to unlock threat actor tracking, campaign readiness, sector coverage, and origin analysis.
            </p>
            <button
              onClick={() => onNavigate('mitre_data_sync')}
              className="mt-3 text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors tracking-wider uppercase"
            >
              Go to Data Sync →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            MATURITY + ACTIVITY — side by side
            ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-2">
          <MaturityRadar detections={detections} posture={posture} />
          <RecentActivityPanel activities={activities} detections={detections} isLoading={activityLoading} onNavigate={onNavigate} />
        </div>

        {/* ═══════════════════════════════════════════
            SLA PIPELINE + PLATFORM COVERAGE
            ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 mb-2">
          <SLAPipeline detections={detections} onNavigate={onNavigate} />
          <PlatformCoverageMatrix detections={detections} onNavigate={onNavigate} />
        </div>

        {/* ═══════════════════════════════════════════
            DISTRIBUTIONS — Language, Platform, Severity
            ═══════════════════════════════════════════ */}
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-2">
              <DistributionPanel title="Query Languages" data={stats.byLanguage} onItemClick={(lang) => onNavigate('library', { queryLanguage: lang })} />
              <DistributionPanel title="Platforms" data={stats.byPlatform} onItemClick={(plat) => onNavigate('library', { platform: plat })} />
              <SeverityPanel data={stats.bySeverity} onItemClick={(sev) => onNavigate('library', { severity: sev })} />
              <DistributionPanel title="Log Sources" data={stats.byLogSource} onItemClick={(ls) => onNavigate('library', { logSource: ls })} />
              <DistributionPanel title="Pipeline" data={stats.byStatus} onItemClick={(status) => onNavigate('library', { status })} />
              {topGaps.length > 0 && <GapsPanel gaps={topGaps} onNavigate={onNavigate} />}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════
            CONTRIBUTORS + ASSIGNMENTS + STALE WATCHLIST
            ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 mb-2">
          <TopContributors detections={detections} onNavigate={onNavigate} />
          <MyAssignmentsPanel detections={detections} userId={userId} onNavigate={onNavigate} />
          <StaleWatchlist detections={detections} onNavigate={onNavigate} />
        </div>

        {/* ═══════════════════════════════════════════
            HYGIENE ALERTS — actionable nudges
            ═══════════════════════════════════════════ */}
        <HygieneAlerts detections={detections} onNavigate={onNavigate} />

        {/* ═══════════════════════════════════════════
            ATT&CK COVERAGE — visual heat strips
            ═══════════════════════════════════════════ */}
        <div className="bg-surface-container-lowest rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">ATT&CK Coverage</span>
            <button onClick={() => onNavigate('mitre')} className="text-[11px] font-brand font-bold text-primary hover:text-primary/70 transition-colors tracking-wide">
              VIEW MATRIX →
            </button>
          </div>
          {/* Kill chain grid — 7 columns, 2 rows */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-1.5">
            {TACTICS.map((tac, i) => {
              const detectionCount = stats?.byTactic[tac.id] || 0;
              // Cap at totalTechniques since our counting over-attributes cross-tactic techniques
              const techsCovered = Math.min(stats?.tacticTechCount[tac.id] || 0, tac.totalTechniques);
              const coveragePct = tac.totalTechniques > 0 ? techsCovered / tac.totalTechniques : 0;
              return (
                <div
                  key={tac.id}
                  onClick={() => onNavigate('library', { tactic: tac.name })}
                  className="cursor-pointer group rounded-lg p-3 transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.10)',
                    opacity: 0,
                    animation: `slideUp 250ms ease ${i * 30}ms forwards`,
                  }}
                >
                  {/* Top row: tactic name (left) + technique fraction (right) */}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[11px] font-medium text-on-surface/80 leading-tight">
                      {tac.name}
                    </span>
                    <span className="text-[10px] font-brand font-bold text-on-surface-variant/50 ml-1 flex-shrink-0">
                      {techsCovered}/{tac.totalTechniques}
                    </span>
                  </div>
                  {/* Big number: rule count */}
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-brand font-bold ${detectionCount > 0 ? 'text-primary' : 'text-on-surface-variant/15'}`}>
                      {detectionCount}
                    </span>
                    <span className="text-[11px] font-medium text-on-surface-variant/50">rules</span>
                  </div>
                  {/* Coverage bar */}
                  <div className="h-1.5 rounded-full mt-2 bg-primary/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${coveragePct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            MINI MITRE HEATMAP — full width technique grid
            ═══════════════════════════════════════════ */}
        <MiniMitreHeatmap techniques={mitreTechniques} coveredTechniqueIds={userTechniqueIds} loading={mitreLoading} onNavigate={onNavigate} />

      </div>
    </div>
  );
};

// ============================================================================
// MINI MITRE HEATMAP — compact colored grid per tactic
// ============================================================================

const TACTIC_SHORTNAMES = [
  { short: 'Reconnaissance', phase: 'reconnaissance' },
  { short: 'Resource Development', phase: 'resource-development' },
  { short: 'Initial Access', phase: 'initial-access' },
  { short: 'Execution', phase: 'execution' },
  { short: 'Persistence', phase: 'persistence' },
  { short: 'Privilege Escalation', phase: 'privilege-escalation' },
  { short: 'Defense Evasion', phase: 'defense-evasion' },
  { short: 'Credential Access', phase: 'credential-access' },
  { short: 'Discovery', phase: 'discovery' },
  { short: 'Lateral Movement', phase: 'lateral-movement' },
  { short: 'Collection', phase: 'collection' },
  { short: 'Command & Control', phase: 'command-and-control' },
  { short: 'Exfiltration', phase: 'exfiltration' },
  { short: 'Impact', phase: 'impact' },
];

const MiniMitreHeatmap: React.FC<{
  techniques: { mitre_id: string | null; data: Record<string, any> }[];
  coveredTechniqueIds: Set<string>;
  loading: boolean;
  onNavigate?: (view: string, filter?: any) => void;
}> = ({ techniques, coveredTechniqueIds, loading, onNavigate }) => {
  const tacticRows = useMemo(() => {
    if (techniques.length === 0) return [];

    const grouped: Record<string, { id: string; name: string; covered: boolean }[]> = {};
    TACTIC_SHORTNAMES.forEach(t => { grouped[t.phase] = []; });

    // Only include parent techniques (no sub-techniques like T1059.001)
    for (const tech of techniques) {
      if (!tech.mitre_id || tech.mitre_id.includes('.')) continue;
      const phases: { phase_name: string }[] = tech.data?.kill_chain_phases || [];
      for (const p of phases) {
        if (grouped[p.phase_name]) {
          grouped[p.phase_name].push({
            id: tech.mitre_id,
            name: tech.data?.name || tech.mitre_id,
            covered: coveredTechniqueIds.has(tech.mitre_id),
          });
        }
      }
    }

    return TACTIC_SHORTNAMES.map(t => {
      const techs = grouped[t.phase] || [];
      const coveredCount = techs.filter(tt => tt.covered).length;
      return { label: t.short, phase: t.phase, techniques: techs, coveredCount };
    });
  }, [techniques, coveredTechniqueIds]);

  if (loading || tacticRows.length === 0) return null;

  const totalParent = tacticRows.reduce((s, r) => s + r.techniques.length, 0);
  const totalCovered = tacticRows.reduce((s, r) => s + r.coveredCount, 0);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-6 mt-2">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">MITRE ATT&CK Heatmap</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">
          {totalCovered}/{totalParent} parent techniques
        </span>
      </div>
      <div className="space-y-2.5">
        {tacticRows.map(row => (
          <div key={row.phase} className="flex items-start gap-4">
            {/* Tactic label — height matches first row of 16px cells */}
            <div className="w-36 flex-shrink-0 text-right" style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span className="text-[10px] font-brand font-bold text-on-surface-variant/50 tracking-wide leading-none">{row.label}</span>
            </div>
            {/* Coverage fraction */}
            <div className="w-8 flex-shrink-0 text-right" style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span className="text-[10px] font-brand font-bold text-primary/60">{row.coveredCount}</span>
            </div>
            {/* Technique cells */}
            <div className="flex flex-wrap gap-[3px] flex-1">
              {row.techniques.map((tech, i) => (
                <div
                  key={`${tech.id}-${i}`}
                  onClick={() => onNavigate?.('library', { technique: tech.id })}
                  className={`rounded transition-opacity hover:opacity-80 ${onNavigate ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{
                    width: 16,
                    height: 16,
                    backgroundColor: tech.covered
                      ? 'rgb(var(--md-sys-color-primary))'
                      : 'rgb(var(--md-sys-color-on-surface) / 0.07)',
                  }}
                  title={`${tech.id}: ${tech.name}${tech.covered ? ' ✓' : ''}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// HYGIENE ALERTS — actionable nudges
// ============================================================================

interface HygieneAlert {
  key: string;
  count: number;
  label: string;
  filterView: string;
  filterParams: any;
}

const HygieneAlerts: React.FC<{
  detections: Detection[];
  onNavigate: (view: string, filter?: any) => void;
}> = ({ detections, onNavigate }) => {
  const alerts = useMemo<HygieneAlert[]>(() => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    const notValidated = detections.filter(d => d.status === 'Production' && !d.testedAndValidated).length;
    const staleDrafts = detections.filter(d => {
      if (d.status !== 'Draft' && d.status !== 'Backlog') return false;
      if (!d.createdDate) return false;
      return (now - new Date(d.createdDate).getTime()) > THIRTY_DAYS;
    }).length;
    const missingLogSources = detections.filter(d => !d.logSources || d.logSources.length === 0).length;
    const lowQuality = detections.filter(d => (d.qualityScore || 0) < 40).length;

    // Compute the cutoff date as ISO string for the createdBefore URL param
    const staleCutoff = new Date(now - THIRTY_DAYS).toISOString();

    const ALERT_PRIORITY: Record<string, number> = {
      'not-validated': 4,
      'low-quality': 3,
      'no-logsrc': 2,
      'stale': 1,
    };

    const all: HygieneAlert[] = [];
    if (notValidated > 0) all.push({ key: 'not-validated', count: notValidated, label: 'Not Validated', filterView: 'library', filterParams: { status: 'Production', testedAndValidated: 'false' } });
    if (staleDrafts > 0) all.push({ key: 'stale', count: staleDrafts, label: 'Stale Drafts', filterView: 'library', filterParams: { status: 'Draft,Backlog', createdBefore: staleCutoff } });
    if (missingLogSources > 0) all.push({ key: 'no-logsrc', count: missingLogSources, label: 'Missing Log Sources', filterView: 'library', filterParams: { missingField: 'logSources' } });
    if (lowQuality > 0) all.push({ key: 'low-quality', count: lowQuality, label: 'Low Quality', filterView: 'library', filterParams: { qualityGrade: 'F' } });

    all.sort((a, b) => (ALERT_PRIORITY[b.key] || 0) - (ALERT_PRIORITY[a.key] || 0) || b.count - a.count);
    return all;
  }, [detections]);

  if (alerts.length === 0) return null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 mb-2">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Hygiene Alerts</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        {alerts.map((a, i) => {
          const priorityColor = a.key === 'not-validated' ? 'text-red-400' : a.key === 'low-quality' ? 'text-amber-400' : 'text-primary';
          return (
            <div
              key={a.key}
              onClick={() => onNavigate(a.filterView, a.filterParams)}
              className="rounded-xl px-4 py-4 cursor-pointer hover:bg-surface-container-low transition-colors"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.06)', opacity: 0, animation: `slideUp 200ms ease ${i * 60}ms forwards` }}
            >
              <div className={`text-2xl font-brand font-bold ${priorityColor}`}>{a.count}</div>
              <div className="text-[11px] font-brand font-medium text-on-surface-variant/60 mt-1">{a.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// RECENT ACTIVITY PANEL — last 8 activities
// ============================================================================

const ACTION_DOT_COLORS: Record<string, string> = {
  detection_created: 'bg-green-400',
  detection_updated: 'bg-blue-400',
  detection_deleted: 'bg-red-400',
  detection_status_changed: 'bg-amber-400',
  review_approved: 'bg-emerald-400',
  review_rejected: 'bg-red-400',
  review_requested: 'bg-purple-400',
  comment_added: 'bg-sky-400',
  detection_published: 'bg-teal-400',
};

const ACTION_LABELS: Record<string, string> = {
  detection_created: 'Created',
  detection_updated: 'Updated',
  detection_deleted: 'Deleted',
  detection_status_changed: 'Status changed',
  detection_assigned: 'Assigned',
  detection_self_assigned: 'Self-assigned',
  review_requested: 'Review requested',
  review_started: 'Review started',
  review_approved: 'Approved',
  review_rejected: 'Changes requested',
  comment_added: 'Commented',
  detection_published: 'Published',
  detection_copied: 'Copied',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface ActivityItem {
  action: string;
  name: string;
  entityId: string;
  timestamp: string;
}

const RecentActivityPanel: React.FC<{
  activities: { action: string; details: Record<string, any>; entity_id: string; created_at: string; user?: { full_name?: string } }[];
  detections: Detection[];
  isLoading: boolean;
  onNavigate: (view: string, filter?: any) => void;
}> = ({ activities, detections, isLoading, onNavigate }) => {
  // Fallback: synthesize activity from detections when activity_log is empty
  const items = useMemo<ActivityItem[]>(() => {
    if (activities.length > 0) {
      return activities.slice(0, 8).map(a => ({
        action: a.action,
        name: a.details?.detection_name || a.details?.name || '',
        entityId: a.entity_id,
        timestamp: a.created_at,
      }));
    }
    // Build pseudo-activity from detections sorted by most recent date
    const events: ActivityItem[] = [];
    for (const d of detections) {
      if (d.updatedDate && d.updatedDate !== d.createdDate) {
        events.push({ action: 'detection_updated', name: d.name, entityId: d.id, timestamp: d.updatedDate });
      }
      if (d.createdDate) {
        events.push({ action: 'detection_created', name: d.name, entityId: d.id, timestamp: d.createdDate });
      }
      if (d.status === 'Production') {
        events.push({ action: 'detection_status_changed', name: d.name, entityId: d.id, timestamp: d.updatedDate || d.createdDate || '' });
      }
    }
    return events
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [activities, detections]);

  if (isLoading) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-5">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
        <div className="mt-3 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-4 bg-surface-container rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-5">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
        <p className="text-[12px] font-brand text-on-surface-variant/40 mt-4 text-center">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Recent Activity</span>
      <div className="mt-3 space-y-0.5">
        {items.map((a, i) => {
          const label = ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ');
          const dotColor = ACTION_DOT_COLORS[a.action] || 'bg-on-surface-variant/30';
          return (
            <div
              key={`${a.entityId}-${a.action}-${i}`}
              onClick={() => a.entityId && onNavigate('detail', { id: a.entityId })}
              className="flex items-center gap-2.5 py-2 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
              <div className="flex-1 min-w-0 truncate">
                <span className="text-[12px] font-brand font-medium text-on-surface-variant/70">{label}</span>
                {a.name && <span className="text-[12px] font-brand font-medium text-on-surface ml-1.5">"{a.name}"</span>}
              </div>
              <span className="text-[10px] font-brand text-on-surface-variant/30 flex-shrink-0">{relativeTime(a.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// MATURITY RADAR — 6-axis spider chart
// ============================================================================

interface RadarProps {
  detections: Detection[];
  posture: { technique_coverage_pct?: number } | null;
}

const MaturityRadar: React.FC<RadarProps> = ({ detections, posture }) => {
  const dimensions = useMemo(() => {
    if (detections.length === 0) return null;
    const total = detections.length;

    // 1. Coverage
    const coverage = posture?.technique_coverage_pct ?? 0;

    // 2. Validation
    const validated = detections.filter(d => d.testedAndValidated).length;
    const validation = Math.round((validated / total) * 100);

    // 3. Quality
    const qualitySum = detections.reduce((s, d) => s + (d.qualityScore || 0), 0);
    const quality = Math.round(qualitySum / total);

    // 4. Threat Intel linkage
    const linked = detections.filter(d =>
      (d.linkedGroups && d.linkedGroups.length > 0) || (d.linkedSoftware && d.linkedSoftware.length > 0)
    ).length;
    const threatIntel = Math.round((linked / total) * 100);

    // 5. Production
    const prod = detections.filter(d => d.status === 'Production').length;
    const production = Math.round((prod / total) * 100);

    // 6. Source Diversity — Shannon entropy of queryLanguage
    const langCounts: Record<string, number> = {};
    detections.forEach(d => { if (d.queryLanguage) langCounts[d.queryLanguage] = (langCounts[d.queryLanguage] || 0) + 1; });
    const langs = Object.values(langCounts);
    let entropy = 0;
    if (langs.length > 1) {
      const t = langs.reduce((a, b) => a + b, 0);
      entropy = -langs.reduce((s, c) => { const p = c / t; return s + (p > 0 ? p * Math.log2(p) : 0); }, 0);
    }
    const maxEntropy = langs.length > 1 ? Math.log2(langs.length) : 1;
    const sourceDiversity = Math.round((entropy / maxEntropy) * 100);

    return [
      { label: 'Coverage', value: coverage },
      { label: 'Validation', value: validation },
      { label: 'Quality', value: quality },
      { label: 'Threat Intel', value: threatIntel },
      { label: 'Production', value: production },
      { label: 'Diversity', value: sourceDiversity },
    ];
  }, [detections, posture]);

  if (!dimensions) return null;

  const SIZE = 340;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 130;
  const axes = dimensions.length;
  const angleStep = (2 * Math.PI) / axes;
  const composite = Math.round(dimensions.reduce((s, d) => s + d.value, 0) / axes);

  const getPoint = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = (value / 100) * R;
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
  };

  const polygonPoints = dimensions.map((d, i) => {
    const p = getPoint(i, d.value);
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 flex flex-col items-center">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider self-start mb-2">Detection Maturity</span>
      <svg width={SIZE} height={SIZE} className="overflow-visible">
        {/* Grid rings */}
        {[25, 50, 75, 100].map(pct => (
          <polygon
            key={pct}
            points={Array.from({ length: axes }, (_, i) => {
              const p = getPoint(i, pct);
              return `${p.x},${p.y}`;
            }).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={1}
          />
        ))}
        {/* Axis lines */}
        {dimensions.map((_, i) => {
          const p = getPoint(i, 100);
          return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />;
        })}
        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgb(var(--md-sys-color-primary))"
          fillOpacity={0.15}
          stroke="rgb(var(--md-sys-color-primary))"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Data points */}
        {dimensions.map((d, i) => {
          const p = getPoint(i, d.value);
          return <circle key={i} cx={p.x} cy={p.y} r={4} fill="rgb(var(--md-sys-color-primary))" />;
        })}
        {/* Labels */}
        {dimensions.map((d, i) => {
          const p = getPoint(i, 118);
          return (
            <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-on-surface-variant/60 text-[11px] font-brand font-medium">
              {d.label}
              <title>{`${d.label}: ${d.value}%`}</title>
            </text>
          );
        })}
        {/* Center score */}
        <text x={CX} y={CY - 8} textAnchor="middle" className="fill-primary text-3xl font-brand font-bold">{composite}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-on-surface-variant/40 text-[9px] font-brand font-bold uppercase tracking-widest">Score</text>
      </svg>
    </div>
  );
};

// ============================================================================
// COVERAGE TREND CHART — 12-month area chart of technique coverage %
// ============================================================================

const CoverageTrendChart: React.FC<{ data: { month: string; coveragePct: number; totalRules: number }[] }> = ({ data }) => {
  if (!data || data.length === 0 || data.every(d => d.coveragePct === 0)) return null;

  const CHART_H = 140;
  const PAD_L_PCT = 4; // % left padding for Y labels
  const PAD_R_PCT = 1;
  const maxVal = 100;
  const latest = data[data.length - 1];
  const first = data[0];
  const delta = latest.coveragePct - first.coveragePct;

  // Percentage-based positioning (0-100%) for HTML overlay
  const getXPct = (i: number) => PAD_L_PCT + (i / (data.length - 1)) * (100 - PAD_L_PCT - PAD_R_PCT);
  const getYPct = (v: number) => ((maxVal - v) / maxVal) * 100;

  // SVG uses a 100x100 viewBox so aspect ratio doesn't matter
  const svgW = 100;
  const svgH = 100;
  const toSvgX = (i: number) => (PAD_L_PCT / 100) * svgW + (i / (data.length - 1)) * ((100 - PAD_L_PCT - PAD_R_PCT) / 100) * svgW;
  const toSvgY = (v: number) => svgH - (v / maxVal) * svgH;

  const points = data.map((d, i) => `${toSvgX(i)},${toSvgY(d.coveragePct)}`).join(' ');
  const fillPath = `M ${toSvgX(0)},${svgH} ${points.split(' ').map(p => `L ${p}`).join(' ')} L ${toSvgX(data.length - 1)},${svgH} Z`;
  const linePath = `M ${points.split(' ').join(' L ')}`;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 mb-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Coverage Trend</span>
          {delta > 0 && (
            <span className="text-[11px] font-brand font-bold text-green-400">+{delta.toFixed(1)}%</span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-brand font-bold text-primary">{latest.coveragePct}%</span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant/40">{latest.totalRules} rules</span>
        </div>
      </div>
      {/* Chart area — relative container for SVG + HTML overlay */}
      <div className="w-full relative group" style={{ height: CHART_H }}>
        {/* SVG layer: only paths and gridlines (no circles/text — they'd get distorted) */}
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="coverageFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--md-sys-color-primary))" stopOpacity="0.20" />
              <stop offset="100%" stopColor="rgb(var(--md-sys-color-primary))" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map(pct => (
            <line key={pct} x1={(PAD_L_PCT / 100) * svgW} y1={toSvgY(pct)} x2={svgW - (PAD_R_PCT / 100) * svgW} y2={toSvgY(pct)} stroke="currentColor" strokeOpacity={pct === 0 ? 0.1 : 0.04} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={fillPath} fill="url(#coverageFill)" />
          <path d={linePath} fill="none" stroke="rgb(var(--md-sys-color-primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* HTML overlay: Y-axis labels (not distorted by preserveAspectRatio) */}
        {yTicks.map(pct => (
          <span key={pct} className="absolute text-[9px] font-brand font-medium text-on-surface-variant/30 pointer-events-none" style={{ left: 0, top: `${getYPct(pct)}%`, transform: 'translateY(-50%)' }}>
            {pct}%
          </span>
        ))}

        {/* HTML overlay: data points — perfect circles that don't stretch */}
        {data.map((d, i) => (
          <div
            key={i}
            className="absolute opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity cursor-crosshair z-10"
            style={{ left: `${getXPct(i)}%`, top: `${getYPct(d.coveragePct)}%`, transform: 'translate(-50%, -50%)' }}
            title={`${d.month}: ${d.coveragePct}% coverage (${d.totalRules} rules)`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-white/80" />
          </div>
        ))}
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-on-surface-variant/40 font-brand font-medium mt-1.5" style={{ paddingLeft: `${PAD_L_PCT}%`, paddingRight: `${PAD_R_PCT}%` }}>
        {data.map((d, i) => (
          <span key={i}>{d.month}</span>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// READINESS BADGE — matches QualityScoreBadge style from reference
// Tinted circular bg + dark track + bold colored arc + colored number
// ============================================================================

interface BreakdownItem { label: string; value: number; weight: string; }

const ReadinessBadge: React.FC<{ value: number; loading?: boolean; breakdown?: BreakdownItem[] }> = ({ value, loading, breakdown }) => {
  const [animated, setAnimated] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(t); }, []);

  const SIZE = 180;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2 - 8;
  const C = R * 2 * Math.PI;
  const filled = animated && !loading ? (value / 100) * C : 0;

  return (
    <div className="relative">
      <div
        className="relative flex-shrink-0 rounded-full cursor-pointer"
        onClick={() => breakdown && setShowBreakdown(!showBreakdown)}
        style={{
          width: SIZE,
          height: SIZE,
          backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.08)',
        }}
      >
        <svg width={SIZE} height={SIZE} className="transform -rotate-90">
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE}
            style={{ stroke: 'rgb(var(--md-sys-color-primary) / 0.15)' }}
          />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            className="stroke-primary" strokeWidth={STROKE} strokeLinecap="round"
            style={{
              strokeDasharray: `${filled} ${C}`,
              transition: 'stroke-dasharray 1.4s cubic-bezier(0.05, 0.7, 0.1, 1.0)',
              filter: 'drop-shadow(0 0 8px rgb(var(--md-sys-color-primary) / 0.4))',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading ? (
            <div className="w-12 h-6 bg-primary/10 rounded animate-pulse" />
          ) : (
            <>
              <AnimatedNumber value={value} duration={1400} className="text-5xl font-brand font-bold text-primary" />
              <span className="text-[9px] font-brand font-bold text-primary/40 uppercase tracking-[0.25em]">Readiness</span>
            </>
          )}
        </div>
      </div>
      {/* Breakdown tooltip */}
      {showBreakdown && breakdown && (
        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 bg-surface-container rounded-xl border border-outline-variant/20 p-3 min-w-[200px] z-10 shadow-lg">
          {breakdown.map(b => (
            <div key={b.label} className="flex items-center justify-between py-1.5">
              <span className="text-[11px] font-brand font-medium text-on-surface-variant/60">{b.label} <span className="text-on-surface-variant/25">({b.weight})</span></span>
              <span className="text-[11px] font-brand font-bold text-primary">{b.value}pts</span>
            </div>
          ))}
          <div className="border-t border-outline-variant/10 mt-1 pt-1.5 flex items-center justify-between">
            <span className="text-[11px] font-brand font-bold text-on-surface">Total</span>
            <span className="text-[11px] font-brand font-bold text-primary">{value}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STAT TILE — bold Orbitron number, no gauge, no border
// ============================================================================

const StatTile: React.FC<{
  label: string; value: number; total?: number; suffix?: string; onClick?: () => void;
}> = ({ label, value, total, suffix, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-surface-container-lowest rounded-xl px-5 py-5 text-center transition-colors ${onClick ? 'cursor-pointer hover:bg-surface-container-low' : ''}`}
  >
    <div className="text-[12px] font-brand font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2">{label}</div>
    <div className="flex items-baseline justify-center gap-0.5">
      <span className="text-3xl font-brand font-bold text-primary">{value.toLocaleString()}</span>
      {total !== undefined && <span className="text-sm text-on-surface-variant font-brand font-bold">/{total.toLocaleString()}</span>}
      {suffix && <span className="text-sm text-on-surface-variant font-brand font-bold">{suffix}</span>}
    </div>
  </div>
);

// ============================================================================
// THREAT ACTORS PANEL — top 5 by TAW score
// ============================================================================

const ThreatActorsPanel: React.FC<{ entries: ThreatLandscapeEntry[]; onNavigate: (view: string, filter?: any) => void }> = ({ entries, onNavigate }) => (
  <div className="bg-surface-container-lowest rounded-2xl p-5">
    <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Threat Actors</span>
    <div className="mt-3">
      {entries.map((e, i) => (
        <div
          key={e.stixId}
          onClick={() => onNavigate('group-detail', { id: e.stixId })}
          className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
          style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 50}ms forwards` }}
        >
          {/* Small score badge */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)' }}
          >
            <span className="text-[10px] font-brand font-bold text-primary">{e.coveragePct}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-brand font-medium text-on-surface truncate">{e.name}</span>
              <span className="text-[11px] font-brand font-semibold text-primary ml-2 flex-shrink-0">{e.coveredCount}/{e.techniqueCount}</span>
            </div>
            <div className="h-1.5 bg-primary/15 rounded-full overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.max(e.coveragePct, 3)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// CAMPAIGN PANEL
// ============================================================================

const CampaignPanel: React.FC<{ campaigns: CampaignReadinessType[]; onNavigate: (view: string, filter?: any) => void }> = ({ campaigns, onNavigate }) => (
  <div className="bg-surface-container-lowest rounded-2xl p-5">
    <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Campaign Readiness</span>
    <div className="mt-3">
      {campaigns.map((c, i) => (
        <div
          key={c.stixId}
          onClick={() => onNavigate('campaign-detail', { id: c.stixId })}
          className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
          style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 50}ms forwards` }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)' }}
          >
            <span className="text-[10px] font-brand font-bold text-primary">{c.coveragePct}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between">
              <div className="truncate">
                <span className="text-[13px] font-brand font-medium text-on-surface">{c.name}</span>
                {c.attributedGroup && <span className="text-[10px] text-on-surface-variant/20 ml-2">{c.attributedGroup}</span>}
              </div>
              <span className="text-[11px] font-brand font-semibold text-primary ml-2 flex-shrink-0">{c.covered}/{c.total}</span>
            </div>
            <div className="h-1.5 bg-primary/15 rounded-full overflow-hidden mt-1.5">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.max(c.coveragePct, 3)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// DISTRIBUTION PANEL — collapsible, shows top 3 by default
// ============================================================================

const DistributionPanel: React.FC<{
  title: string;
  data: Record<string, number>;
  onItemClick?: (key: string) => void;
}> = ({ title, data, onItemClick }) => {
  const [expanded, setExpanded] = useState(false);
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = sorted.length > 0 ? sorted[0][1] : 1;
  if (sorted.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, 3);
  const hasMore = sorted.length > 3;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">{title}</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{sorted.length}</span>
      </div>
      <div className="mt-2.5 space-y-0.5">
        {visible.map(([name, count]) => (
          <div
            key={name}
            onClick={() => onItemClick?.(name)}
            className={`flex items-center gap-2 py-1 px-1.5 rounded-md transition-colors ${onItemClick ? 'cursor-pointer hover:bg-surface-container-low/50' : ''}`}
          >
            <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{name}</span>
            <div className="w-20 h-1.5 bg-primary/15 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-[11px] font-brand font-bold text-primary w-10 text-right flex-shrink-0">{count}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
        >
          {expanded ? 'SHOW LESS' : `+${sorted.length - 3} MORE`}
        </button>
      )}
    </div>
  );
};

// ============================================================================
// SEVERITY PANEL — color-coded severity counts
// ============================================================================

const SEVERITY_CONFIG: { key: string; label: string; color: string }[] = [
  { key: 'Critical', label: 'Critical', color: 'rgb(220, 38, 38)' },
  { key: 'High', label: 'High', color: 'rgb(234, 88, 12)' },
  { key: 'Medium', label: 'Medium', color: 'rgb(202, 138, 4)' },
  { key: 'Low', label: 'Low', color: 'rgb(34, 197, 94)' },
  { key: 'Informational', label: 'Info', color: 'rgb(100, 116, 139)' },
];

const SeverityPanel: React.FC<{ data: Record<string, number>; onItemClick?: (key: string) => void }> = ({ data, onItemClick }) => {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Severity</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{total}</span>
      </div>
      <div className="mt-2.5 space-y-0.5">
        {SEVERITY_CONFIG.map(({ key, label, color }) => {
          const count = data[key] || 0;
          if (count === 0) return null;
          return (
            <div
              key={key}
              onClick={() => onItemClick?.(key)}
              className={`flex items-center gap-2 py-1 px-1.5 rounded-md transition-colors ${onItemClick ? 'cursor-pointer hover:bg-surface-container-low/50' : ''}`}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] font-brand font-medium text-on-surface flex-1">{label}</span>
              <div className="w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: `${color}30` }}>
                <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, backgroundColor: `${color}B3` }} />
              </div>
              <span className="text-[11px] font-brand font-bold w-8 text-right flex-shrink-0" style={{ color }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// SECTOR PANEL — coverage by targeted industry
// ============================================================================

const SectorPanel: React.FC<{ sectors: SectorCoverage[]; onNavigate: (view: string, filter?: any) => void }> = ({ sectors, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sectors : sectors.slice(0, 5);
  const hasMore = sectors.length > 5;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Sector Coverage</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{sectors.length} sectors</span>
      </div>
      <div className="space-y-0.5">
        {visible.map((s, i) => (
          <div
            key={s.name}
            onClick={() => onNavigate('mitre', { sector: s.name })}
            className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 40}ms forwards` }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)' }}
            >
              <span className="text-[10px] font-brand font-bold text-primary">{s.coveragePct}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-brand font-medium text-on-surface truncate">{s.name}</span>
                <span className="text-[11px] font-brand font-semibold text-primary ml-2 flex-shrink-0">{s.coveredTechniques}/{s.totalTechniques} TTPs</span>
              </div>
              <div className="h-1.5 bg-primary/15 rounded-full overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.max(s.coveragePct, 3)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
        >
          {expanded ? 'SHOW LESS' : `+${sectors.length - 5} MORE`}
        </button>
      )}
    </div>
  );
};

// ============================================================================
// ORIGIN PANEL — coverage by threat actor origin country
// ============================================================================

const OriginPanel: React.FC<{ origins: OriginCoverage[]; onNavigate: (view: string, filter?: any) => void }> = ({ origins, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? origins : origins.slice(0, 5);
  const hasMore = origins.length > 5;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Threat Origins</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{origins.length} countries</span>
      </div>
      <div className="space-y-0.5">
        {visible.map((o, i) => (
          <div
            key={o.country}
            onClick={() => onNavigate('mitre', { origin: o.country })}
            className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
            style={{ opacity: 0, animation: `slideUp 250ms ease ${i * 40}ms forwards` }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)' }}
            >
              <span className="text-[10px] font-brand font-bold text-primary">{o.coveragePct}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-brand font-medium text-on-surface truncate">{o.country}</span>
                <span className="text-[11px] font-brand font-semibold text-primary ml-2 flex-shrink-0">{o.coveredTechniques}/{o.totalTechniques} TTPs</span>
              </div>
              <div className="h-1.5 bg-primary/15 rounded-full overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.max(o.coveragePct, 3)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
        >
          {expanded ? 'SHOW LESS' : `+${origins.length - 5} MORE`}
        </button>
      )}
    </div>
  );
};

// ============================================================================
// GAPS PANEL — top uncovered techniques by gap score
// ============================================================================

interface TechniqueGap {
  mitre_id: string;
  name: string;
  tis: number;
  gap_score: number;
}

const GapsPanel: React.FC<{
  gaps: TechniqueGap[];
  onNavigate: (view: string, filter?: any) => void;
}> = ({ gaps, onNavigate }) => {
  const [showAllGaps, setShowAllGaps] = useState(false);
  if (gaps.length === 0) return null;
  const maxGap = Math.max(...gaps.map(g => g.gap_score), 1);
  const visibleGaps = showAllGaps ? gaps : gaps.slice(0, 5);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Top Gaps</span>
        <span className="text-[10px] font-brand font-medium text-on-surface-variant/30">{gaps.length}</span>
      </div>
      <div className="mt-2.5 space-y-0.5">
        {visibleGaps.map((g) => (
          <div
            key={g.mitre_id}
            onClick={() => onNavigate('add_selection')}
            className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer hover:bg-surface-container-low/50 transition-colors"
          >
            <span className="text-[10px] font-brand font-bold text-on-surface-variant/40 w-12 flex-shrink-0">{g.mitre_id}</span>
            <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{g.name}</span>
            <div className="w-16 h-1.5 bg-red-500/20 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-red-500/50" style={{ width: `${(g.gap_score / maxGap) * 100}%` }} />
            </div>
            <span className="text-[10px] font-brand font-bold text-red-400/70 w-8 text-right flex-shrink-0">{g.gap_score.toFixed(1)}</span>
          </div>
        ))}
      </div>
      {gaps.length > 5 && (
        <button
          onClick={() => setShowAllGaps(!showAllGaps)}
          className="mt-2 text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
        >
          {showAllGaps ? 'SHOW LESS' : `SHOW ALL (${gaps.length})`}
        </button>
      )}
    </div>
  );
};

// ============================================================================
// VELOCITY SPARKLINE — 12-week detection creation trend
// ============================================================================

const VelocitySparkline: React.FC<{ data: number[] }> = ({ data }) => {
  const max = Math.max(...data, 1);
  const total = data.reduce((s, v) => s + v, 0);
  const recent = data.slice(-4).reduce((s, v) => s + v, 0);
  const prior = data.slice(-8, -4).reduce((s, v) => s + v, 0);
  const trend = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 100 : 0);
  const svgH = 64;
  const weekLabels = Array.from({ length: data.length }, (_, i) => `W${data.length - i}`);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 mb-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Velocity</span>
          {trend !== 0 && (
            <span className={`text-[11px] font-brand font-bold ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-brand font-bold text-primary">{total}</span>
          <span className="text-[10px] font-brand font-medium text-on-surface-variant">in 12 weeks</span>
        </div>
      </div>
      {/* Full-width bar chart */}
      <div className="flex items-end gap-1.5" style={{ height: svgH }}>
        {data.map((v, i) => {
          const h = max > 0 ? (v / max) * (svgH - 4) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: Math.max(h, 2),
                  backgroundColor: `rgb(var(--md-sys-color-primary) / ${v > 0 ? 1 : 0.2})`,
                }}
                title={`${weekLabels[i]}: ${v} detections`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((_, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[8px] font-brand font-medium text-on-surface-variant/60">{i === 0 ? '12w' : i === data.length - 1 ? 'now' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// QUICK ACTIONS BAR — shortcut buttons
// ============================================================================

const QuickActionsBar: React.FC<{ onNavigate: (view: string, filter?: any) => void }> = ({ onNavigate }) => {
  const actions = [
    { label: 'New Detection', icon: '+', target: 'add_selection' },
    { label: 'Bulk Import', icon: '↓', target: 'bulk_import' },
    { label: 'MITRE Matrix', icon: '⬡', target: 'mitre' },
    { label: 'Coverage', icon: '◎', target: 'coverage' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {actions.map(a => (
        <button
          key={a.target}
          onClick={() => onNavigate(a.target)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-brand font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors tracking-wide"
        >
          <span className="text-[14px]">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
};

// ============================================================================
// SLA PIPELINE — avg time in each status stage
// ============================================================================

const SLA_STAGES = ['Draft', 'Development', 'Review', 'Testing', 'Production'] as const;

const SLAPipeline: React.FC<{ detections: Detection[]; onNavigate?: (view: string, filter?: any) => void }> = ({ detections, onNavigate }) => {
  const stageData = useMemo(() => {
    if (detections.length === 0) return null;
    const now = Date.now();
    const byStage: Record<string, number[]> = {};
    SLA_STAGES.forEach(s => { byStage[s] = []; });

    detections.forEach(d => {
      if (!d.status || !d.createdDate) return;
      const stage = d.status as string;
      if (!(stage in byStage)) return;
      const created = new Date(d.createdDate).getTime();
      const updated = d.updatedDate ? new Date(d.updatedDate).getTime() : now;
      const days = Math.max(0, Math.round((updated - created) / (1000 * 60 * 60 * 24)));
      byStage[stage].push(days);
    });

    const result = SLA_STAGES.map(stage => {
      const vals = byStage[stage];
      const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
      return { stage, avg, count: vals.length };
    });
    const maxAvg = Math.max(...result.map(r => r.avg), 1);
    return { stages: result, maxAvg };
  }, [detections]);

  if (!stageData || stageData.stages.every(s => s.count === 0)) return null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">SLA Pipeline</span>
      <div className="mt-3 space-y-2">
        {stageData.stages.map((s, i) => (
          <div
            key={s.stage}
            onClick={() => onNavigate?.('library', { status: s.stage })}
            className={`flex items-center gap-3 rounded-lg transition-colors ${onNavigate ? 'cursor-pointer hover:bg-surface-container-low/50' : ''}`}
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 50}ms forwards` }}
          >
            <span className="text-[11px] font-brand font-medium text-on-surface-variant w-24 text-right flex-shrink-0">{s.stage}</span>
            <div className="flex-1 h-5 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary flex items-center justify-end pr-2"
                style={{ width: `${Math.max((s.avg / stageData.maxAvg) * 100, 8)}%`, transition: 'width 0.5s ease' }}
              >
                {s.avg > 0 && <span className="text-[9px] font-brand font-bold text-white">{s.avg}d</span>}
              </div>
            </div>
            <span className="text-[10px] font-brand font-medium text-on-surface-variant w-8 flex-shrink-0">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// PLATFORM COVERAGE MATRIX
// ============================================================================

const PlatformCoverageMatrix: React.FC<{ detections: Detection[]; onNavigate?: (view: string, filter?: any) => void }> = ({ detections, onNavigate }) => {
  const platformData = useMemo(() => {
    if (detections.length === 0) return null;

    const platforms: Record<string, { count: number; techniques: Set<string> }> = {};

    detections.forEach(d => {
      (d.platforms || []).forEach(p => {
        if (!platforms[p]) platforms[p] = { count: 0, techniques: new Set() };
        platforms[p].count++;
        (d.mitreAttackIds || []).forEach(id => platforms[p].techniques.add(id));
      });
    });

    const allTechniques = new Set<string>();
    detections.forEach(d => (d.mitreAttackIds || []).forEach(id => allTechniques.add(id)));
    const totalTech = Math.max(allTechniques.size, 1);

    return Object.entries(platforms)
      .map(([name, data]) => ({
        name,
        count: data.count,
        techniques: data.techniques.size,
        coveragePct: Math.round((data.techniques.size / totalTech) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [detections]);

  if (!platformData || platformData.length === 0) return null;
  const maxCount = Math.max(...platformData.map(p => p.count), 1);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Platform Coverage</span>
      <div className="mt-3 space-y-1">
        {platformData.map((p, i) => (
          <div
            key={p.name}
            onClick={() => onNavigate?.('library', { platform: p.name })}
            className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${onNavigate ? 'cursor-pointer hover:bg-surface-container-low/50' : ''}`}
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}
          >
            <span className="text-[11px] font-brand font-medium text-on-surface w-20 truncate flex-shrink-0">{p.name}</span>
            <div className="flex-1 h-4 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(p.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-brand font-bold text-primary w-10 text-right flex-shrink-0">{p.count}</span>
            <span className="text-[10px] font-brand font-medium text-on-surface-variant w-14 text-right flex-shrink-0">{p.techniques} TTPs</span>
            <span className="text-[10px] font-brand font-bold text-primary w-10 text-right flex-shrink-0">{p.coveragePct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// TOP CONTRIBUTORS — leaderboard by author
// ============================================================================

const TopContributors: React.FC<{ detections: Detection[]; onNavigate?: (view: string, filter?: any) => void }> = ({ detections, onNavigate }) => {
  const contributors = useMemo(() => {
    if (detections.length === 0) return [];
    const byAuthor: Record<string, number> = {};
    detections.forEach(d => {
      if (d.author) byAuthor[d.author] = (byAuthor[d.author] || 0) + 1;
    });
    return Object.entries(byAuthor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [detections]);

  if (contributors.length === 0) return null;
  const maxCount = contributors[0]?.count || 1;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Top Contributors</span>
      <div className="mt-3 space-y-1">
        {contributors.map((c, i) => (
          <div
            key={c.name}
            onClick={() => onNavigate?.('library', { author: c.name })}
            className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors ${onNavigate ? 'cursor-pointer hover:bg-surface-container-low/50' : ''}`}
            style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 50}ms forwards` }}
          >
            <span className="text-[12px] font-brand font-bold text-primary/40 w-5 flex-shrink-0">{c.rank}</span>
            <span className="text-[12px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{c.name}</span>
            <div className="w-16 h-1.5 bg-primary/15 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / maxCount) * 100}%` }} />
            </div>
            <span className="text-[12px] font-brand font-bold text-primary w-8 text-right flex-shrink-0">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MY ASSIGNMENTS / REVIEW QUEUE
// ============================================================================

const MyAssignmentsPanel: React.FC<{
  detections: Detection[];
  userId: string | null;
  onNavigate: (view: string, filter?: any) => void;
}> = ({ detections, userId, onNavigate }) => {
  const { assigned, reviews } = useMemo(() => {
    if (!userId || detections.length === 0) return { assigned: [], reviews: [] };

    const assigned = detections
      .filter(d => d.assigned_to === userId)
      .slice(0, 5);

    const reviews = detections
      .filter(d => d.review_status === 'requested' || d.reviewer_id === userId)
      .slice(0, 5);

    return { assigned, reviews };
  }, [detections, userId]);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">My Queue</span>
      <div className="mt-3">
        <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">
          Assigned to me ({assigned.length})
        </div>
        {assigned.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30 mb-3">No assignments</p>
        ) : (
          <div className="space-y-0.5 mb-3">
            {assigned.map(d => (
              <div
                key={d.id}
                onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              >
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-primary/60 px-1.5 py-0.5 rounded bg-primary/10 flex-shrink-0">{d.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="text-[10px] font-brand font-bold text-on-surface-variant/40 uppercase tracking-wider mb-1.5">
          Pending Reviews ({reviews.length})
        </div>
        {reviews.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30">No pending reviews</p>
        ) : (
          <div className="space-y-0.5">
            {reviews.map(d => (
              <div
                key={d.id}
                onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
              >
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-purple-400/80 px-1.5 py-0.5 rounded bg-purple-400/10 flex-shrink-0">Review</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STALE DETECTION WATCHLIST — not updated in 90+ days
// ============================================================================

const StaleWatchlist: React.FC<{
  detections: Detection[];
  onNavigate: (view: string, filter?: any) => void;
}> = ({ detections, onNavigate }) => {
  const stale = useMemo(() => {
    const now = Date.now();
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    const excludeStatuses = ['Deprecated', 'Archived'];

    return detections
      .filter(d => {
        if (!d.updatedDate) return false;
        if (excludeStatuses.includes(d.status)) return false;
        return (now - new Date(d.updatedDate).getTime()) > NINETY_DAYS;
      })
      .map(d => ({
        id: d.id,
        name: d.name,
        status: d.status,
        daysStale: Math.floor((now - new Date(d.updatedDate).getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.daysStale - a.daysStale)
      .slice(0, 5);
  }, [detections]);

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-brand font-bold text-on-surface uppercase tracking-wider">Stale Watchlist</span>
        {stale.length > 0 && (
          <button
            onClick={() => onNavigate('library', { status: 'Draft,Backlog,Production' })}
            className="text-[10px] font-brand font-bold text-primary/50 hover:text-primary transition-colors tracking-wide"
          >
            VIEW ALL STALE
          </button>
        )}
      </div>
      <div className="mt-3">
        {stale.length === 0 ? (
          <p className="text-[11px] font-brand text-on-surface-variant/30 text-center mt-4">No stale detections</p>
        ) : (
          <div className="space-y-0.5">
            {stale.map((d, i) => (
              <div
                key={d.id}
                onClick={() => onNavigate('detail', { id: d.id })}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-surface-container-low/50 transition-colors"
                style={{ opacity: 0, animation: `slideUp 200ms ease ${i * 40}ms forwards` }}
              >
                <span className="text-[11px] font-brand font-medium text-on-surface truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-[9px] font-brand font-bold text-primary/60 px-1.5 py-0.5 rounded bg-primary/10 flex-shrink-0">{d.status}</span>
                <span className="text-[10px] font-brand font-bold text-amber-400/70 flex-shrink-0">{d.daysStale}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// TAB SWITCHER
// ============================================================================

const TabSwitcher: React.FC<{ currentPath: string }> = ({ currentPath }) => {
  const tabs = [
    { path: '/', label: 'Command Center' },
    { path: '/dashboard/classic', label: 'Classic' },
    { path: '/dashboard/globe', label: 'Intel Globe' },
  ];
  return (
    <div className="flex items-center bg-surface-container-lowest rounded-xl p-1">
      {tabs.map(tab => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`px-3 py-1.5 text-[11px] font-brand font-medium rounded-lg transition-all tracking-wide ${currentPath === tab.path ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};
