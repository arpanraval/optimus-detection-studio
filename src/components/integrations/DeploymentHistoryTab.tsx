import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import type { Detection, DeploymentRecord, Integration } from '../../types';
import { integrationService } from '../../lib/integrationService';

// =============================================================================
// Component
// =============================================================================

interface DeploymentHistoryTabProps {
  detection: Detection;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  success: { label: 'Success', color: 'text-green-500', bgColor: 'bg-green-500' },
  failed: { label: 'Failed', color: 'text-error', bgColor: 'bg-error' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bgColor: 'bg-blue-400' },
  pending: { label: 'Pending', color: 'text-amber-500', bgColor: 'bg-amber-500' },
  rolled_back: { label: 'Rolled Back', color: 'text-on-surface-variant', bgColor: 'bg-on-surface-variant' },
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  enable: 'Enabled',
  disable: 'Disabled',
};

export const DeploymentHistoryTab: React.FC<DeploymentHistoryTabProps> = ({ detection }) => {
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

  const getIntegrationName = (integrationId: string): string => {
    const integration = integrations.find(i => i.id === integrationId);
    return integration?.name || 'Unknown Integration';
  };

  const getIntegrationProvider = (integrationId: string): string => {
    const integration = integrations.find(i => i.id === integrationId);
    return integration?.provider || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="loader" className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mx-auto mb-4">
          <Icon name="upload" className="w-8 h-8 text-on-surface-variant/30" />
        </div>
        <h3 className="text-base font-medium text-on-surface mb-1">No Deployments Yet</h3>
        <p className="text-sm text-on-surface-variant max-w-sm mx-auto">
          This detection hasn't been deployed to any SIEM platform. Use the Deploy button to push it to a connected integration.
        </p>
      </div>
    );
  }

  // Group by integration
  const grouped = deployments.reduce<Record<string, DeploymentRecord[]>>((acc, dep) => {
    const key = dep.integration_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(dep);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">
          <p className="text-2xl font-bold text-on-surface">{deployments.length}</p>
          <p className="text-xs text-on-surface-variant">Total Deployments</p>
        </div>
        <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/10">
          <p className="text-2xl font-bold text-green-500">
            {deployments.filter(d => d.status === 'success').length}
          </p>
          <p className="text-xs text-on-surface-variant">Successful</p>
        </div>
        <div className="p-3 rounded-xl bg-error/5 border border-error/10">
          <p className="text-2xl font-bold text-error">
            {deployments.filter(d => d.status === 'failed').length}
          </p>
          <p className="text-xs text-on-surface-variant">Failed</p>
        </div>
        <div className="p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">
          <p className="text-2xl font-bold text-on-surface">{Object.keys(grouped).length}</p>
          <p className="text-xs text-on-surface-variant">Platforms</p>
        </div>
      </div>

      {/* Deployment timeline grouped by integration */}
      {Object.entries(grouped).map(([integrationId, deps]) => (
        <div key={integrationId} className="rounded-xl border border-outline-variant/20 overflow-hidden">
          {/* Integration header */}
          <div className="px-4 py-3 bg-surface-container-high/50 border-b border-outline-variant/10 flex items-center gap-2">
            <Icon name="database" className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-on-surface">{getIntegrationName(integrationId)}</span>
            <span className="text-xs text-on-surface-variant">({getIntegrationProvider(integrationId)})</span>
            <span className="ml-auto text-xs text-on-surface-variant">{deps.length} deployment{deps.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Deployments list */}
          <div className="divide-y divide-outline-variant/10">
            {deps.map(dep => {
              const status = STATUS_CONFIG[dep.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedId === dep.id;

              return (
                <div key={dep.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : dep.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high/30 transition-colors text-left"
                  >
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.bgColor}`} />

                    {/* Action */}
                    <span className="text-xs font-medium text-on-surface w-16">
                      {ACTION_LABELS[dep.action] || dep.action}
                    </span>

                    {/* Status */}
                    <span className={`text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>

                    {/* Language */}
                    {dep.query_language && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-surface-container-highest rounded text-on-surface-variant">
                        {dep.query_language}
                      </span>
                    )}

                    {/* Spacer */}
                    <span className="flex-1" />

                    {/* Duration */}
                    {dep.duration_ms && (
                      <span className="text-[10px] text-on-surface-variant/50">{dep.duration_ms}ms</span>
                    )}

                    {/* Timestamp */}
                    <span className="text-[10px] text-on-surface-variant/50">
                      {new Date(dep.created_at).toLocaleString()}
                    </span>

                    <Icon
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      className="w-3.5 h-3.5 text-on-surface-variant/50"
                    />
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pl-9 space-y-2">
                      {dep.vendor_rule_id && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-on-surface-variant">Vendor Rule ID:</span>
                          <code className="bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface font-mono text-[11px]">
                            {dep.vendor_rule_id}
                          </code>
                        </div>
                      )}
                      {dep.error_message && (
                        <div className="p-2 rounded-lg bg-error/5 border border-error/10 text-xs text-error">
                          {dep.error_message}
                        </div>
                      )}
                      {dep.deployed_query && (
                        <div>
                          <p className="text-[10px] text-on-surface-variant mb-1">Deployed Query:</p>
                          <pre className="p-2 bg-surface-container-highest rounded text-[11px] text-on-surface overflow-x-auto max-h-24 font-mono border border-outline-variant/10">
                            {dep.deployed_query}
                          </pre>
                        </div>
                      )}
                      {dep.started_at && dep.completed_at && (
                        <div className="flex gap-4 text-[10px] text-on-surface-variant/50">
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
        </div>
      ))}
    </div>
  );
};
