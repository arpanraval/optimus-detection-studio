import React, { useState, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Integration, VendorRule, DeploymentRecord } from '../../types';
import { hasPermission } from '../../types';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { IntegrationLogo } from './IntegrationLogo';
import { usePermissions } from '../../context/PermissionsContext';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';

// =============================================================================
// Types
// =============================================================================

type FilterTab = 'all' | 'optimus' | 'needs_update' | 'external';

interface EnrichedRule extends VendorRule {
  needsUpdate: boolean;
  detectionUpdatedAt?: string;
  deployedAt?: string;
}

// =============================================================================
// Severity Styles
// =============================================================================

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-[#A63D40]/10', text: 'text-[#A63D40]', border: 'border-[#A63D40]/20' },
  high:     { bg: 'bg-[#D4734B]/10', text: 'text-[#D4734B]', border: 'border-[#D4734B]/20' },
  medium:   { bg: 'bg-amber-500/10', text: 'text-amber-600',  border: 'border-amber-500/20' },
  low:      { bg: 'bg-[#4D7C6F]/10', text: 'text-[#4D7C6F]', border: 'border-[#4D7C6F]/20' },
  informational: { bg: 'bg-surface-container-highest', text: 'text-on-surface-variant', border: 'border-outline-variant/20' },
};

function getSeverityStyle(severity?: string) {
  if (!severity) return null;
  return SEVERITY_STYLES[severity.toLowerCase()] || null;
}

// =============================================================================
// Skeleton Loading
// =============================================================================

const SkeletonCard: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
  <div
    className="p-5 rounded-xl border border-outline-variant/20 bg-surface-container-low animate-pulse"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-start gap-4">
      <div className="w-2 h-12 rounded-full bg-surface-container-highest flex-shrink-0" />
      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-4 w-48 bg-surface-container-highest rounded-md" />
          <div className="h-5 w-16 bg-surface-container-highest rounded-full" />
          <div className="h-5 w-12 bg-surface-container-highest rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-20 bg-surface-container-highest/60 rounded" />
          <div className="h-3 w-16 bg-surface-container-highest/60 rounded" />
          <div className="h-3 w-24 bg-surface-container-highest/60 rounded" />
        </div>
        <div className="h-3 w-full bg-surface-container-highest/40 rounded" />
      </div>
    </div>
  </div>
);

const SkeletonLoading: React.FC<{ providerName: string }> = ({ providerName }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3 px-1">
      <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <span className="text-sm text-on-surface-variant font-medium">
        Fetching detection rules from {providerName}...
      </span>
    </div>
    <div className="space-y-3">
      {[0, 80, 160, 240, 320, 400].map(d => (
        <SkeletonCard key={d} delay={d} />
      ))}
    </div>
  </div>
);

// =============================================================================
// Filter Tab Pill
// =============================================================================

const FilterPill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent?: string;
}> = ({ label, count, active, onClick, accent }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all ${
      active
        ? `bg-on-surface text-surface shadow-sm`
        : 'bg-surface-container-high/60 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
    }`}
  >
    {label}
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
      active
        ? 'bg-surface/20 text-surface'
        : accent || 'bg-outline-variant/20 text-on-surface-variant'
    }`}>
      {count}
    </span>
  </button>
);

// =============================================================================
// Rule Card
// =============================================================================

const RuleCard: React.FC<{
  rule: EnrichedRule;
  providerMeta: ReturnType<typeof getProviderMeta>;
  canSync: boolean;
  canConfigure: boolean;
  onToggle: (rule: VendorRule) => void;
  onDelete: (rule: VendorRule) => void;
  onImport: (rule: VendorRule) => void;
  togglingId: string | null;
  deletingId: string | null;
  importingId: string | null;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string | null) => void;
}> = ({
  rule, providerMeta, canSync, canConfigure,
  onToggle, onDelete, onImport,
  togglingId, deletingId, importingId, confirmDeleteId, onConfirmDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const sevStyle = getSeverityStyle(rule.severity);
  const isToggling = togglingId === rule.vendorRuleId;
  const isDeleting = deletingId === rule.vendorRuleId;
  const isImporting = importingId === rule.vendorRuleId;
  const isConfirmingDelete = confirmDeleteId === rule.vendorRuleId;

  // `observedState` is the tri-state source of truth (enabled/disabled/unknown);
  // fall back to the boolean for any VendorRule constructed without it.
  const state = rule.observedState ?? (rule.enabled ? 'enabled' : 'disabled');

  const borderColor = rule.needsUpdate
    ? 'border-l-amber-500'
    : state === 'enabled'
      ? 'border-l-[#4D7C6F]'
      : state === 'unknown'
        ? 'border-l-amber-500/60'
        : 'border-l-outline-variant/40';

  return (
    <div className={`rounded-xl border border-outline-variant/20 bg-surface-container-low overflow-hidden border-l-[3px] ${borderColor} transition-all hover:shadow-sm`}>
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left group"
      >
        {/* Status indicator */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            state === 'enabled'
              ? 'bg-[#4D7C6F]'
              : state === 'unknown'
                ? 'bg-amber-500'
                : 'bg-on-surface-variant/25'
          }`}
        />

        {/* Rule name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-on-surface truncate block">
            {rule.name}
          </span>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {rule.isFromOptimus && (
            <span className="px-2.5 py-1 text-[10px] font-bold bg-primary/10 text-primary rounded-full uppercase tracking-widest">
              Optimus
            </span>
          )}

          {rule.needsUpdate && (
            <span className="px-2.5 py-1 text-[10px] font-bold bg-amber-500/15 text-amber-600 rounded-full uppercase tracking-widest flex items-center gap-1">
              <Icon name="alert-triangle" className="w-3 h-3" />
              Drift
            </span>
          )}

          <span
            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
              state === 'enabled'
                ? 'bg-[#4D7C6F]/10 text-[#4D7C6F]'
                : state === 'unknown'
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-surface-container-highest text-on-surface-variant/60'
            }`}
          >
            {state === 'enabled' ? 'Enabled' : state === 'unknown' ? 'Unknown' : 'Disabled'}
          </span>

          <span className="px-2 py-0.5 text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant rounded-md">
            {rule.queryLanguage}
          </span>

          {sevStyle && (
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${sevStyle.bg} ${sevStyle.text} ${sevStyle.border}`}>
              {rule.severity}
            </span>
          )}
        </div>

        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          className="w-4 h-4 text-on-surface-variant/50 group-hover:text-on-surface-variant transition-colors flex-shrink-0"
        />
      </button>

      {/* Drift banner */}
      {rule.needsUpdate && !expanded && (
        <div className="px-5 pb-3 -mt-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15 text-xs text-amber-700">
            <Icon name="alert-triangle" className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">Detection updated in library since last deployment</span>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-outline-variant/10 pt-4">
          {/* Drift detail */}
          {rule.needsUpdate && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/15">
              <Icon name="alert-triangle" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-700">Detection updated since deployment</p>
                <p className="text-xs text-amber-600/80">
                  Library updated: {rule.detectionUpdatedAt ? new Date(rule.detectionUpdatedAt).toLocaleString() : 'Unknown'}
                  {rule.deployedAt && (<> &middot; Last deployed: {new Date(rule.deployedAt).toLocaleString()}</>)}
                </p>
              </div>
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <MetaRow label="Vendor Rule ID" value={rule.vendorRuleId} mono />
            {rule.ruleKind && <MetaRow label="Type" value={rule.ruleKind} />}
            {rule.schedule && <MetaRow label="Schedule" value={rule.schedule} />}
            {rule.lastModified && <MetaRow label="Last Modified" value={new Date(rule.lastModified).toLocaleString()} />}
            {rule.isFromOptimus && rule.optimusDetectionId && (
              <MetaRow label="Linked Detection" value={rule.optimusDetectionId.slice(0, 12) + '...'} mono accent />
            )}
          </div>

          {/* Query preview */}
          {rule.query && (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Query</p>
              <pre className="p-4 bg-surface-container-highest/80 rounded-xl text-xs text-on-surface overflow-x-auto max-h-36 font-mono border border-outline-variant/15 leading-relaxed">
                {rule.query}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {/* Toggle */}
            {canSync && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(rule); }}
                disabled={isToggling}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
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

            {/* Import (for external rules) */}
            {canConfigure && !rule.isFromOptimus && (
              <button
                onClick={(e) => { e.stopPropagation(); onImport(rule); }}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors disabled:opacity-50"
              >
                {isImporting ? (
                  <Icon name="loader" className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon name="download" className="w-3.5 h-3.5" />
                )}
                Import to Optimus
              </button>
            )}

            <div className="flex-1" />

            {/* Delete */}
            {canSync && (
              <>
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#A63D40] font-medium">Delete from SIEM?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onConfirmDelete(null); }}
                      className="px-3 py-1.5 text-xs font-medium text-on-surface-variant bg-surface-container-high rounded-lg hover:bg-surface-container-highest transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(rule); }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#A63D40] hover:bg-[#A63D40]/90 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onConfirmDelete(rule.vendorRuleId); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant/60 hover:text-[#A63D40] hover:bg-[#A63D40]/5 rounded-lg transition-colors"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
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
};

const MetaRow: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="text-on-surface-variant font-medium">{label}:</span>
    <span className={`${mono ? 'font-mono' : ''} ${accent ? 'text-primary' : 'text-on-surface'} font-medium`}>
      {value}
    </span>
  </div>
);

// =============================================================================
// Main Component
// =============================================================================

interface DetectionManagementTabProps {
  integration: Integration;
}

export const DetectionManagementTab: React.FC<DetectionManagementTabProps> = ({ integration }) => {
  const [rules, setRules] = useState<EnrichedRule[]>([]);
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
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
  const providerMeta = getProviderMeta(integration.provider);

  // ---- Fetch Rules with Drift Detection ----

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get enriched vendor rules (with Optimus linkage)
      const vendorRules = await integrationService.listVendorRulesEnriched(integration.id);

      // 2. Get deployment history for date comparison
      const deployments = await integrationService.getDeploymentHistory({ integrationId: integration.id });

      // Build map: vendorRuleId -> latest successful deployment date
      const deployDateMap = new Map<string, string>();
      for (const dep of deployments) {
        if (dep.status === 'success' && dep.vendor_rule_id) {
          const existing = deployDateMap.get(dep.vendor_rule_id);
          if (!existing || new Date(dep.created_at) > new Date(existing)) {
            deployDateMap.set(dep.vendor_rule_id, dep.created_at);
          }
        }
      }

      // 3. For Optimus-linked rules, check detection updatedDate for drift
      const optimusIds = vendorRules
        .filter(r => r.isFromOptimus && r.optimusDetectionId)
        .map(r => r.optimusDetectionId!);

      const detectionDateMap = new Map<string, string>();
      if (optimusIds.length > 0) {
        const { data: detections } = await supabase
          .from('detections')
          .select('id, updatedDate')
          .in('id', optimusIds);

        if (detections) {
          for (const d of detections) {
            if (d.updatedDate) {
              detectionDateMap.set(d.id, d.updatedDate);
            }
          }
        }
      }

      // 4. Enrich rules with drift status
      const enriched: EnrichedRule[] = vendorRules.map(rule => {
        const deployedAt = deployDateMap.get(rule.vendorRuleId);
        const detectionUpdatedAt = rule.optimusDetectionId
          ? detectionDateMap.get(rule.optimusDetectionId)
          : undefined;

        let needsUpdate = false;
        if (rule.isFromOptimus && detectionUpdatedAt && deployedAt) {
          needsUpdate = new Date(detectionUpdatedAt) > new Date(deployedAt);
        }

        return { ...rule, needsUpdate, detectionUpdatedAt, deployedAt };
      });

      setRules(enriched);
      setFetched(true);
      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rules');
    } finally {
      setLoading(false);
    }
  }, [integration.id]);

  // ---- Counts ----

  const counts = useMemo(() => ({
    all: rules.length,
    optimus: rules.filter(r => r.isFromOptimus).length,
    needs_update: rules.filter(r => r.needsUpdate).length,
    external: rules.filter(r => !r.isFromOptimus).length,
    enabled: rules.filter(r => r.enabled).length,
  }), [rules]);

  // ---- Filtered rules ----

  const filtered = useMemo(() => {
    return rules.filter(rule => {
      // Tab filter
      if (activeFilter === 'optimus' && !rule.isFromOptimus) return false;
      if (activeFilter === 'needs_update' && !rule.needsUpdate) return false;
      if (activeFilter === 'external' && rule.isFromOptimus) return false;

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = rule.name?.toLowerCase() || '';
        const query = rule.query?.toLowerCase() || '';
        const id = rule.vendorRuleId?.toLowerCase() || '';
        if (!name.includes(q) && !query.includes(q) && !id.includes(q)) return false;
      }

      return true;
    });
  }, [rules, activeFilter, searchQuery]);

  // ---- Action Handlers ----

  const handleToggle = async (rule: VendorRule) => {
    setTogglingId(rule.vendorRuleId);
    const newEnabled = !rule.enabled;
    setRules(prev => prev.map(r =>
      r.vendorRuleId === rule.vendorRuleId ? { ...r, enabled: newEnabled } : r
    ));
    try {
      await integrationService.toggleVendorRule(rule.integrationId, rule.vendorRuleId, newEnabled);
      showToast('success', `Rule ${newEnabled ? 'enabled' : 'disabled'}`, rule.name);
    } catch (err) {
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
      showToast('success', 'Rule imported', `"${rule.name}" added to your library.`);
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

  // ---- Pre-fetch empty state ----

  if (!fetched && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative mb-6">
          {providerMeta ? (
            <IntegrationLogo provider={providerMeta} size="lg" className="!w-20 !h-20 !rounded-2xl" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              <Icon name="shield" className="w-9 h-9 text-primary/40" />
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface border-2 border-surface-container-low flex items-center justify-center">
            <Icon name="download-cloud" className="w-4 h-4 text-on-surface-variant" />
          </div>
        </div>

        <h3 className="text-base font-semibold text-on-surface mb-2">
          Fetch Detection Rules
        </h3>
        <p className="text-sm text-on-surface-variant max-w-md text-center leading-relaxed mb-6">
          Pull the latest rules from {providerMeta?.name || 'your SIEM'} to see what's deployed,
          identify drift, and manage your detection estate.
        </p>

        <Button
          color="primary"
          size="md"
          leadingIcon="download-cloud"
          onClick={fetchRules}
        >
          Fetch Rules from {providerMeta?.name || 'SIEM'}
        </Button>
      </div>
    );
  }

  // ---- Loading state ----

  if (loading && !fetched) {
    return (
      <div className="py-4">
        <SkeletonLoading providerName={providerMeta?.name || 'SIEM'} />
      </div>
    );
  }

  // ---- Error state ----

  if (error && !fetched) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-[#A63D40]/10 flex items-center justify-center mb-4">
          <Icon name="alert-circle" className="w-8 h-8 text-[#A63D40]/60" />
        </div>
        <h3 className="text-base font-semibold text-on-surface mb-2">Failed to Fetch Rules</h3>
        <p className="text-sm text-[#A63D40] max-w-md text-center mb-5">{error}</p>
        <Button
          color="primary"
          size="sm"
          leadingIcon="refresh-cw"
          onClick={fetchRules}
        >
          Try Again
        </Button>
      </div>
    );
  }

  // ---- Main content (fetched) ----

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterPill
            label="All"
            count={counts.all}
            active={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
          />
          <FilterPill
            label="From Optimus"
            count={counts.optimus}
            active={activeFilter === 'optimus'}
            onClick={() => setActiveFilter('optimus')}
            accent="bg-primary/15 text-primary"
          />
          {counts.needs_update > 0 && (
            <FilterPill
              label="Needs Update"
              count={counts.needs_update}
              active={activeFilter === 'needs_update'}
              onClick={() => setActiveFilter('needs_update')}
              accent="bg-amber-500/15 text-amber-600"
            />
          )}
          <FilterPill
            label="External"
            count={counts.external}
            active={activeFilter === 'external'}
            onClick={() => setActiveFilter('external')}
          />
        </div>

        <div className="flex items-center gap-3">
          {lastFetchedAt && (
            <span className="text-xs text-on-surface-variant/60">
              Fetched {new Date(lastFetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            color="surface"
            variant="outlined"
            size="sm"
            leadingIcon="refresh-cw"
            onClick={fetchRules}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      {rules.length > 6 && (
        <div className="w-72">
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
      )}

      {/* Error banner (when refetching) */}
      {error && fetched && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#A63D40]/5 border border-[#A63D40]/15 text-sm text-[#A63D40]">
          <Icon name="alert-circle" className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading overlay on refresh */}
      {loading && fetched && (
        <div className="flex items-center gap-2.5 px-1 text-sm text-on-surface-variant">
          <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          Refreshing...
        </div>
      )}

      {/* Empty state (after fetch) */}
      {!loading && rules.length === 0 && (
        <div className="text-center py-12 rounded-2xl border border-outline-variant/15 bg-surface-container/30">
          <Icon name="shield" className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-on-surface mb-1.5">No Rules Found</h3>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
            No detection rules were found in {providerMeta?.name || 'this SIEM'}.
            Deploy a detection from your library to get started.
          </p>
        </div>
      )}

      {/* No filter matches */}
      {!loading && rules.length > 0 && filtered.length === 0 && (
        <div className="text-center py-10 rounded-2xl border border-outline-variant/15 bg-surface-container/30">
          <p className="text-sm text-on-surface-variant">No rules match the current filter.</p>
        </div>
      )}

      {/* Rules list */}
      {filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map(rule => (
            <RuleCard
              key={rule.vendorRuleId}
              rule={rule}
              providerMeta={providerMeta}
              canSync={canSync}
              canConfigure={canConfigure}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onImport={handleImport}
              togglingId={togglingId}
              deletingId={deletingId}
              importingId={importingId}
              confirmDeleteId={confirmDeleteId}
              onConfirmDelete={setConfirmDeleteId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
