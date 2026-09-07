import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { Tooltip } from '../ui/Tooltip';
import { DriftSourceRow } from './DriftSourceRow';
import { LIBRARY_LABELS_SHORT } from '../../constants/library';
import type {
  DriftVendorCard as DriftVendorCardType,
  DriftSource,
  DriftItem,
  DriftCheckProgress,
  DriftCheckResult,
} from '../../services/drift/types';
import type { IconName } from '../Icon';

const FRESH_UNTIL_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function timeAgo(iso: string | null): string {
  if (!iso) return 'never checked';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function freshnessClasses(iso: string | null): { classes: string; iconName: IconName; label: string } {
  if (!iso) return { classes: 'bg-surface-container-highest text-on-surface-variant/70', iconName: 'clock', label: 'Never checked' };
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < FRESH_UNTIL_MS) return { classes: 'bg-[#4D7C6F]/15 text-[#4D7C6F]', iconName: 'check-circle', label: `Fresh · ${timeAgo(iso)}` };
  if (ms < STALE_AFTER_MS) return { classes: 'bg-[#A6750D]/15 text-[#A6750D] dark:text-amber-400', iconName: 'clock', label: `Aging · ${timeAgo(iso)}` };
  return { classes: 'bg-[#A63D40]/15 text-[#A63D40] dark:text-rose-400', iconName: 'alert-triangle', label: `Stale · ${timeAgo(iso)}` };
}

interface DriftVendorCardProps {
  card: DriftVendorCardType;
  refreshSignal?: number;
  running: boolean;
  activeSourceUrl: string | null;
  progress: DriftCheckProgress | null;
  onRun: (source: DriftSource) => Promise<DriftCheckResult | undefined>;
  onReview: (item: DriftItem, source: DriftSource) => void;
}

/**
 * Top-level card for a known vendor: collapses every subdir import of the same
 * `(owner, repo, target_library)` into one entry. The card header shows the
 * vendor identity + aggregate stats + freshness; the body lists each subdir as
 * an individually checkable row.
 */
export const DriftVendorCard: React.FC<DriftVendorCardProps> = ({ card, refreshSignal, running, activeSourceUrl, progress, onRun, onReview }) => {
  const [expanded, setExpanded] = useState(true); // open by default — there's only useful info inside
  const fresh = freshnessClasses(card.lastCheckedAt);
  const subdirCount = card.subdirs.length;
  const libraryCounts = card.subdirs.reduce<Record<string, number>>((acc, s) => {
    acc[s.targetLibrary] = (acc[s.targetLibrary] ?? 0) + 1;
    return acc;
  }, {});

  const checkAll = async () => {
    for (const s of card.subdirs) {
      if (s.pinned) continue;
      await onRun(s);
    }
  };

  return (
    <div className="bg-surface-container dark:bg-surface-container-high border border-outline-variant/15 rounded-2xl overflow-hidden">
      {/* Vendor header */}
      <div className="px-5 py-4 bg-surface-container-highest border-b border-outline-variant/20 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Icon name="git-branch" className="w-5 h-5 text-primary shrink-0" />
            <span className="font-bold text-on-surface text-[15px]">{card.owner}/{card.repo}</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
              {subdirCount} {subdirCount === 1 ? 'directory' : 'directories'}
            </span>
            {Object.entries(libraryCounts).map(([lib, count]) => (
              <Tooltip key={lib} content={`${count} ${count === 1 ? 'directory' : 'directories'} → ${LIBRARY_LABELS_SHORT[lib as keyof typeof LIBRARY_LABELS_SHORT] ?? lib} library`}>
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">
                  {count}× {LIBRARY_LABELS_SHORT[lib as keyof typeof LIBRARY_LABELS_SHORT] ?? lib}
                </span>
              </Tooltip>
            ))}
          </div>
          {/* Aggregate stats */}
          <div className="flex items-center gap-4 mt-3 flex-wrap text-[12px]">
            <Tooltip content="Total local detections imported from this vendor across all directories.">
              <span className="text-on-surface-variant"><span className="font-mono font-bold tabular-nums text-on-surface">{card.totalTracked.toLocaleString()}</span> tracked</span>
            </Tooltip>
            {card.totalConflicts > 0 && (
              <Tooltip content="You edited locally + upstream changed. Accept Upstream would overwrite your edits.">
                <span className="text-[#A63D40] dark:text-rose-400"><span className="font-mono font-bold tabular-nums">{card.totalConflicts.toLocaleString()}</span> conflict</span>
              </Tooltip>
            )}
            {card.totalDrifted - card.totalConflicts > 0 && (
              <Tooltip content="Upstream content changed; you didn't edit locally.">
                <span className="text-[#A6750D] dark:text-amber-400"><span className="font-mono font-bold tabular-nums">{(card.totalDrifted - card.totalConflicts).toLocaleString()}</span> upstream update</span>
              </Tooltip>
            )}
            {card.totalRemoved > 0 && (
              <Tooltip content="Local detections whose upstream rule no longer exists at this source.">
                <span className="text-on-surface-variant"><span className="font-mono font-bold tabular-nums">{card.totalRemoved.toLocaleString()}</span> removed</span>
              </Tooltip>
            )}
            {card.totalNewUpstream > 0 && (
              <Tooltip content="Upstream rules at this vendor that aren't yet imported.">
                <span className="text-[#0284C7]"><span className="font-mono font-bold tabular-nums">{card.totalNewUpstream.toLocaleString()}</span> new upstream</span>
              </Tooltip>
            )}
            {card.totalUntrackable > 0 && (
              <Tooltip content="Local detections from this vendor with no external_id — can't be matched to upstream.">
                <span className="text-on-surface-variant/60"><span className="font-mono font-bold tabular-nums">{card.totalUntrackable.toLocaleString()}</span> no upstream id</span>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip content={card.lastCheckedAt ? `Most-recent check across ${subdirCount} ${subdirCount === 1 ? 'directory' : 'directories'} — ${new Date(card.lastCheckedAt).toLocaleString()}` : 'No directory has been checked yet.'} position="left">
            <span className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5 ${fresh.classes}`}>
              <Icon name={fresh.iconName} className="w-3 h-3" />
              {fresh.label}
            </span>
          </Tooltip>
          <Button
            color="primary"
            size="sm"
            leadingIcon="refresh-cw"
            disabled={running}
            onClick={checkAll}
          >
            Check all
          </Button>
          <Button color="secondary" size="sm" leadingIcon={expanded ? 'chevron-down' : 'chevron-right'} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </div>

      {/* Subdir entries */}
      {expanded && (
        <div className="p-3 space-y-3">
          {card.subdirs.map((s) => (
            <DriftSourceRow
              key={`${s.sourceUrl}::${s.targetLibrary}`}
              source={s}
              variant="subdir"
              refreshSignal={refreshSignal}
              running={running}
              activeSourceUrl={activeSourceUrl}
              progress={progress}
              onRun={onRun}
              onReview={onReview}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DriftVendorCard;
