import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { integrationService } from '../../lib/integrationService';
import { usePreflight } from '../../hooks/usePreflight';
import { PreflightTimeChart, PreflightEntityChart } from './SiemPreflightCharts';
import type { Detection, Integration, PreflightResult, PreflightWindowDays } from '../../types';

interface SiemPreflightPanelProps {
  detection: Detection;
  integration?: Integration;
  mode: 'standalone' | 'deploy';
  onResult?: (result: PreflightResult) => void;
}

const WINDOWS: PreflightWindowDays[] = [7, 14, 30];

export const SiemPreflightPanel: React.FC<SiemPreflightPanelProps> = ({
  detection,
  integration,
  mode,
  onResult,
}) => {
  const { run, loading, result, error } = usePreflight();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(integration?.id);
  const [windowDays, setWindowDays] = useState<PreflightWindowDays>(30);
  const [sampleOpen, setSampleOpen] = useState(false);

  useEffect(() => {
    if (integration) return;
    integrationService
      .listIntegrations()
      .then((all) =>
        setIntegrations(all.filter((i) => i.provider === 'defender_xdr' && i.status === 'connected')),
      )
      .catch(() => setIntegrations([]));
  }, [integration]);

  const activeIntegration = useMemo(
    () => integration || integrations.find((i) => i.id === selectedId),
    [integration, integrations, selectedId],
  );

  const handleRun = async () => {
    if (!activeIntegration) return;
    const res = await run({
      detectionId: detection.id,
      detectionName: detection.name,
      integrationId: activeIntegration.id,
      integrationName: activeIntegration.name,
      windowDays,
    });
    if (res) onResult?.(res);
  };

  const sampleColumns = useMemo(() => {
    const rows = result?.sample || [];
    return rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        {!integration && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Defender XDR integration
            </label>
            <select
              value={selectedId || ''}
              onChange={(e) => setSelectedId(e.target.value || undefined)}
              className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant/20 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary/40"
            >
              <option value="">Select a connected integration…</option>
              {integrations.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">Backtest window</label>
          <div className="flex rounded-lg border border-outline-variant/20 overflow-hidden">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowDays(w)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  windowDays === w
                    ? 'bg-primary/15 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || !activeIntegration}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name={loading ? 'loader' : 'play'} className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running pre-flight…' : 'Run pre-flight'}
        </button>
      </div>

      {mode === 'deploy' && !result && !loading && (
        <p className="text-xs text-on-surface-variant/70">
          Optional — run the query against Defender to validate it and estimate false positives before deploying.
        </p>
      )}

      {/* Service-level error (could not run at all) */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-error/20 bg-error/5">
          <Icon name="x-circle" className="w-4 h-4 text-error mt-0.5 flex-shrink-0" />
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Validation verdict */}
          {result.validation_passed ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
              <Icon name="check-circle" className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-green-500">Query runs cleanly in Defender</span>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-error/20 bg-error/5">
              <div className="flex items-center gap-2">
                <Icon name="x-circle" className="w-4 h-4 text-error" />
                <span className="text-xs font-medium text-error">
                  {result.error_message || 'Query failed validation'}
                </span>
              </div>
              {result.error_guidance && (
                <p className="text-[11px] text-on-surface-variant mt-1.5 ml-6">{result.error_guidance}</p>
              )}
            </div>
          )}

          {/* Non-fatal: probe passed but a later derived query failed */}
          {result.validation_passed && result.status !== 'success' && result.error_message && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {result.error_message}
                {result.error_guidance ? ` — ${result.error_guidance}` : ''}
              </p>
            </div>
          )}

          {/* Schema lint warnings */}
          {(result.schema_warnings || []).map((w) => (
            <div key={w.code} className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{w.message}</p>
            </div>
          ))}

          {/* Backtest headline */}
          {result.validation_passed && result.hit_count !== null && (
            <div className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/50">
              <p className="text-sm text-on-surface">
                Would have matched{' '}
                <span className="text-lg font-semibold text-on-surface">
                  {result.hit_count.toLocaleString()}
                </span>{' '}
                {result.hit_count === 1 ? 'event' : 'events'} in the last {result.window_days} days.
              </p>
              {!result.window_applied && (
                <p className="text-[11px] text-on-surface-variant/70 mt-1">
                  The query does not expose a Timestamp column, so the window could not be narrowed —
                  this count covers Defender's full 30-day retention.
                </p>
              )}
            </div>
          )}

          {/* Breakdown */}
          {result.validation_passed && result.breakdown && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-3 rounded-xl border border-outline-variant/20">
                <p className="text-xs font-medium text-on-surface-variant mb-2">Hits per day</p>
                <PreflightTimeChart data={result.breakdown.overTime} />
              </div>
              <div className="p-3 rounded-xl border border-outline-variant/20">
                <p className="text-xs font-medium text-on-surface-variant mb-2">
                  Top {result.breakdown.entityColumn || 'entities'}
                </p>
                <PreflightEntityChart
                  data={result.breakdown.byEntity}
                  entityColumn={result.breakdown.entityColumn}
                />
              </div>
            </div>
          )}

          {/* Sample rows */}
          {result.validation_passed && (result.sample || []).length > 0 && (
            <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
              <button
                onClick={() => setSampleOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <span>Sample matched events ({(result.sample || []).length})</span>
                <Icon name={sampleOpen ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-on-surface-variant" />
              </button>
              {sampleOpen && (
                <div className="overflow-x-auto border-t border-outline-variant/10">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-surface-container-high/50">
                        {sampleColumns.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left font-medium text-on-surface-variant">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(result.sample || []).map((row, i) => (
                        <tr key={i} className="border-t border-outline-variant/10">
                          {sampleColumns.map((c) => (
                            <td key={c} className="px-2 py-1.5 text-on-surface-variant max-w-[200px] truncate">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
