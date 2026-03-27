import React, { useState, useMemo } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useAppData } from '../../router/AppDataContext';
import { getProviderMeta } from '../../lib/providerMeta';
import type { Integration, DeploymentRecord, Detection } from '../../types';
import { Status } from '../../types';

const PROVIDER_LANGUAGES: Record<string, string[]> = {
  splunk: ['SPL'],
  sentinel: ['KQL'],
  defender_xdr: ['KQL'],
  elastic: ['Lucene', 'EQL', 'ES|QL', 'Elasticsearch DSL'],
  crowdstrike: ['CQL'],
  chronicle: ['YARA-L'],
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-[#A63D40]/10 text-[#A63D40]',
  high: 'bg-[#D4734B]/10 text-[#D4734B]',
  medium: 'bg-amber-500/10 text-amber-500',
  low: 'bg-[#4D7C6F]/10 text-[#4D7C6F]',
  informational: 'bg-surface-container-highest text-on-surface-variant',
};

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  update: 'bg-blue-500/15 text-blue-400',
  delete: 'bg-[#A63D40]/15 text-[#A63D40]',
  enable: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  disable: 'bg-zinc-500/15 text-zinc-400',
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-[#4D7C6F]/15 text-[#4D7C6F]',
  failed: 'bg-[#A63D40]/15 text-[#A63D40]',
  pending: 'bg-amber-500/15 text-amber-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  rolled_back: 'bg-zinc-500/15 text-zinc-400',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

interface SiemHomeDeployTabProps {
  integration: Integration;
  deployments: DeploymentRecord[];
  onRefresh: () => void;
}

export function SiemHomeDeployTab({ integration, deployments, onRefresh }: SiemHomeDeployTabProps) {
  const { detections } = useAppData();
  const meta = getProviderMeta(integration.provider);

  const supportedLangs = useMemo(
    () => PROVIDER_LANGUAGES[integration.provider] ?? [],
    [integration.provider],
  );

  const deployedIds = useMemo(
    () => new Set(deployments.filter(d => d.status === 'success').map(d => d.detection_id)),
    [deployments],
  );

  const compatible = useMemo(
    () =>
      detections.filter(
        (d: Detection) =>
          d.status === Status.Production &&
          !deployedIds.has(d.id) &&
          d.queryLanguage &&
          supportedLangs.includes(d.queryLanguage),
      ),
    [detections, deployedIds, supportedLangs],
  );

  const failedPending = useMemo(
    () =>
      deployments.filter(
        d => d.status === 'failed' || d.status === 'pending' || d.status === 'in_progress',
      ),
    [deployments],
  );

  return (
    <div className="space-y-6">
      {/* Ready to Deploy */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="upload-cloud" className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-on-surface">Ready to Deploy</h3>
            <span className="ml-1 text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
              {compatible.length}
            </span>
          </div>
          <Button variant="text" size="sm" onClick={onRefresh}>
            <Icon name="refresh-cw" className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>

        {compatible.length === 0 ? (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 text-center">
            <Icon name="check-circle" className="w-8 h-8 text-[#4D7C6F] mb-2" />
            <p className="text-sm text-on-surface-variant">All compatible detections are deployed</p>
          </div>
        ) : (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <p className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant/10">
              {compatible.length} detection{compatible.length !== 1 ? 's' : ''} ready to deploy to{' '}
              <span className="text-on-surface font-medium">{meta?.name ?? integration.provider}</span>
            </p>
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-high text-xs text-on-surface-variant uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Detection</th>
                  <th className="text-left px-4 py-3 font-medium">Severity</th>
                  <th className="text-left px-4 py-3 font-medium">Language</th>
                  <th className="text-right px-4 py-3 font-medium">MITRE</th>
                </tr>
              </thead>
              <tbody>
                {compatible.map((det: Detection) => (
                  <tr
                    key={det.id}
                    className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-on-surface">{det.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      {det.severity && (
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            SEVERITY_STYLES[det.severity.toLowerCase()] ?? 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          {det.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">
                        {det.queryLanguage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-on-surface-variant">
                        {det.mitreTechniques?.length ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-outline-variant/10">
              <p className="text-xs text-on-surface-variant italic">
                Use the Detection Library to deploy individual detections
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Failed & Pending */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Icon name="alert-triangle" className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-semibold text-on-surface">Failed &amp; Pending</h3>
          <span className="ml-1 text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
            {failedPending.length}
          </span>
        </div>

        {failedPending.length === 0 ? (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 text-center">
            <Icon name="check-circle" className="w-8 h-8 text-[#4D7C6F] mb-2" />
            <p className="text-sm text-on-surface-variant">No failed or pending deployments</p>
          </div>
        ) : (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-high text-xs text-on-surface-variant uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Detection ID</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Error</th>
                  <th className="text-right px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {failedPending.map(dep => (
                  <tr
                    key={dep.id}
                    className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-on-surface">
                        {dep.detection_id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          ACTION_STYLES[dep.action] ?? 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {dep.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          STATUS_STYLES[dep.status] ?? 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {dep.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {dep.error_message ? (
                        <span className="text-xs text-[#A63D40] line-clamp-2">{dep.error_message}</span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-on-surface-variant">
                        {relativeTime(dep.started_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
