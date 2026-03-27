import React, { useMemo } from 'react';
import { Icon } from '../Icon';
import type { Integration, DeploymentRecord } from '../../types';

// ── Style maps ──────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface SiemHomeOverviewTabProps {
  integration: Integration;
  deployments: DeploymentRecord[];
  onRefresh: () => void;
  onSwitchTab?: (tab: 'deploy' | 'history') => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SiemHomeOverviewTab({
  integration,
  deployments,
  onRefresh,
  onSwitchTab,
}: SiemHomeOverviewTabProps) {
  const { failedCount, pendingCount, breakdown, recentDeployments } = useMemo(() => {
    const failed = deployments.filter((d) => d.status === 'failed');
    const pending = deployments.filter(
      (d) => d.status === 'pending' || d.status === 'in_progress',
    );

    // Breakdown by action type
    const counts: Record<string, { total: number; success: number; failed: number }> = {};
    for (const d of deployments) {
      if (!counts[d.action]) counts[d.action] = { total: 0, success: 0, failed: 0 };
      counts[d.action].total++;
      if (d.status === 'success') counts[d.action].success++;
      if (d.status === 'failed') counts[d.action].failed++;
    }

    const sorted = [...deployments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return {
      failedCount: failed.length,
      pendingCount: pending.length,
      breakdown: Object.entries(counts),
      recentDeployments: sorted.slice(0, 15),
    };
  }, [deployments]);

  const isError = integration.status === 'error';
  const errorMessage = integration.last_test_result?.message;
  const hasAlerts = failedCount > 0 || pendingCount > 0 || isError;

  return (
    <div className="space-y-4">

      {/* ── Alerts: connection error or deployment failures ── */}
      {hasAlerts && (
        <div className="space-y-2">
          {/* Connection error with actual message */}
          {isError && errorMessage && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#A63D40]/8 border border-[#A63D40]/20">
              <Icon name="x-circle" className="w-4 h-4 text-[#A63D40] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#A63D40]">Connection error</p>
                <p className="text-xs text-on-surface-variant mt-0.5 break-words">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Failed / in-progress deployments */}
          {(failedCount > 0 || pendingCount > 0) && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/10">
              <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-on-surface-variant flex-1">
                {failedCount > 0 && (
                  <span className="text-[#A63D40] font-medium">{failedCount} failed</span>
                )}
                {failedCount > 0 && pendingCount > 0 && <span> · </span>}
                {pendingCount > 0 && (
                  <span className="text-amber-400 font-medium">{pendingCount} in progress</span>
                )}
                <span className="text-on-surface-variant"> — check the Deploy tab</span>
              </span>
              {onSwitchTab && (
                <button
                  type="button"
                  onClick={() => onSwitchTab('deploy')}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1 shrink-0"
                >
                  Go to Deploy
                  <Icon name="arrowRight" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Two-column: breakdown + recent activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Deployment breakdown by action type */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
          <h3 className="text-sm font-medium text-on-surface mb-4">By Action Type</h3>
          {breakdown.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No deployments yet</p>
          ) : (
            <div className="space-y-3">
              {breakdown.map(([action, counts]) => {
                const pct = counts.total > 0 ? Math.round((counts.success / counts.total) * 100) : 0;
                return (
                  <div key={action}>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${ACTION_STYLES[action] ?? 'bg-zinc-500/15 text-zinc-400'}`}
                      >
                        {action}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {counts.success}/{counts.total}
                        {counts.failed > 0 && (
                          <span className="text-[#A63D40] ml-1">({counts.failed} failed)</span>
                        )}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#4D7C6F] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity — takes 2/3 width */}
        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h3 className="text-sm font-medium text-on-surface">Recent Activity</h3>
            <button
              type="button"
              onClick={onRefresh}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Refresh"
            >
              <Icon name="refresh-cw" className="w-4 h-4" />
            </button>
          </div>

          {recentDeployments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Icon name="clock" className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No deployment activity yet</p>
              {onSwitchTab && (
                <button
                  type="button"
                  onClick={() => onSwitchTab('deploy')}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Go to Deploy →
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/10">
              {recentDeployments.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-container-high/50 transition-colors"
                >
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded capitalize shrink-0 ${ACTION_STYLES[d.action] ?? 'bg-zinc-500/15 text-zinc-400'}`}
                  >
                    {d.action}
                  </span>

                  <span className="font-mono text-xs text-on-surface-variant truncate min-w-0 flex-1">
                    {d.detection_id.slice(0, 8)}
                  </span>

                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${STATUS_STYLES[d.status] ?? 'bg-zinc-500/15 text-zinc-400'}`}
                  >
                    {d.status.replace('_', ' ')}
                  </span>

                  {d.completed_at && d.duration_ms != null && (
                    <span className="text-xs text-on-surface-variant/60 shrink-0 w-14 text-right">
                      {formatDuration(d.duration_ms)}
                    </span>
                  )}

                  <span className="text-xs text-on-surface-variant/60 shrink-0 w-16 text-right">
                    {relativeTime(d.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {deployments.length > 15 && onSwitchTab && (
            <div className="px-5 py-3 border-t border-outline-variant/10">
              <button
                type="button"
                onClick={() => onSwitchTab('history')}
                className="text-xs text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
              >
                View full history
                <Icon name="arrowRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SiemHomeOverviewTab;
