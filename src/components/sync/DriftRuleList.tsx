import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { Button, ConfirmDialog } from '../ui';
import { DriftBadge } from './DriftBadge';
import type { DriftItem, DriftState } from '../../services/drift/types';

interface DriftRuleListProps {
  items: DriftItem[];
  onReview: (item: DriftItem) => void;
  /** Called when the user runs Accept on a multi-selection of non-conflicts. */
  onBulkAccept?: (detectionIds: string[]) => void | Promise<void>;
  /** Called when the user runs Keep mine on every visible conflict. */
  onBulkKeepMine?: (detectionIds: string[]) => void | Promise<void>;
  /** True while a bulk operation is in flight (disables the bar). */
  bulkBusy?: boolean;
}

type FilterKey = 'actionable' | 'conflict' | 'changed' | 'removed' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'actionable', label: 'Needs review' },
  { key: 'conflict', label: 'Conflicts' },
  { key: 'changed', label: 'Upstream changes' },
  { key: 'removed', label: 'Removed' },
  { key: 'all', label: 'All' },
];

const ACTIONABLE: DriftState[] = ['upstream_changed', 'conflict', 'upstream_removed'];

function matchesFilter(item: DriftItem, f: FilterKey): boolean {
  switch (f) {
    case 'actionable': return ACTIONABLE.includes(item.driftState);
    case 'conflict': return item.driftState === 'conflict';
    case 'changed': return item.driftState === 'upstream_changed';
    case 'removed': return item.driftState === 'upstream_removed';
    case 'all': return true;
  }
}

/** Eligible for bulk accept — only non-conflict, actionable upstream changes. */
function isBulkEligible(it: DriftItem): boolean {
  return it.driftState === 'upstream_changed';
}

export const DriftRuleList: React.FC<DriftRuleListProps> = ({ items, onReview, onBulkAccept, onBulkKeepMine, bulkBusy }) => {
  const [filter, setFilter] = useState<FilterKey>('actionable');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmKeepAll, setConfirmKeepAll] = useState(false);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { actionable: 0, conflict: 0, changed: 0, removed: 0, all: items.length };
    for (const it of items) {
      if (ACTIONABLE.includes(it.driftState)) c.actionable++;
      if (it.driftState === 'conflict') c.conflict++;
      if (it.driftState === 'upstream_changed') c.changed++;
      if (it.driftState === 'upstream_removed') c.removed++;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => matchesFilter(it, filter) && (!q || it.detectionName.toLowerCase().includes(q) || it.externalId.toLowerCase().includes(q)));
  }, [items, filter, search]);

  const visibleEligible = useMemo(() => visible.filter(isBulkEligible), [visible]);
  const visibleConflicts = useMemo(() => visible.filter((it) => it.driftState === 'conflict'), [visible]);
  const selectedEligibleIds = useMemo(
    () => visibleEligible.filter((it) => selected.has(it.detectionId)).map((it) => it.detectionId),
    [visibleEligible, selected],
  );
  const cosmeticInSelection = useMemo(
    () => selectedEligibleIds.filter((id) => visibleEligible.find((it) => it.detectionId === id)?.cosmeticOnly).length,
    [selectedEligibleIds, visibleEligible],
  );

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allEligibleSelected = visibleEligible.length > 0 && visibleEligible.every((it) => selected.has(it.detectionId));
  const toggleAllEligible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allEligibleSelected) {
        for (const it of visibleEligible) next.delete(it.detectionId);
      } else {
        for (const it of visibleEligible) next.add(it.detectionId);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  if (items.length === 0) {
    return <div className="text-[13px] text-on-surface-variant/60 py-4 text-center">No drift recorded for this source yet — run a check.</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold ${filter === f.key ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            {f.label}{f.key !== 'all' && counts[f.key] > 0 ? ` ${counts[f.key]}` : ''}
          </button>
        ))}
        <div className="ml-auto relative">
          <Icon name="filter-x" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or id…"
            className="pl-8 pr-2 py-1.5 text-[12.5px] rounded-lg bg-surface-container-highest text-on-surface placeholder:text-on-surface-variant/40 w-56 outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-[13px] text-on-surface-variant/60 py-4 text-center">Nothing matches.</div>
      ) : (
        <>
          {/* Conflict-filter bulk action — "Mark all visible conflicts as Keep mine".
              Useful after a comparator fix where many conflicts are known to be false positives. */}
          {filter === 'conflict' && visibleConflicts.length > 0 && onBulkKeepMine && (
            <div className="px-3 py-2 mb-2 flex items-center gap-3 text-[12.5px] rounded-lg bg-[#A63D40]/10 border border-[#A63D40]/30">
              <Icon name="alert-triangle" className="w-4 h-4 text-[#A63D40] dark:text-rose-400 shrink-0" />
              <span className="text-on-surface">
                {visibleConflicts.length} conflict{visibleConflicts.length === 1 ? '' : 's'} visible. If these are false positives (e.g. after a drift-checker fix), bulk-mark them as <strong>Keep mine</strong> to clear the noise.
              </span>
              <Button color="secondary" size="sm" leadingIcon="shield-check" loading={bulkBusy} disabled={bulkBusy} onClick={() => setConfirmKeepAll(true)} className="ml-auto">
                Keep mine for {visibleConflicts.length}
              </Button>
            </div>
          )}

          {visibleEligible.length > 0 && onBulkAccept && (
            <div className="px-3 py-2 mb-2 flex items-center gap-2 text-[12px] text-on-surface-variant rounded-lg bg-surface-container-highest/60">
              <input
                type="checkbox"
                aria-label="Select all eligible"
                checked={allEligibleSelected}
                onChange={toggleAllEligible}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span>
                {allEligibleSelected
                  ? `All ${visibleEligible.length} eligible selected`
                  : `Select all ${visibleEligible.length} eligible`}
                <span className="text-on-surface-variant/50"> · conflicts excluded</span>
              </span>
            </div>
          )}
          <div className="rounded-lg border border-outline-variant/15 divide-y divide-outline-variant/10">
            {visible.slice(0, 300).map((it) => {
              const eligible = isBulkEligible(it);
              const checked = selected.has(it.detectionId);
              return (
                <div key={it.detectionId} className="px-3 py-2.5 flex items-center gap-3 hover:bg-surface-container/40">
                  {onBulkAccept ? (
                    eligible ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${it.detectionName}`}
                        checked={checked}
                        onChange={() => toggleOne(it.detectionId)}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                    ) : (
                      <span className="w-3.5 h-3.5" aria-hidden />
                    )
                  ) : null}
                  <DriftBadge state={it.driftState} size="xs" compact />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-on-surface truncate">{it.detectionName}</div>
                    <div className="text-[11px] text-on-surface-variant/50 font-mono truncate">{it.externalId}</div>
                  </div>
                  {it.driftState === 'upstream_changed' && (
                    <span className="text-[11px] text-on-surface-variant/60 hidden sm:inline">
                      {it.cosmeticOnly ? 'cosmetic' : `${it.fieldDiffs.length} field${it.fieldDiffs.length === 1 ? '' : 's'}`}
                    </span>
                  )}
                  {it.isConflict && <span className="text-[11px] font-semibold text-[#A6750D] dark:text-amber-400 hidden sm:inline">edited locally</span>}
                  <Button color="secondary" size="sm" onClick={() => onReview(it)}>Review</Button>
                </div>
              );
            })}
            {visible.length > 300 && (
              <div className="px-3 py-2 text-[12px] text-on-surface-variant/60">Showing 300 of {visible.length} — refine the filter.</div>
            )}
          </div>

          {confirmKeepAll && onBulkKeepMine && (
            <ConfirmDialog
              isOpen
              variant="warning"
              title={`Keep mine for ${visibleConflicts.length} rule${visibleConflicts.length === 1 ? '' : 's'}?`}
              message={`This advances each rule's baseline to the current upstream version, so they stop showing as drifted (until upstream changes again). Your local rule content is unchanged. Use this when you know these conflicts are false positives.`}
              confirmLabel="Keep mine"
              cancelLabel="Cancel"
              onConfirm={async () => {
                setConfirmKeepAll(false);
                await onBulkKeepMine(visibleConflicts.map((it) => it.detectionId));
              }}
              onClose={() => setConfirmKeepAll(false)}
            />
          )}

          {selectedEligibleIds.length > 0 && onBulkAccept && (
            <div className="mt-3 sticky bottom-2 z-10 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 backdrop-blur flex items-center gap-3 shadow-lg">
              <span className="text-[12.5px] font-semibold text-on-surface">
                {selectedEligibleIds.length} selected
                {cosmeticInSelection > 0 && (
                  <span className="ml-1 text-on-surface-variant font-normal">({cosmeticInSelection} cosmetic)</span>
                )}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button color="secondary" size="sm" onClick={clearSelection} disabled={bulkBusy}>Clear</Button>
                <Button
                  color="primary"
                  size="sm"
                  loading={bulkBusy}
                  leadingIcon="arrow-down"
                  onClick={async () => {
                    await onBulkAccept(selectedEligibleIds);
                    clearSelection();
                  }}
                >
                  Accept upstream for {selectedEligibleIds.length}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
