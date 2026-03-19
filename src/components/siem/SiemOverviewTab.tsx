import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import { useAppData } from '../../router/AppDataContext';
import type { Integration, DeploymentRecord } from '../../types';
import { Status } from '../../types';
import { ConversionOpportunities } from './ConversionOpportunities';

interface IntegrationHealth {
  integration: Integration;
  deployedCount: number;
  lastDeployment: string | null;
  failedCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500/15 text-green-400 border-green-500/20',
  error: 'bg-red-500/15 text-red-400 border-red-500/20',
  testing: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  disconnected: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

function formatRelativeTime(dateStr: string | null): string {
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

export function SiemOverviewTab() {
  const { detections } = useAppData();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intRes, depRes] = await Promise.all([
        supabase.from('integrations').select('*').order('created_at', { ascending: false }),
        supabase.from('deployment_history').select('*').order('created_at', { ascending: false }),
      ]);
      if (intRes.error) throw new Error(intRes.error.message);
      if (depRes.error) throw new Error(depRes.error.message);
      setIntegrations((intRes.data || []) as Integration[]);
      setDeployments((depRes.data || []) as DeploymentRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute health info per integration
  const healthCards: IntegrationHealth[] = integrations.map((integration) => {
    const intDeployments = deployments.filter((d) => d.integration_id === integration.id);
    const successDeployments = intDeployments.filter((d) => d.status === 'success');
    const failedDeployments = intDeployments.filter((d) => d.status === 'failed');
    const uniqueDetectionIds = new Set(successDeployments.map((d) => d.detection_id));
    const lastDeploy = intDeployments.length > 0 ? intDeployments[0].created_at : null;

    return {
      integration,
      deployedCount: uniqueDetectionIds.size,
      lastDeployment: lastDeploy,
      failedCount: failedDeployments.length,
    };
  });

  // Overall health score
  const productionDetections = detections.filter((d) => d.status === Status.Production);
  const totalProduction = productionDetections.length;
  const allSuccessfulDetectionIds = new Set(
    deployments.filter((d) => d.status === 'success').map((d) => d.detection_id)
  );
  const deployedProductionCount = productionDetections.filter((d) =>
    allSuccessfulDetectionIds.has(d.id)
  ).length;
  const healthScore = totalProduction > 0 ? Math.round((deployedProductionCount / totalProduction) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 text-on-surface-variant animate-spin" />
        <span className="ml-3 text-on-surface-variant">Loading SIEM health data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container/30 border border-error/20 rounded-xl p-6 text-center">
        <Icon name="alert-triangle" className="w-6 h-6 text-error mx-auto mb-2" />
        <p className="text-on-surface">{error}</p>
        <button onClick={fetchData} className="mt-3 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Health Score Banner */}
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-on-surface">Deployment Health Score</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {deployedProductionCount} of {totalProduction} production detections deployed to at least one SIEM
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${healthScore >= 80 ? 'text-green-400' : healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {healthScore}%
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant transition-colors"
              title="Refresh"
            >
              <Icon name="refresh-cw" className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${healthScore >= 80 ? 'bg-green-500' : healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Conversion Opportunities */}
      <ConversionOpportunities />

      {/* Integration Cards */}
      {healthCards.length === 0 ? (
        <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
          <Icon name="link" className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
          <h3 className="text-base font-medium text-on-surface mb-1">No integrations connected</h3>
          <p className="text-sm text-on-surface-variant">Connect a SIEM or security tool in Settings to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {healthCards.map(({ integration, deployedCount, lastDeployment, failedCount }) => (
            <div
              key={integration.id}
              className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 hover:border-outline-variant/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-on-surface">{integration.name}</h4>
                  <p className="text-xs text-on-surface-variant capitalize mt-0.5">{integration.provider.replace(/_/g, ' ')}</p>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md border ${STATUS_COLORS[integration.status] || STATUS_COLORS.disconnected}`}>
                  {integration.status}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Rules deployed</span>
                  <span className="text-on-surface font-medium">{deployedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Failed deployments</span>
                  <span className={`font-medium ${failedCount > 0 ? 'text-red-400' : 'text-on-surface'}`}>{failedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Last deployment</span>
                  <span className="text-on-surface font-medium">{formatRelativeTime(lastDeployment)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Last tested</span>
                  <span className="text-on-surface font-medium">{formatRelativeTime(integration.last_tested_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
