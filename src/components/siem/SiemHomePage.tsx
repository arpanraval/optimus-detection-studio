import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Breadcrumb } from '../ui';
import { ROUTES } from '../../router/routes';
import { IntegrationLogo } from '../integrations/IntegrationLogo';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { usePermissions } from '../../context/PermissionsContext';
import { hasPermission } from '../../types';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
import type { Integration, ConnectionTestResult, DeploymentRecord, VendorRule } from '../../types';
import { SiemHomeOverviewTab } from './SiemHomeOverviewTab';
import { SiemHomeRulesTab } from './SiemHomeRulesTab';
import { NativeRulesPanel } from './NativeRulesPanel';
import { SiemHomeDeployTab } from './SiemHomeDeployTab';
import { SiemHomeHistoryTab } from './SiemHomeHistoryTab';
import { SiemSettingsPanel } from './SiemSettingsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20',
  error: 'bg-[#A63D40]/15 text-[#A63D40] border border-[#A63D40]/20',
  testing: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  configured: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
  disconnected: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'rules', label: 'Rules', icon: 'shield' },
  { id: 'deploy', label: 'Deploy', icon: 'upload-cloud' },
  { id: 'history', label: 'History', icon: 'clock' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SiemHomePageProps {
  integrationId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SiemHomePage({ integrationId }: SiemHomePageProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch {
    // Default to viewer when context unavailable
  }
  const canConfigure = hasPermission(userRole, 'integrations:configure');
  const canSync = hasPermission(userRole, 'integrations:sync');

  // State
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intData, depRes] = await Promise.all([
        integrationService.getIntegration(integrationId),
        supabase
          .from('deployment_history')
          .select('*')
          .eq('integration_id', integrationId)
          .order('created_at', { ascending: false }),
      ]);

      if (depRes.error) throw new Error(depRes.error.message);

      setIntegration(intData);
      setDeployments((depRes.data || []) as DeploymentRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration');
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleTestConnection = useCallback(async () => {
    if (!integration) return;
    setTesting(true);
    try {
      const result: ConnectionTestResult = await integrationService.testConnection(integrationId);
      setIntegration((prev) =>
        prev
          ? {
              ...prev,
              last_tested_at: new Date().toISOString(),
              last_test_result: result,
              status: result.success ? 'connected' : 'error',
            }
          : prev
      );
      showToast(
        result.success ? 'success' : 'error',
        result.success
          ? `Connection successful (${result.latency_ms}ms)`
          : `Connection failed: ${result.message}`,
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }, [integration, integrationId, showToast]);

  const handleSyncRules = useCallback(async () => {
    setSyncing(true);
    try {
      await fetchData();
      showToast('success', 'Rules synced successfully');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [fetchData, showToast]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const stats = (() => {
    if (deployments.length === 0) {
      return { totalDeployed: 0, failed: 0, successRate: '—', lastDeployed: 'Never' };
    }

    const successIds = new Set(
      deployments.filter((d) => d.status === 'success').map((d) => d.detection_id)
    );
    const failedCount = deployments.filter((d) => d.status === 'failed').length;
    const total = deployments.length;
    const successCount = deployments.filter((d) => d.status === 'success').length;
    const rate = total > 0 ? Math.round((successCount / total) * 100) : 0;

    return {
      totalDeployed: successIds.size,
      failed: failedCount,
      successRate: `${rate}%`,
      lastDeployed: relativeTime(deployments[0]?.created_at ?? null),
    };
  })();

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-on-surface-variant">Loading integration...</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-[#A63D40]/15 flex items-center justify-center mx-auto mb-4">
            <Icon name="alert-triangle" className="w-6 h-6 text-[#A63D40]" />
          </div>
          <h3 className="text-lg font-semibold text-on-surface mb-2">Failed to load integration</h3>
          <p className="text-sm text-on-surface-variant mb-6">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outlined" color="surface" onClick={() => navigate(ROUTES.SIEM_HEALTH)}>
              Back to SIEM Home
            </Button>
            <Button variant="tonal" color="primary" onClick={refreshData}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  if (!integration) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-500/15 flex items-center justify-center mx-auto mb-4">
            <Icon name="x-circle" className="w-6 h-6 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-on-surface mb-2">Integration not found</h3>
          <p className="text-sm text-on-surface-variant mb-6">
            The integration you are looking for does not exist or has been removed.
          </p>
          <Button variant="tonal" color="primary" onClick={() => navigate(ROUTES.SIEM_HEALTH)}>
            Back to SIEM Home
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const providerMeta = getProviderMeta(integration.provider);
  const providerDisplayName = integration.provider.replace(/_/g, ' ');
  const statusKey = integration.status || 'configured';
  const statusClasses = STATUS_COLORS[statusKey] || STATUS_COLORS.configured;
  const lastTestResult = integration.last_test_result;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="px-4 lg:px-6 py-4 pb-16 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'SIEM Home', href: ROUTES.SIEM_HEALTH },
          { label: integration.name || 'Integration' },
        ]}
        className="mb-2"
      />

      {/* Back navigation */}
      <button
        onClick={() => navigate(ROUTES.SIEM_HEALTH)}
        className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors group"
      >
        <Icon name="arrow-left" className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to SIEM Home
      </button>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Logo + info */}
          <div className="flex items-center gap-4">
            {providerMeta && <IntegrationLogo provider={providerMeta} size="lg" />}
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-on-surface">{integration.name}</h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses}`}
                >
                  {statusKey}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                <span className="capitalize">{providerDisplayName}</span>
                {integration.last_tested_at && (
                  <>
                    <span className="text-outline-variant/30">|</span>
                    <span>
                      Tested {relativeTime(integration.last_tested_at)}
                      {lastTestResult?.latency_ms != null && (
                        <span className="ml-1 text-on-surface-variant/70">
                          {lastTestResult.latency_ms}ms
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            {canSync && (
              <Button
                variant="outlined"
                color="secondary"
                size="sm"
                leadingIcon="zap"
                loading={testing}
                onClick={handleTestConnection}
              >
                Test Connection
              </Button>
            )}
            {canSync && (
              <Button
                variant="tonal"
                color="secondary"
                size="sm"
                leadingIcon="refresh-cw"
                loading={syncing}
                onClick={handleSyncRules}
              >
                Sync Rules
              </Button>
            )}
            {canConfigure && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                aria-label="Integration settings"
              >
                <Icon name="settings" className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-surface-container rounded-xl p-4 flex-1 min-w-[140px]">
          <div className="text-xs text-on-surface-variant mb-1">Total Deployed</div>
          <div className="text-2xl font-bold text-on-surface">{stats.totalDeployed}</div>
        </div>
        <div className="bg-surface-container rounded-xl p-4 flex-1 min-w-[140px]">
          <div className="text-xs text-on-surface-variant mb-1">Failed</div>
          <div className={`text-2xl font-bold ${stats.failed > 0 ? 'text-[#A63D40]' : 'text-on-surface'}`}>
            {stats.failed}
          </div>
        </div>
        <div className="bg-surface-container rounded-xl p-4 flex-1 min-w-[140px]">
          <div className="text-xs text-on-surface-variant mb-1">Success Rate</div>
          <div className="text-2xl font-bold text-on-surface">{stats.successRate}</div>
        </div>
        <div className="bg-surface-container rounded-xl p-4 flex-1 min-w-[140px]">
          <div className="text-xs text-on-surface-variant mb-1">Last Deployed</div>
          <div className="text-2xl font-bold text-on-surface">{stats.lastDeployed}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-sm rounded-lg'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface rounded-lg'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <SiemHomeOverviewTab
            integration={integration}
            deployments={deployments}
            onRefresh={refreshData}
            onSwitchTab={(tab) => setActiveTab(tab)}
          />
        )}
        {activeTab === 'rules' && (integration.provider === 'crowdstrike' ? <NativeRulesPanel key={integration.id} integration={integration} /> : <SiemHomeRulesTab integration={integration} />)}
        {activeTab === 'deploy' && (
          <SiemHomeDeployTab
            integration={integration}
            deployments={deployments}
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'history' && <SiemHomeHistoryTab integration={integration} />}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SiemSettingsPanel
          integration={integration}
          onClose={() => setShowSettings(false)}
          onUpdated={refreshData}
          onDisconnect={() => navigate(ROUTES.SIEM_HEALTH)}
        />
      )}
    </div>
  );
}
