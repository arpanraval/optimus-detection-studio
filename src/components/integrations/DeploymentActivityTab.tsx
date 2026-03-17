import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { DeploymentRecord, Integration } from '../../types';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';

// =============================================================================
// Constants
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  success:     { label: 'Success',     dot: 'bg-[#4D7C6F]', text: 'text-[#4D7C6F]' },
  failed:      { label: 'Failed',      dot: 'bg-[#A63D40]', text: 'text-[#A63D40]' },
  in_progress: { label: 'In Progress', dot: 'bg-[#0284C7]', text: 'text-[#0284C7]' },
  pending:     { label: 'Pending',     dot: 'bg-amber-500',  text: 'text-amber-600' },
  rolled_back: { label: 'Rolled Back', dot: 'bg-on-surface-variant', text: 'text-on-surface-variant' },
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  enable: 'Enabled',
  disable: 'Disabled',
};

const PAGE_SIZE = 50;

// =============================================================================
// Component
// =============================================================================

interface DeploymentActivityTabProps {
  /** When provided, filter deployments to this integration only */
  integrationId?: string;
}

export const DeploymentActivityTab: React.FC<DeploymentActivityTabProps> = ({ integrationId: propIntegrationId }) => {
  const [allDeployments, setAllDeployments] = useState<DeploymentRecord[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterProvider, setFilterProvider] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [deps, ints] = await Promise.all([
        propIntegrationId
          ? integrationService.getDeploymentHistory({ integrationId: propIntegrationId })
          : integrationService.getAllDeployments({ limit: PAGE_SIZE }),
        integrationService.listIntegrations(),
      ]);
      setAllDeployments(deps);
      setIntegrations(ints);
      setHasMore(!propIntegrationId && deps.length === PAGE_SIZE);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await integrationService.getAllDeployments({
        limit: PAGE_SIZE,
        offset: allDeployments.length,
      });
      setAllDeployments(prev => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      // Silently handle
    } finally {
      setLoadingMore(false);
    }
  };

  const integrationMap = useMemo(() => {
    const map = new Map<string, Integration>();
    integrations.forEach(i => map.set(i.id, i));
    return map;
  }, [integrations]);

  const availableProviders = useMemo(() => {
    const providers = new Set<string>();
    integrations.forEach(i => providers.add(i.provider));
    return Array.from(providers);
  }, [integrations]);

  const filtered = useMemo(() => {
    return allDeployments.filter(dep => {
      const integration = integrationMap.get(dep.integration_id);
      if (filterProvider !== 'all') {
        if (!integration || integration.provider !== filterProvider) return false;
      }
      if (filterStatus !== 'all' && dep.status !== filterStatus) return false;
      if (filterAction !== 'all' && dep.action !== filterAction) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = integration?.name?.toLowerCase() || '';
        const vendorId = dep.vendor_rule_id?.toLowerCase() || '';
        if (!name.includes(q) && !vendorId.includes(q)) return false;
      }
      return true;
    });
  }, [allDeployments, integrationMap, filterProvider, filterStatus, filterAction, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (allDeployments.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mx-auto mb-4">
          <Icon name="clock" className="w-8 h-8 text-on-surface-variant/30" />
        </div>
        <h3 className="text-base font-semibold text-on-surface mb-2">No Deployment Activity</h3>
        <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Deploy a detection from the library to see activity here.
        </p>
      </div>
    );
  }

  // Custom styled select to match design system
  const selectClasses = "h-8 px-3 text-xs font-medium bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface focus:outline-none focus:border-outline focus:ring-1 focus:ring-outline/20 transition-all cursor-pointer";

  return (
    <div className="space-y-5">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {!propIntegrationId && (
          <select
            value={filterProvider}
            onChange={e => setFilterProvider(e.target.value)}
            className={selectClasses}
          >
            <option value="all">All Providers</option>
            {availableProviders.map(p => {
              const meta = getProviderMeta(p as any);
              return <option key={p} value={p}>{meta?.name || p}</option>;
            })}
          </select>
        )}

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={selectClasses}
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
        </select>

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className={selectClasses}
        >
          <option value="all">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>

        <div className="ml-auto w-56">
          <Input
            size="sm"
            type="search"
            leadingIcon="search"
            placeholder="Search deployments..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            clearable
            onClear={() => setSearchQuery('')}
          />
        </div>
      </div>

      {/* Deployment list */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-on-surface-variant">No deployments match the current filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/15">
            {filtered.map(dep => {
              const integration = integrationMap.get(dep.integration_id);
              const meta = integration ? getProviderMeta(integration.provider) : undefined;
              const status = STATUS_CONFIG[dep.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedId === dep.id;

              return (
                <div key={dep.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : dep.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container/40 transition-colors text-left"
                  >
                    {/* Status dot */}
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.dot}`} />

                    {/* Timestamp */}
                    <span className="text-xs text-on-surface-variant w-32 flex-shrink-0 font-medium">
                      {new Date(dep.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>

                    {/* Integration name + icon */}
                    <div className="flex items-center gap-2 w-40 flex-shrink-0">
                      {meta && (
                        <meta.IconComponent
                          size={16}
                          color={meta.useDefaultColor ? 'default' : meta.brandColor}
                        />
                      )}
                      <span className="text-sm font-medium text-on-surface truncate">
                        {integration?.name || 'Unknown'}
                      </span>
                    </div>

                    {/* Action */}
                    <span className="text-sm text-on-surface w-20 font-medium">
                      {ACTION_LABELS[dep.action] || dep.action}
                    </span>

                    {/* Status */}
                    <span className={`text-xs font-semibold w-20 ${status.text}`}>
                      {status.label}
                    </span>

                    {/* Language badge */}
                    {dep.query_language ? (
                      <span className="px-2 py-0.5 text-xs bg-surface-container-highest rounded-md text-on-surface-variant font-medium">
                        {dep.query_language}
                      </span>
                    ) : (
                      <span className="w-12" />
                    )}

                    <span className="flex-1" />

                    {/* Duration */}
                    {dep.duration_ms != null && (
                      <span className="text-xs text-on-surface-variant">{dep.duration_ms}ms</span>
                    )}

                    <Icon
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      className="w-4 h-4 text-on-surface-variant"
                    />
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pl-12 space-y-3 bg-surface-container/30">
                      {dep.vendor_rule_id && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-on-surface-variant">Vendor Rule ID:</span>
                          <code className="bg-surface-container-highest px-2 py-0.5 rounded-md text-on-surface font-mono text-xs">
                            {dep.vendor_rule_id}
                          </code>
                        </div>
                      )}
                      {dep.error_message && (
                        <div className="p-3 rounded-xl bg-[#A63D40]/5 border border-[#A63D40]/15 text-sm text-[#A63D40]">
                          {dep.error_message}
                        </div>
                      )}
                      {dep.deployed_query && (
                        <div>
                          <p className="text-xs text-on-surface-variant font-medium mb-1.5">Deployed Query:</p>
                          <pre className="p-3 bg-surface-container-highest rounded-xl text-xs text-on-surface overflow-x-auto max-h-28 font-mono border border-outline-variant/20">
                            {dep.deployed_query}
                          </pre>
                        </div>
                      )}
                      {dep.started_at && dep.completed_at && (
                        <div className="flex gap-6 text-xs text-on-surface-variant">
                          <span>Started: {new Date(dep.started_at).toLocaleString()}</span>
                          <span>Completed: {new Date(dep.completed_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && filtered.length === allDeployments.length && (
        <div className="text-center pt-2">
          <Button
            color="surface"
            variant="outlined"
            size="sm"
            onClick={loadMore}
            loading={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
};
