import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { Tooltip } from '../ui/Tooltip';
import { DriftRuleList } from './DriftRuleList';
import { NewUpstreamRulesPanel } from './NewUpstreamRulesPanel';
import { useSourceDrift } from '../../hooks/useSourceDrift';
import { useToast } from '../../hooks/useToast';
import { useAppData } from '../../router/AppDataContext';
import { bulkApplyUpstream, bulkAcceptCosmetic, bulkKeepMine } from '../../services/drift/driftMutations';
import { LIBRARY_LABELS_SHORT } from '../../constants/library';
import type { DriftSourceWithStats, DriftSource, DriftItem, DriftCheckProgress, DriftCheckResult, SourceReachability, NewUpstreamRule } from '../../services/drift/types';

const CANONICAL_OWNERS = new Set(['sigmahq', 'splunk', 'elastic', 'azure', 'chronicle', 'crowdstrike', 'mitre-attack', 'google']);

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

const RECHECK_SOFT_LIMIT_MS = 30_000;
const FRESH_UNTIL_MS = 24 * 60 * 60 * 1000;          // < 24h → fresh (green)
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;      // > 7d  → stale (red)

interface Freshness {
  label: string;
  classes: string;
  iconName: string;
}

function freshnessFor(iso: string | null, pinned?: boolean): Freshness {
  if (pinned) return { label: 'Pinned', classes: 'bg-surface-container-highest text-on-surface-variant/70', iconName: 'lock' };
  if (!iso) return { label: 'Never checked', classes: 'bg-surface-container-highest text-on-surface-variant/70', iconName: 'clock' };
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < FRESH_UNTIL_MS) return { label: `Fresh · ${timeAgo(iso)}`, classes: 'bg-[#4D7C6F]/15 text-[#4D7C6F]', iconName: 'check-circle' };
  if (ms < STALE_AFTER_MS) return { label: `Aging · ${timeAgo(iso)}`, classes: 'bg-[#A6750D]/15 text-[#A6750D] dark:text-amber-400', iconName: 'clock' };
  return { label: `Stale · ${timeAgo(iso)}`, classes: 'bg-[#A63D40]/15 text-[#A63D40] dark:text-rose-400', iconName: 'alert-triangle' };
}

const REACHABILITY_MSG: Record<SourceReachability, string | null> = {
  ok: null,
  pinned: 'Pinned to a tag/commit — no drift possible.',
  not_found: 'Repository or branch not found upstream — it may have been deleted, renamed, or made private.',
  needs_token: 'Private repo — provide a GitHub token to check it.',
  rate_limited: 'GitHub API rate limit reached — try again later or use a token.',
};

interface DriftSourceRowProps {
  source: DriftSourceWithStats;
  /** 'standalone' = full card (current behaviour, used for fork/custom sources).
   *  'subdir'     = compact entry rendered inside a DriftVendorCard. The
   *                  vendor identity is omitted because the parent card already
   *                  shows it; the subdir path is the visual anchor instead. */
  variant?: 'standalone' | 'subdir';
  /** Bump from the parent to re-fetch this row's persisted drift (e.g. after a review action elsewhere). */
  refreshSignal?: number;
  /** Shared check controller from the parent section. */
  running: boolean;
  activeSourceUrl: string | null;
  progress: DriftCheckProgress | null;
  onRun: (source: DriftSource) => Promise<DriftCheckResult | undefined>;
  onReview: (item: DriftItem, source: DriftSource) => void;
}

export const DriftSourceRow: React.FC<DriftSourceRowProps> = ({ source, variant = 'standalone', refreshSignal = 0, running, activeSourceUrl, progress, onRun, onReview }) => {
  const [expanded, setExpanded] = useState(false);
  const [lastResult, setLastResult] = useState<DriftCheckResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const sourceForHook: DriftSource | null = expanded ? source : null;
  const { items, lastCheckedAt, reachability, refresh } = useSourceDrift(sourceForHook);
  const { showToast } = useToast();
  const { profile } = useAppData();
  const actorId = profile?.id ?? '';

  const cosmeticCount = items.filter((it) => it.driftState === 'upstream_changed' && it.cosmeticOnly).length;

  const onBulkAccept = async (detectionIds: string[]) => {
    if (!actorId) { showToast('error', 'Not signed in', 'Could not determine the acting user.'); return; }
    setBulkBusy(true);
    try {
      const res = await bulkApplyUpstream(detectionIds, { actorId });
      const ok = res.succeeded.length, bad = res.failed.length;
      if (ok > 0 && bad === 0) showToast('success', `Synced ${ok} rule${ok === 1 ? '' : 's'} from upstream`);
      else if (ok > 0 && bad > 0) showToast('warning', `Synced ${ok}, ${bad} failed`, res.failed[0]?.error);
      else showToast('error', `Could not sync any of the ${bad} rule${bad === 1 ? '' : 's'}`, res.failed[0]?.error);
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const onAcceptCosmetic = async () => {
    if (!actorId) { showToast('error', 'Not signed in', 'Could not determine the acting user.'); return; }
    setBulkBusy(true);
    try {
      const res = await bulkAcceptCosmetic(source.sourceUrl, source.targetLibrary, { actorId });
      const ok = res.succeeded.length;
      if (ok === 0) showToast('info', 'No cosmetic-only changes to accept.');
      else showToast('success', `Accepted ${ok} cosmetic update${ok === 1 ? '' : 's'}`, res.failed.length ? `${res.failed.length} failed` : undefined);
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const onBulkKeepMine = async (detectionIds: string[]) => {
    if (!actorId) { showToast('error', 'Not signed in', 'Could not determine the acting user.'); return; }
    setBulkBusy(true);
    try {
      const res = await bulkKeepMine(detectionIds, { actorId });
      const ok = res.succeeded.length, bad = res.failed.length;
      if (ok > 0 && bad === 0) showToast('success', `Marked ${ok} rule${ok === 1 ? '' : 's'} as Keep mine`);
      else if (ok > 0) showToast('warning', `Kept ${ok}, ${bad} failed`, res.failed[0]?.error);
      else showToast('error', `Could not keep any of the ${bad} rule${bad === 1 ? '' : 's'}`, res.failed[0]?.error);
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    if (refreshSignal > 0 && expanded) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const isChecking = running && activeSourceUrl === source.sourceUrl;
  const isOtherChecking = running && activeSourceUrl !== source.sourceUrl;
  const isFork = source.owner ? !CANONICAL_OWNERS.has(source.owner.toLowerCase()) : false;
  const effectiveReachability: SourceReachability = source.pinned ? 'pinned' : (lastResult?.reachability ?? reachability ?? source.reachability);
  const reachMsg = REACHABILITY_MSG[effectiveReachability];
  const checkedIso = lastResult?.checkedAt ?? lastCheckedAt ?? source.lastCheckedAt;
  const recentlyChecked = checkedIso ? Date.now() - new Date(checkedIso).getTime() < RECHECK_SOFT_LIMIT_MS : false;

  const newUpstream: NewUpstreamRule[] = lastResult?.newUpstream ?? [];
  const tracked = lastResult?.counts.tracked ?? source.tracked;
  const drifted = lastResult ? (lastResult.counts.changed + lastResult.counts.conflict) : source.drifted;
  const conflicts = lastResult?.counts.conflict ?? source.conflicts;
  const removed = lastResult?.counts.removed ?? source.removed;
  const untrackable = lastResult?.counts.untrackable ?? source.untrackable;

  const handleCheck = async () => {
    if (recentlyChecked && !window.confirm(`Checked ${timeAgo(checkedIso)}. Re-check anyway?`)) return;
    const r = await onRun(source);
    if (r) {
      setLastResult(r);
      setExpanded(true);
      refresh();
    }
  };

  const fresh = freshnessFor(checkedIso, source.pinned);
  const isSubdir = variant === 'subdir';

  return (
    <div className={`bg-surface-container dark:bg-surface-container-high border rounded-2xl overflow-hidden ${expanded ? 'border-primary/30' : 'border-outline-variant/15'}`}>
      {/* Header — vendor identity (standalone) OR subdir path (subdir) */}
      <div className={`px-5 ${isSubdir ? 'py-3' : 'py-4'} bg-surface-container-highest border-b border-outline-variant/20 flex items-start justify-between gap-4`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isSubdir ? (
              <>
                <Icon name="archive" className="w-4 h-4 text-on-surface-variant shrink-0" />
                <span className="font-mono font-semibold text-on-surface text-[13px] truncate">{source.subdir || '(repo root)'}</span>
              </>
            ) : (
              <>
                <Icon name="git-branch" className="w-5 h-5 text-primary shrink-0" />
                <span className="font-bold text-on-surface text-[15px] truncate">{source.owner}/{source.repo}</span>
                {source.subdir && <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-mono text-on-surface-variant/70 truncate max-w-[200px]">{source.subdir}</span>}
              </>
            )}
            {source.ref && <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-mono text-on-surface-variant/70">{source.ref}</span>}
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/70">{LIBRARY_LABELS_SHORT[source.targetLibrary] ?? source.targetLibrary}</span>
            {isFork && !isSubdir && <span className="px-1.5 py-0.5 rounded bg-[#A6750D]/15 text-[10px] font-semibold text-[#A6750D] dark:text-amber-400 inline-flex items-center gap-1"><Icon name="git-fork" className="w-2.5 h-2.5" />fork / mirror</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip content={checkedIso ? `Last checked ${new Date(checkedIso).toLocaleString()}` : 'Run a check to populate drift state.'} position="left">
            <span className={`px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5 ${fresh.classes}`}>
              <Icon name={fresh.iconName} className="w-3 h-3" />
              {fresh.label}
            </span>
          </Tooltip>
          <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-on-surface-variant/50 hover:text-primary" aria-label="Open on GitHub">
            <Icon name="external-link" className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* FOCUS — stats / progress */}
      <div className="px-5 py-5 border-b border-outline-variant/15">
        {isChecking ? (
          <div className="space-y-2">
            <div className="text-[13px] text-on-surface-variant">{progress?.message ?? 'Checking…'}</div>
            <div className="h-1.5 bg-primary/15 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: progress && progress.total > 0 ? `${Math.min(100, (progress.current / progress.total) * 100)}%` : '40%' }} />
            </div>
          </div>
        ) : effectiveReachability !== 'ok' && effectiveReachability !== 'pinned' ? (
          <div className="text-[13px] text-[#A63D40] flex items-center gap-2"><Icon name="alert-triangle" className="w-4 h-4" />{reachMsg}</div>
        ) : (
          <div className="flex items-end gap-6 flex-wrap">
            {/* Conflicts is the most actionable — render largest when > 0 */}
            <Stat value={conflicts} label="conflicts" tone="error" emphasis={conflicts > 0 ? 'primary' : 'neutral'}
              hint="Drifted detections that you also edited locally — Accept Upstream would overwrite your edits. Review carefully." />
            <Stat value={drifted - conflicts} label="upstream changes" tone="warn" emphasis={drifted - conflicts > 0 ? 'primary' : 'neutral'}
              hint="Upstream content changed since import; you didn't edit locally. Usually safe to accept in bulk." />
            <Stat value={removed} label="removed" tone="neutral" emphasis={removed > 0 ? 'secondary' : 'neutral'}
              hint="Detections whose upstream rule no longer exists at this source (deprecated, deleted, or moved out of scope)." />
            <span className="text-on-surface-variant/30 text-[10px] mb-2">·</span>
            <Stat value={tracked} label="tracked total" tone="muted" emphasis="secondary"
              hint="Local detections imported from this source with an upstream id, eligible for drift checking." />
            {newUpstream.length > 0 && <Stat value={newUpstream.length} label="new upstream" tone="info" emphasis="secondary"
              hint="Upstream rules at this source that aren't yet imported into your library." />}
            {untrackable > 0 && <Stat value={untrackable} label="no upstream id" tone="muted" emphasis="secondary"
              hint="Detections from this source missing an external_id — can't be matched to upstream. Check the source data quality." />}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap">
        <Button
          color="primary"
          size="sm"
          leadingIcon="refresh-cw"
          loading={isChecking}
          disabled={isChecking || isOtherChecking || source.pinned}
          onClick={handleCheck}
        >
          {source.pinned ? 'No drift possible' : 'Check for updates'}
        </Button>
        <Button color="secondary" size="sm" leadingIcon={expanded ? 'chevron-down' : 'chevron-right'} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Collapse' : 'Review'}
        </Button>
        {expanded && cosmeticCount > 0 && (
          <Tooltip content="Accept all upstream changes that don't change any tracked field">
            <Button color="secondary" size="sm" leadingIcon="check-circle" loading={bulkBusy} disabled={bulkBusy} onClick={onAcceptCosmetic}>
              Accept {cosmeticCount} cosmetic
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Expanded review area */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-outline-variant/10 space-y-4">
          <div className="text-[11.5px] text-on-surface-variant/60 flex items-center gap-1.5">
            <Icon name="info" className="w-3 h-3" />
            Only the first rule per file is tracked for drift — files containing multiple rules are not fully covered.
          </div>
          <DriftRuleList
            items={items}
            onReview={(it) => onReview(it, source)}
            onBulkAccept={onBulkAccept}
            onBulkKeepMine={onBulkKeepMine}
            bulkBusy={bulkBusy}
          />
          {newUpstream.length > 0 && <NewUpstreamRulesPanel source={source} rules={newUpstream} />}
        </div>
      )}
    </div>
  );
};

const TONE_CLASS = {
  info: 'text-[#0284C7]',
  warn: 'text-[#A6750D] dark:text-amber-400',
  error: 'text-[#A63D40] dark:text-rose-400',
  neutral: 'text-on-surface',
  muted: 'text-on-surface-variant/80',
} as const;

type Emphasis = 'primary' | 'secondary' | 'neutral';
const SIZE_CLASS: Record<Emphasis, string> = {
  primary:   'text-3xl',     // dominant — the actionable count
  secondary: 'text-lg',      // descriptive context numbers
  neutral:   'text-lg',      // zero values — quiet
};
const LABEL_OPACITY: Record<Emphasis, string> = {
  primary:   'text-on-surface-variant',
  secondary: 'text-on-surface-variant/70',
  neutral:   'text-on-surface-variant/50',
};

const Stat: React.FC<{
  value: number;
  label: string;
  tone?: keyof typeof TONE_CLASS;
  emphasis?: Emphasis;
  hint?: string;
}> = ({ value, label, tone = 'neutral', emphasis = 'secondary', hint }) => {
  const body = (
    <div className={hint ? 'cursor-help' : undefined}>
      <div className={`font-mono font-bold tabular-nums leading-none ${SIZE_CLASS[emphasis]} ${TONE_CLASS[value > 0 ? tone : 'muted']}`}>
        {value.toLocaleString()}
      </div>
      <div className={`text-[10.5px] font-semibold uppercase tracking-wider mt-1.5 inline-flex items-center gap-1 ${LABEL_OPACITY[emphasis]}`}>
        {label}
        {hint && <Icon name="info" className="w-3 h-3 opacity-60" />}
      </div>
    </div>
  );
  return hint ? <Tooltip content={hint}>{body}</Tooltip> : body;
};
