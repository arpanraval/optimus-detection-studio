import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import type { AutoDigestJob } from '../../hooks/useAutoDigestSettings';
import { JobTranscript } from './JobTranscript';

// =============================================================================
// TYPES
// =============================================================================

interface FeedActivityLogProps {
  userId: string;
  /** Shared live list from the settings hook. When provided, this component
   * does not maintain a second stale copy of auto_digest_jobs. */
  liveJobs?: AutoDigestJob[];
}

type JobStatusTone = 'success' | 'partial' | 'failure' | 'running' | 'pending';

// Filter chips: framed around the user-visible outcome, not internal jargon.
type ActivityFilter = 'all' | 'productive' | 'errors' | 'skipped-only';

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'productive',   label: 'With reports' },
  { id: 'skipped-only', label: 'No reports' },
  { id: 'errors',       label: 'Failed' },
];

const JOB_PAGE_SIZE = 20;

// Runs worth offering a retry on. A retry is a fresh run, not a resume: the
// phases re-derive their work from digest_status, so anything the failed run
// left behind (a 'classified' article it selected but never digested) is
// picked back up by ranking. Completed and cancelled runs are excluded --
// nothing is owed for those.
const RETRYABLE_STATUSES = new Set<AutoDigestJob['status']>([
  'failed',
  'partial',
  'timeout_partial',
]);

function mergeJobs(existing: AutoDigestJob[], incoming: AutoDigestJob[]): AutoDigestJob[] {
  const byId = new Map<string, AutoDigestJob>();
  for (const job of existing) byId.set(job.id, job);
  for (const job of incoming) byId.set(job.id, job);
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function jobMatchesFilter(job: AutoDigestJob, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  const summary = job.result_summary as Record<string, any> | null;
  const sysErrors = countSystemErrors(summary);
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;
  if (filter === 'productive')   return digested > 0;
  if (filter === 'errors')       return sysErrors > 0 || job.status === 'failed' || job.status === 'partial' || job.status === 'timeout_partial';
  if (filter === 'skipped-only') return digested === 0 && sysErrors === 0 && job.status === 'completed';
  return true;
}

// =============================================================================
// HELPERS
// =============================================================================

// System errors vs feed-transport blips.
//
// `result_summary.errors[]` mixes real pipeline failures with everyday
// upstream feed flakiness. Real errors share well-known orchestrator
// prefixes (Phase X, Entry "...", Digest <id>, etc); feed harvest
// errors fall through as `<feed name>: <transport message>`. Treating
// both the same caused the page to render amber/red on healthy runs.
const SYSTEM_ERROR_PREFIXES = [
  'Classify ',
  'Classification fetch failed',
  'Entry fetch ',
  'Entry ',
  'Entry "',
  'Digest ',
  'Report save ',
  'Feasibility ',
  'Campaign-detect ',  // legacy prefix from the old actor-based detector — kept so historical errors still classify as system errors
  'Subject-link ',     // current prefix emitted by the orchestrator when linkBySubject throws
  'Phase ',
  'No auto_digest_settings',
  'Feed query failed',
];

export function isSystemError(s: string): boolean {
  return SYSTEM_ERROR_PREFIXES.some((p) => s.startsWith(p));
}

export function countSystemErrors(summary: Record<string, any> | null | undefined): number {
  const errs: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
  return errs.filter(isSystemError).length;
}

export function countFeedErrors(summary: Record<string, any> | null | undefined): number {
  const errs: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
  return errs.filter((e) => !isSystemError(e)).length;
}

function getRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function jobDuration(job: AutoDigestJob): number | null {
  const start = job.started_at || job.created_at;
  const end = job.completed_at || (job.status === 'pending' || job.status === 'processing' ? new Date().toISOString() : null);
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

function jobToneAndLabel(job: AutoDigestJob): { tone: JobStatusTone; label: string } {
  // Severity is computed from system errors only. Feed-transport blips
  // don't flip the tone; they're surfaced as a parenthetical note.
  const summary = job.result_summary as Record<string, any> | null;
  const systemErrors = countSystemErrors(summary);
  const feedErrors = countFeedErrors(summary);
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;

  if (job.status === 'pending') return { tone: 'pending', label: 'Queued' };
  if (job.status === 'processing') return { tone: 'running', label: 'Running' };
  if (job.status === 'failed') return { tone: 'failure', label: 'Failed' };
  if (job.status === 'cancelled') return { tone: 'failure', label: 'Cancelled' };
  if (job.status === 'partial' || job.status === 'timeout_partial') return { tone: 'partial', label: job.status === 'partial' ? 'Partial' : 'Timed out' };

  if (systemErrors > 0) {
    return { tone: 'partial', label: `Completed with ${systemErrors} error${systemErrors === 1 ? '' : 's'}` };
  }
  const harvested = summary?.articles_harvested ?? summary?.harvested ?? 0;

  if (digested > 0) {
    const note = feedErrors > 0 ? ` (${feedErrors} feed${feedErrors === 1 ? '' : 's'} unreachable)` : '';
    return { tone: 'success', label: `Completed${note}` };
  }
  if (harvested === 0) {
    const note = feedErrors > 0 ? ` (${feedErrors} feed${feedErrors === 1 ? '' : 's'} unreachable)` : '';
    return { tone: 'success', label: `Completed — no new articles${note}` };
  }
  return { tone: 'success', label: 'Completed — no threat-relevant articles' };
}

// Single-colour dot per row tone. We rely on the row's data for
// information; the dot is just a leading status glyph.
const TONE_DOT: Record<JobStatusTone, string> = {
  success: 'bg-secondary',
  partial: 'bg-ext-amber',
  failure: 'bg-error',
  running: 'bg-ext-amber animate-pulse',
  pending: 'bg-outline-variant',
};

function jobOneLineSummary(job: AutoDigestJob): string {
  const summary = job.result_summary as Record<string, any> | null;
  const systemErrors = countSystemErrors(summary);
  const feedErrors = countFeedErrors(summary);
  const feedsFetched = summary?.feeds_fetched ?? 0;
  const harvested = summary?.articles_harvested ?? 0;
  const recovered = summary?.articles_recovered ?? 0;
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;
  const skipped = summary?.skipped ?? summary?.articles_skipped ?? 0;

  if (job.status === 'pending') return 'Waiting for the orchestrator to pick this up…';
  if (job.status === 'processing') {
    return `In flight — ${feedsFetched} feed${feedsFetched === 1 ? '' : 's'} fetched so far`;
  }
  if (job.status === 'failed') return job.error || 'Run failed before reporting any stats';
  if (job.status === 'cancelled') return job.error || 'Run cancelled by the analyst';

  const parts: string[] = [];
  parts.push(`${feedsFetched} feed${feedsFetched === 1 ? '' : 's'}`);
  if (harvested > 0) parts.push(`${harvested} harvested`);
  if (recovered > 0) parts.push(`${recovered} recovered`);
  if (digested > 0) parts.push(`${digested} digested`);
  if (skipped > 0) parts.push(`${skipped} not relevant`);
  if (feedErrors > 0) parts.push(`${feedErrors} feed${feedErrors === 1 ? '' : 's'} unreachable`);
  if (systemErrors > 0) parts.push(`${systemErrors} error${systemErrors === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

// =============================================================================
// RUN ROW — single-line dense entry, expands inline
// =============================================================================

const JobRow: React.FC<{
  job: AutoDigestJob;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  /** False while any run is pending/processing — a second run cannot start. */
  retryEnabled: boolean;
  retrying: boolean;
}> = ({ job, expanded, onToggle, onRetry, retryEnabled, retrying }) => {
  const { tone, label } = jobToneAndLabel(job);
  const dur = jobDuration(job);
  const summary = jobOneLineSummary(job);
  const time = formatTime(job.started_at || job.created_at);
  const canRetry = RETRYABLE_STATUSES.has(job.status);

  const handleCopyId = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(job.id); } catch { /* drop quietly */ }
  };

  const handleRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onRetry();
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className="border-b border-outline-variant/30 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleRowKeyDown}
        aria-expanded={expanded}
        title={`Run ID: ${job.id}`}
        className="w-full grid grid-cols-[auto_auto_1fr_auto_auto] gap-x-4 items-center px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {/* Time */}
        <span className="text-sm font-mono tabular-nums text-on-surface-variant">{time}</span>
        {/* Status dot + label */}
        <span className="flex items-center gap-2 min-w-[180px]">
          <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
          <span className="text-sm font-medium text-on-surface truncate">{label}</span>
        </span>
        {/* Summary */}
        <span className="text-sm text-on-surface-variant truncate">{summary}</span>
        {/* Duration */}
        <span className="text-xs tabular-nums text-on-surface-variant min-w-[64px] text-right">
          {dur != null ? formatDuration(dur) : ''}
        </span>
        {/* Retry + copy ID + chevron */}
        <span className="flex items-center gap-1.5">
          {canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={!retryEnabled || retrying}
              aria-label={`Retry run from ${time}`}
              title={
                retrying
                  ? 'Starting a new run…'
                  : retryEnabled
                    ? 'Run the pipeline again. Articles this run left undigested are picked back up.'
                    : 'A digest run is already in progress'
              }
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none rounded p-1 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon
                name="refresh-cw"
                className={`w-3.5 h-3.5 text-on-surface-variant/60 ${retrying ? 'animate-spin' : ''}`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyId}
            aria-label={`Copy run ID ${job.id}`}
            title="Copy run ID"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none rounded p-1 transition-opacity"
          >
            <Icon name="copy" className="w-3.5 h-3.5 text-on-surface-variant/60" />
          </button>
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            className="w-4 h-4 text-on-surface-variant/60"
          />
        </span>
      </div>
      {expanded && <JobTranscript job={job} />}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FeedActivityLog: React.FC<FeedActivityLogProps> = ({ userId, liveJobs }) => {
  const [historyJobs, setHistoryJobs] = useState<AutoDigestJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const jobs = useMemo(
    () => mergeJobs(historyJobs, liveJobs ?? []),
    [historyJobs, liveJobs],
  );
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const [searchParams] = useSearchParams();
  const requestedRunId = searchParams.get('run');

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(JOB_PAGE_SIZE);
    if (!error && data) {
      setHistoryJobs((previous) => mergeJobs(previous, data as AutoDigestJob[]));
      setHasMore(data.length === JOB_PAGE_SIZE);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryJobs([]);
    setHasMore(true);
    setIsLoading(true);
    fetchJobs().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchJobs]);

  const oldestLoadedAt = historyJobs.length > 0
    ? historyJobs[historyJobs.length - 1].created_at
    : null;

  const loadOlderJobs = useCallback(async () => {
    if (!oldestLoadedAt || !hasMore || isLoadingOlder) return;
    setIsLoadingOlder(true);
    const { data, error } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', oldestLoadedAt)
      .order('created_at', { ascending: false })
      .limit(JOB_PAGE_SIZE);
    if (!error && data) {
      setHistoryJobs((previous) => mergeJobs(previous, data as AutoDigestJob[]));
      setHasMore(data.length === JOB_PAGE_SIZE);
    }
    setIsLoadingOlder(false);
  }, [userId, oldestLoadedAt, hasMore, isLoadingOlder]);

  const hasActiveJob = jobs.some((j) => j.status === 'pending' || j.status === 'processing');

  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Retry is deliberately the same call the scheduler and Run Now make. There
  // is no resume-a-failed-job path: every phase re-queries state rather than
  // carrying IDs across hops, so a fresh run sweeps up whatever the failed one
  // stranded. The reason lands in result_summary, so a retried run is
  // distinguishable from a scheduled one in this very list.
  const handleRetry = useCallback(async (jobId: string) => {
    if (!userId || hasActiveJob || retryingJobId) return;
    setRetryingJobId(jobId);
    setRetryError(null);
    const { error } = await supabase.rpc('request_auto_digest_job', {
      p_user_id: userId,
      p_reason: 'retry',
    });
    setRetryingJobId(null);
    if (error) {
      setRetryError(error.message);
      return;
    }
    // The RPC is a no-op when a run is already pending/processing — it returns
    // the existing one rather than creating a second. Refetch either way so
    // the new run appears and the poller takes over from here.
    await fetchJobs();
  }, [userId, hasActiveJob, retryingJobId, fetchJobs]);
  useEffect(() => {
    // When liveJobs is supplied, useAutoDigestSettings owns the polling and
    // publishes each update to this component. This fallback keeps the
    // component self-contained for standalone callers.
    if (liveJobs !== undefined || !userId || !hasActiveJob) return;
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [userId, hasActiveJob, fetchJobs, liveJobs]);

  // Auto-expand only when the user came in via a deep link (?run=ID)
  // or while a job is actively running. Closed-by-default for normal
  // page loads — landing on a transcript wall of every run was an
  // information overload; users now click to drill in.
  useEffect(() => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (requestedRunId && jobs.some((j) => j.id === requestedRunId)) {
        next.add(requestedRunId);
      }
      for (const j of jobs) {
        if (j.status === 'pending' || j.status === 'processing') next.add(j.id);
      }
      return next;
    });
  }, [jobs, requestedRunId]);

  const toggleJob = (jobId: string) =>
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });

  const toggleDay = (key: string) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const filteredJobs = useMemo(
    () => jobs.filter((j) => jobMatchesFilter(j, filter)),
    [jobs, filter],
  );

  const grouped = useMemo(() => {
    const groups: { dateKey: string; label: string; jobs: AutoDigestJob[] }[] = [];
    const map = new Map<string, AutoDigestJob[]>();
    for (const j of filteredJobs) {
      const key = getDateKey(j.created_at);
      if (!map.has(key)) {
        const arr: AutoDigestJob[] = [];
        map.set(key, arr);
        groups.push({ dateKey: key, label: getRelativeDate(j.created_at), jobs: arr });
      }
      map.get(key)!.push(j);
    }
    return groups;
  }, [filteredJobs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Icon name="activity" className="w-7 h-7 text-on-surface-variant/30 mb-3" />
        <p className="text-sm text-on-surface-variant">No runs yet.</p>
        <p className="text-xs text-on-surface-variant/60 mt-1">Click Run Now above to start the first one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Filter row — neutral active state. The brand primary in light
          mode reads as pink/magenta which doesn't fit a quiet filter
          chip; using surface-container-highest gives a subtle grey
          fill that works in both light and dark themes. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-1.5">
          {ACTIVITY_FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-surface-container-highest text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs tabular-nums text-on-surface-variant/80">
          {filter === 'all'
            ? `${jobs.length} run${jobs.length === 1 ? '' : 's'}`
            : `${filteredJobs.length} of ${jobs.length}`}
        </span>
      </div>

      {retryError && (
        <div className="mb-3 px-3 py-2 rounded-md border border-error/40 bg-error-container/40 flex items-start gap-2">
          <Icon name="refresh-cw" className="w-3.5 h-3.5 text-error mt-0.5 shrink-0" />
          <p className="text-xs text-on-surface">
            Could not start a retry — <span className="text-on-surface-variant">{retryError}</span>
          </p>
        </div>
      )}

      {filteredJobs.length === 0 && (
        <div className="px-4 py-8 flex flex-col items-center text-center gap-2">
          <p className="text-xs text-on-surface-variant">
            No runs match the <span className="font-medium text-on-surface">{ACTIVITY_FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}</span> filter.
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Day-grouped run rows. Continuous list — each row separated by
          a thin divider, not a rounded card. Reads as a clean activity
          log, not a stack of widgets. Day-group headers anchor each
          batch with typographic weight. */}
      <div className="flex flex-col gap-5">
        {grouped.map((group) => {
          const collapsed = collapsedDays.has(group.dateKey);
          return (
            <div key={group.dateKey}>
              <button
                type="button"
                onClick={() => toggleDay(group.dateKey)}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                <Icon
                  name={collapsed ? 'chevron-right' : 'chevron-down'}
                  className="w-4 h-4 text-on-surface-variant group-hover:text-on-surface"
                />
                <span className="text-sm font-semibold text-on-surface uppercase tracking-wide">
                  {group.label}
                </span>
                <span className="text-xs tabular-nums text-on-surface-variant">
                  ({group.jobs.length})
                </span>
              </button>
              {!collapsed && (
                <div className="border-y border-outline-variant/30">
                  {group.jobs.map((j) => (
                    <JobRow
                      key={j.id}
                      job={j}
                      expanded={expandedJobs.has(j.id)}
                      onToggle={() => toggleJob(j.id)}
                      onRetry={() => handleRetry(j.id)}
                      retryEnabled={!hasActiveJob && retryingJobId === null}
                      retrying={retryingJobId === j.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      {hasMore && historyJobs.length > 0 && (
        <div className={'flex flex-col items-center gap-2 pt-6'}>
          <button type={'button'} onClick={loadOlderJobs} disabled={isLoadingOlder} className={'text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline'}>
            {isLoadingOlder ? 'Loading older runs...' : 'Load older runs'}
          </button>
          <span className={'text-xs text-on-surface-variant/60'}>Showing {jobs.length} runs</span>
        </div>
      )}
      </div>
    </div>
  );
};
