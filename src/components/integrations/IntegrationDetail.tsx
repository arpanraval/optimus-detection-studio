import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { DetectionManagementTab } from './DetectionManagementTab';
import { DeploymentActivityTab } from './DeploymentActivityTab';
import { SettingsTab } from './SettingsTab';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta, getDisplayStatus, STATUS_BADGE_CONFIG } from '../../lib/providerMeta';
import { IntegrationLogo } from './IntegrationLogo';
import type { Integration, ConnectionTestResult } from '../../types';
import { hasPermission } from '../../types';
import { usePermissions } from '../../context/PermissionsContext';

// =============================================================================
// Types
// =============================================================================

type DetailTab = 'detections' | 'deployments' | 'settings';

const TABS: { id: DetailTab; label: string; icon: string }[] = [
  { id: 'detections', label: 'Detection Management', icon: 'shield' },
  { id: 'deployments', label: 'Deployment History', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

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

// =============================================================================
// Component
// =============================================================================

interface IntegrationDetailProps {
  integrationId: string;
  onBack: () => void;
}

export const IntegrationDetail: React.FC<IntegrationDetailProps> = ({
  integrationId,
  onBack,
}) => {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('detections');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch {
    // Default
  }
  const canConfigure = hasPermission(userRole, 'integrations:configure');

  const loadIntegration = useCallback(async () => {
    try {
      const data = await integrationService.getIntegration(integrationId);
      setIntegration(data);
      setTestResult(data.last_test_result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration');
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleTest = async () => {
    setTesting(true);
    setShowTestResult(true);
    try {
      const result = await integrationService.testConnection(integrationId);
      setTestResult(result);
      loadIntegration();
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
        latency_ms: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    onBack();
  };

  // Loading state
  if (loading) {
    return (
      <div className="h-full overflow-y-auto scrollbar-page">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-20">
            <Icon name="loader" className="w-6 h-6 animate-spin text-on-surface-variant" />
          </div>
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !integration) {
    return (
      <div className="h-full overflow-y-auto scrollbar-page">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-6"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            Back to Integrations
          </button>
          <div className="text-center py-20">
            <Icon name="alert-circle" className="w-12 h-12 text-[#A63D40]/50 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-on-surface mb-2">Integration Not Found</h3>
            <p className="text-sm text-on-surface-variant">{error || 'This integration may have been deleted.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const meta = getProviderMeta(integration.provider);
  const displayStatus = meta ? getDisplayStatus(meta, integration) : 'configured';
  const badge = STATUS_BADGE_CONFIG[displayStatus];
  const latency = testResult?.latency_ms || integration.last_test_result?.latency_ms;

  return (
    <div className="h-full overflow-y-auto scrollbar-page">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-5"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          Back to Integrations
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-5">
            {/* Provider logo */}
            {meta && (
              <IntegrationLogo provider={meta} size="lg" />
            )}

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-0.5">
                <h1 className="text-lg font-bold text-on-surface truncate">
                  {integration.name}
                </h1>
                {integration.is_default && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant rounded-md uppercase tracking-wider">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-xs text-on-surface-variant">
                <span className={`px-2 py-0.5 font-semibold rounded-md border ${badge.className}`}>
                  {badge.label}
                </span>
                <span className="w-1 h-1 rounded-full bg-outline-variant/30" />
                <span>Tested {relativeTime(integration.last_tested_at)}</span>
                {latency != null && latency > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-outline-variant/30" />
                    <span>{latency}ms</span>
                  </>
                )}
              </div>
            </div>

            {/* Header actions */}
            {canConfigure && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  color="secondary"
                  variant="tonal"
                  size="md"
                  leadingIcon="zap"
                  onClick={handleTest}
                  disabled={testing}
                  loading={testing}
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
            )}
          </div>

          {/* Test result toast (inline, dismissible) */}
          {showTestResult && testResult && !testing && (
            <div className={`mt-4 flex items-center gap-3 p-3 rounded-xl border transition-all ${
              testResult.success
                ? 'bg-[#4D7C6F]/5 border-[#4D7C6F]/20'
                : 'bg-[#A63D40]/5 border-[#A63D40]/20'
            }`}>
              <Icon
                name={testResult.success ? 'check-circle' : 'alert-circle'}
                className={`w-4 h-4 flex-shrink-0 ${testResult.success ? 'text-[#4D7C6F]' : 'text-[#A63D40]'}`}
              />
              <span className={`text-sm font-medium flex-1 ${testResult.success ? 'text-[#4D7C6F]' : 'text-[#A63D40]'}`}>
                {testResult.message}
              </span>
              {testResult.latency_ms > 0 && (
                <span className="text-xs text-on-surface-variant">{testResult.latency_ms}ms</span>
              )}
              <button
                onClick={() => setShowTestResult(false)}
                className="p-1 rounded-md hover:bg-surface-container-high transition-colors"
              >
                <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
              </button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 border-b border-outline-variant/15">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? 'text-on-surface border-on-surface'
                  : 'text-on-surface-variant border-transparent hover:text-on-surface'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'detections' && (
          <DetectionManagementTab integration={integration} />
        )}

        {activeTab === 'deployments' && (
          <DeploymentActivityTab integrationId={integration.id} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            integration={integration}
            canConfigure={canConfigure}
            onUpdated={loadIntegration}
            onDisconnect={handleDisconnect}
          />
        )}
      </div>
    </div>
  );
};
