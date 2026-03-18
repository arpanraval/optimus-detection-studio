import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './useToast';

export interface ThreatIntelFeed {
  id: string;
  user_id: string;
  name: string;
  feed_type: 'rss' | 'taxii';
  url: string;
  taxii_config?: Record<string, any>;
  schedule_cron: string;
  is_enabled: boolean;
  quality_rating?: number;
  last_fetched_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface FeedEntry {
  id: string;
  feed_id: string;
  user_id: string;
  external_id?: string;
  title: string;
  content?: string;
  url?: string;
  published_at?: string;
  fetched_at: string;
  auto_digest_report_id?: string;
  staleness_score: number;
  is_processed: boolean;
  feed_name?: string;
}

export function useThreatIntelFeeds(userId: string) {
  const [feeds, setFeeds] = useState<ThreatIntelFeed[]>([]);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const refreshFeeds = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feeds').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (!error) setFeeds(data || []);
  }, [userId]);

  const refreshEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('threat_intel_feed_entries').select('*, threat_intel_feeds(name)')
      .eq('user_id', userId).order('fetched_at', { ascending: false }).limit(100);
    if (!error) {
      setEntries((data || []).map((e: any) => ({ ...e, feed_name: e.threat_intel_feeds?.name })));
    }
  }, [userId]);

  useEffect(() => {
    Promise.all([refreshFeeds(), refreshEntries()]).finally(() => setIsLoading(false));
  }, [refreshFeeds, refreshEntries]);

  const addFeed = useCallback(async (feed: Partial<ThreatIntelFeed>) => {
    const { error } = await supabase.from('threat_intel_feeds').insert({ ...feed, user_id: userId });
    if (error) { showToast('error', 'Failed to add feed'); return; }
    showToast('success', 'Feed added');
    refreshFeeds();
  }, [userId, refreshFeeds, showToast]);

  const updateFeed = useCallback(async (id: string, updates: Partial<ThreatIntelFeed>) => {
    const { error } = await supabase.from('threat_intel_feeds').update(updates).eq('id', id);
    if (error) { showToast('error', 'Failed to update feed'); return; }
    refreshFeeds();
  }, [refreshFeeds, showToast]);

  const deleteFeed = useCallback(async (id: string) => {
    const { error } = await supabase.from('threat_intel_feeds').delete().eq('id', id);
    if (error) { showToast('error', 'Failed to delete feed'); return; }
    showToast('success', 'Feed deleted');
    refreshFeeds(); refreshEntries();
  }, [refreshFeeds, refreshEntries, showToast]);

  const fetchFeed = useCallback(async (feedId?: string) => {
    const { data, error } = await supabase.functions.invoke('fetch-feeds', {
      body: feedId ? { feed_id: feedId } : { all: true },
    });
    if (error) { showToast('error', 'Failed to fetch feed'); return; }
    showToast('success', `Fetched ${data?.new_entries_count || 0} new entries`);
    refreshFeeds(); refreshEntries();
  }, [refreshFeeds, refreshEntries, showToast]);

  const rateFeed = useCallback(async (id: string, rating: number) => {
    await supabase.from('threat_intel_feeds').update({ quality_rating: rating }).eq('id', id);
    refreshFeeds();
  }, [refreshFeeds]);

  return { feeds, entries, isLoading, addFeed, updateFeed, deleteFeed, fetchFeed, rateFeed, refreshFeeds, refreshEntries };
}
