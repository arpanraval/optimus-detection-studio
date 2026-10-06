import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import type { Detection, DeploymentRecord, Integration } from '../../types';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { DetailCard } from '../detection/DetailCard';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

// =============================================================================
// Design-system maps (sage #4D7C6F success, brick #A63D40 failure, sky #0284C7 running)
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; icon: IconName; pill: string }> = {
  success: {
    label: 'Success',
    icon: 'check-circle',
    pill: 'bg-[#4D7C6F]/15 text-[#4D7C6F] dark:text-[#6BA594]',
  },
  failed: {
    label: 'Failed',
    icon: 'x-circle',
    pill: 'bg-[#A63D40]/15 text-[#A63D40]',
  },
  in_progress: {
    label: 'In progress',
    icon: 'loader',
    pill: 'bg-[#0284C7]/15 text-[#0284C7]',
  },
  pending: {
    label: 'Pending',
    icon: 'clock',
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  rolled_back: {
    label: 'Rolled back',
    icon: 'undo',
    pill: 'bg-surface-container-highest text-on-surface-variant',
  },
};

/** Verb phrase for a history row: "Created in Sentinel Production". */
const ACTION_PHRASES: Record<string, { verb: string; preposition: string }> = {
  create: { verb: 'Created', preposition: 'in' },
  update: { verb: 'Updated', preposition: 'in' },
  delete: { verb: 'Removed', preposition: 'from' },
  enable: { verb: 'Enabled', preposition: 'in' },
  disable: { verb: 'Disabled', preposition: 'in' },
};

function statusOf(record: DeploymentRecord) {
  return STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "5m ago" inside a week, then a fixed "Sep 21, 2026" rather than the locale's numeric date. */
function formatWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// =============================================================================
// Small pieces
// =============================================================================

const StatusPill: React.FC<{ record: DeploymentRecord }> = ({ record }) => {
  const status = statusOf(record);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.pill}`}>
      {status.label}
    </span>
  );
};

const MetaChip: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
  <span
    title={title}
    className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-container-highest text-on-surface-variant border border-outline-variant/20"
  >
    {children}
  </span>
);

const ProviderTile: React.FC<{ integration?: Integration }> = ({ integration }) => {
  const meta = integration ? getProviderMeta(integration.provider) : undefined;
  return (
    <span className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center flex-shrink-0 text-on-surface-variant">
      {/* Monochrome on purpose: one icon colour per page, status lives in the pills. */}
      {meta ? (
        <meta.IconComponent size={20} color="currentColor" />
      ) : (
        <Icon name="database" className="w-5 h-5" />
      )}
    </span>
  );
};

const CopyableId: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span className="flex items-center gap-1 min-w-0 max-w-full">
      <code className="block min-w-0 font-mono text-xs text-on-surface truncate" title={value}>{value}</code>
      <button
        type="button"
        onClick={copy}
        className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors flex-shrink-0"
        aria-label={copied ? 'Copied' : 'Copy rule ID'}
        title={copied ? 'Copied' : 'Copy rule ID'}
      >
        <Icon name={copied ? 'check' : 'copy'} className="w-3.5 h-3.5" />
      </button>
    </span>
  );
};

// =============================================================================
// Component
// =============================================================================

interface DeploymentHistoryTabProps {
  detection: Detection;
  /** Opens the deploy flow; offered from the empty state when the viewer may deploy. */
  onDeploy?: () => void;
}

export const DeploymentHistoryTab: React.FC<DeploymentHistoryTabProps> = ({ detection, onDeploy }) => {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [detection.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [deps, ints] = await Promise.all([
        integrationService.getDeploymentHistory({ detectionId: detection.id }),
        integrationService.listIntegrations(),
      ]);
      setDeployments(deps);
      setIntegrations(ints);
    } catch {
      // No deployments
    } finally {
      setLoading(false);
    }
  };

  const integrationMap = useMemo(() => {
    const map = new Map<string, Integration>();
    integrations.forEach(i => map.set(i.id, i));
    return map;
  }, [integrations]);

  const sorted = useMemo(
    () => [...deployments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [deployments],
  );

  // One row per connection: its most recent push, plus the version it last deployed successfully.
  const targets = useMemo(() => {
    const byIntegration = new Map<string, { latest: DeploymentRecord; lastSuccess?: DeploymentRecord; count: number }>();
    for (const dep of sorted) {
      const entry = byIntegration.get(dep.integration_id);
      if (!entry) {
        byIntegration.set(dep.integration_id, {
          latest: dep,
          lastSuccess: dep.status === 'success' ? dep : undefined,
          count: 1,
        });
      } else {
        entry.count += 1;
        if (!entry.lastSuccess && dep.status === 'success') entry.lastSuccess = dep;
      }
    }
    return Array.from(byIntegration.entries());
  }, [sorted]);

  const successCount = deployments.filter(d => d.status === 'success').length;
  const failedCount = deployments.filter(d => d.status === 'failed').length;

  const integrationName = (id: string) => integrationMap.get(id)?.name || 'Unknown integration';

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5">
            <Skeleton variant="text" width="w-40" height="h-4" className="mb-5" />
            <div className="flex items-center gap-3">
              <Skeleton variant="rounded" width="w-10" height="h-10" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="w-1/3" height="h-4" />
                <Skeleton variant="text" width="w-1/2" height="h-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <DetailCard title="Deployments">
        <EmptyState
          icon="cloud-upload"
          title="Not deployed yet"
          description="This detection hasn't been pushed to a connected SIEM. Deployments and their results will be recorded here."
          action={onDeploy ? { label: 'Deploy', icon: 'upload', onClick: onDeploy } : undefined}
        />
      </DetailCard>
    );
  }

  const summary = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <MetaChip>
        {targets.length} target{targets.length !== 1 ? 's' : ''}
      </MetaChip>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#4D7C6F]/15 text-[#4D7C6F] dark:text-[#6BA594]">
        {successCount} succeeded
      </span>
      {failedCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#A63D40]/15 text-[#A63D40]">
          {failedCount} failed
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Where this detection lives: latest push per connection */}
      <DetailCard
        title="Deployment targets"
        description="Latest push to each connected SIEM, from Optimus deployment records."
        headerRight={summary}
      >
        <ul className="-mx-5 -my-5 divide-y divide-outline-variant/20">
          {targets.map(([integrationId, { latest, lastSuccess, count }]) => {
            const integration = integrationMap.get(integrationId);
            const meta = integration ? getProviderMeta(integration.provider) : undefined;
            const phrase = ACTION_PHRASES[latest.action];
            const deployedVersion = lastSuccess?.detection_version ?? null;
            const isBehind = deployedVersion != null && deployedVersion < detection.version;
            const ruleId = latest.vendor_rule_id || lastSuccess?.vendor_rule_id || null;

            return (
              <li
                key={integrationId}
                className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center"
              >
                <div className="col-span-2 lg:col-span-1 flex items-center gap-3 min-w-0">
                  <ProviderTile integration={integration} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{integrationName(integrationId)}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {meta?.name || integration?.provider || 'SIEM'}
                      {latest.query_language && <> · {latest.query_language}</>}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <p className="text-on-surface-variant mb-1">Latest push</p>
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPill record={latest} />
                    <span className="text-on-surface truncate">{phrase?.verb || latest.action}</span>
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <p className="text-on-surface-variant mb-1">Deployed version</p>
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[22px] text-on-surface">
                    {deployedVersion != null ? <span className="font-mono">v{deployedVersion}</span> : <span className="text-on-surface-variant">—</span>}
                    {isBehind && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        title={`The detection is now v${detection.version}. Re-deploy to bring this target up to date.`}
                      >
                        Behind v{detection.version}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <p className="text-on-surface-variant mb-1">Rule ID</p>
                  <div className="min-h-[22px] flex items-center min-w-0">
                    {ruleId ? <CopyableId value={ruleId} /> : <span className="text-on-surface-variant">—</span>}
                  </div>
                </div>

                <div className="min-w-0 text-xs">
                  <p className="text-on-surface-variant mb-1">Last activity</p>
                  <p className="min-h-[22px] flex items-center text-on-surface truncate" title={formatTimestamp(latest.created_at)}>
                    {formatWhen(latest.created_at)}
                    <span className="text-on-surface-variant whitespace-pre"> · {count} push{count !== 1 ? 'es' : ''}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </DetailCard>

      {/* Every push, newest first */}
      <DetailCard title="Deployment history" description="Each push recorded for this detection. Select a row for the query and timings.">
        <ol className="-mx-5 -my-5 divide-y divide-outline-variant/20">
          {sorted.map(dep => {
            const status = statusOf(dep);
            const phrase = ACTION_PHRASES[dep.action];
            const isExpanded = expandedId === dep.id;
            const duration = formatDuration(dep.duration_ms);

            return (
              <li key={dep.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : dep.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-container/60 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-container-highest text-on-surface-variant">
                    <Icon name={status.icon} className={`w-4 h-4 ${dep.status === 'in_progress' ? 'animate-spin' : ''}`} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-on-surface truncate">
                      <span className="font-medium">{phrase?.verb || dep.action}</span>
                      <span className="text-on-surface-variant"> {phrase?.preposition || 'in'} </span>
                      <span className="font-medium">{integrationName(dep.integration_id)}</span>
                    </span>
                    <span className="block text-xs text-on-surface-variant mt-0.5" title={formatTimestamp(dep.created_at)}>
                      {formatWhen(dep.created_at)}
                      {duration && <> · took {duration}</>}
                    </span>
                  </span>

                  <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {dep.detection_version != null && <MetaChip title="Detection version deployed">v{dep.detection_version}</MetaChip>}
                    {dep.query_language && <MetaChip>{dep.query_language}</MetaChip>}
                  </span>
                  <StatusPill record={dep} />
                  <Icon
                    name="chevron-down"
                    className={`w-4 h-4 text-on-surface-variant flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 pl-16 space-y-3">
                    {dep.error_message && (
                      <div className="p-3 rounded-xl bg-[#A63D40]/5 border border-[#A63D40]/15 text-sm text-[#A63D40] break-words">
                        {dep.error_message}
                      </div>
                    )}

                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                      <div className="min-w-0 col-span-2 md:col-span-1">
                        <dt className="text-on-surface-variant mb-0.5">Rule ID</dt>
                        <dd>{dep.vendor_rule_id ? <CopyableId value={dep.vendor_rule_id} /> : <span className="text-on-surface-variant">—</span>}</dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant mb-0.5">Started</dt>
                        <dd className="text-on-surface">{formatTimestamp(dep.started_at || dep.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant mb-0.5">Completed</dt>
                        <dd className="text-on-surface">{dep.completed_at ? formatTimestamp(dep.completed_at) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-on-surface-variant mb-0.5">Duration</dt>
                        <dd className="text-on-surface">{duration || '—'}</dd>
                      </div>
                    </dl>

                    {dep.deployed_query && (
                      <div>
                        <p className="text-xs text-on-surface-variant mb-1.5">Deployed query</p>
                        <pre className="p-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-xs font-mono text-on-surface overflow-x-auto max-h-56 whitespace-pre-wrap break-words">
                          {dep.deployed_query}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </DetailCard>
    </div>
  );
};
