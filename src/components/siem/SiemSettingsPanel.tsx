import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { ConnectionSetupInline } from '../integrations/ConnectionSetupInline';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';
import { usePermissions } from '../../context/PermissionsContext';
import { hasPermission } from '../../types';
import { useToast } from '../../hooks/useToast';
import type { Integration } from '../../types';

// =============================================================================
// Types
// =============================================================================

interface SiemSettingsPanelProps {
  integration: Integration;
  onClose: () => void;
  onUpdated: () => void;
  onDisconnect: () => void;
}

// =============================================================================
// Status Badge
// =============================================================================

const StatusBadge: React.FC<{ status: Integration['status'] }> = ({ status }) => {
  const config: Record<string, { label: string; dot: string; bg: string; text: string }> = {
    connected: {
      label: 'Connected',
      dot: 'bg-green-400',
      bg: 'bg-green-400/10',
      text: 'text-green-400',
    },
    configured: {
      label: 'Configured',
      dot: 'bg-amber-400',
      bg: 'bg-amber-400/10',
      text: 'text-amber-400',
    },
    error: {
      label: 'Error',
      dot: 'bg-red-400',
      bg: 'bg-red-400/10',
      text: 'text-red-400',
    },
    disconnected: {
      label: 'Disconnected',
      dot: 'bg-on-surface-variant/50',
      bg: 'bg-on-surface-variant/5',
      text: 'text-on-surface-variant',
    },
  };

  const c = config[status] ?? config.disconnected;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

// =============================================================================
// Disconnect Confirmation Dialog
// =============================================================================

const DisconnectConfirmation: React.FC<{
  integrationName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ integrationName, loading, onConfirm, onCancel }) => (
  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
    <div className="flex items-start gap-3">
      <div className="p-1.5 rounded-lg bg-red-500/10">
        <Icon name="alert-triangle" className="w-4 h-4 text-red-400" />
      </div>
      <div className="space-y-1 flex-1">
        <p className="text-sm font-medium text-on-surface">
          Disconnect {integrationName}?
        </p>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          This will remove all credentials. Deployment history will be preserved.
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 justify-end">
      <Button variant="text" color="surface" size="sm" onClick={onCancel} disabled={loading}>
        Cancel
      </Button>
      <Button variant="filled" color="error" size="sm" onClick={onConfirm} loading={loading}>
        Disconnect
      </Button>
    </div>
  </div>
);

// =============================================================================
// SiemSettingsPanel
// =============================================================================

export const SiemSettingsPanel: React.FC<SiemSettingsPanelProps> = ({
  integration,
  onClose,
  onUpdated,
  onDisconnect,
}) => {
  const { showToast } = useToast();
  const meta = getProviderMeta(integration.provider);

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch {
    // PermissionsContext not available - default to viewer
  }
  const canConfigure = hasPermission(userRole, 'integrations:configure');

  // Local state
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingDefault, setTogglingDefault] = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleToggleDefault = async () => {
    setTogglingDefault(true);
    try {
      if (integration.is_default) {
        await integrationService.updateIntegrationDirect(integration.id, { is_default: false });
      } else {
        await integrationService.setAsDefault(integration.id);
      }
      onUpdated();
      showToast('success', integration.is_default ? 'Removed as default' : 'Set as default');
    } catch {
      showToast('error', 'Failed to update default status');
    } finally {
      setTogglingDefault(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await integrationService.deleteIntegration(integration.id);
      showToast('success', `${integration.name} disconnected`);
      onDisconnect();
    } catch {
      showToast('error', 'Failed to disconnect integration');
      setDisconnecting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-surface border-l border-outline-variant/20 shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-outline-variant/10 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container-highest/50 transition-colors text-on-surface-variant hover:text-on-surface"
            aria-label="Close settings panel"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Animation */}
        <style>{`
          @keyframes slide-in-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .animate-slide-in-right {
            animation: slide-in-right 200ms ease-out;
          }
        `}</style>

        {/* Content */}
        <div className="p-6 space-y-8">

          {/* ── Connection Info ────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">
              Connection Info
            </h3>

            <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 space-y-4">
              {/* Provider + Logo */}
              <div className="flex items-center gap-3">
                {meta ? (
                  <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center overflow-hidden">
                    <img
                      src={meta.logoPath}
                      alt={meta.name}
                      className="w-5 h-5 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center">
                    <Icon name="server" className="w-4 h-4 text-on-surface-variant" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {meta?.name ?? integration.provider}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {integration.name}
                  </p>
                </div>
                <StatusBadge status={integration.status} />
              </div>

              {/* Meta details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-on-surface-variant/70 mb-0.5">Last tested</p>
                  <p className="text-on-surface">
                    {integration.last_tested_at
                      ? new Date(integration.last_tested_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-on-surface-variant/70 mb-0.5">Last synced</p>
                  <p className="text-on-surface">
                    {integration.last_synced_at
                      ? new Date(integration.last_synced_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Default toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10">
                <div>
                  <p className="text-sm text-on-surface">Default integration</p>
                  <p className="text-xs text-on-surface-variant">
                    Used when deploying without selecting a target
                  </p>
                </div>
                <button
                  onClick={handleToggleDefault}
                  disabled={togglingDefault}
                  className={`
                    relative w-10 h-[22px] rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40
                    ${integration.is_default ? 'bg-primary' : 'bg-on-surface-variant/30'}
                    ${togglingDefault ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  role="switch"
                  aria-checked={integration.is_default}
                  aria-label="Set as default integration"
                >
                  <span
                    className={`
                      absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200
                      ${integration.is_default ? 'translate-x-[18px]' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* ── Update Credentials ────────────────────────────────── */}
          {canConfigure && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">
                Update Credentials
              </h3>

              {!editingCredentials ? (
                <Button
                  variant="outlined"
                  color="secondary"
                  size="md"
                  leadingIcon="key"
                  onClick={() => setEditingCredentials(true)}
                >
                  Update Credentials
                </Button>
              ) : (
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4">
                  <ConnectionSetupInline
                    provider={integration.provider}
                    providerDisplayName={meta?.name ?? integration.provider}
                    existingIntegrationId={integration.id}
                    onConnected={() => {
                      setEditingCredentials(false);
                      onUpdated();
                      showToast('success', 'Credentials updated');
                    }}
                    onCancel={() => setEditingCredentials(false)}
                  />
                </div>
              )}
            </section>
          )}

          {/* ── Danger Zone ───────────────────────────────────────── */}
          {canConfigure && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400/80">
                Danger Zone
              </h3>

              <div className="rounded-xl border border-red-500/20 bg-surface-container p-4 space-y-3">
                {!showDisconnectConfirm ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-on-surface">Disconnect integration</p>
                      <p className="text-xs text-on-surface-variant">
                        Remove credentials and disconnect from {meta?.name ?? integration.provider}
                      </p>
                    </div>
                    <Button
                      variant="outlined"
                      color="error"
                      size="sm"
                      leadingIcon="unlink"
                      onClick={() => setShowDisconnectConfirm(true)}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <DisconnectConfirmation
                    integrationName={integration.name}
                    loading={disconnecting}
                    onConfirm={handleDisconnect}
                    onCancel={() => setShowDisconnectConfirm(false)}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
