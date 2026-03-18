import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';

interface HistoryRow {
  id: string;
  detection_id: string;
  action: string;
  status: string;
  vendor_rule_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  integration_name: string;
  integration_provider: string;
}

const PAGE_SIZE = 25;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SiemHistoryTab() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filters
  const [filterSiem, setFilterSiem] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Integration list for filter dropdown
  const [integrationOptions, setIntegrationOptions] = useState<{ id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch integrations for lookup
      const intRes = await supabase.from('integrations').select('id, name, provider');
      if (intRes.error) throw new Error(intRes.error.message);
      const ints = intRes.data || [];
      setIntegrationOptions(ints.map((i: any) => ({ id: i.id, name: i.name })));
      const intMap = new Map(ints.map((i: any) => [i.id, i]));

      // Build query
      let query = supabase
        .from('deployment_history')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filterSiem !== 'all') query = query.eq('integration_id', filterSiem);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);

      const offset = page * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, error: qErr, count } = await query;
      if (qErr) throw new Error(qErr.message);

      setTotalCount(count || 0);
      setRows(
        (data || []).map((d: any) => {
          const int = intMap.get(d.integration_id);
          return {
            id: d.id,
            detection_id: d.detection_id,
            action: d.action,
            status: d.status,
            vendor_rule_id: d.vendor_rule_id,
            started_at: d.started_at || d.created_at,
            completed_at: d.completed_at,
            duration_ms: d.duration_ms,
            error_message: d.error_message,
            integration_name: int?.name || 'Unknown',
            integration_provider: int?.provider || 'unknown',
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [page, filterSiem, filterAction, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filterSiem, filterAction, filterStatus]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      create: 'text-green-400',
      update: 'text-blue-400',
      delete: 'text-red-400',
      enable: 'text-amber-400',
      disable: 'text-zinc-400',
    };
    return <span className={`text-xs font-medium capitalize ${colors[action] || 'text-on-surface-variant'}`}>{action}</span>;
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 text-on-surface-variant animate-spin" />
        <span className="ml-3 text-on-surface-variant">Loading deployment history...</span>
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
          {integrationOptions.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-3 py-2 bg-surface-container border border-outline-variant/20 rounded-lg text-sm text-on-surface"
        >
          <option value="all">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-surface-container border border-outline-variant/20 rounded-lg text-sm text-on-surface"
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="in_progress">In Progress</option>
          <option value="rolled_back">Rolled Back</option>
        </select>
        <span className="flex items-center text-sm text-on-surface-variant">
          {totalCount} record{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
          <Icon name="clock" className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">No deployment history found.</p>
        </div>
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Detection ID</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">SIEM</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Deployed At</th>
                  <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
                    <td className="px-4 py-3 text-on-surface font-mono text-xs">{row.detection_id.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-on-surface">{row.integration_name}</td>
                    <td className="px-4 py-3">{actionBadge(row.action)}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">{formatDate(row.started_at)}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">{formatDuration(row.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/10">
              <span className="text-xs text-on-surface-variant">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs rounded-lg bg-surface-container-high text-on-surface disabled:opacity-40 hover:bg-surface-container-highest transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs rounded-lg bg-surface-container-high text-on-surface disabled:opacity-40 hover:bg-surface-container-highest transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
