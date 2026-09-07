import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icon';
import type { CoveringDetection, TTPLike } from './types';
import { TTPCard } from './TTPCard';
import { MITRE_TACTICS_ORDER } from './TTPMiniMatrix';

interface TTPTacticListProps {
  ttps: TTPLike[];
  search?: string;
  // Digest inline-edit
  editingId?: string | null;
  editingValue?: string;
  onCopy?: (v: string) => void;
  onStartEdit?: (ttp: TTPLike) => void;
  onSaveEdit?: (id: string, newExplanation: string) => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onRemove?: (id: string) => void;
  // Both pages
  onCreateDetection?: (ttp: TTPLike) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  // Story-only
  showSources?: boolean;
  /**
   * Resolves the detections behind a TTP's coverage badge (G8). Threaded rather
   * than resolved here so the list stays presentational and the owning page
   * decides what "covering" means -- the digest resolves against its own
   * libraryMatches; the story page supplies nothing and the badge stays inert.
   */
  getCoveringDetections?: (ttp: TTPLike) => CoveringDetection[];
}

export const TTPTacticList: React.FC<TTPTacticListProps> = ({
  ttps, search = '',
  editingId, editingValue,
  onCopy, onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onRemove,
  onCreateDetection, selectedIds, onToggleSelect, showSources, getCoveringDetections,
}) => {
  const [expandedTactics, setExpandedTactics] = useState<Set<string>>(new Set());

  const ttpsByTactic = useMemo(() => {
    const map = new Map<string, TTPLike[]>();

    const filtered = search
      ? ttps.filter(t =>
          t.techniqueName.toLowerCase().includes(search.toLowerCase()) ||
          t.mitreId.toLowerCase().includes(search.toLowerCase())
        )
      : ttps;

    filtered.forEach(ttp => {
      let tacticName = ttp.tacticName;
      if (!tacticName && ttp.tacticId) {
        const tactic = MITRE_TACTICS_ORDER.find(t => t.id === ttp.tacticId);
        if (tactic) tacticName = tactic.name;
      }
      if (!tacticName) tacticName = 'Uncategorized';

      if (!map.has(tacticName)) map.set(tacticName, []);
      map.get(tacticName)!.push(ttp);
    });

    // Sort within a tactic: multi-source first (corroboration > coverage), then MITRE ID.
    map.forEach(techniques => {
      techniques.sort((a, b) => {
        const aS = a.sources?.length ?? 0;
        const bS = b.sources?.length ?? 0;
        if (aS !== bS) return bS - aS;
        return a.mitreId.localeCompare(b.mitreId);
      });
    });

    // Sort tactics by MITRE order
    const sortedMap = new Map<string, TTPLike[]>();
    const tacticOrder = MITRE_TACTICS_ORDER.map(t => t.name);
    tacticOrder.forEach(tacticName => {
      if (map.has(tacticName)) sortedMap.set(tacticName, map.get(tacticName)!);
    });
    map.forEach((techniques, tacticName) => {
      if (!sortedMap.has(tacticName)) sortedMap.set(tacticName, techniques);
    });

    return sortedMap;
  }, [ttps, search]);

  useEffect(() => {
    setExpandedTactics(new Set(ttpsByTactic.keys()));
  }, [ttpsByTactic]);

  const toggleTactic = (tactic: string) => {
    setExpandedTactics(prev => {
      const next = new Set(prev);
      if (next.has(tactic)) next.delete(tactic);
      else next.add(tactic);
      return next;
    });
  };

  if (ttpsByTactic.size === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant bg-surface-container-low rounded-2xl border border-outline-variant/30">
        No techniques match your search.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(ttpsByTactic.entries()).map(([tacticName, tacticTTPs]) => {
        const isExpanded = expandedTactics.has(tacticName);
        const coveredCount = tacticTTPs.filter(t => t.hasExistingDetection).length;
        const gapCount = tacticTTPs.length - coveredCount;
        const corroboratedCount = tacticTTPs.filter(t => (t.sources?.length ?? 0) >= 2).length;

        return (
          <div key={tacticName} className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden">
            <button
              onClick={() => toggleTactic(tacticName)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-container transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-1 h-8 rounded-full ${coveredCount > 0 ? 'bg-[#4D7C6F]' : 'bg-surface-variant'}`}></div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-on-surface group-hover:text-tertiary transition-colors">{tacticName}</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium flex items-center gap-2">
                    {tacticTTPs.length} Technique{tacticTTPs.length !== 1 ? 's' : ''}
                    {coveredCount > 0 && (
                      <>
                        <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                        <span className="text-[#4D7C6F]">{coveredCount} Covered</span>
                      </>
                    )}
                    {gapCount > 0 && (
                      <>
                        <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                        <span className="text-on-surface-variant">{gapCount} Gap{gapCount !== 1 ? 's' : ''}</span>
                      </>
                    )}
                    {showSources && corroboratedCount > 0 && (
                      <>
                        <span className="w-1 h-1 bg-surface-variant rounded-full"></span>
                        <span className="text-emerald-600 dark:text-emerald-400">{corroboratedCount} Corroborated</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface transition-colors" />
            </button>

            {isExpanded && (
              <div className="p-4 pt-0 grid grid-cols-1 xl:grid-cols-2 gap-4 border-t border-outline-variant/10 bg-surface-container-lowest">
                <div className="h-1 col-span-full"></div>
                {tacticTTPs.map((ttp, i) => {
                  const key = ttp.id ?? `${ttp.mitreId}-${i}`;
                  return (
                    <TTPCard
                      key={key}
                      ttp={ttp}
                      isEditing={editingId === ttp.id}
                      editValue={editingId === ttp.id ? (editingValue ?? '') : (ttp.explanation || '')}
                      onCreateDetection={onCreateDetection}
                      onCopy={onCopy}
                      onStartEdit={onStartEdit}
                      onSaveEdit={onSaveEdit}
                      onCancelEdit={onCancelEdit}
                      onEditChange={onEditChange}
                      onRemove={onRemove}
                      isSelected={ttp.id ? selectedIds?.has(ttp.id) ?? false : false}
                      onToggleSelect={onToggleSelect && ttp.id ? () => onToggleSelect(ttp.id!) : undefined}
                      showSources={showSources}
                      coveringDetections={getCoveringDetections?.(ttp)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
