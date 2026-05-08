import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Input } from './ui/Input';
import { IntegrationLogo } from './integrations/IntegrationLogo';
import { ConnectionSetupInline } from './integrations/ConnectionSetupInline';
import { integrationService } from '../lib/integrationService';
import { logger } from '../lib/logger';
import {
  PROVIDER_META,
  getProviderMeta,
  getDisplayStatus,
  STATUS_BADGE_CONFIG,
  type ProviderMeta,
} from '../lib/providerMeta';
import { routeHelpers } from '../router/routes';
import type { Integration, IntegrationProvider } from '../types';
import { hasPermission } from '../types';
import { usePermissions } from '../context/PermissionsContext';

// =============================================================================
// Helpers
// =============================================================================

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
// Connected Integration Card
// =============================================================================

const ConnectedIntegrationCard: React.FC<{
  integration: Integration;
  providerMeta: ProviderMeta;
}> = ({ integration, providerMeta }) => {
  const navigate = useNavigate();
  const displayStatus = getDisplayStatus(providerMeta, integration);
  const badge = STATUS_BADGE_CONFIG[displayStatus];
  const latency = integration.last_test_result?.latency_ms;

  return (
    <button
      onClick={() => navigate(routeHelpers.integrationDetail(integration.id))}
      className="group text-left w-full rounded-2xl border border-outline-variant/15 bg-surface-container-low transition-all duration-200 hover:shadow-lg hover:border-outline-variant/30 hover:bg-surface-container"
    >
      {/* Card body with generous padding */}
      <div className="p-6">
        <div className="flex items-center gap-4 mb-5">
          <IntegrationLogo provider={providerMeta} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-on-surface truncate leading-tight">
                {integration.name}
              </h3>
              {integration.is_default && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md shrink-0">
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-on-surface-variant/60 mt-0.5">
              {providerMeta.name}
            </p>
          </div>
          <Icon
            name="chevron-right"
            className="w-5 h-5 text-on-surface-variant/20 group-hover:text-on-surface-variant/60 group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </div>

        {/* Status bar at bottom */}
        <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10">
          <span className={`px-3 py-1 text-[11px] font-semibold rounded-full border ${badge.className}`}>
            {badge.label}
          </span>
          <div className="flex items-center gap-2.5 text-xs text-on-surface-variant/50">
            <span>Tested {relativeTime(integration.last_tested_at)}</span>
            {latency != null && latency > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-on-surface-variant/20" />
                <span>{latency}ms</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

// =============================================================================
// Available Integration Card
// =============================================================================

const AvailableIntegrationCard: React.FC<{
  providerMeta: ProviderMeta;
  isExpanded: boolean;
  onSetUp: () => void;
  canConfigure: boolean;
  hasExistingConnection?: boolean;
}> = ({ providerMeta, isExpanded, onSetUp, canConfigure, hasExistingConnection }) => {
  const { name, description } = providerMeta;

  return (
    <div className={`rounded-2xl border transition-all duration-200 ${
      isExpanded
        ? 'bg-surface-container-low border-primary/30 shadow-lg ring-1 ring-primary/10'
        : 'bg-surface-container-low border-outline-variant/15 hover:shadow-lg hover:border-outline-variant/30 hover:bg-surface-container'
    }`}>
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <IntegrationLogo provider={providerMeta} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-on-surface leading-tight">{name}</h3>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant/60 leading-relaxed mb-5">{description}</p>
        {!isExpanded && canConfigure && (
          <button
            onClick={onSetUp}
            className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-colors shadow-sm ${
              hasExistingConnection
                ? 'text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 shadow-none'
                : 'text-on-primary bg-primary hover:bg-primary/90 shadow-primary/20'
            }`}
          >
            {hasExistingConnection ? 'Add Connection' : 'Connect'}
          </button>
        )}
        {!isExpanded && !canConfigure && (
          <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-on-surface-variant/40 bg-surface-container-high rounded-xl">
            <Icon name="lock" className="w-4 h-4" />
            <span>Requires permission</span>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Coming Soon Card
// =============================================================================

const ComingSoonCard: React.FC<{ providerMeta: ProviderMeta }> = ({ providerMeta }) => {
  const { name, description } = providerMeta;

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low/60 opacity-50">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <IntegrationLogo provider={providerMeta} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-on-surface/60 leading-tight">{name}</h3>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant/40 leading-relaxed mb-5">{description}</p>
        <div className="flex items-center justify-center py-2.5 text-sm font-medium text-on-surface-variant/40 bg-surface-container-high/60 rounded-xl">
          Coming Soon
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Connection Setup Modal
// =============================================================================

export const ConnectionSetupModal: React.FC<{
  provider: IntegrationProvider;
  providerMeta: ProviderMeta;
  onConnected: () => void;
  onClose: () => void;
  isAdditionalConnection?: boolean;
}> = ({ provider, providerMeta, onConnected, onClose, isAdditionalConnection }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${providerMeta.name}`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative w-full max-w-lg bg-surface-container-high rounded-2xl border border-outline-variant/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
          <IntegrationLogo provider={providerMeta} size="md" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-on-surface">Connect {providerMeta.name}</h2>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">{providerMeta.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <ConnectionSetupInline
          provider={provider}
          providerDisplayName={providerMeta.name}
          onConnected={onConnected}
          onCancel={onClose}
          isAdditionalConnection={isAdditionalConnection}
        />
      </div>
    </div>
  );
};

// =============================================================================
// Main Hub Component
// =============================================================================

export const IntegrationsHub: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<IntegrationProvider | null>(null);

  // Permissions
  let userRole = 'viewer';
  try {
    const perms = usePermissions();
    userRole = perms.userRole || 'viewer';
  } catch (err) {
    logger.warn('Failed to get user permissions, defaulting to viewer:', err);
  }
  const canConfigure = hasPermission(userRole, 'integrations:configure');

  const loadData = useCallback(async () => {
    try {
      const ints = await integrationService.listIntegrations();
      setIntegrations(ints);
    } catch (err) {
      logger.warn('Failed to load integrations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter providers by search
  const filterBySearch = (meta: ProviderMeta) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return meta.name.toLowerCase().includes(q) || meta.description.toLowerCase().includes(q);
  };

  // Categorize providers
  const connectedIntegrations = useMemo(() => {
    return integrations
      .filter(i => ['connected', 'error', 'configured', 'testing'].includes(i.status))
      .filter(i => {
        if (!searchQuery) return true;
        const meta = getProviderMeta(i.provider);
        return meta ? filterBySearch(meta) : false;
      })
      .sort((a, b) => {
        if (a.status === 'error' && b.status !== 'error') return -1;
        if (b.status === 'error' && a.status !== 'error') return 1;
        return 0;
      });
  }, [integrations, searchQuery]);

  const connectedProviderIds = useMemo(() => {
    return new Set(integrations.map(i => i.provider));
  }, [integrations]);

  const availableProviders = useMemo(() => {
    return PROVIDER_META
      .filter(p => {
        if (p.comingSoon) return false;
        if (p.category === 'siem') return true; // Always show — multi-connection allowed
        return !connectedProviderIds.has(p.id);
      })
      .filter(filterBySearch);
  }, [connectedProviderIds, searchQuery]);

  const comingSoonProviders = useMemo(() => {
    return PROVIDER_META
      .filter(p => p.comingSoon)
      .filter(filterBySearch);
  }, [searchQuery]);

  const handleSetUp = (provider: IntegrationProvider) => {
    setExpandedProvider(expandedProvider === provider ? null : provider);
  };

  const handleConnected = () => {
    setExpandedProvider(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto scrollbar-page">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-20">
            <Icon name="loader" className="w-6 h-6 animate-spin text-on-surface-variant" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-page">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-xl font-bold text-on-surface mb-1">Integrations</h1>
            <p className="text-sm text-on-surface-variant">
              Connect your security tools to deploy and manage detections.
            </p>
          </div>
          <div className="w-72">
            <Input
              type="search"
              leadingIcon="search"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              clearable
              onClear={() => setSearchQuery('')}
            />
          </div>
        </div>

        {/* Connected Section */}
        {connectedIntegrations.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2.5 mb-6">
              <h2 className="text-sm font-semibold text-on-surface">
                Connected
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant bg-surface-container-high rounded-full min-w-[22px] text-center">
                {connectedIntegrations.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {connectedIntegrations.map(integration => {
                const meta = getProviderMeta(integration.provider);
                if (!meta) return null;
                return (
                  <ConnectedIntegrationCard
                    key={integration.id}
                    integration={integration}
                    providerMeta={meta}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Available Section */}
        {availableProviders.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2.5 mb-6">
              <h2 className="text-sm font-semibold text-on-surface">
                Available
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant bg-surface-container-high rounded-full min-w-[22px] text-center">
                {availableProviders.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {availableProviders.map(meta => (
                <AvailableIntegrationCard
                  key={meta.id}
                  providerMeta={meta}
                  isExpanded={expandedProvider === meta.id}
                  onSetUp={() => handleSetUp(meta.id)}
                  canConfigure={canConfigure}
                  hasExistingConnection={connectedProviderIds.has(meta.id)}
                />
              ))}
            </div>

            {/* Connection setup form is rendered as a modal (see below) */}
          </section>
        )}

        {/* Coming Soon Section */}
        {comingSoonProviders.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2.5 mb-6">
              <h2 className="text-sm font-semibold text-on-surface/50">
                Coming Soon
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {comingSoonProviders.map(meta => (
                <ComingSoonCard key={meta.id} providerMeta={meta} />
              ))}
            </div>
          </section>
        )}

        {/* Empty search state */}
        {connectedIntegrations.length === 0 && availableProviders.length === 0 && comingSoonProviders.length === 0 && searchQuery && (
          <div className="text-center py-16">
            <Icon name="search" className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-on-surface mb-1">No Results</h3>
            <p className="text-xs text-on-surface-variant">
              No integrations match &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 border-t border-outline-variant/10">
          <p className="text-[10px] text-on-surface-variant/30 text-center tracking-wide">
            All product names, logos, and brands are property of their respective owners.
          </p>
        </footer>
      </div>

      {/* Connection Setup Modal */}
      {expandedProvider && (() => {
        const meta = PROVIDER_META.find(p => p.id === expandedProvider);
        if (!meta) return null;
        return (
          <ConnectionSetupModal
            provider={expandedProvider}
            providerMeta={meta}
            onConnected={handleConnected}
            onClose={() => setExpandedProvider(null)}
            isAdditionalConnection={connectedProviderIds.has(expandedProvider)}
          />
        );
      })()}
    </div>
  );
};
