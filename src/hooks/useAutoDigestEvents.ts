import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// Mirror of the auto_digest_run_events table. New event types must be added
// here AND to the CHECK constraint in 20260429d_auto_digest_run_events.sql.
export type DigestEventType =
  | 'feed_fetched'
  | 'feed_failed'
  | 'article_seen'
  | 'article_duplicate'
  | 'article_classified'
  | 'article_classify_failed'
  | 'article_relevance_dropped'
  | 'article_skipped_daily_limit'
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
      setEvents(rows);
      lastSeenRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
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
        setEvents((prev) => [...prev, ...rows]);
        lastSeenRef.current = rows[rows.length - 1].created_at;
      }
    } catch (e) {
      // Silent — polling errors shouldn't surface in the UI; the next tick may succeed.
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
