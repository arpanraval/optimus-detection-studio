import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { usePermissions } from '../../context/PermissionsContext';
import { hasPermission } from '../../types';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import { routeHelpers } from '../../router/routes';
import type { Integration, VendorRule, DeploymentRecord } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SiemHomeRulesTabProps {
  integration: Integration;
}

type SourceFilter = 'all' | 'optimus' | 'external';
type SyncFilter = 'all' | 'synced' | 'needs_update';

interface EnrichedRule extends VendorRule {
  needsUpdate: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-[#A63D40]/10 text-[#A63D40] border-[#A63D40]/20',
  high: 'bg-[#D4734B]/10 text-[#D4734B] border-[#D4734B]/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-[#4D7C6F]/10 text-[#4D7C6F] border-[#4D7C6F]/20',
  informational: 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20',
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SkeletonRow = () => (
  <div className="p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full bg-surface-container-highest" />
      <div className="h-4 w-48 bg-surface-container-highest rounded" />
      <div className="h-5 w-16 bg-surface-container-highest rounded-full ml-auto" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Filter Pill
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
        active
          ? 'bg-primary/15 text-primary border-primary/30 border'
          : 'bg-surface-container-high text-on-surface-variant border border-transparent hover:border-outline-variant/20'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rule Row
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  expanded,
  onToggleExpand,
  onToggleEnable,
  onImport,
  onDelete,
  canSync,
  canConfigure,
}: {
  rule: EnrichedRule;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnable: () => void;
  onImport: () => void;
  onDelete: () => void;
  canSync: boolean;
  canConfigure: boolean;
}) {
  const navigate = useNavigate();
  const severityKey = rule.severity?.toLowerCase() ?? '';
  const severityStyle = SEVERITY_STYLES[severityKey] ?? SEVERITY_STYLES.informational;

  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low overflow-hidden transition-colors hover:border-outline-variant/20">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Enabled dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            rule.enabled ? 'bg-[#4D7C6F]' : 'bg-zinc-500'
          }`}
        />

        {/* Name */}
        <span className="font-medium text-sm text-on-surface truncate min-w-0">
          {rule.name}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Source badge */}
          {rule.isFromOptimus ? (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              Optimus
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
              External
            </span>
          )}

          {/* Severity badge */}
          {rule.severity && (
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${severityStyle}`}
            >
              {rule.severity}
            </span>
          )}

          {/* Needs update indicator */}
          {rule.needsUpdate && (
            <span className="flex items-center gap-1 text-[11px] text-amber-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Update available
            </span>
          )}

          {/* Chevron */}
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            className="w-4 h-4 text-on-surface-variant"
          />
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-outline-variant/10">
          {/* Query preview */}
          {rule.query && (
            <div className="mt-3 bg-surface-container-highest rounded-lg p-3 font-mono text-xs text-on-surface max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
              {rule.query}
            </div>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-2">
            <div>
              <span className="text-on-surface-variant block mb-0.5">Vendor Rule ID</span>
              <span className="text-on-surface font-mono break-all">{rule.vendorRuleId}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block mb-0.5">Query Language</span>
              <span className="text-on-surface">{rule.queryLanguage}</span>
            </div>
            {rule.lastModified && (
              <div>
                <span className="text-on-surface-variant block mb-0.5">Last Modified</span>
                <span className="text-on-surface">{formatDateTime(rule.lastModified)}</span>
              </div>
            )}
            {rule.schedule && (
              <div>
                <span className="text-on-surface-variant block mb-0.5">Schedule</span>
                <span className="text-on-surface">{rule.schedule}</span>
              </div>
            )}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 pt-1">
            {rule.isFromOptimus ? (
              <>
                {canSync && (
                  <Button
                    variant="tonal"
                    color="secondary"
                    size="sm"
                    leadingIcon="upload"
                    onClick={() => {
                      if (rule.optimusDetectionId) navigate(routeHelpers.detectionDetail(rule.optimusDetectionId));
                    }}
                  >
                    Review deployment
                  </Button>
                )}
                <Button
                  variant="text"
                  color="primary"
                  size="sm"
                  leadingIcon="external-link"
                  onClick={() => {
                    if (rule.optimusDetectionId) {
                      navigate(routeHelpers.detectionDetail(rule.optimusDetectionId));
                    }
                  }}
                >
                  View in Library
                </Button>
              </>
            ) : (
              <>
                {canSync && (
                  <Button
                    variant="tonal"
                    color="primary"
                    size="sm"
                    leadingIcon="download"
                    onClick={onImport}
                  >
                    Import to Optimus
                  </Button>
                )}
                {canConfigure && (
                  <Button
                    variant="text"
                    color="error"
                    size="sm"
                    leadingIcon="trash"
                    onClick={onDelete}
                  >
                    Delete from SIEM
                  </Button>
                )}
              </>
            )}

            {canSync && (
              <Button
                variant="text"
                color={rule.enabled ? 'secondary' : 'primary'}
                size="sm"
                leadingIcon={rule.enabled ? 'x' : 'play'}
                onClick={onToggleEnable}
              >
                {rule.enabled ? 'Disable' : 'Enable'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  ruleName,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-surface-container rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl border border-outline-variant/10">
        <h3 className="text-lg font-semibold text-on-surface mb-2">Delete Rule</h3>
        <p className="text-sm text-on-surface-variant mb-6">
          Are you sure you want to delete <span className="font-medium text-on-surface">{ruleName}</span> from the SIEM? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="text" color="surface" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="filled" color="error" size="sm" leadingIcon="trash" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SiemHomeRulesTab({ integration }: SiemHomeRulesTabProps) {
  const { showToast } = useToast();

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch {
    // PermissionsContext unavailable — default to viewer
  }
  const canSync = hasPermission(userRole, 'integrations:sync');
  const canConfigure = hasPermission(userRole, 'integrations:configure');

  // Provider metadata
  const providerMeta = getProviderMeta(integration.provider);
  const providerName = providerMeta?.name ?? integration.provider;

  // State
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<EnrichedRule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all');
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<EnrichedRule | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const vendorRules = await integrationService.listVendorRulesEnriched(integration.id);

      // Collect Optimus detection IDs to check for drift
      const optimusIds = vendorRules
        .filter((r) => r.isFromOptimus && r.optimusDetectionId)
        .map((r) => r.optimusDetectionId!);

      let detectionUpdatedMap = new Map<string, string>();

      if (optimusIds.length > 0) {
        // Fetch deployment records to get completed_at timestamps
        const { data: deployments } = await supabase
          .from('deployment_history')
          .select('detection_id, completed_at')
          .eq('integration_id', integration.id)
          .eq('status', 'success')
          .order('completed_at', { ascending: false });

        const deploymentMap = new Map<string, string>();
        for (const dep of deployments || []) {
          if (dep.detection_id && dep.completed_at && !deploymentMap.has(dep.detection_id)) {
            deploymentMap.set(dep.detection_id, dep.completed_at);
          }
        }

        // Fetch detection updated_at timestamps
        const { data: detections } = await supabase
          .from('detections')
          .select('id,updated_at')
          .in('id', optimusIds);

        const enrichedDetections = new Map<string, boolean>();
        for (const det of detections || []) {
          const lastDeploy = deploymentMap.get(det.id);
          if (lastDeploy && det.updated_at) {
            enrichedDetections.set(
              det.id,
              new Date(det.updated_at) > new Date(lastDeploy)
            );
          }
        }

        detectionUpdatedMap = new Map(
          Array.from(enrichedDetections.entries()).map(([id, val]) => [id, val ? 'yes' : 'no'])
        );
      }

      // Build enriched rules
      const enriched: EnrichedRule[] = vendorRules.map((rule) => ({
        ...rule,
        needsUpdate:
          rule.isFromOptimus &&
          rule.optimusDetectionId != null &&
          detectionUpdatedMap.get(rule.optimusDetectionId) === 'yes',
      }));

      setRules(enriched);
      setHasFetched(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch rules';
      setError(message);
      showToast('error', message);
    } finally {
      setLoading(false);
    }
  }, [integration.id, showToast]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleToggle = useCallback(
    async (rule: EnrichedRule) => {
      setTogglingId(rule.vendorRuleId);
      try {
        await integrationService.toggleVendorRule(
          integration.id,
          rule.vendorRuleId,
          !rule.enabled
        );
        setRules((prev) =>
          prev.map((r) =>
            r.vendorRuleId === rule.vendorRuleId ? { ...r, enabled: !r.enabled } : r
          )
        );
        showToast('success', `Rule "${rule.name}" ${rule.enabled ? 'disabled' : 'enabled'}`);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to toggle rule');
      } finally {
        setTogglingId(null);
      }
    },
    [integration.id, showToast]
  );

  const handleImport = useCallback(
    async (rule: EnrichedRule) => {
      setImportingId(rule.vendorRuleId);
      try {
        await integrationService.importVendorRule(rule);
        showToast('success', `"${rule.name}" imported to Optimus library`);
        // Re-fetch to update linkage
        await fetchRules();
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to import rule');
      } finally {
        setImportingId(null);
      }
    },
    [showToast, fetchRules]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingRule) return;
    setDeleteLoading(true);
    try {
      await integrationService.deleteVendorRule(
        integration.id,
        deletingRule.vendorRuleId
      );
      setRules((prev) =>
        prev.filter((r) => r.vendorRuleId !== deletingRule.vendorRuleId)
      );
      showToast('success', `Rule "${deletingRule.name}" deleted from SIEM`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setDeletingRule(null);
      setDeleteLoading(false);
    }
  }, [deletingRule, integration.id, showToast]);

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rules.filter((rule) => {
      // Source filter
      if (sourceFilter === 'optimus' && !rule.isFromOptimus) return false;
      if (sourceFilter === 'external' && rule.isFromOptimus) return false;

      // Sync filter
      if (syncFilter === 'synced' && rule.needsUpdate) return false;
      if (syncFilter === 'needs_update' && !rule.needsUpdate) return false;

      // Text search
      if (q && !rule.name.toLowerCase().includes(q) && !rule.vendorRuleId.toLowerCase().includes(q)) {
        return false;
      }

      return true;
    });
  }, [rules, sourceFilter, syncFilter, search]);

  // Stats
  const totalCount = rules.length;
  const optimusCount = rules.filter((r) => r.isFromOptimus).length;
  const externalCount = totalCount - optimusCount;

  // -------------------------------------------------------------------------
  // CTA (initial state before first fetch)
  // -------------------------------------------------------------------------

  if (!hasFetched && !loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Icon name="list" className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-on-surface">
            Fetch Rules from {providerName}
          </h3>
          <p className="text-sm text-on-surface-variant">
            Pull all detection rules from your {providerName} instance to view, manage, and compare them with your Optimus library.
          </p>
          <Button
            variant="filled"
            color="primary"
            size="md"
            leadingIcon="refresh-cw"
            loading={loading}
            onClick={fetchRules}
          >
            Fetch Rules from {providerName}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-32 bg-surface-container-highest rounded-full animate-pulse" />
          <div className="h-8 w-32 bg-surface-container-highest rounded-full animate-pulse" />
          <div className="h-8 w-48 bg-surface-container-highest rounded-lg animate-pulse ml-auto" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#A63D40]/10 flex items-center justify-center">
          <Icon name="alert-triangle" className="w-6 h-6 text-[#A63D40]" />
        </div>
        <p className="text-sm text-on-surface-variant">{error}</p>
        <Button variant="tonal" color="primary" size="sm" leadingIcon="refresh-cw" onClick={fetchRules}>
          Retry
        </Button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Delete confirmation dialog */}
      {deletingRule && (
        <DeleteConfirmDialog
          ruleName={deletingRule.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingRule(null)}
        />
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Source filter */}
        <div className="flex items-center gap-1.5">
          <FilterPill label="All" active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')} />
          <FilterPill label="From Optimus" active={sourceFilter === 'optimus'} onClick={() => setSourceFilter('optimus')} />
          <FilterPill label="External" active={sourceFilter === 'external'} onClick={() => setSourceFilter('external')} />
        </div>

        <div className="w-px h-5 bg-outline-variant/20" />

        {/* Sync filter */}
        <div className="flex items-center gap-1.5">
          <FilterPill label="All" active={syncFilter === 'all'} onClick={() => setSyncFilter('all')} />
          <FilterPill label="Synced" active={syncFilter === 'synced'} onClick={() => setSyncFilter('synced')} />
          <FilterPill label="Needs Update" active={syncFilter === 'needs_update'} onClick={() => setSyncFilter('needs_update')} />
        </div>

        {/* Search + refresh */}
        <div className="flex items-center gap-2 ml-auto">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules..."
            className="w-56 text-sm"
          />
          <Button
            variant="text"
            color="surface"
            size="sm"
            leadingIcon="refresh-cw"
            onClick={fetchRules}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats line */}
      <p className="text-xs text-on-surface-variant">
        {totalCount} rule{totalCount !== 1 ? 's' : ''} &middot;{' '}
        {optimusCount} from Optimus &middot;{' '}
        {externalCount} external
      </p>

      {/* Rule list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center">
            <Icon name="shield" className="w-6 h-6 text-on-surface-variant" />
          </div>
          <p className="text-sm text-on-surface-variant">
            {totalCount === 0
              ? `No rules found in ${providerName}`
              : 'No rules match the current filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule) => (
            <RuleRow
              key={rule.vendorRuleId}
              rule={rule}
              expanded={expandedId === rule.vendorRuleId}
              onToggleExpand={() =>
                setExpandedId((prev) =>
                  prev === rule.vendorRuleId ? null : rule.vendorRuleId
                )
              }
              onToggleEnable={() => handleToggle(rule)}
              onImport={() => handleImport(rule)}
              onDelete={() => setDeletingRule(rule)}
              canSync={canSync}
              canConfigure={canConfigure}
            />
          ))}
        </div>
      )}
    </div>
  );
}
