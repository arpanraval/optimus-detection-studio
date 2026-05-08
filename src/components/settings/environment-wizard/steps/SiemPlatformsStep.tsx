import React, { useCallback, useEffect, useState } from 'react';
import { SiemCard } from '../cards/SiemCard';
import { supabase } from '../../../../lib/supabaseClient';
import {
  PROVIDER_META,
  getDisplayStatus,
  type DisplayStatus,
  type ProviderMeta,
} from '../../../../lib/providerMeta';
import type { IntegrationProvider } from '../../../../types/integration';
import { ConnectionSetupModal } from '../../../IntegrationsHub';

const SIEM_PROVIDERS = PROVIDER_META.filter(p => p.category === 'siem');

interface SiemPlatformsStepProps {
  selected: string[];
  onSelect: (platforms: string[]) => void;
}

export const SiemPlatformsStep: React.FC<SiemPlatformsStepProps> = ({ selected, onSelect }) => {
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, DisplayStatus>>({});
  const [setupProvider, setSetupProvider] = useState<ProviderMeta | null>(null);

  const allSelected = selected.length === SIEM_PROVIDERS.length;

  const fetchStatuses = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('integrations')
        .select('provider, status');
      if (data) {
        const statuses: Record<string, DisplayStatus> = {};
        for (const provider of SIEM_PROVIDERS) {
          const dbRow = data.find(d => d.provider === provider.id);
          statuses[provider.name] = getDisplayStatus(
            provider,
            dbRow ? { ...dbRow, provider: dbRow.provider as IntegrationProvider } as any : undefined
          );
        }
        setConnectionStatuses(statuses);
      }
    } catch {
      // Integrations table may not exist — default to 'available'
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const toggle = (name: string) => {
    onSelect(
      selected.includes(name)
        ? selected.filter(s => s !== name)
        : [...selected, name]
    );
  };

  const toggleAll = () => {
    onSelect(allSelected ? [] : SIEM_PROVIDERS.map(p => p.name));
  };

  const handleConnect = useCallback((providerMeta: ProviderMeta) => {
    setSetupProvider(providerMeta);
  }, []);

  const handleConnected = useCallback(() => {
    const justConnected = setupProvider;
    setSetupProvider(null);
    fetchStatuses();
    // Auto-select in profile if not already
    if (justConnected && !selected.includes(justConnected.name)) {
      onSelect([...selected, justConnected.name]);
    }
  }, [setupProvider, fetchStatuses, selected, onSelect]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-on-surface">Which SIEM platforms do you use?</h2>
        <button
          onClick={toggleAll}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant mb-6">
        Select the platforms where you deploy and manage detection rules. You can connect them now to enable live deployment.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SIEM_PROVIDERS.map((provider, i) => (
          <SiemCard
            key={provider.id}
            providerMeta={provider}
            selected={selected.includes(provider.name)}
            connectionStatus={connectionStatuses[provider.name] || 'available'}
            onClick={() => toggle(provider.name)}
            onConnectClick={() => handleConnect(provider)}
            index={i}
          />
        ))}
      </div>

      {setupProvider && (
        <ConnectionSetupModal
          provider={setupProvider.id}
          providerMeta={setupProvider}
          onConnected={handleConnected}
          onClose={() => setSetupProvider(null)}
        />
      )}
    </div>
  );
};
