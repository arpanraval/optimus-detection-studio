import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { IntegrationLogo } from '../integrations/IntegrationLogo';
import { supabase } from '../../lib/supabaseClient';
import { getProviderMeta } from '../../lib/providerMeta';
import type { Integration, DeploymentRecord } from '../../types';
import type { IconName } from '../Icon';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIEM_PROVIDERS = ['splunk', 'sentinel', 'defender_xdr', 'elastic', 'crowdstrike', 'chronicle'];

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

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  connected:  { dot: 'bg-[#4D7C6F]',  bg: 'bg-[#4D7C6F]/10', text: 'text-[#4D7C6F]',  label: 'Connected' },
  error:      { dot: 'bg-[#A63D40]',  bg: 'bg-[#A63D40]/10', text: 'text-[#A63D40]',  label: 'Error' },
  testing:    { dot: 'bg-amber-400',   bg: 'bg-amber-500/10', text: 'text-amber-400',  label: 'Testing' },
  configured: { dot: 'bg-zinc-400',    bg: 'bg-zinc-500/10',  text: 'text-zinc-400',   label: 'Configured' },
  disabled:   { dot: 'bg-zinc-600',    bg: 'bg-zinc-500/10',  text: 'text-zinc-500',   label: 'Disabled' },
};

interface IntegrationStats {
  rulesDeployed: number;
  failedCount: number;
  lastDeployedAt: string | null;
}

function computeStats(
  integrationId: string,
  deployments: DeploymentRecord[],
): IntegrationStats {
  const relevant = deployments.filter((d) => d.integration_id === integrationId);

  const successfulDetectionIds = new Set(
    relevant
      .filter((d) => d.status === 'success' && d.action === 'create')
      .map((d) => d.detection_id),
  );

  const failedCount = relevant.filter((d) => d.status === 'failed').length;

  const lastDeployedAt = relevant.reduce<string | null>((latest, d) => {
    if (!d.completed_at) return latest;
    if (!latest) return d.completed_at;
    return new Date(d.completed_at) > new Date(latest) ? d.completed_at : latest;
  }, null);

  return {
    rulesDeployed: successfulDetectionIds.size,
    failedCount,
    lastDeployedAt,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.configured;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function StatItem({
  icon,
  label,
  value,
  alert,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon
        name={icon}
        className={`w-3.5 h-3.5 flex-shrink-0 ${alert ? 'text-[#A63D40]' : 'text-on-surface-variant/60'}`}
      />
      <span className="text-on-surface-variant/60">{label}</span>
      <span className={`ml-auto font-medium ${alert ? 'text-[#A63D40]' : 'text-on-surface'}`}>
        {value}
      </span>
    </div>
  );
}

function IntegrationCard({
  integration,
  stats,
  onClick,
}: {
  integration: Integration;
  stats: IntegrationStats;
  onClick: () => void;
}) {
  const providerMeta = getProviderMeta(integration.provider);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left bg-surface-container rounded-2xl p-5 border border-outline-variant/10
                 hover:border-outline-variant/20 hover:bg-surface-container-high
                 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {providerMeta ? (
            <IntegrationLogo provider={providerMeta} size="md" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center">
              <Icon name="shield" className="w-6 h-6 text-on-surface-variant/40" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-on-surface truncate">
              {integration.name}
            </h3>
            <p className="text-xs text-on-surface-variant/60 truncate">
              {providerMeta?.name ?? integration.provider}
            </p>
          </div>
        </div>
        <StatusBadge status={integration.status} />
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <StatItem
          icon="check-circle"
          label="Rules deployed"
          value={stats.rulesDeployed}
        />
        <StatItem
          icon="x-circle"
          label="Failed"
          value={stats.failedCount}
          alert={stats.failedCount > 0}
        />
        <StatItem
          icon="clock"
          label="Last deploy"
          value={relativeTime(stats.lastDeployedAt)}
        />
        <StatItem
          icon="activity"
          label="Last tested"
          value={relativeTime(integration.last_tested_at)}
        />
      </div>

      {/* Footer hint */}
      <div className="mt-4 pt-3 border-t border-outline-variant/10 flex items-center justify-end">
        <span className="text-xs text-on-surface-variant/40 group-hover:text-primary transition-colors flex items-center gap-1">
          Open
          <Icon name="arrowRight" className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SiemLandingPage() {
  const navigate = useNavigate();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [intResult, deplResult] = await Promise.all([
        supabase.from('integrations').select('*'),
        supabase
          .from('deployment_history')
          .select('*')
          .order('completed_at', { ascending: false }),
      ]);

      if (intResult.error) throw intResult.error;
      if (deplResult.error) throw deplResult.error;

      const siemIntegrations = (intResult.data as Integration[]).filter((i) =>
        SIEM_PROVIDERS.includes(i.provider),
      );

      setIntegrations(siemIntegrations);
      setDeployments(deplResult.data as DeploymentRecord[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load integrations';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -- Loading state --
  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="list" />;
  }

  // -- Error state --
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-12 h-12 rounded-full bg-[#A63D40]/10 flex items-center justify-center">
          <Icon name="alert-triangle" className="w-6 h-6 text-[#A63D40]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-on-surface mb-1">Failed to load integrations</p>
          <p className="text-xs text-on-surface-variant/60 max-w-sm">{error}</p>
        </div>
        <Button variant="tonal" color="surface" size="sm" leadingIcon="refresh-cw" onClick={fetchData}>
          Retry
        </Button>
      </div>
    );
  }

  // -- Empty state --
  if (integrations.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader onConnect={() => navigate('/settings/integrations')} />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center">
            <Icon name="link" className="w-7 h-7 text-on-surface-variant/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface mb-1">No SIEMs connected</p>
            <p className="text-xs text-on-surface-variant/60 max-w-xs">
              Connect a SIEM or EDR platform in Settings to start deploying and managing detection rules.
            </p>
          </div>
          <Button
            variant="filled"
            color="primary"
            size="sm"
            leadingIcon="plus"
            onClick={() => navigate('/settings/integrations')}
          >
            Connect SIEM
          </Button>
        </div>
      </div>
    );
  }

  // -- Main grid --
  return <> {loading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="space-y-6">
      <PageHeader onConnect={() => navigate('/settings/integrations')} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            stats={computeStats(integration.id, deployments)}
            onClick={() => navigate(`/siem/${integration.id}`)}
          />
        ))}
      </div>
    </div>
  )} </>;
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

function PageHeader({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">SIEM / EDR</h1>
        <p className="text-sm text-on-surface-variant/60 mt-0.5">
          Manage detection rules across your connected platforms.
        </p>
      </div>
      <Button variant="tonal" color="primary" size="sm" leadingIcon="plus" onClick={onConnect}>
        Connect SIEM
      </Button>
    </div>
  );
}
