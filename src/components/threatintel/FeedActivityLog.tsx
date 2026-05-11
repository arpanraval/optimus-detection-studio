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
}

type JobStatusTone = 'success' | 'partial' | 'failure' | 'running' | 'pending';

// Filter chips for the run list. Most users land on Activity to answer
// "did the last run actually digest anything?" or "what's broken?" — the
// chips give them a one-click way to slice without scrolling through 20+
// runs. "All" is always the default so we never hide data unintentionally.
type ActivityFilter = 'all' | 'productive' | 'errors' | 'skipped-only';

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'productive',   label: 'Productive' },
  { id: 'errors',       label: 'With errors' },
  { id: 'skipped-only', label: 'Nothing relevant' },
];

function jobMatchesFilter(job: AutoDigestJob, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  const summary = job.result_summary as Record<string, any> | null;
  const errors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;
  if (filter === 'productive')   return digested > 0;
  if (filter === 'errors')       return errors.length > 0 || job.status === 'failed';
  if (filter === 'skipped-only') return digested === 0 && errors.length === 0 && job.status === 'completed';
  return true;
}

// =============================================================================
// HELPERS
// =============================================================================

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
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
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

function jobToneAndLabel(job: AutoDigestJob): { tone: JobStatusTone; label: string; iconName: string } {
  // System errors are bugs / infra failures inside the orchestrator pipeline
  // (article_classify_failed, article_digest_failed, feed_failed). They live
  // in result_summary.errors[] populated by the orchestrator. AI verdicts —
  // articles correctly judged non-threat-research and Skipped — are NOT
  // errors and do not flip the tone. This separation is load-bearing UX:
  // a run that successfully judged 5 marketing articles and skipped them is
  // a working pipeline, not a failure.
  const summary = job.result_summary as Record<string, any> | null;
  const systemErrors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
  const digested = summary?.digested ?? summary?.articles_digested ?? 0;

  if (job.status === 'pending') return { tone: 'pending', label: 'Queued', iconName: 'clock' };
  if (job.status === 'processing') return { tone: 'running', label: 'Running', iconName: 'loader' };
  if (job.status === 'failed') return { tone: 'failure', label: 'Failed', iconName: 'x-circle' };
  if (job.status === 'timeout_partial') return { tone: 'partial', label: 'Timed out (partial)', iconName: 'alert-triangle' };

  // Completed status from here on.
  const n = systemErrors.length;
  if (digested > 0 && n === 0) {
    return { tone: 'success', label: 'Completed', iconName: 'check-circle' };
  }
  if (digested > 0 && n > 0) {
    return { tone: 'partial', label: `Completed with ${n} error${n === 1 ? '' : 's'}`, iconName: 'alert-triangle' };
  }
  if (digested === 0 && n === 0) {
    return { tone: 'success', label: 'Completed — nothing relevant today', iconName: 'check-circle' };
  }
  // digested === 0 && n > 0
  return { tone: 'partial', label: `Completed with ${n} error${n === 1 ? '' : 's'}`, iconName: 'alert-triangle' };
}

const TONE_CLASSES: Record<JobStatusTone, { dot: string; iconColor: string; bg: string; label: string }> = {
  success: { dot: 'bg-emerald-500',                iconColor: 'text-emerald-500', bg: 'bg-emerald-500/5',        label: 'text-emerald-500' },
  partial: { dot: 'bg-amber-400',                  iconColor: 'text-amber-400',   bg: 'bg-amber-400/5',          label: 'text-amber-400' },
  failure: { dot: 'bg-red-400',                    iconColor: 'text-red-400',     bg: 'bg-red-400/5',            label: 'text-red-400' },
  running: { dot: 'bg-amber-400 animate-pulse',    iconColor: 'text-amber-400',   bg: 'bg-amber-400/5',          label: 'text-amber-400' },
  pending: { dot: 'bg-on-surface-variant/40',      iconColor: 'text-on-surface-variant', bg: 'bg-surface-container-lowest', label: 'text-on-surface-variant' },
};

function jobOneLineSummary(job: AutoDigestJob): string {
  const summary = job.result_summary as Record<string, any> | null;
  const systemErrors: string[] = Array.isArray(summary?.errors) ? summary!.errors : [];
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

  // Show feeds, harvest, and the productive outcomes. AI-skip is a verdict,
  // not a failure — surface it neutrally. Only systemErrors get the "error"
  // label since "failed" was already misleading.
  const parts: string[] = [];
  parts.push(`${feedsFetched} feed${feedsFetched === 1 ? '' : 's'}`);
  if (harvested > 0) parts.push(`${harvested} harvested`);
  if (recovered > 0) parts.push(`${recovered} recovered`);
  if (digested > 0) parts.push(`${digested} digested`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (systemErrors.length > 0) parts.push(`${systemErrors.length} error${systemErrors.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

// =============================================================================
// JOB CARD
// =============================================================================

const JobCard: React.FC<{ job: AutoDigestJob; expanded: boolean; onToggle: () => void }> = ({ job, expanded, onToggle }) => {
  const { tone, label, iconName } = jobToneAndLabel(job);
  const classes = TONE_CLASSES[tone];
  const dur = jobDuration(job);
  const summary = jobOneLineSummary(job);

  return (
    <div className={`rounded-xl border border-outline-variant/30 ${classes.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={onToggle}
        // Hex job IDs (#768e794e) used to render in the visible row but were
        // pure noise — eight characters of horizontal real estate that taught
        // the user nothing. Moved to a `title` so they're available on hover
        // for support/copy without polluting the scan-read.
        title={`Run ID: ${job.id}`}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-on-surface/[0.02] transition-colors"
      >
        <Icon
          name={iconName}
          className={`w-4 h-4 mt-0.5 shrink-0 ${classes.iconColor} ${tone === 'running' ? 'animate-spin' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${classes.label}`}>{label}</span>
            <span className="text-[11px] text-on-surface-variant/50 tabular-nums">
              {formatTime(job.created_at)}
            </span>
            {dur != null && (
              <span className="text-[11px] text-on-surface-variant/50 tabular-nums">
                · {formatDuration(dur)}
              </span>
            )}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">{summary}</div>
        </div>
        <Icon
          name={expanded ? 'chevron-down' : 'chevron-right'}
          className="w-4 h-4 text-on-surface-variant/40 shrink-0 mt-1"
        />
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/15">
          <JobTranscript job={job} />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FeedActivityLog: React.FC<FeedActivityLogProps> = ({ userId }) => {
  const [jobs, setJobs] = useState<AutoDigestJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ActivityFilter>('all');

  // ?run=<jobId> deep-link from a digested report (or campaign) — auto-expand
  // that run's transcript on mount so the user lands directly on the context
  // they came for instead of having to scroll and click.
  const [searchParams] = useSearchParams();
  const requestedRunId = searchParams.get('run');

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setJobs(data as AutoDigestJob[]);
  }, [userId]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchJobs().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchJobs]);

  // Live poll while a job is running so the activity log reflects status
  // changes (pending → processing → completed) without manual refresh.
  const hasActiveJob = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
  useEffect(() => {
    if (!userId || !hasActiveJob) return;
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [userId, hasActiveJob, fetchJobs]);

  // Auto-expand any active job + the most-recent job so the user always
  // sees something useful when landing on the page. If the user arrived
  // via a `?run=<jobId>` deep-link, prefer that run.
  useEffect(() => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (requestedRunId && jobs.some((j) => j.id === requestedRunId)) {
        next.add(requestedRunId);
        return next;
      }
      let mostRecentDone: string | null = null;
      for (const j of jobs) {
        if (j.status === 'pending' || j.status === 'processing') next.add(j.id);
        else if (mostRecentDone === null) mostRecentDone = j.id;
      }
      if (mostRecentDone && next.size === 0) next.add(mostRecentDone);
      return next;
    });
  }, [jobs, requestedRunId]);

  const toggleJob = (jobId: string) =>
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      next.has(jobId) ? next.delete(jobId) : next.add(jobId);
      return next;
    });

  const toggleDay = (key: string) =>
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Apply the filter chip BEFORE grouping by day so chip filtering doesn't
  // leave empty-day headers behind.
  const filteredJobs = useMemo(
    () => jobs.filter((j) => jobMatchesFilter(j, filter)),
    [jobs, filter],
  );

  // Group jobs by day
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

  // ─── Loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="text-base font-semibold text-on-surface mb-4">Activity Log</h3>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ─── Empty ─────────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="text-base font-semibold text-on-surface mb-4">Activity Log</h3>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon name="activity" className="w-10 h-10 text-on-surface-variant/30 mb-3" />
          <p className="text-sm text-on-surface-variant">
            No auto-digest runs yet. Click <span className="font-medium text-on-surface">Run Now</span> above to kick off the first one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 flex flex-col"
         style={{ maxHeight: 'calc(100vh - 260px)' }}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0 gap-4 flex-wrap">
        <h3 className="text-base font-semibold text-on-surface">Activity Log</h3>
        <div className="flex items-center gap-1">
          {ACTIVITY_FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/50'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest tabular-nums">
          {filter === 'all'
            ? `${jobs.length} run${jobs.length === 1 ? '' : 's'}`
            : `${filteredJobs.length} of ${jobs.length}`}
        </span>
      </div>

      {filteredJobs.length === 0 && (
        <div className="px-6 pb-8 text-center text-xs text-on-surface-variant/60">
          No runs match the {ACTIVITY_FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} filter.
        </div>
      )}

      <div className="overflow-y-auto px-6 pb-6 space-y-4 scrollbar-thin">
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
                  className="w-3.5 h-3.5 text-on-surface-variant/50 group-hover:text-on-surface-variant transition-colors"
                />
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {group.label}
                </span>
                <span className="text-[10px] text-on-surface-variant/40 tabular-nums">
                  ({group.jobs.length})
                </span>
              </button>
              {!collapsed && (
                <div className="space-y-2">
                  {group.jobs.map((j) => (
                    <JobCard
                      key={j.id}
                      job={j}
                      expanded={expandedJobs.has(j.id)}
                      onToggle={() => toggleJob(j.id)}
                    />
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
