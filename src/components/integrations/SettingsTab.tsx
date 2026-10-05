import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { ConnectionSetupInline } from './ConnectionSetupInline';
import type { Integration } from '../../types';
import { integrationService } from '../../lib/integrationService';
import { getProviderMeta } from '../../lib/providerMeta';

// =============================================================================
// Component
// =============================================================================

interface SettingsTabProps {
  integration: Integration;
  canConfigure: boolean;
  onUpdated: () => void;
  onDisconnect: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  integration,
  canConfigure,
  onUpdated,
  onDisconnect,
}) => {
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const meta = getProviderMeta(integration.provider);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await integrationService.deleteIntegration(integration.id);
      onDisconnect();
    } catch {
      // Error handled
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleDefault = async () => {
    try {
      if (integration.is_default) {
        // Toggle OFF — just clear this one
        await integrationService.updateIntegrationDirect(integration.id, {
          is_default: false,
        });
      } else {
        // Toggle ON — atomically clear others and set this one
        await integrationService.setAsDefault(integration.id);
      }
      onUpdated();
    } catch {
      // Error handled
    }
  };

  return (
    <div className="space-y-8">
      {/* Connection Credentials */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-on-surface">Connection Credentials</h3>
          {canConfigure && !editingCredentials && (
            <Button
              color="surface"
              variant="outlined"
              size="sm"
              leadingIcon="edit"
              onClick={() => setEditingCredentials(true)}
            >
              Edit Credentials
            </Button>
          )}
        </div>

        {editingCredentials && meta ? (
          <ConnectionSetupInline
            provider={integration.provider}
            providerDisplayName={meta.name}
            existingIntegrationId={integration.id}
            onConnected={() => {
              setEditingCredentials(false);
              onUpdated();
            }}
            onCancel={() => setEditingCredentials(false)}
          />
        ) : (
          <div className="p-4 rounded-xl bg-surface-container/60 space-y-2.5">
            <DetailRow label="Auth Type" value={integration.auth_type || 'token'} />
            <DetailRow
              label="Credentials"
              value={canConfigure ? 'Stored securely' : 'Hidden'}
            />
          </div>
        )}
      </section>

      {/* Integration Metadata */}
      <section>
        <h3 className="text-sm font-semibold text-on-surface mb-4">Integration Metadata</h3>
        <div className="p-4 rounded-xl bg-surface-container/60 space-y-2.5">
          <DetailRow label="Integration ID" value={integration.id} mono />
          <DetailRow label="Provider" value={meta?.name || integration.provider} />
          <DetailRow label="Category" value={integration.category} />
          <DetailRow label="Created" value={new Date(integration.created_at).toLocaleString()} />
          {integration.updated_at && (
            <DetailRow label="Last Modified" value={new Date(integration.updated_at).toLocaleString()} />
          )}
        </div>
      </section>

      {/* Preferences */}
      {canConfigure && (
        <section>
          <h3 className="text-sm font-semibold text-on-surface mb-4">Preferences</h3>
          <div className="p-4 rounded-xl bg-surface-container/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-on-surface">Default Integration</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Use this integration as the default for deployments of its type.
                </p>
              </div>
              <Button
                color="surface"
                variant="outlined"
                size="sm"
                leadingIcon="star"
                onClick={handleToggleDefault}
              >
                {integration.is_default ? 'Unset Default' : 'Set Default'}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Danger Zone */}
      {canConfigure && (
        <section>
          <h3 className="text-sm font-semibold text-[#A63D40] mb-4">Danger Zone</h3>
          <div className="p-4 rounded-xl border border-[#A63D40]/20 bg-[#A63D40]/5">
            {confirmDisconnect ? (
              <div className="space-y-3">
                <p className="text-sm text-[#A63D40]">
                  This will permanently remove the connection and all stored credentials.
                  Deployed rules will remain in the vendor platform but can no longer be managed from Optimus.
                </p>
                <div className="flex gap-3">
                  <Button
                    color="surface"
                    variant="text"
                    size="sm"
                    onClick={() => setConfirmDisconnect(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="error"
                    size="sm"
                    onClick={handleDisconnect}
                    loading={disconnecting}
                  >
                    {disconnecting ? 'Removing...' : 'Confirm Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-on-surface">Disconnect Integration</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Remove stored credentials and disconnect. Imported rules and production history are retained.
                  </p>
                </div>
                <Button
                  color="error"
                  variant="text"
                  size="sm"
                  leadingIcon="unlink"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

// =============================================================================
// Sub-components
// =============================================================================

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between text-sm">
    <span className="text-on-surface-variant">{label}</span>
    <span className={`text-on-surface font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
  </div>
);
