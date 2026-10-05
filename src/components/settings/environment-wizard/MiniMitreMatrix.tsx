import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { Icon } from '../../Icon';
import type { TacticThreatCoverage, TacticThreatTechnique } from '../../../hooks/useProfileIntelligence';

interface MiniMitreMatrixProps {
  tacticCoverage: TacticThreatCoverage[];
  loading: boolean;
}

function getCoverageColor(covered: number, total: number): string {
  if (total === 0) return 'text-outline';
  const pct = (covered / total) * 100;
  if (pct >= 80) return 'text-ext-teal';
  if (pct >= 50) return 'text-ext-amber';
  return 'text-ext-coral';
}

function getColumnBg(covered: number, total: number): string {
  if (total === 0) return 'rgb(var(--md-sys-color-surface-container) / 0.3)';
  const pct = (covered / total) * 100;
  if (pct >= 80) return 'rgb(var(--md-ext-color-teal) / 0.06)';
  if (pct >= 50) return 'rgb(var(--md-ext-color-amber) / 0.06)';
  return 'rgb(var(--md-ext-color-coral) / 0.06)';
}

export const MiniMitreMatrix: React.FC<MiniMitreMatrixProps> = ({
  tacticCoverage,
  loading,
}) => {
  const navigate = useNavigate();
  const [hoveredTactic, setHoveredTactic] = useState<string | null>(null);
  const [expandedTactic, setExpandedTactic] = useState<string | null>(null);

  // Summary stats
  const totals = useMemo(() => {
    const ids = new Set<string>();
    const coveredIds = new Set<string>();
    for (const t of tacticCoverage) {
      for (const technique of t.techniques) {
        ids.add(technique.mitreId);
        if (technique.covered) coveredIds.add(technique.mitreId);
      }
    }
    const covered = coveredIds.size, total = ids.size;
    return { covered, total, pct: total > 0 ? Math.round((covered / total) * 100) : 0 };
  }, [tacticCoverage]);

  if (loading) {
    return (
      <div
        className="rounded-2xl p-5 h-full"
        style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
      >
        <div className="h-3 w-48 bg-surface-container rounded animate-pulse mb-5" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg animate-pulse"
              style={{ height: 80, opacity: 1 - (i % 7) * 0.08, backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (tacticCoverage.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 h-full"
        style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
      >
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-3">
          MITRE ATT&CK Threat Matrix
        </h3>
        <p className="text-[11px] text-outline">
          Configure sectors or country to see threat group technique coverage.
        </p>
      </div>
    );
  }

  // Find max technique count per column for consistent visual scaling
  const maxTechniques = Math.max(...tacticCoverage.map(t => t.totalCount), 1);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
            MITRE ATT&CK Threat Matrix
          </h3>
          <div className="text-[9px] text-outline mt-0.5">
            Threat techniques mapped to rules last observed enabled in your SIEMs
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-brand font-bold leading-none ${getCoverageColor(totals.covered, totals.total)}`}>
            {totals.pct}%
          </div>
          <div className="text-[9px] text-on-surface-variant mt-0.5">
            {totals.covered}/{totals.total} techniques
          </div>
        </div>
      </div>

      {/* Matrix grid — 7 columns × 2 rows for 14 tactics */}
      <div className="grid grid-cols-7 gap-1">
        {tacticCoverage.map(tactic => {
          const pct = tactic.totalCount > 0
            ? Math.round((tactic.coveredCount / tactic.totalCount) * 100)
            : 0;
          const isHovered = hoveredTactic === tactic.tactic;
          const isExpanded = expandedTactic === tactic.tactic;
          const gapCount = tactic.totalCount - tactic.coveredCount;

          return (
            <div
              key={tactic.tactic}
              className="relative"
            >
              {/* Tactic column */}
              <div
                className={`rounded-lg p-1.5 cursor-pointer transition-all ${
                  isExpanded ? 'ring-1 ring-primary/40' : ''
                } ${isHovered ? 'scale-[1.02]' : ''}`}
                style={{ backgroundColor: getColumnBg(tactic.coveredCount, tactic.totalCount) }}
                onMouseEnter={() => setHoveredTactic(tactic.tactic)}
                onMouseLeave={() => setHoveredTactic(null)}
                onClick={() => setExpandedTactic(isExpanded ? null : tactic.tactic)}
              >
                {/* Tactic label */}
                <div className="text-[7px] font-bold text-on-surface-variant uppercase tracking-wider leading-tight mb-1 truncate">
                  {tactic.abbr}
                </div>

                {/* Technique cells — stacked mini-blocks */}
                <div className="flex flex-wrap gap-[2px]">
                  {tactic.techniques.slice(0, 20).map(tech => (
                    <div
                      key={tech.mitreId}
                      className="rounded-[2px] transition-colors"
                      style={{
                        width: 5,
                        height: 5,
                        backgroundColor: tech.covered
                          ? 'rgb(var(--md-ext-color-teal) / 0.7)'
                          : 'rgb(var(--md-ext-color-coral) / 0.5)',
                      }}
                      title={`${tech.mitreId} ${tech.name} — ${tech.covered ? 'Covered' : 'Gap'} (${tech.groupCount} groups)`}
                    />
                  ))}
                  {tactic.techniques.length > 20 && (
                    <div
                      className="rounded-[2px] flex items-center justify-center"
                      style={{
                        width: 5,
                        height: 5,
                        backgroundColor: 'rgb(var(--md-sys-color-outline) / 0.2)',
                      }}
                    />
                  )}
                </div>

                {/* Coverage fraction */}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className={`text-[8px] font-mono font-bold ${getCoverageColor(tactic.coveredCount, tactic.totalCount)}`}>
                    {tactic.coveredCount}/{tactic.totalCount}
                  </span>
                  {gapCount > 0 && (
                    <span className="text-[7px] font-bold text-ext-coral">
                      {gapCount}
                    </span>
                  )}
                </div>

                {/* Mini progress bar */}
                <div className="h-[3px] rounded-full mt-0.5 overflow-hidden" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container))' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 80
                        ? 'rgb(var(--md-ext-color-teal))'
                        : pct >= 50
                          ? 'rgb(var(--md-ext-color-amber))'
                          : 'rgb(var(--md-ext-color-coral))',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded tactic detail panel */}
      {expandedTactic && (
        <ExpandedTacticPanel
          tactic={tacticCoverage.find(t => t.tactic === expandedTactic)!}
          onClose={() => setExpandedTactic(null)}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 justify-end">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.7)' }} />
          <span className="text-[8px] text-on-surface-variant">Covered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: 'rgb(var(--md-ext-color-coral) / 0.5)' }} />
          <span className="text-[8px] text-on-surface-variant">Gap</span>
        </div>
      </div>
    </div>
  );
};

// ── Expanded panel ──

interface ExpandedTacticPanelProps {
  tactic: TacticThreatCoverage;
  onClose: () => void;
}

function ExpandedTacticPanel({ tactic, onClose }: ExpandedTacticPanelProps): React.ReactElement {
  const navigate = useNavigate();
  const pct = tactic.totalCount > 0
    ? Math.round((tactic.coveredCount / tactic.totalCount) * 100)
    : 0;

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden animate-page-enter"
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.6)' }}
    >
      {/* Panel header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-outline-variant/15">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-brand font-bold text-on-surface uppercase tracking-wider">
            {tactic.tactic}
          </span>
          <span className={`text-[10px] font-mono font-bold ${getCoverageColor(tactic.coveredCount, tactic.totalCount)}`}>
            {tactic.coveredCount}/{tactic.totalCount} ({pct}%)
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-container-highest/50 transition-colors"
        >
          <Icon name="x" className="w-3 h-3 text-outline" />
        </button>
      </div>

      {/* Technique list */}
      <div className="max-h-56 overflow-y-auto scrollbar-thin">
        {tactic.techniques.map(tech => (
          <div
            key={tech.mitreId}
            className="flex items-center gap-2 py-1.5 px-3 hover:bg-surface-container-highest/30 transition-colors group/tech"
          >
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
            <span className="text-[8px] font-mono text-outline flex-shrink-0">
              {tech.groupCount} {tech.groupCount === 1 ? 'group' : 'groups'}
            </span>
            {tech.covered ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(tech.mitreId)}`);
                }}
                className="text-[8px] font-bold text-ext-teal opacity-0 group-hover/tech:opacity-100 transition-opacity flex-shrink-0"
              >
                View
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(tech.mitreId)}`);
                }}
                className="text-[8px] font-bold text-ext-coral opacity-0 group-hover/tech:opacity-100 transition-opacity flex-shrink-0"
              >
                Search
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
