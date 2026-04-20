import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface PackDeploymentStatus {
  pack_id: string;
  integration_id: string;
  integration_name?: string;
  total_detections: number;
  deployed_count: number;
  failed_count: number;
  last_deployed_at: string | null;
}

export interface PackTotals {
  pack_id: string;
  total_detections: number;
  production_ready_count: number;
  draft_count: number;
}

export function usePackDeploymentStatus(packId: string | null) {
  const [statuses, setStatuses] = useState<PackDeploymentStatus[]>([]);
  const [totals, setTotals] = useState<PackTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!packId) return;
    setLoading(true);
    setError(null);
    try {
      const [statusRes, totalsRes, integrationsRes] = await Promise.all([
        supabase.from('v_pack_deployment_status').select('*').eq('pack_id', packId),
        supabase.from('v_pack_totals').select('*').eq('pack_id', packId).maybeSingle(),
        supabase.from('integrations').select('id, name'),
      ]);

      if (statusRes.error) throw statusRes.error;
      if (totalsRes.error) throw totalsRes.error;

      const integrationMap = new Map<string, string>();
      (integrationsRes.data || []).forEach((i: { id: string; name: string }) =>
        integrationMap.set(i.id, i.name)
      );

      const enriched: PackDeploymentStatus[] = (statusRes.data || []).map(s => ({
        ...s,
        integration_name: integrationMap.get(s.integration_id),
      }));

      setStatuses(enriched);
      setTotals(totalsRes.data as PackTotals | null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load pack status'));
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { statuses, totals, loading, error, refetch: fetch };
}

/**
 * One-shot check: has this pack been deployed to any SIEM?
 * Used by PackVersionTimeline to warn before rollback that deployed rules
 * will stay active in the SIEM after rollback (rollback only changes the
 * local pack membership, not SIEM state).
 */
export async function hasActiveDeployments(packId: string): Promise<boolean> {
  const { data } = await supabase
    .from('v_pack_deployment_status')
    .select('deployed_count')
    .eq('pack_id', packId);
  return (data || []).some((r: { deployed_count: number }) => r.deployed_count > 0);
}
