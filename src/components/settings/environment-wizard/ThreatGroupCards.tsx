import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, routeHelpers } from '../../../router/routes';
import { Icon } from '../../Icon';
import type { ThreatGroupSummary, GroupTechniqueDetail } from '../../../hooks/useProfileIntelligence';

// ── Risk thresholds ──

const HIGH_RISK_THRESHOLD = 50;
const MEDIUM_RISK_THRESHOLD = 80;
const KEY_GAPS_LIMIT = 3;

// ── Types ──

interface ThreatGroupCardsProps {
  groups: ThreatGroupSummary[];
  groupTechniqueDetails: Record<string, GroupTechniqueDetail[]>;
  sectorLabel: string | null;
  loading: boolean;
}

interface RiskLevel {
  label: string;
  bgClass: string;
  textClass: string;
}

// ── Helpers ──

function getCoveragePercent(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 100);
}

function getRiskLevel(pct: number): RiskLevel {
  if (pct < HIGH_RISK_THRESHOLD) {
    return { label: 'HIGH RISK', bgClass: 'bg-ext-coral/15', textClass: 'text-ext-coral' };
  }
  if (pct < MEDIUM_RISK_THRESHOLD) {
    return { label: 'MEDIUM', bgClass: 'bg-ext-amber/15', textClass: 'text-ext-amber' };
  }
  return { label: 'COVERED', bgClass: 'bg-ext-teal/15', textClass: 'text-ext-teal' };
}

function getBarColor(pct: number): string {
  if (pct < HIGH_RISK_THRESHOLD) return 'bg-ext-coral';
  if (pct < MEDIUM_RISK_THRESHOLD) return 'bg-ext-amber';
  return 'bg-ext-teal';
}

/**
 * Build a map of mitreId -> count of groups that use this technique (across all groups).
 * Used to sort uncovered techniques by cross-group prevalence.
 */
function buildTechniqueGroupCounts(
  groupTechniqueDetails: Record<string, GroupTechniqueDetail[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const techniques of Object.values(groupTechniqueDetails)) {
    for (const tech of techniques) {
      counts.set(tech.mitreId, (counts.get(tech.mitreId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Get the top uncovered techniques for a group, sorted by how many other groups
 * also use the same technique (highest prevalence first).
 */
function getTopUncoveredGaps(
  techniques: GroupTechniqueDetail[],
  techniqueGroupCounts: Map<string, number>,
  limit: number,
): { top: GroupTechniqueDetail[]; remaining: number } {
  const uncovered = techniques
    .filter((t) => !t.covered)
    .sort((a, b) => (techniqueGroupCounts.get(b.mitreId) ?? 0) - (techniqueGroupCounts.get(a.mitreId) ?? 0));
  return {
    top: uncovered.slice(0, limit),
    remaining: Math.max(0, uncovered.length - limit),
  };
}

// ── Loading skeleton ──

function LoadingSkeleton(): React.ReactElement {
  return (
    <div
      className="rounded-2xl p-5 h-full"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
    >
      <div className="h-3 w-48 bg-surface-container rounded animate-pulse mb-5" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-surface-container/50 rounded-xl animate-pulse"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Expanded technique list ──

interface TechniqueListProps {
  techniques: GroupTechniqueDetail[];
}

function TechniqueList({ techniques }: TechniqueListProps): React.ReactElement {
  const navigate = useNavigate();
  const covered = techniques.filter((t) => t.covered).length;
  const total = techniques.length;
  const pct = getCoveragePercent(covered, total);

  // Sort: uncovered first, then covered
  const sorted = [...techniques].sort((a, b) => {
    if (a.covered === b.covered) return a.mitreId.localeCompare(b.mitreId);
    return a.covered ? 1 : -1;
  });

  return (
    <div
      className="ml-4 mr-3 mt-1.5 mb-2 rounded-lg overflow-hidden"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
    >
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-outline-variant/20">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          {covered} of {total} techniques covered ({pct}%)
        </span>
      </div>

      {/* Technique rows */}
      <div className="max-h-52 overflow-y-auto scrollbar-thin">
        {sorted.map((tech) => (
          <div
            key={tech.mitreId}
            className="flex items-center gap-2 py-1.5 px-3 hover:bg-surface-container-highest/30 transition-colors group/tech"
          >
            {/* Coverage dot */}
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                tech.covered ? 'bg-ext-teal' : 'bg-ext-coral'
              }`}
            />

            <span className="font-mono text-[9px] font-bold text-on-surface-variant w-14 flex-shrink-0">
              {tech.mitreId}
            </span>
            <span
              className={`text-[10px] truncate flex-1 min-w-0 ${
                tech.covered ? 'text-on-surface-variant' : 'text-on-surface'
              }`}
            >
              {tech.name}
            </span>

            {/* Action button */}
            {tech.covered && tech.detectionId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(routeHelpers.detectionDetail(tech.detectionId!));
                }}
                className="text-[9px] font-bold text-ext-teal opacity-0 group-hover/tech:opacity-100 transition-opacity"
              >
                View Detection
              </button>
            )}
            {!tech.covered && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(tech.mitreId)}`);
                }}
                className="text-[9px] font-bold text-ext-coral opacity-0 group-hover/tech:opacity-100 transition-opacity"
              >
                Search Library
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ──

export function ThreatGroupCards({
  groups,
  groupTechniqueDetails,
  sectorLabel,
  loading,
}: ThreatGroupCardsProps): React.ReactElement {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Pre-compute cross-group technique prevalence for sorting uncovered gaps
  const techniqueGroupCounts = useMemo(
    () => buildTechniqueGroupCounts(groupTechniqueDetails),
    [groupTechniqueDetails],
  );

  // Sort groups by coverage percentage ascending (lowest coverage = highest risk first)
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const pctA = getCoveragePercent(a.coveredTechniqueCount ?? 0, a.techniqueCount);
      const pctB = getCoveragePercent(b.coveredTechniqueCount ?? 0, b.techniqueCount);
      return pctA - pctB;
    });
  }, [groups]);

  if (loading) return <LoadingSkeleton />;

  if (groups.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 h-full"
        style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
      >
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-3">
          Top Threat Groups Targeting Your Sector
        </h3>
        <p className="text-[12px] text-outline">
          Configure sectors or country to see threat groups targeting your organization.
        </p>
      </div>
    );
  }

  const visible = showAll ? sortedGroups : sortedGroups.slice(0, 8);
  const remaining = sortedGroups.length - 8;

  const headerLabel = sectorLabel
    ? `Top Threat Groups Targeting ${sectorLabel}`
    : 'Top Threat Groups Targeting Your Sector';

  return (
    <div
      className="rounded-2xl p-5 h-full border border-outline-variant"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          {headerLabel}
        </h3>
        <span className="text-xs font-mono text-ext-rose">{sortedGroups.length}</span>
      </div>

      {/* Group list */}
      <div className="space-y-1.5">
        {visible.map((group) => {
          const covered = group.coveredTechniqueCount ?? 0;
          const total = Math.max(group.techniqueCount, 1);
          const pct = getCoveragePercent(covered, total);
          const risk = getRiskLevel(pct);
          const isExpanded = expandedGroup === group.stixId;
          const techniques = groupTechniqueDetails[group.stixId] ?? [];
          const { top: topGaps, remaining: moreGaps } = getTopUncoveredGaps(
            techniques,
            techniqueGroupCounts,
            KEY_GAPS_LIMIT,
          );

          return (
            <div key={group.stixId} className="group">
              {/* Clickable card row */}
              <div
                className={`px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                  isExpanded
                    ? 'bg-surface-container-highest/60'
                    : 'hover:bg-surface-container-highest/30'
                }`}
                onClick={() => setExpandedGroup(isExpanded ? null : group.stixId)}
              >
                {/* Top row: name, risk badge, chevron */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-on-surface truncate">
                        {group.name}
                      </span>
                      <span
                        className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${risk.bgClass} ${risk.textClass}`}
                      >
                        {risk.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">
                      {group.originCountry} · {group.activityType}
                    </div>
                  </div>
                  <Icon
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    className="w-3.5 h-3.5 text-outline flex-shrink-0"
                  />
                </div>

                {/* Coverage bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-on-surface">
                      <span className="font-bold">{covered}</span>
                      <span className="text-on-surface-variant">/{total} techniques</span>
                    </span>
                    <span className={`text-[10px] font-mono font-bold ${risk.textClass}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getBarColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Key gaps preview (always visible, not only on expand) */}
                {topGaps.length > 0 && (
                  <div className="mt-1.5">
                    <span className="text-[9px] text-on-surface-variant">
                      <span className="font-bold text-ext-coral/80">Key gaps: </span>
                      {topGaps.map((g, i) => (
                        <React.Fragment key={g.mitreId}>
                          {i > 0 && ', '}
                          <span className="text-on-surface-variant">
                            {g.mitreId} {g.name}
                          </span>
                        </React.Fragment>
                      ))}
                      {moreGaps > 0 && (
                        <span className="text-ext-coral/60 ml-1">+{moreGaps} more</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Expanded technique list */}
              {isExpanded && techniques.length > 0 && (
                <TechniqueList techniques={techniques} />
              )}
            </div>
          );
        })}
      </div>

      {/* Show more button */}
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-[10px] font-bold text-ext-teal uppercase tracking-wider hover:opacity-70 transition-opacity"
        >
          +{remaining} more groups
        </button>
      )}
    </div>
  );
}
