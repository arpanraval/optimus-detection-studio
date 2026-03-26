import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Detection, Status } from '../../types';
import { Icon } from '../Icon';
import { KanbanCard } from './KanbanCard';
import type { UserLookup } from './KanbanBoard';

interface KanbanColumnProps {
  status: Status;
  detections: Detection[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  totalDetections: number;
  userLookup: UserLookup;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  wipLimit?: number;
  onSetWipLimit?: (limit: number | null) => void;
  cardDensity?: 'comfortable' | 'compact';
  flaggedIds?: Set<string>;
  onToggleFlag?: (id: string) => void;
}

// Design system aligned column themes
const COLUMN_THEME: Record<Status, { dot: string; accent: string; icon: string }> = {
  [Status.Backlog]:     { dot: 'bg-on-surface-variant/40', accent: 'text-on-surface-variant', icon: 'inbox' },
  [Status.Draft]:       { dot: 'bg-on-surface-variant/60', accent: 'text-on-surface-variant', icon: 'file-text' },
  [Status.Development]: { dot: 'bg-purple-500',            accent: 'text-purple-400',         icon: 'code' },
  [Status.Review]:      { dot: 'bg-[#783264]',             accent: 'text-[#783264]',          icon: 'eye' },
  [Status.Testing]:     { dot: 'bg-[#0284C7]',             accent: 'text-[#0284C7]',          icon: 'shield-check' },
  [Status.Production]:  { dot: 'bg-[#4D7C6F]',             accent: 'text-[#4D7C6F]',          icon: 'check-circle' },
  [Status.Deprecated]:  { dot: 'bg-[#A63D40]',             accent: 'text-[#A63D40]',          icon: 'alert-triangle' },
  [Status.Archived]:    { dot: 'bg-on-surface-variant/30', accent: 'text-on-surface-variant/50', icon: 'archive' },
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  detections,
  selectedIds,
  onToggleSelect,
  totalDetections,
  userLookup,
  isCollapsed,
  onToggleCollapse,
  wipLimit,
  onSetWipLimit,
  cardDensity,
  flaggedIds,
  onToggleFlag,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });

  const theme = COLUMN_THEME[status];
  const detectionIds = detections.map(d => d.id);
  const criticalCount = detections.filter(d => d.severity === 'Critical' || d.severity === 'High').length;
  const isOverWip = wipLimit != null && detections.length > wipLimit;
  const isAtWip = wipLimit != null && detections.length === wipLimit;

  const [showWipInput, setShowWipInput] = useState(false);
  const [wipInputValue, setWipInputValue] = useState('');

  // Collapsed state
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        className={`flex flex-col items-center w-10 min-w-[40px] flex-shrink-0 h-full rounded-2xl bg-surface-container border border-outline-variant/20 cursor-pointer hover:bg-surface-container-high transition-colors ${
          isOver ? 'bg-[#783264]/8 ring-2 ring-[#783264]/20' : ''
        }`}
        onClick={onToggleCollapse}
        title={`${status} (${detections.length}) - Click to expand`}
      >
        <div className="pt-3 pb-2">
          <Icon name={theme.icon} className={`w-4 h-4 ${theme.accent}`} />
        </div>
        <span className="text-[10px] font-bold tabular-nums text-on-surface-variant">{detections.length}</span>
        <div className="flex-1" />
        <div className="pb-3">
          <Icon name="chevron-right" className="w-3 h-3 text-on-surface-variant/40" />
        </div>
      </div>
    );
  }

  const handleWipBadgeClick = () => {
    setWipInputValue(wipLimit != null ? String(wipLimit) : '');
    setShowWipInput(true);
  };

  const handleWipSubmit = () => {
    const parsed = parseInt(wipInputValue, 10);
    if (onSetWipLimit) {
      onSetWipLimit(wipInputValue.trim() === '' || isNaN(parsed) || parsed <= 0 ? null : parsed);
    }
    setShowWipInput(false);
  };

  const handleWipKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleWipSubmit();
    if (e.key === 'Escape') setShowWipInput(false);
  };

  return (
    <div className="flex flex-col min-w-[320px] flex-1 h-full">
      {/* Column Header - elevated surface for dark mode visibility */}
      <div className="rounded-2xl px-4 py-3 mb-2 bg-surface-container border border-outline-variant/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-surface-container-highest/50 flex items-center justify-center">
              <Icon name={theme.icon} className={`w-3.5 h-3.5 ${theme.accent}`} />
            </div>
            <span className="text-[13px] font-semibold text-on-surface">{status}</span>

            {/* Count + WIP badge */}
            {showWipInput ? (
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-lg bg-surface-container-highest/60 text-on-surface-variant">
                  {detections.length}
                </span>
                <span className="text-[10px] text-on-surface-variant">/</span>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  value={wipInputValue}
                  onChange={(e) => setWipInputValue(e.target.value)}
                  onBlur={handleWipSubmit}
                  onKeyDown={handleWipKeyDown}
                  placeholder="∞"
                  className="w-10 text-[11px] font-bold tabular-nums px-1 py-0.5 rounded-lg bg-surface-container-highest border border-outline-variant/30 text-on-surface outline-none focus:border-[#783264]/40 text-center"
                />
              </div>
            ) : (
              <button
                onClick={handleWipBadgeClick}
                title={wipLimit != null ? `WIP limit: ${wipLimit} (click to edit)` : 'Click to set WIP limit'}
                className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-lg transition-colors ${
                  isOverWip
                    ? 'bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20'
                    : isAtWip
                      ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                      : 'bg-surface-container-highest/60 text-on-surface-variant border border-transparent'
                }`}
              >
                {detections.length}{wipLimit != null && `/${wipLimit}`}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20">
                {criticalCount} high+
              </span>
            )}
            <button
              onClick={onToggleCollapse}
              title="Collapse column"
              className="p-1 rounded-lg hover:bg-surface-container-highest/60 transition-colors text-on-surface-variant/40 hover:text-on-surface-variant"
            >
              <Icon name="chevron-left" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {detections.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-outline-variant/10">
            <span className="text-[9px] text-on-surface-variant/50">
              Avg Q: <span className="font-bold text-on-surface-variant">{Math.round(detections.reduce((s, d) => s + (d.qualityScore || 0), 0) / detections.length)}</span>
            </span>
            <div className="h-3 w-px bg-outline-variant/10" />
            {(() => {
              const crit = detections.filter(d => d.severity === 'Critical').length;
              const high = detections.filter(d => d.severity === 'High').length;
              const med = detections.filter(d => d.severity === 'Medium').length;
              const low = detections.filter(d => d.severity === 'Low').length;
              return (
                <div className="flex items-center gap-1">
                  {crit > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-[#A63D40]/10 text-[#A63D40]">{crit}C</span>}
                  {high > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-orange-500/10 text-orange-400">{high}H</span>}
                  {med > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-500">{med}M</span>}
                  {low > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-[#4D7C6F]/10 text-[#4D7C6F]">{low}L</span>}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Card Area - visible lane background */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl p-2 space-y-2 overflow-y-auto scrollbar-thin transition-all duration-200 bg-surface-container-low/50 border ${
          isOverWip
            ? 'border-[#A63D40]/30'
            : 'border-outline-variant/10'
        } ${
          isOver ? 'bg-[#783264]/8 ring-2 ring-[#783264]/20 ring-inset border-[#783264]/20' : ''
        }`}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <SortableContext items={detectionIds} strategy={verticalListSortingStrategy}>
          {detections.map(detection => (
            <KanbanCard
              key={detection.id}
              detection={detection}
              isSelected={selectedIds.has(detection.id)}
              onToggleSelect={onToggleSelect}
              userLookup={userLookup}
              cardDensity={cardDensity}
              isFlagged={flaggedIds?.has(detection.id)}
              onToggleFlag={onToggleFlag}
            />
          ))}
        </SortableContext>

        {detections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-outline-variant/20">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center mb-3">
              <Icon name={theme.icon} className={`w-5 h-5 ${theme.accent} opacity-40`} />
            </div>
            <span className="text-[11px] font-medium text-on-surface-variant/40">No detections</span>
            <span className="text-[10px] text-on-surface-variant/25 mt-1">Drag items here</span>
          </div>
        )}
      </div>
    </div>
  );
};
