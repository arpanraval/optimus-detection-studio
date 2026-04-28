import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface DigestCampaignSummary {
  id: string;
  campaignName: string;
  threatActors: string[] | null;
  attackType: string | null;
  severity: string | null;
  articleCount: number;
  ttpCount: number;
  coveragePercent: number;
  feasibleGapCount: number;
  infeasibleGapCount: number;
  reviewStatus: 'pending' | 'reviewed' | 'actioned' | 'deferred' | 'dismissed' | null;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

interface UseDigestCampaignsResult {
  campaigns: DigestCampaignSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDigestCampaigns(userId: string | undefined): UseDigestCampaignsResult {
  const [campaigns, setCampaigns] = useState<DigestCampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('auto_digest_campaigns')
        .select(
          'id, name, threat_actors, attack_type, severity, article_count, total_ttp_count, coverage_percent, feasible_gap_count, infeasible_gap_count, review_status, first_seen_at, last_updated_at'
        )
        .eq('user_id', userId)
        .order('last_updated_at', { ascending: false });

      if (queryError) throw queryError;

      setCampaigns(
        (data ?? []).map(row => ({
          id: row.id,
          campaignName: row.name,
          threatActors: row.threat_actors ?? null,
          attackType: row.attack_type ?? null,
          severity: row.severity ?? null,
          articleCount: row.article_count ?? 0,
          ttpCount: row.total_ttp_count ?? 0,
          coveragePercent: row.coverage_percent ?? 0,
          feasibleGapCount: row.feasible_gap_count ?? 0,
          infeasibleGapCount: row.infeasible_gap_count ?? 0,
          reviewStatus: row.review_status ?? null,
          firstSeenAt: new Date(row.first_seen_at).getTime(),
          lastUpdatedAt: new Date(row.last_updated_at).getTime(),
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { campaigns, isLoading, error, refetch: fetch };
}
