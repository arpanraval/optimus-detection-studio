import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import type { Integration } from '../../types';

interface DeploymentRow {
  id: string;
  detection_id: string;
  integration_id: string;
  status: string;
  vendor_rule_id: string | null;
  created_at: string;
  integration_name: string;
  integration_provider: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SiemDriftTab() {
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSiem, setFilterSiem] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [intRes, depRes] = await Promise.all([
          supabase.from('integrations').select('*'),
          supabase.from('deployment_history').select('*').order('created_at', { ascending: false }),
        ]);
        if (intRes.error) throw new Error(intRes.error.message);
        if (depRes.error) throw new Error(depRes.error.message);

        const ints = (intRes.data || []) as Integration[];
        setIntegrations(ints);

        const intMap = new Map(ints.map((i) => [i.id, i]));
        const mapped: DeploymentRow[] = (depRes.data || []).map((d: any) => {
          const int = intMap.get(d.integration_id);
          return {
            id: d.id,
            detection_id: d.detection_id,
            integration_id: d.integration_id,
            status: d.status,
            vendor_rule_id: d.vendor_rule_id,
            created_at: d.created_at,
            integration_name: int?.name || 'Unknown',
            integration_provider: int?.provider || 'unknown',
          };
        });

        // Deduplicate: keep latest deployment per detection+integration
        const latestMap = new Map<string, DeploymentRow>();
        for (const row of mapped) {
          const key = `${row.detection_id}::${row.integration_id}`;
          if (!latestMap.has(key)) {
            latestMap.set(key, row);
          }
        }
        setRows(Array.from(latestMap.values()));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drift data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterSiem !== 'all' && r.integration_id !== filterSiem) return false;
      if (filterStatus === 'synced' && r.status !== 'success') return false;
      if (filterStatus === 'failed' && r.status !== 'failed') return false;
      if (filterStatus === 'rolled_back' && r.status !== 'rolled_back') return false;
      return true;
    });
  }, [rows, filterSiem, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 text-on-surface-variant animate-spin" />
        <span className="ml-3 text-on-surface-variant">Loading drift data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container/30 border border-error/20 rounded-xl p-6 text-center">
        <p className="text-on-surface">{error}</p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-500/15 text-green-400',
      failed: 'bg-red-500/15 text-red-400',
      rolled_back: 'bg-zinc-500/15 text-zinc-400',
      in_progress: 'bg-amber-500/15 text-amber-400',
      pending: 'bg-blue-500/15 text-blue-400',
    };
    return (
      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md ${colors[status] || 'bg-zinc-500/15 text-zinc-400'}`}>
        {status === 'success' ? 'Synced' : status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterSiem}
          onChange={(e) => setFilterSiem(e.target.value)}
          className="px-3 py-2 bg-surface-container border border-outline-variant/20 rounded-lg text-sm text-on-surface"
        >
          <option value="all">All SIEMs</option>
          {integrations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-surface-container border border-outline-variant/20 rounded-lg text-sm text-on-surface"
        >
          <option value="all">All Statuses</option>
          <option value="synced">Synced</option>
          <option value="failed">Failed</option>
          <option value="rolled_back">Rolled Back</option>
        </select>
        <span className="flex items-center text-sm text-on-surface-variant">
          {filtered.length} deployment{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
          <Icon name="check-circle" className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">No deployment records match your filters.</p>
        </div>
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Detection ID</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">SIEM</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Last Deployed</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Vendor Rule ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
                    <td className="px-4 py-3 text-on-surface font-mono text-xs">{row.detection_id.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-on-surface">{row.integration_name}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">{row.vendor_rule_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
