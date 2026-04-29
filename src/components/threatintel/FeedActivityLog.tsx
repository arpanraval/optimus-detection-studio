import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import type { FeedEntry } from '../../hooks/useThreatIntelFeeds';
import type { AutoDigestJob } from '../../hooks/useAutoDigestSettings';

// =============================================================================
// TYPES
// =============================================================================

interface FeedActivityLogProps {
  userId: string;
}

/** Union type for timeline items (entry or job) */
type TimelineItem =
  | { kind: 'entry'; data: FeedEntry; timestamp: string }
  | { kind: 'job'; data: AutoDigestJob; timestamp: string };

// =============================================================================
// HELPERS
// =============================================================================

function getRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =============================================================================
// STATUS RENDERERS
// =============================================================================

function EntryItem({ entry }: { entry: FeedEntry }) {
  const status = entry.digest_status || 'ready';
  const feedName = entry.feed_name || 'Unknown Feed';

  if (status === 'ready') {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Digest Complete</span>
          </div>
          <p className="text-sm text-on-surface truncate mt-0.5">
            {feedName}: {entry.title}
          </p>
          {entry.auto_digest_report_id && (
            <Link
              to={routeHelpers.threatIntelDetail(entry.auto_digest_report_id)}
              className="text-xs text-primary hover:underline mt-0.5 inline-block"
            >
              View report
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (status === 'skipped') {
    const confidence = (entry.classification as Record<string, any>)?.confidence;
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-on-surface-variant/40 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="skip-forward" className="w-3.5 h-3.5 text-on-surface-variant/60" />
            <span className="text-xs font-medium text-on-surface-variant/60">Skipped</span>
          </div>
          <p className="text-sm text-on-surface truncate mt-0.5">
            {feedName}: {entry.title}
          </p>
          <p className="text-xs text-on-surface-variant/50 mt-0.5">
            Reason: {entry.skip_reason || 'N/A'}
            {confidence != null && ` (confidence: ${confidence})`}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'digest_failed' || status === 'extract_failed') {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-red-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="x-circle" className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">Failed</span>
          </div>
          <p className="text-sm text-on-surface truncate mt-0.5">
            {feedName}: {entry.title}
          </p>
          {entry.extract_error && (
            <p className="text-xs text-red-400/70 mt-0.5">
              Error: {entry.extract_error.length > 200
                ? 'Processing failed — check feed health in settings'
                : entry.extract_error}
            </p>
          )}
          <p className="text-xs text-on-surface-variant/40 mt-0.5">
            Paste Content Manually
          </p>
        </div>
      </div>
    );
  }

  if (status === 'digesting' || status === 'queued') {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="loader" className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="text-xs font-medium text-amber-400">Processing</span>
          </div>
          <p className="text-sm text-on-surface truncate mt-0.5">
            {feedName}: {entry.title}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'classified') {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-400">Classified</span>
          </div>
          <p className="text-sm text-on-surface truncate mt-0.5">
            {feedName}: {entry.title}
          </p>
          <p className="text-xs text-on-surface-variant/50 mt-0.5">
            Waiting for digest slot
          </p>
        </div>
      </div>
    );
  }

  // Fallback for any other status
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-2 h-2 rounded-full bg-on-surface-variant/30 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-on-surface truncate">
          {feedName}: {entry.title}
        </p>
        <p className="text-xs text-on-surface-variant/50 mt-0.5">
          Status: {status}
        </p>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function JobItem({ job }: { job: AutoDigestJob }) {
  const summary = job.result_summary as Record<string, any> | null;
  const errors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
  const feedsFetched = summary?.feeds_fetched ?? 0;
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;
  const skipped = summary?.skipped ?? summary?.articles_skipped ?? 0;
  const failed = summary?.failed ?? summary?.articles_failed ?? errors.length;
  const harvested = summary?.articles_harvested ?? 0;

  // ─── Completed ───────────────────────────────────────────────────────────
  if (job.status === 'completed') {
    // Errors took down everything. Surface the real failure to the user instead
    // of hiding it behind a happy "Job Completed" with all-zero stats.
    if (errors.length > 0 && digested === 0) {
      return (
        <div className="flex items-start gap-3">
          <span className="mt-1.5 w-2 h-2 rounded-full bg-red-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-400">Failed during processing</span>
            </div>
            <p className="text-sm text-on-surface mt-0.5">
              Fetched {feedsFetched} feed{feedsFetched === 1 ? '' : 's'} but all {errors.length} article{errors.length === 1 ? '' : 's'} failed.
            </p>
            <p className="text-xs text-on-surface-variant mt-1 truncate" title={errors.join('\n')}>
              {errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}
            </p>
          </div>
        </div>
      );
    }

    // Genuinely empty run: feeds fetched, but nothing matched the relevance / classification gate.
    if (digested === 0 && skipped === 0 && failed === 0) {
      return (
        <div className="flex items-start gap-3">
          <span className="mt-1.5 w-2 h-2 rounded-full bg-on-surface-variant/40 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="check" className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="text-xs font-medium text-on-surface-variant">Completed — no new content</span>
            </div>
            <p className="text-sm text-on-surface mt-0.5">
              Checked {feedsFetched} feed{feedsFetched === 1 ? '' : 's'}
              {harvested > 0 ? `, ${harvested} article${harvested === 1 ? '' : 's'} harvested` : ''}
              {harvested > 0 ? ' — none passed the relevance gate' : ' — no new articles'}.
            </p>
          </div>
        </div>
      );
    }

    // Successful completion with at least some output.
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Completed</span>
            {errors.length > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                {errors.length} error{errors.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface mt-0.5">
            <span className="font-medium">{digested}</span> digested
            {skipped > 0 && <>, {skipped} skipped</>}
            {failed > 0 && <>, <span className="text-red-400">{failed} failed</span></>}
            <span className="text-on-surface-variant"> · from {feedsFetched} feed{feedsFetched === 1 ? '' : 's'}</span>
          </p>
        </div>
      </div>
    );
  }

  // ─── Failed (job-level error before completion) ─────────────────────────
  if (job.status === 'failed') {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2 h-2 rounded-full bg-red-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="x-circle" className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">Job Failed</span>
          </div>
          <p className="text-sm text-on-surface mt-0.5">
            {job.error || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Pending / processing — show elapsed time so the user has a heartbeat ───
  const startedAt = job.started_at || job.created_at;
  const elapsed = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon name="loader" className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span className="text-xs font-medium text-amber-400">
            {job.status === 'pending' ? 'Queued' : 'Running'}
          </span>
          {elapsed > 0 && (
            <span className="text-[11px] text-on-surface-variant tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>
        <p className="text-sm text-on-surface mt-0.5">
          {job.status === 'pending'
            ? 'Waiting for the orchestrator to pick up this job…'
            : `Fetching feeds, classifying articles, and digesting matches${feedsFetched > 0 ? ` (${feedsFetched} feed${feedsFetched === 1 ? '' : 's'} so far)` : ''}…`}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FeedActivityLog: React.FC<FeedActivityLogProps> = ({ userId }) => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [jobs, setJobs] = useState<AutoDigestJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);

      const [entriesResult, jobsResult] = await Promise.all([
        supabase
          .from('threat_intel_feed_entries')
          .select('*, threat_intel_feeds(name)')
          .eq('user_id', userId)
          .neq('digest_status', 'harvested')
          .order('fetched_at', { ascending: false })
          .limit(50),
        supabase
          .from('auto_digest_jobs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(7),
      ]);

      if (cancelled) return;

      if (!entriesResult.error) {
        setEntries(
          (entriesResult.data || []).map((e: any) => ({
            ...e,
            feed_name: e.threat_intel_feeds?.name,
          }))
        );
      }

      if (!jobsResult.error) {
        setJobs(jobsResult.data || []);
      }

      setIsLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, [userId]);

  // Build unified timeline, grouped by date
  const groupedTimeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...entries.map((e): TimelineItem => ({
        kind: 'entry',
        data: e,
        timestamp: e.fetched_at,
      })),
      ...jobs.map((j): TimelineItem => ({
        kind: 'job',
        data: j,
        timestamp: j.created_at,
      })),
    ];

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const groups: { dateKey: string; label: string; items: TimelineItem[] }[] = [];
    const groupMap = new Map<string, TimelineItem[]>();

    for (const item of items) {
      const key = getDateKey(item.timestamp);
      if (!groupMap.has(key)) {
        const group: TimelineItem[] = [];
        groupMap.set(key, group);
        groups.push({ dateKey: key, label: getRelativeDate(item.timestamp), items: group });
      }
      groupMap.get(key)!.push(item);
    }

    return groups;
  }, [entries, jobs]);

  const toggleDay = (dateKey: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Empty state
  if (entries.length === 0 && jobs.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="text-base font-semibold text-on-surface mb-4">Activity Log</h3>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon name="activity" className="w-10 h-10 text-on-surface-variant/30 mb-3" />
          <p className="text-sm text-on-surface-variant">
            No auto-digest activity yet. Enable auto-digest in settings to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      <h3 className="text-base font-semibold text-on-surface mb-4">Activity Log</h3>

      <div className="space-y-4">
        {groupedTimeline.map((group) => {
          const isCollapsed = collapsedDays.has(group.dateKey);

          return (
            <div key={group.dateKey}>
              {/* Day header */}
              <button
                type="button"
                onClick={() => toggleDay(group.dateKey)}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                <Icon
                  name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                  className="w-3.5 h-3.5 text-on-surface-variant/50 group-hover:text-on-surface-variant transition-colors"
                />
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  {group.label}
                </span>
                <span className="text-xs text-on-surface-variant/40">
                  ({group.items.length})
                </span>
              </button>

              {/* Day items */}
              {!isCollapsed && (
                <div className="ml-2 border-l border-outline-variant/10 pl-4 space-y-3">
                  {group.items.map((item) => (
                    <div key={item.kind === 'entry' ? item.data.id : item.data.id} className="relative">
                      <span className="text-xs text-on-surface-variant/50 block mb-1">
                        {formatTime(item.timestamp)}
                      </span>
                      {item.kind === 'entry' ? (
                        <EntryItem entry={item.data} />
                      ) : (
                        <JobItem job={item.data} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
