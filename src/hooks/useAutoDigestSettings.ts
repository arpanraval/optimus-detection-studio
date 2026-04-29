import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './useToast';

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
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout_partial';
  started_at: string | null;
  completed_at: string | null;
  result_summary: Record<string, any> | null;
  error: string | null;
  created_at: string;
}

// ============================================
// HOOK
// ============================================

export function useAutoDigestSettings(userId: string) {
  const [settings, setSettings] = useState<AutoDigestSettings | null>(null);
  const [curatedSources, setCuratedSources] = useState<CuratedFeedSource[]>([]);
  const [enabledSourceIds, setEnabledSourceIds] = useState<Set<string>>(new Set());
  const [recentJobs, setRecentJobs] = useState<AutoDigestJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('auto_digest_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
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
    if (!error) {
      setCuratedSources(data || []);
    }
  }, []);

  const fetchEnabledSources = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feeds')
      .select('curated_source_id')
      .eq('user_id', userId)
      .eq('is_auto_digest', true)
      .eq('is_enabled', true)
      .not('curated_source_id', 'is', null);
    if (!error) {
      const ids = new Set<string>((data || []).map((r: any) => r.curated_source_id));
      setEnabledSourceIds(ids);
    }
  }, [userId]);

  const fetchRecentJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('auto_digest_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(7);
    if (!error) {
      setRecentJobs(data || []);
    }
  }, [userId]);

  const saveSettings = useCallback(async (updates: Partial<AutoDigestSettings>) => {
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
      return;
    }
    showToast('success', 'Auto-digest settings saved');
    await fetchSettings();
  }, [userId, fetchSettings, showToast]);

  const toggleSource = useCallback(async (source: CuratedFeedSource, enabled: boolean) => {
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
        showToast('error', 'Failed to enable feed source');
        return;
      }
    } else {
      const { error } = await supabase
        .from('threat_intel_feeds')
        .update({ is_enabled: false })
        .eq('user_id', userId)
        .eq('curated_source_id', source.id);
      if (error) {
        showToast('error', 'Failed to disable feed source');
        return;
      }
    }
    await fetchEnabledSources();
  }, [userId, fetchEnabledSources, showToast]);

  const triggerManualRun = useCallback(async (): Promise<{ jobId: string } | null> => {
    const { data, error } = await supabase.functions.invoke('trigger-auto-digest', { body: {} });
    if (error) {
      showToast('error', `Failed to start: ${error.message}`);
      return null;
    }
    if (data?.status === 'pending' || data?.status === 'processing') {
      showToast('info', 'A digest job is already in progress');
    } else {
      showToast('success', 'Digest pipeline started');
    }
    await fetchRecentJobs();
    return { jobId: data?.job_id };
  }, [showToast, fetchRecentJobs]);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchSettings(),
      fetchEnabledSources(),
      fetchRecentJobs(),
    ]);
  }, [fetchSettings, fetchEnabledSources, fetchRecentJobs]);

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    Promise.all([
      fetchSettings(),
      fetchCuratedSources(),
      fetchEnabledSources(),
      fetchRecentJobs(),
    ]).finally(() => setIsLoading(false));
  }, [userId, fetchSettings, fetchCuratedSources, fetchEnabledSources, fetchRecentJobs]);

  return {
    settings,
    curatedSources,
    enabledSourceIds,
    recentJobs,
    isLoading,
    fetchSettings,
    fetchCuratedSources,
    fetchEnabledSources,
    fetchRecentJobs,
    saveSettings,
    toggleSource,
    triggerManualRun,
    refresh,
  };
}
