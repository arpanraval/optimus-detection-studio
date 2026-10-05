import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../router/routes';
import { Icon } from '../../Icon';
import type { GapTechnique } from '../../../hooks/useProfileIntelligence';

interface CriticalGapsListProps {
  gaps: GapTechnique[];
  crownJewels: string[];
  loading: boolean;
  /** Set of MITRE technique IDs that already have detections in Development+ status */
  coveredTechniqueIds?: Set<string>;
  /** Set of technique IDs the user has dismissed */
  dismissedIds?: Set<string>;
  /** Whether to show dismissed items */
  showDismissed?: boolean;
  /** Called when user dismisses a gap item */
  onDismiss?: (techniqueId: string) => void;
  /** Called when user restores a dismissed gap item */
  onRestore?: (techniqueId: string) => void;
  /** Currently selected gap IDs for batch actions */
  selectedIds?: Set<string>;
  /** Called when selection changes */
  onSelectionChange?: (ids: Set<string>) => void;
  /** Called to batch-create draft detections */
  onBatchCreateDrafts?: (techniqueIds: Set<string>, gaps: Array<{ mitreId: string; name: string }>) => void;
}

const CROWN_JEWEL_TACTIC_HINTS: Record<string, string[]> = {
  'Domain Controllers': ['credential', 'privilege', 'lateral', 'active directory', 'kerberos', 'ldap', 'ntds'],
  'Financial Systems': ['exfiltration', 'collection', 'financial', 'payment'],
  'Customer Databases': ['exfiltration', 'collection', 'database', 'sql'],
  'Source Code Repositories': ['exfiltration', 'collection', 'git', 'repository'],
  'Executive Accounts': ['credential', 'privilege', 'phishing', 'executive'],
  'Medical Records': ['exfiltration', 'collection', 'medical', 'health'],
  'Payment Systems': ['exfiltration', 'collection', 'payment', 'pci'],
  'SCADA / ICS': ['impact', 'lateral', 'scada', 'ics', 'industrial'],
  'Email Systems': ['initial access', 'phishing', 'email', 'exchange'],
  'HR / PII Systems': ['exfiltration', 'collection', 'personnel', 'pii'],
};

export const CriticalGapsList: React.FC<CriticalGapsListProps> = ({
  gaps,
  crownJewels,
  loading,
  coveredTechniqueIds = new Set(),
  dismissedIds = new Set(),
  showDismissed = false,
  onDismiss,
  onRestore,
  selectedIds = new Set(),
  onSelectionChange,
  onBatchCreateDrafts,
}) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const scoredGaps = useMemo(() => {
    const crownPatterns: RegExp[] = [];
    for (const jewel of crownJewels) {
      const hints = CROWN_JEWEL_TACTIC_HINTS[jewel];
      if (hints) {
        for (const h of hints) {
          const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          crownPatterns.push(new RegExp('\\b' + escaped + '\\b', 'i'));
        }
      }
    }

    return gaps.map(gap => {
      const crownRelevant = crownPatterns.length > 0 && crownPatterns.some(p => p.test(gap.name));
      const score = (gap.threatGroupCount * 2) + (crownRelevant ? 3 : 0);
      const isCovered = coveredTechniqueIds.has(gap.mitreId);
      const isDismissed = dismissedIds.has(gap.mitreId);
      return { ...gap, crownRelevant, score, isCovered, isDismissed };
    }).sort((a, b) => {
      // SIEM-detectable gaps first, then by score within each group
      if (a.siemDetectable !== b.siemDetectable) {
        return a.siemDetectable ? -1 : 1;
      }
      return b.score - a.score;
    });
  }, [gaps, crownJewels, coveredTechniqueIds, dismissedIds]);

  // Filter dismissed items unless showDismissed is true
  const filteredGaps = useMemo(() => {
    if (showDismissed) return scoredGaps;
    return scoredGaps.filter(g => !g.isDismissed);
  }, [scoredGaps, showDismissed]);

  const actionableCount = filteredGaps.filter(g => g.siemDetectable).length;
  const externalIntelCount = filteredGaps.length - actionableCount;

  const toggleSelect = useCallback((mitreId: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(mitreId)) next.delete(mitreId); else next.add(mitreId);
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange]);

  if (loading) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <div className="h-3 w-28 bg-surface-container rounded animate-pulse mb-5" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface-container/50 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    );
  }

  if (filteredGaps.length === 0) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase mb-3">Coverage Gaps</h3>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'rgb(var(--md-ext-color-teal) / 0.1)' }}>
            <Icon name="shield-check" className="w-5 h-5 text-ext-teal" />
          </div>
          <p className="text-[12px] text-on-surface-variant">
            {dismissedIds.size > 0
              ? `All gaps addressed or dismissed (${dismissedIds.size} dismissed).`
              : 'No uncovered techniques in the selected threat scope.'}
          </p>
        </div>
      </div>
    );
  }

  const visible = expanded ? filteredGaps : filteredGaps.slice(0, 10);
  const remaining = filteredGaps.length - 10;

  return (
    <div className="rounded-2xl p-5 h-full" style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container-high))' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-brand font-bold text-on-surface tracking-[0.2em] uppercase">
          Coverage Gaps
        </h3>
        <span className="text-[10px] font-mono">
          <span className="text-ext-coral">{filteredGaps.length}</span>
          {externalIntelCount > 0 && (
            <span className="text-on-surface-variant">
              {' '}({actionableCount} actionable, {externalIntelCount} external)
            </span>
          )}
        </span>
      </div>

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 rounded-lg border" style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.05)', borderColor: 'rgb(var(--md-sys-color-primary) / 0.2)' }}>
          <span className="text-[11px] font-medium text-on-surface">{selectedIds.size} selected</span>
          <button
            onClick={() => onBatchCreateDrafts?.(selectedIds, filteredGaps)}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
            style={{
              background: 'rgb(var(--md-sys-color-primary))',
              color: 'rgb(var(--md-sys-color-on-primary))',
            }}
          >
            Create All as Drafts
          </button>
          <button
            onClick={() => onSelectionChange?.(new Set())}
            className="px-2 py-1 text-[10px] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="space-y-0.5">
        {visible.map((gap) => {
          if (gap.siemDetectable) {
            return (
              <ActionableGapRow
                key={gap.mitreId}
                gap={gap}
                isCovered={gap.isCovered}
                isDismissed={gap.isDismissed}
                isSelected={selectedIds.has(gap.mitreId)}
                onSelect={() => toggleSelect(gap.mitreId)}
                onClick={() => navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(gap.mitreId)}`)}
                onCreateDetection={() => navigate(`${ROUTES.DETECTION_NEW}?technique=${encodeURIComponent(gap.mitreId)}`)}
                onDismiss={() => onDismiss?.(gap.mitreId)}
                onRestore={() => onRestore?.(gap.mitreId)}
                showActions
              />
            );
          }
          return (
            <ExternalIntelGapRow
              key={gap.mitreId}
              gap={gap}
              isCovered={gap.isCovered}
              isDismissed={gap.isDismissed}
              onClick={() => navigate(`${ROUTES.LIBRARY}?search=${encodeURIComponent(gap.mitreId)}`)}
              onDismiss={() => onDismiss?.(gap.mitreId)}
              onRestore={() => onRestore?.(gap.mitreId)}
            />
          );
        })}
      </div>

      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 w-full py-2 text-[10px] font-bold text-ext-teal uppercase tracking-wider hover:opacity-70 transition-opacity"
        >
          +{remaining} more gaps
        </button>
      )}
    </div>
  );
};

interface GapRowProps {
  gap: {
    mitreId: string;
    name: string;
    threatGroupCount: number;
    crownRelevant: boolean;
    candidateDetectionIds?: string[];
  };
  isCovered: boolean;
  isDismissed: boolean;
  onClick: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
}

interface ActionableGapRowProps extends GapRowProps {
  isSelected: boolean;
  onSelect: () => void;
  onCreateDetection: () => void;
  showActions: boolean;
}

function ActionableGapRow({ gap, isCovered, isDismissed, isSelected, onSelect, onClick, onCreateDetection, onDismiss, onRestore, showActions }: ActionableGapRowProps): React.ReactElement {
  const heat = Math.min(gap.threatGroupCount / 5, 1);
  const bgOpacity = isDismissed ? 0.02 : (0.03 + heat * 0.07);

  return (
    <div
      className={`flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors cursor-pointer group ${isDismissed ? 'opacity-50' : ''}`}
      style={{ backgroundColor: `rgb(var(--md-ext-color-coral) / ${bgOpacity})` }}
      onClick={onClick}
    >
      {/* Checkbox for batch selection */}
      {showActions && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-outline-variant/30 text-ext-teal focus:ring-ext-teal/30 cursor-pointer flex-shrink-0"
        />
      )}

      <span
        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: `rgb(var(--md-ext-color-coral) / ${0.15 + heat * 0.25})`,
          color: 'rgb(var(--md-ext-color-coral))',
        }}
      >
        {gap.threatGroupCount}
      </span>

      <span className="font-mono text-[10px] font-bold text-ext-coral/70 w-14 flex-shrink-0">
        {gap.mitreId}
      </span>

      <span className="text-[11px] text-on-surface truncate flex-1 min-w-0">{gap.name}</span>

      {(gap.candidateDetectionIds?.length ?? 0) > 0 && (
        <span className="text-[10px] text-primary flex-shrink-0" title="Available candidates; this gap is not yet covered by an enabled rule">
          {gap.candidateDetectionIds?.length} candidates
        </span>
      )}

      {/* Covered badge */}
      {isCovered && (
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0" style={{ backgroundColor: 'rgb(var(--md-ext-color-green) / 0.15)', color: 'rgb(var(--md-ext-color-green))' }}>
          Covered
        </span>
      )}

      {/* Dismissed badge */}
      {isDismissed && (
        <span className="text-[9px] text-outline/60 uppercase tracking-wider flex-shrink-0">
          Dismissed
        </span>
      )}

      {gap.crownRelevant && (
        <Icon name="shield" className="w-3 h-3 text-ext-amber flex-shrink-0" title="Crown jewel risk" />
      )}

      {/* Action buttons */}
      {showActions && !isCovered && !isDismissed && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onCreateDetection}
            className="px-2.5 py-1 text-[10px] font-medium rounded-lg transition-colors flex items-center gap-1"
            style={{ backgroundColor: 'rgb(var(--md-sys-color-primary) / 0.1)', color: 'rgb(var(--md-sys-color-primary))' }}
            title="Create detection for this technique"
          >
            <Icon name="plus" className="w-3 h-3" /> Create
          </button>
          <button
            onClick={onDismiss}
            className="px-2 py-1 text-[10px] text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
            title="Dismiss from plan"
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Restore button for dismissed items */}
      {isDismissed && (
        <button
          onClick={e => { e.stopPropagation(); onRestore?.(); }}
          className="text-[9px] font-bold text-ext-teal uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          Restore
        </button>
      )}

      <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}

function ExternalIntelGapRow({ gap, isCovered, isDismissed, onClick, onDismiss, onRestore }: GapRowProps): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-2 py-2 px-2.5 rounded-lg transition-colors cursor-pointer group ${isDismissed ? 'opacity-30' : 'opacity-50'}`}
      style={{ backgroundColor: 'rgb(var(--md-sys-color-surface-container) / 0.5)' }}
      onClick={onClick}
    >
      <span
        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{
          backgroundColor: 'rgb(var(--md-sys-color-outline) / 0.1)',
          color: 'rgb(var(--md-sys-color-outline))',
        }}
      >
        {gap.threatGroupCount}
      </span>

      <span className="font-mono text-[10px] font-bold text-outline/50 w-14 flex-shrink-0">
        {gap.mitreId}
      </span>

      <span className="text-[11px] text-on-surface-variant truncate flex-1 min-w-0">{gap.name}</span>

      {/* Covered badge */}
      {isCovered && (
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0" style={{ backgroundColor: 'rgb(var(--md-ext-color-green) / 0.15)', color: 'rgb(var(--md-ext-color-green))' }}>
          Covered
        </span>
      )}

      {!isDismissed ? (
        <>
          <span className="text-[8px] font-bold uppercase tracking-wider text-outline/60 flex-shrink-0 whitespace-nowrap">
            External intel required
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDismiss?.(); }}
            className="px-1 py-0.5 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Dismiss from plan"
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        </>
      ) : (
        <>
          <span className="text-[9px] text-outline/60 uppercase tracking-wider flex-shrink-0">
            Dismissed
          </span>
          <button
            onClick={e => { e.stopPropagation(); onRestore?.(); }}
            className="text-[9px] font-bold text-ext-teal uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            Restore
          </button>
        </>
      )}

      <Icon name="arrow-right" className="w-3 h-3 text-outline opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}
