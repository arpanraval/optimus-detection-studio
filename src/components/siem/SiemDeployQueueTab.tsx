import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../lib/supabaseClient';
import { useAppData } from '../../router/AppDataContext';
import { Status } from '../../types';
import type { Integration, Detection } from '../../types';

// Map provider to typical query language for grouping
const PROVIDER_LABELS: Record<string, string> = {
  splunk: 'Splunk',
  sentinel: 'Microsoft Sentinel',
  defender_xdr: 'Microsoft Defender XDR',
  elastic: 'Elastic Security',
  chronicle: 'Google Chronicle',
  crowdstrike: 'CrowdStrike',
};

interface QueueGroup {
  provider: string;
  providerLabel: string;
  integrations: Integration[];
  detections: Detection[];
}

export function SiemDeployQueueTab() {
  const { detections } = useAppData();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deployedDetectionIds, setDeployedDetectionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [intRes, depRes] = await Promise.all([
          supabase.from('integrations').select('*'),
          supabase.from('deployment_history').select('detection_id, status'),
        ]);
        if (intRes.error) throw new Error(intRes.error.message);
        if (depRes.error) throw new Error(depRes.error.message);

        setIntegrations((intRes.data || []) as Integration[]);

        const successIds = new Set<string>();
        for (const d of depRes.data || []) {
          if (d.status === 'success') successIds.add(d.detection_id);
        }
        setDeployedDetectionIds(successIds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deploy queue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Production detections not deployed anywhere
  const undeployedDetections = useMemo(() => {
    return detections.filter(
      (d) => d.status === Status.Production && !deployedDetectionIds.has(d.id)
    );
  }, [detections, deployedDetectionIds]);

  // Group integrations by provider, show undeployed detections per group
  const groups = useMemo<QueueGroup[]>(() => {
    const providerMap = new Map<string, Integration[]>();
    for (const int of integrations) {
      const existing = providerMap.get(int.provider) || [];
      existing.push(int);
      providerMap.set(int.provider, existing);
    }

    return Array.from(providerMap.entries()).map(([provider, ints]) => ({
      provider,
      providerLabel: PROVIDER_LABELS[provider] || provider.replace(/_/g, ' '),
      integrations: ints,
      detections: undeployedDetections,
    }));
  }, [integrations, undeployedDetections]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icon name="loader" className="w-6 h-6 text-on-surface-variant animate-spin" />
        <span className="ml-3 text-on-surface-variant">Loading deploy queue...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-container/30 border border-error/20 rounded-xl p-6 text-center">
        <p className="text-on-surface">{error}</p>
      </div>
    );
  }

  if (undeployedDetections.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
        <Icon name="check-circle" className="w-8 h-8 text-green-400 mx-auto mb-3" />
        <h3 className="text-base font-medium text-on-surface mb-1">All clear</h3>
        <p className="text-sm text-on-surface-variant">All production detections have been deployed to at least one SIEM.</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl p-10 text-center border border-outline-variant/10">
        <Icon name="link" className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
        <h3 className="text-base font-medium text-on-surface mb-1">No integrations</h3>
        <p className="text-sm text-on-surface-variant">
          Connect a SIEM integration to deploy detections. {undeployedDetections.length} production detection{undeployedDetections.length !== 1 ? 's' : ''} pending.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/15 rounded-lg">
            <Icon name="upload-cloud" className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-on-surface">
              {undeployedDetections.length} production detection{undeployedDetections.length !== 1 ? 's' : ''} not deployed
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              These detections have Production status but no successful deployment record.
            </p>
          </div>
        </div>
      </div>

      {/* Groups by SIEM provider */}
      {groups.map((group) => (
        <div key={group.provider} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-on-surface">{group.providerLabel}</h4>
              <span className="text-xs text-on-surface-variant">
                {group.integrations.length} connection{group.integrations.length !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-400 rounded-lg">
              {group.detections.length} pending
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/5">
                  <th className="text-left px-4 py-2 text-on-surface-variant font-medium text-xs">Detection</th>
                  <th className="text-left px-4 py-2 text-on-surface-variant font-medium text-xs">Severity</th>
                  <th className="text-left px-4 py-2 text-on-surface-variant font-medium text-xs">Query Language</th>
                </tr>
              </thead>
              <tbody>
                {group.detections.slice(0, 50).map((det) => (
                  <tr key={det.id} className="border-b border-outline-variant/5 hover:bg-surface-container-high/40">
                    <td className="px-4 py-2.5 text-on-surface">{det.name || det.id.slice(0, 12)}</td>
                    <td className="px-4 py-2.5 text-on-surface-variant capitalize">{det.severity || '-'}</td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{det.queryLanguage || '-'}</td>
                  </tr>
                ))}
                {group.detections.length > 50 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-center text-xs text-on-surface-variant">
                      +{group.detections.length - 50} more detections
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
