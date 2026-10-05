/**
 * usePackDeployJob — subscribes to live job + item updates via Supabase Realtime.
 * Updates happen in real-time as the worker processes each detection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { PackDeployJob } from '../lib/packDeployJobService';

export interface PackDeployJobItem {
  id: string;
  job_id: string;
  detection_id: string;
  detection_name: string | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  vendor_rule_id: string | null;
  error_message: string | null;
  retry_count: number;
  retryable: boolean;
  needs_reconciliation: boolean;
  attempted_at: string | null;
}

export function usePackDeployJob(jobId: string | null) {
  const [job, setJob] = useState<PackDeployJob | null>(null);
  const [items, setItems] = useState<PackDeployJobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentJob = useRef(jobId);
  currentJob.current = jobId;

  const refresh = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const [jobRes, itemsRes] = await Promise.all([
      supabase
        .from('pack_deploy_jobs')
        .select('*,detection_packs(name),integrations(name)')
        .eq('id', jobId)
        .maybeSingle(),
      supabase.from('pack_deploy_job_items').select('*').eq('job_id', jobId).order('id'),
    ]);
    if (currentJob.current !== jobId) return;
    setError(jobRes.error?.message || itemsRes.error?.message || null);
    if (jobRes.data) setJob(jobRes.data as PackDeployJob);
    if (itemsRes.data) setItems(itemsRes.data as PackDeployJobItem[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setItems([]);
      return;
    }

    setJob(null);
    setItems([]);
    void refresh();
    // Realtime is an optimization; snapshots repair missed events and reconnect gaps.
    const poll = window.setInterval(() => {
      void refresh();
    }, 5000);

    // Subscribe to realtime changes on the job row and item rows
    const channel = supabase
      .channel(`deploy_job_${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pack_deploy_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          if (currentJob.current !== jobId) return;
          setJob((previous) => ({ ...previous, ...payload.new }) as PackDeployJob);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pack_deploy_job_items', filter: `job_id=eq.${jobId}` },
        (payload) => {
          if (currentJob.current !== jobId) return;
          const updated = payload.new as unknown as PackDeployJobItem;
          setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pack_deploy_job_items', filter: `job_id=eq.${jobId}` },
        (payload) => {
          if (currentJob.current !== jobId) return;
          const inserted = payload.new as unknown as PackDeployJobItem;
          setItems((prev) => [...prev, inserted]);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [jobId, refresh]);

  return { job, items, loading, error, refresh };
}
