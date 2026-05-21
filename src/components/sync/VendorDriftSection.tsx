import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { Button, EmptyState } from '../ui';
import { Tooltip } from '../ui/Tooltip';
import { DriftSourceRow } from './DriftSourceRow';
import { DriftVendorCard } from './DriftVendorCard';
import { useDriftSummary } from '../../hooks/useDriftSummary';
import { useDriftCheck } from '../../hooks/useDriftCheck';
import { listDriftCards } from '../../services/drift/driftService';
import { ROUTES } from '../../router/routes';
import { useNavigate } from 'react-router-dom';
import type { DriftCard, DriftSource, DriftItem } from '../../services/drift/types';

const STALE_BANNER_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const Chip: React.FC<{ value: number; label: string; tone: 'red' | 'amber' | 'neutral' | 'green' | 'blue'; hint: string }> = ({ value, label, tone, hint }) => {
  const tones = {
    red:     value > 0 ? 'bg-[#A63D40]/15 text-[#A63D40] dark:text-rose-400' : 'bg-surface-container-highest text-on-surface-variant/50',
    amber:   value > 0 ? 'bg-[#A6750D]/15 text-[#A6750D] dark:text-amber-400' : 'bg-surface-container-highest text-on-surface-variant/50',
    blue:    value > 0 ? 'bg-[#0284C7]/15 text-[#0284C7]' : 'bg-surface-container-highest text-on-surface-variant/50',
    green:   value > 0 ? 'bg-[#4D7C6F]/15 text-[#4D7C6F]' : 'bg-surface-container-highest text-on-surface-variant/50',
    neutral: 'bg-surface-container-highest text-on-surface-variant',
  };
  return (
    <Tooltip content={hint}>
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-semibold ${tones[tone]}`}>
        <span className="font-mono tabular-nums">{value.toLocaleString()}</span>
        <span className="text-[10.5px] uppercase tracking-wider opacity-90">{label}</span>
      </span>
    </Tooltip>
  );
};

const DriftReviewPanel = lazy(() => import('./DriftReviewPanel'));

export const VendorDriftSection: React.FC = () => {
  const navigate = useNavigate();
  const { summary } = useDriftSummary();
  const check = useDriftCheck();
  const [cards, setCards] = useState<DriftCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [review, setReview] = useState<{ item: DriftItem; source: DriftSource } | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [checkingAll, setCheckingAll] = useState(false);

  // Surface a "consider re-checking" banner if any subdir's last check is older
  // than 2 days — recent comparator fixes mean stale persisted state may be wrong.
  const allSubdirs = (cards ?? []).flatMap((c) => c.kind === 'vendor' ? c.subdirs : [c.source]);
  const hasStaleSource = allSubdirs.some((s) => {
    if (s.pinned || !s.lastCheckedAt) return false;
    return Date.now() - new Date(s.lastCheckedAt).getTime() > STALE_BANNER_MS;
  });

  const reloadSources = useCallback(async () => {
    try {
      setCards(await listDriftCards());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { reloadSources(); }, [reloadSources]);

  const runOne = useCallback(async (source: DriftSource) => {
    const r = await check.run(source, { token: token.trim() || undefined });
    await reloadSources();
    setRefreshSignal((n) => n + 1);
    return r;
  }, [check, token, reloadSources]);

  const runAll = useCallback(async () => {
    if (!cards) return;
    setCheckingAll(true);
    try {
      for (const s of allSubdirs) {
        if (s.pinned) continue;
        await check.run(s, { token: token.trim() || undefined });
      }
      await reloadSources();
      setRefreshSignal((n) => n + 1);
    } finally {
      setCheckingAll(false);
    }
  }, [cards, allSubdirs, check, token, reloadSources]);

  const onResolved = useCallback(async () => {
    await reloadSources();
    setRefreshSignal((n) => n + 1);
  }, [reloadSources]);

  return (
    <section id="vendor-drift" className="scroll-mt-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2.5">
            <Icon name="git-branch" className="w-6 h-6 text-primary" />
            Vendor Rule Drift
          </h2>
          <p className="text-[13px] text-on-surface-variant/70 mt-1 max-w-3xl">
            For rules imported from GitHub vendor repos, this checks whether the upstream file has changed since import and lets you review &amp; pull the update.
          </p>
          {summary && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Chip value={summary.totalConflict}  label="conflict"        tone="red"     hint="Upstream changed AND you edited locally — Accept Upstream would overwrite your edits." />
              <Chip value={summary.totalChanged}   label="upstream update" tone="amber"   hint="Upstream content changed; you didn't edit locally. Usually safe to accept in bulk." />
              <Chip value={summary.totalRemoved}   label="removed"         tone="neutral" hint="Rules no longer existing at the upstream source (deprecated, deleted, moved out of scope)." />
              <span className="text-on-surface-variant/30 text-[10px] mx-0.5">·</span>
              <Chip value={summary.totalTracked}   label="tracked total"   tone="neutral" hint="All local detections matched to a GitHub source via external_id." />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Tooltip content="Personal access token. Optional but strongly recommended — raises GitHub's anonymous rate limit (60/hr → 5000/hr) and unlocks private repos.">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub token (ghp_…)"
              autoComplete="off"
              className="px-2.5 py-1.5 text-[12.5px] rounded-lg bg-surface-container-highest text-on-surface placeholder:text-on-surface-variant/40 w-64 outline-none focus:ring-1 focus:ring-primary/40"
            />
          </Tooltip>
          <Button color="primary" size="sm" leadingIcon="refresh-cw" loading={checkingAll} disabled={check.running} onClick={runAll}>
            Check all sources
          </Button>
        </div>
      </div>

      {/* Recheck-stale banner — recent comparator fixes mean persisted state may be wrong. */}
      {hasStaleSource && !checkingAll && (
        <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-[13px] text-on-surface flex items-start gap-2.5">
          <Icon name="info" className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <span>
            Some sources haven't been checked recently. The drift checker was improved — <strong>re-check sources</strong> to refresh persisted results (false conflicts from older checks will clear automatically).
          </span>
        </div>
      )}

      {/* Tab-active warning while a multi-source check runs — browsers throttle hidden tabs. */}
      {checkingAll && (
        <div className="mb-4 rounded-xl border border-[#A6750D]/40 bg-[#A6750D]/10 px-4 py-2.5 text-[13px] text-on-surface flex items-start gap-2.5">
          <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 text-[#A6750D] dark:text-amber-400 shrink-0" />
          <span>
            Checking each source in turn. <strong>Keep this tab active</strong> — modern browsers throttle background tabs and the check can stall. A scheduled background runner is on the Phase&nbsp;2 roadmap.
          </span>
        </div>
      )}

      {/* Body */}
      {loadError ? (
        <div className="text-[13px] text-error">Could not load drift sources: {loadError}</div>
      ) : cards === null ? (
        <div className="flex items-center gap-2 text-[13px] text-on-surface-variant/60 py-8 justify-center">
          <Icon name="refresh-cw" className="w-4 h-4 animate-spin" /> Loading sources…
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon="download-cloud"
          title="No GitHub imports yet"
          description="Import detection rules from a GitHub vendor repo (Sigma, Splunk ESCU, Elastic, …) to enable upstream drift tracking."
          action={{ label: 'Open the importer', onClick: () => navigate(ROUTES.BULK_IMPORT), icon: 'download-cloud' }}
        />
      ) : (
        <div className="space-y-5">
          {cards.map((card) => card.kind === 'vendor' ? (
            <DriftVendorCard
              key={card.key}
              card={card}
              refreshSignal={refreshSignal}
              running={check.running}
              activeSourceUrl={check.activeSourceUrl}
              progress={check.progress}
              onRun={runOne}
              onReview={(item, source) => setReview({ item, source })}
            />
          ) : (
            <DriftSourceRow
              key={`${card.source.sourceUrl}::${card.source.targetLibrary}`}
              source={card.source}
              refreshSignal={refreshSignal}
              running={check.running}
              activeSourceUrl={check.activeSourceUrl}
              progress={check.progress}
              onRun={runOne}
              onReview={(item, source) => setReview({ item, source })}
            />
          ))}
        </div>
      )}

      {review && (
        <Suspense fallback={null}>
          <DriftReviewPanel
            item={review.item}
            sourceUrl={review.source.sourceUrl}
            onClose={() => setReview(null)}
            onResolved={onResolved}
          />
        </Suspense>
      )}
    </section>
  );
};
