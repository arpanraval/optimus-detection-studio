import { Select } from '@/components/ui/Select';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import type { Integration, DeploymentRecord } from '../../types';

const PAGE_SIZE = 25;

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  update: 'bg-blue-500/15 text-blue-400',
  delete: 'bg-[#A63D40]/15 text-[#A63D40]',
  enable: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  disable: 'bg-zinc-500/15 text-zinc-400',
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  failed: 'bg-[#A63D40]/15 text-[#A63D40]',
  pending: 'bg-amber-500/15 text-amber-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  rolled_back: 'bg-zinc-500/15 text-zinc-400',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

interface SiemHomeHistoryTabProps {
  integration: Integration;
}

type HistoryRow = DeploymentRecord;

export function SiemHomeHistoryTab({ integration }: SiemHomeHistoryTabProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('deployment_history')
        .select('*', { count: 'exact' })
        .eq('integration_id', integration.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error: fetchError, count } = await query;
      if (fetchError) throw new Error(fetchError.message);

      setRows((data ?? []) as HistoryRow[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [integration.id, page, filterAction, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterAction, filterStatus]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">Action</label>
          <Select
            value={filterAction}
            onChange={(nextValue) => setFilterAction(nextValue)}
            aria-label="Action"
            size="sm"
            options={[
              { value: 'all', label: 'All' },
              { value: 'create', label: 'Create' },
              { value: 'update', label: 'Update' },
              { value: 'delete', label: 'Delete' },
              { value: 'enable', label: 'Enable' },
              { value: 'disable', label: 'Disable' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">Status</label>
          <Select
            value={filterStatus}
            onChange={(nextValue) => setFilterStatus(nextValue)}
            aria-label="Status"
            size="sm"
            options={[
              { value: 'all', label: 'All' },
              { value: 'success', label: 'Success' },
              { value: 'failed', label: 'Failed' },
              { value: 'pending', label: 'Pending' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'rolled_back', label: 'Rolled Back' },
            ]}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#A63D40]/10 border border-[#A63D40]/20 rounded-xl px-4 py-3 text-sm text-[#A63D40]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <Icon name="loader" className="w-6 h-6 text-on-surface-variant animate-spin mb-2" />
          <p className="text-sm text-on-surface-variant">Loading history...</p>
        </div>
      ) : rows.length === 0 ? (
        /* Empty state */
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <Icon name="clock" className="w-8 h-8 text-on-surface-variant mb-2" />
          <p className="text-sm text-on-surface-variant">No deployment history</p>
        </div>
      ) : (
        /* Table */
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container-high text-xs text-on-surface-variant uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium w-8" />
                <th className="text-left px-4 py-3 font-medium">Detection ID</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Vendor Rule ID</th>
                <th className="text-left px-4 py-3 font-medium">Deployed At</th>
                <th className="text-right px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isExpanded = expandedId === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(row.id)}
                    >
                      <td className="px-4 py-3">
                        <Icon
                          name={isExpanded ? 'chevron-down' : 'chevron-right'}
                          className="text-on-surface-variant text-base"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-on-surface">
                          {row.detection_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            ACTION_STYLES[row.action] ?? 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            STATUS_STYLES[row.status] ?? 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          {row.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.vendor_rule_id ? (
                          <span className="text-sm font-mono text-on-surface-variant">
                            {row.vendor_rule_id.length > 16
                              ? `${row.vendor_rule_id.slice(0, 16)}...`
                              : row.vendor_rule_id}
                          </span>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-on-surface-variant">
                          {formatDate(row.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-on-surface-variant">
                          {formatDuration(row.duration_ms)}
                        </span>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr className="border-t border-outline-variant/5 bg-surface-container-high/30">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-3 text-sm">
                            <div className="flex gap-8">
                              <div>
                                <span className="text-xs text-on-surface-variant uppercase tracking-wider">
                                  Full Detection ID
                                </span>
                                <p className="font-mono text-on-surface mt-0.5">{row.detection_id}</p>
                              </div>
                              {row.vendor_rule_id && (
                                <div>
                                  <span className="text-xs text-on-surface-variant uppercase tracking-wider">
                                    Full Vendor Rule ID
                                  </span>
                                  <p className="font-mono text-on-surface mt-0.5">{row.vendor_rule_id}</p>
                                </div>
                              )}
                            </div>

                            {row.deployed_query && (
                              <div>
                                <span className="text-xs text-on-surface-variant uppercase tracking-wider">
                                  Deployed Query
                                </span>
                                <pre className="mt-1 bg-surface-container rounded-lg border border-outline-variant/10 p-3 text-xs font-mono text-on-surface-variant overflow-x-auto whitespace-pre-wrap">
                                  {row.deployed_query}
                                </pre>
                              </div>
                            )}

                            {row.error_message && (
                              <div>
                                <span className="text-xs text-[#A63D40] uppercase tracking-wider">
                                  Error
                                </span>
                                <p className="mt-0.5 text-[#A63D40] bg-[#A63D40]/5 rounded-lg px-3 py-2 text-xs">
                                  {row.error_message}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-on-surface-variant">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
