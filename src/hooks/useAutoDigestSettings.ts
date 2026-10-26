import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './useToast';
import { getAllThreatIntelPromptTemplates } from '../lib/ai/prompts/threat-intel';
import { useTeamAutoDigest } from './useTeamAutoDigest';

// ============================================
// TYPES
// ============================================

export interface AutoDigestSettings {
  user_id: string;
  is_enabled: boolean;
  schedule_hour_utc: number;
  max_articles_per_day: number;
  ai_model: string;
  classification_model: string;
  digest_model: string;
  /** Cached frontend prompt templates for the background orchestrator.
   *  Null until the user has triggered at least one manual run from the
   *  UI (which seeds the cache). The Activity tab uses this to show a
   *  bootstrap-needed banner when null + Auto-run is ON. */
  prompt_templates: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CuratedFeedSource {
  id: string;
  name: string;
  vendor: string;
  url: string;
  feed_type: string;
  category: 'threat_research' | 'government' | 'community';
  description: string;
  is_active: boolean;
  avg_articles_week: number;
  extraction_method: string;
}

export interface AutoDigestJob {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'cancelled' | 'failed' | 'timeout_partial';
  outcome?: 'complete' | 'partial' | 'failed' | 'cancelled' | null;
  phase?: string | null;
  heartbeat_at?: string | null;
  active_entry_id?: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: Record<string, any> | null;
  error: string | null;
  created_at: string;
}

// ============================================
// HOOK
// ============================================

// Per-source health surfaced in the Sources tab. Keyed by curated_source_id.
// `last_fetched_at` and `last_error` come from the user's threat_intel_feeds
// row that was created when they toggled the source on.
export interface FeedHealth {
  last_fetched_at: string | null;
  last_error: string | null;
  feed_id: string;
}

/** A user-added feed (curated_source_id IS NULL) shown in its own section
 *  on the Sources tab. Same threat_intel_feeds table; just keyed and
 *  rendered separately so the curated list stays clean. */
export interface CustomFeed {
  id: string;
  name: string;
  url: string;
  feed_type: string;
  is_enabled: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
}

export function useAutoDigestSettings(currentUserId: string) {
  const team = useTeamAutoDigest(currentUserId);
  const { userId, canManage } = team;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AutoDigestSettings | null>(null);
  const [curatedSources, setCuratedSources] = useState<CuratedFeedSource[]>([]);
  const [enabledSourceIds, setEnabledSourceIds] = useState<Set<string>>(new Set());
  const [feedHealth, setFeedHealth] = useState<Map<string, FeedHealth>>(new Map());
  const [customFeeds, setCustomFeeds] = useState<CustomFeed[]>([]);
  const [recentJobs, setRecentJobs] = useState<AutoDigestJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('auto_digest_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!error) {
      setSettings(data);
    }
  }, [userId]);

  const fetchCuratedSources = useCallback(async () => {
    const { data, error } = await supabase
      .from('curated_feed_sources')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    if (!error) {
      setCuratedSources(data || []);
    }
  }, []);

  const fetchEnabledSources = useCallback(async () => {
    // Fetch enabled sources together with the health columns (last_fetched_at,
    // last_error) so the Sources tab can render a per-row status pill without
    // a second round-trip. Disabled sources don't need health since the user
    // has nothing actionable to do about them until they re-enable.
    const { data, error } = await supabase
      .from('threat_intel_feeds')
      .select('id, curated_source_id, last_fetched_at, last_error')
      .eq('user_id', userId)
      .eq('is_auto_digest', true)
      .eq('is_enabled', true)
      .not('curated_source_id', 'is', null);
    if (error) throw error;
    if (!error) {
      const ids = new Set<string>();
      const health = new Map<string, FeedHealth>();
      for (const r of (data || []) as any[]) {
        if (!r.curated_source_id) continue;
        ids.add(r.curated_source_id);
        health.set(r.curated_source_id, {
          feed_id: r.id,
          last_fetched_at: r.last_fetched_at ?? null,
          last_error: r.last_error ?? null,
        });
      }
      setEnabledSourceIds(ids);
      setFeedHealth(health);
    }
  }, [userId]);

  // Custom feeds are user-added rows in threat_intel_feeds with
  // curated_source_id IS NULL. Same table, just rendered as a separate
  // section so the curated list isn't polluted with one-off entries.
  const fetchCustomFeeds = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feeds')
      .select('id, name, url, feed_type, is_enabled, last_fetched_at, last_error')
      .eq('user_id', userId)
      .eq('is_auto_digest', true)
      .is('curated_source_id', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!error) setCustomFeeds((data || []) as CustomFeed[]);
  }, [userId]);

  const addCustomFeed = useCallback(async (input: { name: string; url: string; feedType: 'rss' | 'atom' }) => {
    if (!canManage) return false;
    // Light client-side validation — the DB has its own NOT NULL/CHECK
    // guards, but a friendlier error here is worth the few lines.
    const name = input.name.trim();
    let parsedUrl: URL;
    try { parsedUrl = new URL(input.url); }
    catch { showToast('error', 'Invalid URL'); return false; }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      showToast('error', 'Only http:// and https:// feeds are supported');
      return false;
    }
    if (!name) { showToast('error', 'Source name is required'); return false; }

    const feedType = input.feedType === 'atom' ? 'rss' : input.feedType; // table only has 'rss' | 'taxii'

    const { error } = await supabase
      .from('threat_intel_feeds')
      .insert({
        user_id: userId,
        name,
        url: parsedUrl.toString(),
        feed_type: feedType,
        curated_source_id: null,
        is_auto_digest: true,
        is_enabled: true,
        extraction_method: 'direct',
        schedule_cron: '0 0 * * *',
      });

    if (error) {
      showToast('error', `Failed to add source: ${error.message}`);
      return false;
    }
    showToast('success', `Added ${name}`);
    await fetchCustomFeeds();
    return true;
  }, [canManage, userId, fetchCustomFeeds, showToast]);

  const removeCustomFeed = useCallback(async (feedId: string) => {
    if (!canManage) return false;
    const { error } = await supabase
      .from('threat_intel_feeds')
      .delete()
      .eq('id', feedId)
      .eq('user_id', userId)
      .is('curated_source_id', null); // belt-and-suspenders: never let this delete a curated row
    if (error) {
      showToast('error', `Failed to remove source: ${error.message}`);
      return false;
    }
    showToast('success', 'Source removed');
    await fetchCustomFeeds();
    return true;
  }, [canManage, userId, fetchCustomFeeds, showToast]);

  const toggleCustomFeed = useCallback(async (feedId: string, nextEnabled: boolean) => {
    if (!canManage) return;
    const { error } = await supabase
      .from('threat_intel_feeds')
      .update({ is_enabled: nextEnabled })
      .eq('id', feedId)
      .eq('user_id', userId)
      .is('curated_source_id', null);
    if (error) {
      showToast('error', `Failed to update source: ${error.message}`);
      return;
    }
    await fetchCustomFeeds();
  }, [canManage, userId, fetchCustomFeeds, showToast]);

  const fetchRecentJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(7);
    if (error) throw error;
    if (!error) {
      setRecentJobs(data || []);
    }
  }, [userId]);

  const saveSettings = useCallback(async (updates: Partial<AutoDigestSettings>): Promise<boolean> => {
    if (!canManage) return false;
    const { error } = await supabase
      .from('auto_digest_settings')
      .upsert(
        {
          ...updates,
          user_id: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (error) {
      showToast('error', 'Failed to save auto-digest settings');
      return false;
    }
    showToast('success', 'Auto-digest settings saved');
    await fetchSettings();
    return true;
  }, [canManage, userId, fetchSettings, showToast]);

  const toggleSource = useCallback(async (source: CuratedFeedSource, enabled: boolean): Promise<boolean> => {
    if (!canManage) return false;
    // Returns true on success, false on failure. The Save flow needs the
    // boolean to track per-source failures across a batch (so a mid-loop
    // failure doesn't strand earlier successes in the dirty-pending set);
    // single-toggle UI paths can ignore the return value. Keeps the toast
    // for failures so the user always sees something happen.
    if (enabled) {
      const feedType = source.feed_type === 'atom' ? 'rss' : source.feed_type;
      const { error } = await supabase
        .from('threat_intel_feeds')
        .insert({
          user_id: userId,
          name: source.name,
          url: source.url,
          feed_type: feedType,
          curated_source_id: source.id,
          is_auto_digest: true,
          is_enabled: true,
          extraction_method: source.extraction_method,
          schedule_cron: '0 0 * * *', // default daily
        });
      if (error) {
        showToast('error', `Failed to enable ${source.name}: ${error.message}`);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('threat_intel_feeds')
        .update({ is_enabled: false })
        .eq('user_id', userId)
        .eq('curated_source_id', source.id);
      if (error) {
        showToast('error', `Failed to disable ${source.name}: ${error.message}`);
        return false;
      }
    }
    await fetchEnabledSources();
    return true;
  }, [canManage, userId, fetchEnabledSources, showToast]);

  const triggerManualRun = useCallback(async (): Promise<{ jobId: string } | null> => {
    if (!canManage) return null;
    // Plan A: send the canonical threat-intel prompt templates with the
    // trigger so the orchestrator (which can't import frontend modules)
    // has them when it picks up the job. The trigger function caches
    // them on auto_digest_settings.prompt_templates so subsequent
    // cron-triggered runs can use the most-recently-seeded set too.
    const promptTemplates = getAllThreatIntelPromptTemplates();
    const { data, error } = await supabase.functions.invoke('trigger-auto-digest', {
      body: { promptTemplates },
    });
    if (error) {
      showToast('error', `Failed to start: ${error.message}`);
      return null;
    }
    const jobId = typeof data?.job_id === 'string' ? data.job_id : null;
    if (jobId) {
      // Publish the RPC response immediately so the header and Activity tab
      // render the new run before the follow-up SELECT completes.
      const jobStatus: AutoDigestJob['status'] =
        data?.status === 'processing' ? 'processing' : 'pending';
      const optimisticJob: AutoDigestJob = {
        id: jobId,
        user_id: userId,
        status: jobStatus,
        outcome: null,
        phase: null,
        heartbeat_at: null,
        active_entry_id: null,
        started_at: null,
        completed_at: null,
        result_summary: null,
        error: null,
        created_at: new Date().toISOString(),
      };
      setRecentJobs((previous) => {
        const existing = previous.find((job) => job.id === jobId);
        if (existing) {
          return previous.map((job) =>
            job.id === jobId ? { ...job, status: jobStatus } : job,
          );
        }
        return [optimisticJob, ...previous].slice(0, 7);
      });
    }
    if (data?.status === 'pending' || data?.status === 'processing') {
      showToast('info', 'A digest job is already in progress');
    } else {
      showToast('success', 'Digest pipeline started');
    }
    await fetchRecentJobs();
    return jobId ? { jobId } : null;
  }, [canManage, userId, showToast, fetchRecentJobs]);

  const cancelJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!canManage) return false;
    const { data, error } = await supabase.rpc('cancel_auto_digest_job', {
      p_job_id: jobId,
      p_reason: 'Cancelled by user',
    });
    if (error || data?.ok === false) {
      showToast('error', `Failed to cancel digest: ${error?.message || 'Job is no longer active'}`);
      return false;
    }
    showToast('info', 'Digest cancellation requested');
    await fetchRecentJobs();
    return true;
  }, [canManage, fetchRecentJobs, showToast]);
  const refresh = useCallback(async () => {
    await Promise.all([
      fetchSettings(),
      fetchEnabledSources(),
      fetchCustomFeeds(),
      fetchRecentJobs(),
    ]);
  }, [fetchSettings, fetchEnabledSources, fetchCustomFeeds, fetchRecentJobs]);

  useEffect(() => {
    if (!userId) {
      setSettings(null);
      setRecentJobs([]);
      setEnabledSourceIds(new Set());
      setFeedHealth(new Map());
      setCustomFeeds([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      fetchSettings(),
      fetchCuratedSources(),
      fetchEnabledSources(),
      fetchCustomFeeds(),
      fetchRecentJobs(),
    ]).catch(() => setLoadError('Unable to load the team pipeline. Please try again.'))
      .finally(() => setIsLoading(false));
  }, [userId, fetchSettings, fetchCuratedSources, fetchEnabledSources, fetchCustomFeeds, fetchRecentJobs]);

  // Poll job status while a job is active so the UI can reflect the live state
  // (button stuck on "Run" after refresh was the user-visible symptom of this
  // missing). Polls every 3s; stops as soon as no pending/processing job exists.
  const hasActiveJob = recentJobs.some(j => j.status === 'pending' || j.status === 'processing');
  useEffect(() => {
    if (!userId || !hasActiveJob) return;
    const interval = setInterval(() => {
      fetchRecentJobs().catch(() => setLoadError('Unable to refresh digest activity.'));
    }, 3000);
    return () => clearInterval(interval);
  }, [userId, hasActiveJob, fetchRecentJobs]);

  return {
    teamUserId: userId,
    canManage,
    error: team.error || loadError,
    settings,
    curatedSources,
    enabledSourceIds,
    feedHealth,
    customFeeds,
    recentJobs,
    isLoading: team.isLoading || isLoading,
    fetchSettings,
    fetchCuratedSources,
    fetchEnabledSources,
    fetchCustomFeeds,
    fetchRecentJobs,
    saveSettings,
    toggleSource,
    addCustomFeed,
    removeCustomFeed,
    toggleCustomFeed,
    triggerManualRun,
    cancelJob,
    refresh,
  };
}
