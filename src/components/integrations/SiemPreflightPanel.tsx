import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { routeHelpers } from '../../router/routes';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { EmptyState } from '../ui/EmptyState';
import { integrationService } from '../../lib/integrationService';
import { usePreflight } from '../../hooks/usePreflight';
import { PreflightTimeChart, PreflightEntityChart } from './SiemPreflightCharts';
import type { Detection, Integration, PreflightResult, PreflightWindowDays } from '../../types';
import { SiemFinetuneModal } from './SiemFinetuneModal';
import type { FinetuneRefinement } from '../../types/finetune';

interface SiemPreflightPanelProps {
  detection: Detection;
  integration?: Integration;
  mode: 'standalone' | 'deploy';
  onResult?: (result: PreflightResult) => void;
}

const WINDOW_PRESETS = [3, 7, 14, 30, 60];
const WINDOW_MIN = 1;
const WINDOW_MAX = 90;

/** Best-effort KQL extraction for the read-only preview (mirrors pickKqlQuery server-side). */
function previewKql(detection: Detection): string | null {
  const fromArray = (detection.queries || []).find(
    (q) => q.language && q.language.toUpperCase() === 'KQL' && q.query && q.query.trim() !== '',
  );
  if (fromArray?.query) return fromArray.query;
  if (
    detection.detectionQuery &&
    detection.detectionQuery.trim() !== '' &&
    detection.queryLanguage &&
    detection.queryLanguage.toUpperCase() === 'KQL'
  ) {
    return detection.detectionQuery;
  }
  return null;
}

export const SiemPreflightPanel: React.FC<SiemPreflightPanelProps> = ({
  detection,
  integration,
  mode,
  onResult,
}) => {
  const navigate = useNavigate();
  const { run, loading, result, error } = usePreflight();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(!integration);
  const [selectedId, setSelectedId] = useState<string | undefined>(integration?.id);
  const [windowDays, setWindowDays] = useState<PreflightWindowDays>(30);
  const [showFinetune, setShowFinetune] = useState(false);

  useEffect(() => {
    if (integration) return;
    let cancelled = false;
    setLoadingIntegrations(true);
    integrationService
      .listIntegrations()
      .then((all) => {
        if (cancelled) return;
        const connected = all.filter(
          (i) => i.provider === 'defender_xdr' && i.status === 'connected',
        );
        setIntegrations(connected);
        // Auto-select when exactly one connected integration exists.
        if (connected.length === 1) setSelectedId(connected[0].id);
      })
      .catch(() => {
        if (!cancelled) setIntegrations([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingIntegrations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [integration]);

  const activeIntegration = useMemo(
    () => integration || integrations.find((i) => i.id === selectedId),
    [integration, integrations, selectedId],
  );

  const previewQuery = useMemo(() => previewKql(detection), [detection]);

  const sampleColumns = useMemo(() => {
    const rows = result?.sample ?? [];
    return rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];
  }, [result?.sample]);

  const handleApplyRefinement = (refinement: FinetuneRefinement) => {
    // Hand the refined KQL to the detection's edit form for review. Nothing is
    // persisted until the user saves there.
    setShowFinetune(false);
    navigate(routeHelpers.detectionEdit(detection.id), {
      state: { refinedKql: refinement.kql },
    });
  };

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

  // No connected Defender XDR integration — give a real empty state, not a dead dropdown.
  if (!integration && !loadingIntegrations && integrations.length === 0) {
    return (
      <EmptyState
        icon="unlink"
        title="No connected Defender XDR integration"
        description="Pre-flight runs this detection's query against a connected Microsoft Defender XDR integration. Connect and test one first."
        action={{
          label: 'Open integration settings',
          onClick: () => navigate('/settings/integrations'),
          icon: 'arrow-right',
        }}
        size="sm"
      />
    );
  }

  const hitCount = result?.hit_count ?? 0;
  const showBreakdown = !!result?.validation_passed && !!result?.breakdown && hitCount > 0;

  // The run controls — integration picker, time range, run button. Rendered as a
  // full card before a run and inside a collapsed summary afterwards, so the
  // result (not the configuration) leads the post-run view.
  const controlsBody = (
    <>
      {!integration && (
        <Select
          label="Defender XDR integration"
          fullWidth
          options={integrations.map((i) => ({ value: i.id, label: i.name }))}
          value={selectedId}
          onChange={setSelectedId}
          placeholder="Select a connected integration…"
        />
      )}

      <div>
        <label htmlFor="preflight-window" className="mb-1.5 block text-sm font-medium text-on-surface">
          Time range
        </label>
        {/* One cohesive control — a custom day count plus quick presets, split into
            divided segments so it reads as a single component, not loose pieces. */}
        <div className="inline-flex items-stretch overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high focus-within:border-primary/50">
          <input
            id="preflight-window"
            type="number"
            min={WINDOW_MIN}
            max={WINDOW_MAX}
            value={windowDays}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) {
                setWindowDays(Math.min(Math.max(n, WINDOW_MIN), WINDOW_MAX));
              }
            }}
            // Stop the scroll wheel from silently changing the value when the
            // cursor passes over the input while scrolling the modal.
            onWheel={(e) => e.currentTarget.blur()}
            className="w-12 bg-transparent py-1.5 text-center text-sm tabular-nums text-on-surface focus:outline-none"
          />
          <span className="flex items-center border-l border-outline-variant px-3 text-xs text-on-surface-variant">
            days
          </span>
          <div role="group" aria-label="Time range presets" className="flex items-stretch">
            {WINDOW_PRESETS.map((w) => {
              const active = windowDays === w;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setWindowDays(w)}
                  className={`flex items-center border-l border-outline-variant px-3 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {w}d
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-on-surface-variant/70">
          {WINDOW_MIN}–{WINDOW_MAX} days · Defender Advanced Hunting retains ~30 days by default.
        </p>
      </div>

      <Button
        variant="filled"
        color="primary"
        fullWidth
        leadingIcon="play"
        loading={loading}
        disabled={!activeIntegration}
        onClick={handleRun}
      >
        {loading ? 'Running pre-flight…' : result ? 'Run pre-flight again' : 'Run pre-flight'}
      </Button>

      {mode === 'deploy' && !result && !loading && (
        <p className="text-[11px] text-on-surface-variant/70">
          Optional — but recommended before deploying to catch query errors and noisy rules early.
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      {/* What this does — idle only */}
      {!result && (
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Runs this detection&apos;s KQL against Defender Advanced Hunting to confirm it executes
          cleanly and estimate how often it would have fired — before you deploy it.
        </p>
      )}

      {/* Query preview */}
      {previewQuery && (
        <details className="group rounded-xl border border-outline-variant bg-surface-container-highest/40">
          <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-on-surface-variant hover:text-on-surface">
            <Icon name="code" className="h-3.5 w-3.5" />
            Query to run
            <Icon
              name="chevron-down"
              className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180"
            />
          </summary>
          <pre className="max-h-44 overflow-auto border-t border-outline-variant px-3.5 py-3 font-mono text-[11px] leading-relaxed text-on-surface-variant">
            {previewQuery}
          </pre>
        </details>
      )}

      {/* Controls — a full card before a run; a collapsed summary afterwards so
          the result, not the configuration, leads the post-run view. */}
      {!result ? (
        <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-high/40 p-4">
          {controlsBody}
        </div>
      ) : (
        <details className="group rounded-xl border border-outline-variant bg-surface-container-high/40">
          <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs">
            <span className="flex-shrink-0 text-on-surface-variant">Tested against</span>
            <span className="truncate font-medium text-on-surface">
              {activeIntegration?.name}
            </span>
            <span className="flex-shrink-0 text-on-surface-variant">· {windowDays} days</span>
            <span className="ml-auto flex flex-shrink-0 items-center gap-1 font-medium text-on-surface-variant group-hover:text-on-surface">
              Change &amp; re-run
              <Icon
                name="chevron-down"
                className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              />
            </span>
          </summary>
          <div className="space-y-4 border-t border-outline-variant p-4">
            {controlsBody}
          </div>
        </details>
      )}

      {/* Service-level error (the run could not complete at all) */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
          <Icon name="x-circle" className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" />
          <p className="text-xs text-on-surface">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Validation verdict */}
          {result.validation_passed ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-ext-green/30 bg-ext-green-container/40 px-3.5 py-2.5">
              <Icon name="check-circle" className="h-4 w-4 flex-shrink-0 text-ext-green" />
              <span className="text-xs font-medium text-on-surface">Query runs cleanly in Defender</span>
            </div>
          ) : (
            <div className="rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Icon name="x-circle" className="h-4 w-4 flex-shrink-0 text-error" />
                <span className="text-xs font-medium text-on-surface">
                  {result.error_message || 'Query failed validation'}
                </span>
              </div>
              {result.error_guidance && (
                <p className="ml-[26px] mt-1.5 text-[11px] leading-relaxed text-on-surface-variant">
                  {result.error_guidance}
                </p>
              )}
            </div>
          )}

          {/* Non-fatal: probe passed but a later derived query failed */}
          {result.validation_passed && result.status !== 'success' && result.error_message && (
            <div className="flex items-start gap-2.5 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-2.5">
              <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ext-amber" />
              <p className="text-[11px] leading-relaxed text-on-surface-variant">
                {result.error_message}
                {result.error_guidance ? ` — ${result.error_guidance}` : ''}
              </p>
            </div>
          )}

          {/* Results table — the matched events ARE the result. The count + the
              Finetune CTA become the table's toolbar instead of separate cards
              above the data. */}
          {result.validation_passed && result.hit_count !== null && (
            <div className="overflow-hidden rounded-xl border border-outline-variant">
              <div className="flex items-center justify-between gap-3 bg-surface-container-high/40 px-4 py-2.5">
                <div className="min-w-0 text-xs">
                  <span className="text-sm font-semibold tabular-nums text-on-surface">
                    {result.hit_count.toLocaleString()}
                  </span>
                  <span className="ml-1 text-on-surface-variant">
                    {result.hit_count === 1 ? 'event' : 'events'} · last {result.window_days} days
                  </span>
                  {!result.window_applied && (
                    <span className="ml-2 text-on-surface-variant/70">
                      · window filter not applied
                    </span>
                  )}
                </div>
                {(result.hit_count ?? 0) > 0 && activeIntegration ? (
                  <Button
                    variant="filled"
                    color="primary"
                    leadingIcon="magic-wand"
                    onClick={() => setShowFinetune(true)}
                  >
                    Finetune with AI
                  </Button>
                ) : (
                  result.hit_count === 0 && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-[11px] text-ext-green">
                      <Icon name="check-circle" className="h-3.5 w-3.5" />
                      Clean to deploy
                    </span>
                  )
                )}
              </div>

              {(result.hit_count ?? 0) > 0 && (result.sample || []).length > 0 ? (
                <div className="overflow-x-auto border-t border-outline-variant">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-surface-container-high/40">
                        {sampleColumns.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap px-3 py-2 text-left font-medium text-on-surface-variant"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(result.sample || []).map((row, i) => (
                        <tr key={i} className="border-t border-outline-variant">
                          {sampleColumns.map((c) => (
                            <td
                              key={c}
                              className="max-w-[200px] truncate px-3 py-2 text-on-surface-variant"
                            >
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : result.hit_count === 0 ? (
                <p className="border-t border-outline-variant px-4 py-3 text-center text-xs text-on-surface-variant">
                  No matches in the last {result.window_days} days.
                </p>
              ) : null}
            </div>
          )}

          {/* Breakdown — only meaningful when there were hits */}
          {showBreakdown && result.breakdown && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-outline-variant p-3.5">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                  Activity over time
                </p>
                <PreflightTimeChart data={result.breakdown.overTime} />
              </div>
              <div className="rounded-xl border border-outline-variant p-3.5">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                  Top {result.breakdown.entityColumn || 'entities'}
                </p>
                <PreflightEntityChart
                  data={result.breakdown.byEntity}
                  entityColumn={result.breakdown.entityColumn}
                />
              </div>
            </div>
          )}

          {/* Schema-lint warnings — caveats for saving as a custom detection, last */}
          {(result.schema_warnings || []).map((w) => (
            <div
              key={w.code}
              className="flex items-start gap-2.5 rounded-xl border border-ext-amber/30 bg-ext-amber-container/30 px-3.5 py-2.5"
            >
              <Icon name="alert-triangle" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ext-amber" />
              <p className="text-[11px] leading-relaxed text-on-surface-variant">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {showFinetune && activeIntegration && result && (
        <SiemFinetuneModal
          detection={detection}
          integrationId={activeIntegration.id}
          windowDays={windowDays}
          baselineHitCount={result.hit_count ?? 0}
          preflightRunId={result.id}
          onApplyRefinement={handleApplyRefinement}
          onClose={() => setShowFinetune(false)}
        />
      )}
    </div>
  );
};
