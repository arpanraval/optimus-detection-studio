import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// Mirror of the auto_digest_run_events table. New event types must be added
// here AND to the CHECK constraint (see 20260429d_auto_digest_run_events.sql
// + 20260430a_drop_dead_event_types.sql).
export type DigestEventType =
  | 'feed_fetched'
  | 'feed_failed'
  | 'article_seen'
  | 'article_classified'
  | 'article_classify_failed'
  | 'article_skipped_daily_limit'
  | 'article_ranked'
  | 'article_digested'
  | 'article_digest_failed';

export interface DigestEvent {
  id: string;
  job_id: string;
  user_id: string | null;
  created_at: string;
  event_type: DigestEventType;
  feed_id: string | null;
  feed_name: string | null;
  article_id: string | null;
  article_title: string | null;
  article_url: string | null;
  passed: boolean | null;
  reason: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown> | null;
}

interface UseAutoDigestEventsOptions {
  /** When true, the hook polls every `pollIntervalMs` for new rows. */
  live: boolean;
  /** Override the default 2s polling interval. */
  pollIntervalMs?: number;
}

/**
 * Stream the audit-trail events for a single auto-digest job.
 *
 * Initial fetch loads everything for the job. Subsequent polls fetch only rows
 * with `created_at > lastSeen`, indexed on (job_id, created_at) so each tick
 * is a quick range scan. Polling auto-stops once `live` flips to false (which
 * the page does as soon as the parent job leaves pending/processing) so we
 * don't keep pinging the DB after a run completes.
 */
export function useAutoDigestEvents(jobId: string | null, options: UseAutoDigestEventsOptions) {
  const { live, pollIntervalMs = 2000 } = options;
  const [events, setEvents] = useState<DigestEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastSeenRef = useRef<string | null>(null);

  // De-dupe by id when merging into state. Two paths produce duplicates:
  //   1. React StrictMode mounts effects twice in dev — without a guard the
  //      same row from the initial fetch gets pushed into state twice.
  //   2. Concurrent polls: setInterval fires every 2s but doesn't await the
  //      previous fetchSince. If a query takes >2s, two polls share the same
  //      lastSeenRef and both append the same rows.
  // Result was the "Encountered two children with the same key" warning
  // in JobTranscript:501. Keep the union deterministic (sort by created_at)
  // so list order doesn't flicker as polls land.
  const mergeEvents = (prev: DigestEvent[], next: DigestEvent[]): DigestEvent[] => {
    if (next.length === 0) return prev;
    const byId = new Map<string, DigestEvent>();
    for (const e of prev) byId.set(e.id, e);
    for (const e of next) byId.set(e.id, e);
    return Array.from(byId.values()).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
  };

  const fetchAll = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('auto_digest_run_events')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
      if (err) throw err;
      const rows = (data ?? []) as DigestEvent[];
      // Replace, not append — fetchAll is the source of truth for a fresh load.
      // Dedupe within rows themselves as a belt-and-suspenders against any
      // accidental DB-level duplicates.
      const unique = Array.from(new Map(rows.map((r) => [r.id, r])).values());
      setEvents(unique);
      lastSeenRef.current = unique.length > 0 ? unique[unique.length - 1].created_at : null;
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  const fetchSince = useCallback(async () => {
    if (!jobId || !lastSeenRef.current) return;
    try {
      const { data, error: err } = await supabase
        .from('auto_digest_run_events')
        .select('*')
        .eq('job_id', jobId)
        .gt('created_at', lastSeenRef.current)
        .order('created_at', { ascending: true });
      if (err) throw err;
      const rows = (data ?? []) as DigestEvent[];
      if (rows.length > 0) {
        setEvents((prev) => mergeEvents(prev, rows));
        lastSeenRef.current = rows[rows.length - 1].created_at;
      }
    } catch (e: any) {
      // AbortError fires on normal teardown (job ended → live flipped false →
      // useEffect cleanup cancels the in-flight fetch). It's not a real
      // failure and shouldn't surface as a warning. Same for the
      // supabase-js wrapper that re-throws DOMException(name='AbortError')
      // as a plain object with `message: "AbortError: ..."`.
      const msg = typeof e?.message === 'string' ? e.message : String(e ?? '');
      if (e?.name === 'AbortError' || /AbortError|aborted/i.test(msg)) return;
      console.warn('[useAutoDigestEvents] poll failed:', e);
    }
  }, [jobId]);

  // Initial load whenever jobId changes
  useEffect(() => {
    setEvents([]);
    lastSeenRef.current = null;
    if (jobId) fetchAll();
  }, [jobId, fetchAll]);

  // Live polling while the job is running
  useEffect(() => {
    if (!jobId || !live) return;
    const interval = setInterval(() => {
      fetchSince();
    }, pollIntervalMs);
    return () => clearInterval(interval);
  }, [jobId, live, pollIntervalMs, fetchSince]);

  return { events, isLoading, error, refetch: fetchAll };
}
