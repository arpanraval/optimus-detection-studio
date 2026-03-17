import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Integration, VendorRule } from '../../types';
import { hasPermission } from '../../types';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { usePermissions } from '../../context/PermissionsContext';
import { useToast } from '../../hooks/useToast';

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_CONFIG: Record<string, { dot: string; text: string }> = {
  critical:      { dot: 'bg-[#A63D40]',     text: 'text-[#A63D40]' },
  high:          { dot: 'bg-[#D4734B]',     text: 'text-[#D4734B]' },
  medium:        { dot: 'bg-amber-500',      text: 'text-amber-600' },
  low:           { dot: 'bg-[#4D7C6F]',     text: 'text-[#4D7C6F]' },
  informational: { dot: 'bg-on-surface-variant', text: 'text-on-surface-variant' },
};

function getSeverityConfig(severity?: string) {
  if (!severity) return null;
  return SEVERITY_CONFIG[severity.toLowerCase()] || null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =============================================================================
// Component
// =============================================================================

interface LiveRulesTabProps {
  /** When provided, skip the integration selector and show rules for this integration only */
  integrationId?: string;
}

export const LiveRulesTab: React.FC<LiveRulesTabProps> = ({ integrationId: propIntegrationId }) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>(propIntegrationId || '');
  const [rules, setRules] = useState<VendorRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const hasPropIntegrationId = !!propIntegrationId;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch {
    // Default to viewer
  }
  const canSync = hasPermission(userRole, 'integrations:sync');
  const canConfigure = hasPermission(userRole, 'integrations:configure');

  const { showToast } = useToast();

  // Load integrations on mount
  useEffect(() => {
    if (hasPropIntegrationId) {
      // When integrationId is provided as prop, skip fetching the list
      setLoading(false);
    } else {
      loadIntegrations();
    }
  }, []);

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const ints = await integrationService.listIntegrations();
      // Only show SIEM integrations that are connected
      const siemIntegrations = ints.filter(
        i => ['splunk', 'sentinel', 'defender_xdr', 'elastic'].includes(i.provider) &&
             (i.status === 'connected' || i.status === 'configured')
      );
      setIntegrations(siemIntegrations);
      if (siemIntegrations.length > 0 && !selectedIntegrationId) {
        setSelectedIntegrationId(siemIntegrations[0].id);
      }
    } catch {
      // Will show empty state
    } finally {
      setLoading(false);
    }
  };

  // Load rules when integration changes
  useEffect(() => {
    if (selectedIntegrationId) {
      loadRules();
    } else {
      setRules([]);
    }
  }, [selectedIntegrationId]);

  const loadRules = useCallback(async () => {
    if (!selectedIntegrationId) return;
    setLoadingRules(true);
    setError(null);
    try {
      const vendorRules = await integrationService.listVendorRulesEnriched(selectedIntegrationId);
      setRules(vendorRules);
      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, [selectedIntegrationId]);

  // Get selected integration
  const selectedIntegration = useMemo(
    () => integrations.find(i => i.id === selectedIntegrationId),
    [integrations, selectedIntegrationId]
  );
  const selectedMeta = selectedIntegration ? getProviderMeta(selectedIntegration.provider) : undefined;

  // Filtered rules
  const filtered = useMemo(() => {
    return rules.filter(rule => {
      if (filterStatus === 'enabled' && !rule.enabled) return false;
      if (filterStatus === 'disabled' && rule.enabled) return false;
      if (filterSource === 'optimus' && !rule.isFromOptimus) return false;
      if (filterSource === 'external' && rule.isFromOptimus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = rule.name?.toLowerCase() || '';
        const query = rule.query?.toLowerCase() || '';
        const id = rule.vendorRuleId?.toLowerCase() || '';
        if (!name.includes(q) && !query.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });
  }, [rules, filterStatus, filterSource, searchQuery]);

  // Stats
  const stats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    fromOptimus: rules.filter(r => r.isFromOptimus).length,
  }), [rules]);

  // ---- Action Handlers ----

  const handleToggle = async (rule: VendorRule) => {
    setTogglingId(rule.vendorRuleId);
    const newEnabled = !rule.enabled;
    // Optimistic update
    setRules(prev => prev.map(r =>
      r.vendorRuleId === rule.vendorRuleId ? { ...r, enabled: newEnabled } : r
    ));
    try {
      await integrationService.toggleVendorRule(rule.integrationId, rule.vendorRuleId, newEnabled);
      showToast('success', `Rule ${newEnabled ? 'enabled' : 'disabled'}`, rule.name);
    } catch (err) {
      // Revert optimistic update
      setRules(prev => prev.map(r =>
        r.vendorRuleId === rule.vendorRuleId ? { ...r, enabled: !newEnabled } : r
      ));
      showToast('error', 'Toggle failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (rule: VendorRule) => {
    setDeletingId(rule.vendorRuleId);
    try {
      await integrationService.deleteVendorRule(rule.integrationId, rule.vendorRuleId);
      setRules(prev => prev.filter(r => r.vendorRuleId !== rule.vendorRuleId));
      setConfirmDeleteId(null);
      showToast('success', 'Rule deleted', rule.name);
    } catch (err) {
      showToast('error', 'Delete failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = async (rule: VendorRule) => {
    setImportingId(rule.vendorRuleId);
    try {
      const detectionId = await integrationService.importVendorRule(rule);
      showToast('success', 'Rule imported', `"${rule.name}" added to your library as a Draft detection.`);
      // Mark as from Optimus locally
      setRules(prev => prev.map(r =>
        r.vendorRuleId === rule.vendorRuleId
          ? { ...r, isFromOptimus: true, optimusDetectionId: detectionId }
          : r
      ));
    } catch (err) {
      showToast('error', 'Import failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setImportingId(null);
    }
  };

  // ---- Render ----

  const selectClasses = "h-8 px-3 text-xs font-medium bg-surface-container-high border border-outline-variant/30 rounded-xl text-on-surface focus:outline-none focus:border-outline focus:ring-1 focus:ring-outline/20 transition-all cursor-pointer";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (!hasPropIntegrationId && integrations.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mx-auto mb-4">
          <Icon name="shield" className="w-8 h-8 text-on-surface-variant/30" />
        </div>
        <h3 className="text-base font-semibold text-on-surface mb-2">No SIEM Integrations</h3>
        <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Connect a SIEM integration (Splunk, Sentinel, Defender XDR, or Elastic) to view live rules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Integration selector + refresh */}
      <div className="flex items-center gap-3">
        {!hasPropIntegrationId && (
          <select
            value={selectedIntegrationId}
            onChange={e => setSelectedIntegrationId(e.target.value)}
            className={selectClasses + ' min-w-[200px]'}
          >
            {integrations.map(i => {
              const meta = getProviderMeta(i.provider);
              return (
                <option key={i.id} value={i.id}>
                  {meta?.name || i.provider} — {i.name}
                </option>
              );
            })}
          </select>
        )}

        <Button
          color="surface"
          variant="outlined"
          size="sm"
          leadingIcon="refresh-cw"
          onClick={loadRules}
          loading={loadingRules}
          disabled={loadingRules}
        >
          Refresh
        </Button>

        {lastRefreshed && (
          <span className="text-xs text-on-surface-variant ml-1">
            Last refreshed {timeAgo(lastRefreshed)}
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-xl bg-[#A63D40]/5 border border-[#A63D40]/15 text-sm text-[#A63D40] flex items-center gap-2">
          <Icon name="alert-circle" className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats bar */}
      {rules.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl bg-surface-container/50 border border-outline-variant/15 text-sm">
          <span className="text-on-surface-variant">
            Total <span className="font-semibold text-on-surface ml-1">{stats.total}</span>
          </span>
          <span className="w-px h-4 bg-outline-variant/30" />
          <span className="text-on-surface-variant">
            Enabled <span className="font-semibold text-[#4D7C6F] ml-1">{stats.enabled}</span>
          </span>
          <span className="w-px h-4 bg-outline-variant/30" />
          <span className="text-on-surface-variant">
            From Optimus <span className="font-semibold text-primary ml-1">{stats.fromOptimus}</span>
          </span>
        </div>
      )}

      {/* Filter row */}
      {rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={selectClasses}
          >
            <option value="all">All Statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>

          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className={selectClasses}
          >
            <option value="all">All Sources</option>
            <option value="optimus">From Optimus</option>
            <option value="external">External</option>
          </select>

          <div className="ml-auto w-56">
            <Input
              size="sm"
              type="search"
              leadingIcon="search"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              clearable
              onClear={() => setSearchQuery('')}
            />
          </div>
        </div>
      )}

      {/* Loading rules */}
      {loadingRules && rules.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Icon name="loader" className="w-6 h-6 animate-spin text-on-surface-variant" />
          <span className="ml-3 text-sm text-on-surface-variant">Fetching rules from {selectedMeta?.name || 'SIEM'}...</span>
        </div>
      )}

      {/* Empty state */}
      {!loadingRules && !error && rules.length === 0 && selectedIntegrationId && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mx-auto mb-4">
            <Icon name="shield" className="w-8 h-8 text-on-surface-variant/30" />
          </div>
          <h3 className="text-base font-semibold text-on-surface mb-2">No Rules Found</h3>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            No detection rules were found in this SIEM. Deploy a detection or create rules directly in the vendor portal.
          </p>
        </div>
      )}

      {/* Rules list */}
      {filtered.length > 0 && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-on-surface-variant">No rules match the current filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/15">
              {filtered.map(rule => {
                const isExpanded = expandedId === rule.vendorRuleId;
                const sevConfig = getSeverityConfig(rule.severity);
                const isToggling = togglingId === rule.vendorRuleId;
                const isDeleting = deletingId === rule.vendorRuleId;
                const isImporting = importingId === rule.vendorRuleId;
                const isConfirmingDelete = confirmDeleteId === rule.vendorRuleId;

                return (
                  <div key={rule.vendorRuleId}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : rule.vendorRuleId)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-surface-container/40 transition-colors text-left"
                    >
                      {/* Status dot */}
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        rule.enabled ? 'bg-[#4D7C6F]' : 'bg-on-surface-variant/30'
                      }`} />

                      {/* Rule name */}
                      <span className="text-sm font-medium text-on-surface truncate min-w-0 flex-1">
                        {rule.name}
                      </span>

                      {/* Optimus badge */}
                      {rule.isFromOptimus && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded-full flex-shrink-0 uppercase tracking-wider">
                          Optimus
                        </span>
                      )}

                      {/* Provider icon */}
                      {selectedMeta && (
                        <selectedMeta.IconComponent
                          size={14}
                          color={selectedMeta.useDefaultColor ? 'default' : selectedMeta.brandColor}
                        />
                      )}

                      {/* Query language pill */}
                      <span className="px-2 py-0.5 text-xs bg-surface-container-highest rounded-md text-on-surface-variant font-medium flex-shrink-0">
                        {rule.queryLanguage}
                      </span>

                      {/* Severity pill */}
                      {sevConfig && (
                        <span className={`text-xs font-semibold flex-shrink-0 ${sevConfig.text}`}>
                          {rule.severity}
                        </span>
                      )}

                      <Icon
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        className="w-4 h-4 text-on-surface-variant flex-shrink-0"
                      />
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pl-12 space-y-3 bg-surface-container/30">
                        {/* Vendor Rule ID */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-on-surface-variant">Vendor Rule ID:</span>
                          <code className="bg-surface-container-highest px-2 py-0.5 rounded-md text-on-surface font-mono text-xs">
                            {rule.vendorRuleId}
                          </code>
                        </div>

                        {/* Rule kind */}
                        {rule.ruleKind && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-on-surface-variant">Type:</span>
                            <span className="text-on-surface text-xs font-medium">{rule.ruleKind}</span>
                          </div>
                        )}

                        {/* Schedule */}
                        {rule.schedule && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-on-surface-variant">Schedule:</span>
                            <span className="text-on-surface text-xs font-medium">{rule.schedule}</span>
                          </div>
                        )}

                        {/* Last modified */}
                        {rule.lastModified && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-on-surface-variant">Last Modified:</span>
                            <span className="text-on-surface text-xs">{new Date(rule.lastModified).toLocaleString()}</span>
                          </div>
                        )}

                        {/* Optimus linkage */}
                        {rule.isFromOptimus && rule.optimusDetectionId && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-on-surface-variant">Linked Detection:</span>
                            <code className="bg-primary/10 text-primary px-2 py-0.5 rounded-md font-mono text-xs">
                              {rule.optimusDetectionId.slice(0, 8)}...
                            </code>
                          </div>
                        )}

                        {/* Query */}
                        {rule.query && (
                          <div>
                            <p className="text-xs text-on-surface-variant font-medium mb-1.5">Query:</p>
                            <pre className="p-3 bg-surface-container-highest rounded-xl text-xs text-on-surface overflow-x-auto max-h-32 font-mono border border-outline-variant/20">
                              {rule.query}
                            </pre>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          {/* Toggle */}
                          {canSync && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggle(rule); }}
                              disabled={isToggling}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                rule.enabled
                                  ? 'text-amber-600 bg-amber-500/10 hover:bg-amber-500/20'
                                  : 'text-[#4D7C6F] bg-[#4D7C6F]/10 hover:bg-[#4D7C6F]/20'
                              } disabled:opacity-50`}
                            >
                              {isToggling ? (
                                <Icon name="loader" className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Icon name={rule.enabled ? 'pause-circle' : 'play-circle'} className="w-3.5 h-3.5" />
                              )}
                              {rule.enabled ? 'Disable' : 'Enable'}
                            </button>
                          )}

                          {/* Import */}
                          {canConfigure && !rule.isFromOptimus && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleImport(rule); }}
                              disabled={isImporting}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isImporting ? (
                                <Icon name="loader" className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Icon name="download" className="w-3.5 h-3.5" />
                              )}
                              Import to Optimus
                            </button>
                          )}

                          {/* Delete */}
                          {canSync && (
                            <>
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[#A63D40]">Delete "{rule.name}"?</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                    className="px-2 py-1 text-xs font-medium text-on-surface-variant bg-surface-container-high rounded-lg"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(rule); }}
                                    disabled={isDeleting}
                                    className="px-2 py-1 text-xs font-medium text-on-error bg-error hover:bg-error/90 rounded-lg disabled:opacity-50"
                                  >
                                    {isDeleting ? 'Deleting...' : 'Confirm'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(rule.vendorRuleId); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A63D40] bg-[#A63D40]/10 hover:bg-[#A63D40]/20 rounded-lg transition-colors"
                                >
                                  <Icon name="trash-2" className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* No filter matches */}
      {!loadingRules && rules.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-on-surface-variant">No rules match the current filters.</p>
        </div>
      )}
    </div>
  );
};
