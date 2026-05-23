import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { BulletList } from '../ui/BulletList';
import { useFinetuneRun } from '../../hooks/useFinetuneRun';
import { FinetuneActivityStream } from './FinetuneActivityStream';
import { FinetuneLadderCard } from './FinetuneLadderCard';
import type { Detection } from '../../types';
import type { FinetuneRefinement } from '../../types/finetune';

const QUERY_BUDGET = 12;

interface SiemFinetunePanelProps {
  detection: Detection;
  integrationId: string;
  windowDays: number;
  baselineHitCount: number;
  preflightRunId?: string;
  onApplyRefinement: (refinement: FinetuneRefinement) => void;
}

export const SiemFinetunePanel: React.FC<SiemFinetunePanelProps> = ({
  detection, integrationId, windowDays, baselineHitCount, preflightRunId, onApplyRefinement,
}) => {
  const { status, timeline, queryCount, result, usage, error, start, cancel } = useFinetuneRun();
  const startedRef = useRef(false);

  // Auto-start the run once when the panel mounts.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start({ detectionId: detection.id, integrationId, windowDays, preflightRunId });
  }, [detection.id, integrationId, windowDays, preflightRunId, start]);

  const running = status === 'running' || status === 'starting';
  const completed = status === 'completed' && !!result;

  return (
    <div className="space-y-4">
      {/* Intro — while the agent is still working */}
      {running && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 px-4 py-3">
          <p className="text-xs leading-relaxed text-on-surface-variant">
            An AI agent is investigating the {baselineHitCount.toLocaleString()} matches over the
            last {windowDays} days and will return a ladder of measured, refined queries.
          </p>
          <p className="mt-1.5 text-[11px] text-on-surface-variant/70">
            Keep this tab open until it finishes — the agent needs an active session to run its queries.
          </p>
        </div>
      )}

      {/* Service-level error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
          <Icon name="x-circle" className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" />
          <p className="text-xs text-on-surface">{error}</p>
        </div>
      )}

      {/* Live activity — while running */}
      {running && (
        <>
          {timeline.length > 0 ? (
            <FinetuneActivityStream
              timeline={timeline}
              running
              queryCount={queryCount}
              queryBudget={QUERY_BUDGET}
            />
          ) : (
            <div className="flex items-center gap-2 px-0.5 text-[11px] text-on-surface-variant">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Starting the investigation…
            </div>
          )}
          <Button variant="outlined" color="primary" leadingIcon="x" onClick={() => void cancel()}>
            Stop finetuning
          </Button>
        </>
      )}

      {status === 'failed' && !error && (
        <p className="text-xs text-on-surface-variant">
          The finetuning run did not complete. Close this and try again.
        </p>
      )}

      {/* Result — diagnosis, then the ladder, then the (collapsed) investigation */}
      {completed && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
              What&apos;s driving the noise
            </p>
            <BulletList
              text={result.summary}
              className="text-xs leading-relaxed text-on-surface"
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
              Refinement options — conservative to aggressive
            </p>
            <div className="space-y-3">
              {result.refinements
                .slice()
                .sort((a, b) => a.level - b.level)
                .map((r) => (
                  <FinetuneLadderCard
                    key={r.level}
                    refinement={r}
                    baselineHitCount={result.baseline_hit_count || baselineHitCount}
                    onApply={onApplyRefinement}
                  />
                ))}
            </div>
          </div>

          {timeline.length > 0 && (
            <details className="group rounded-xl border border-outline-variant">
              <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-on-surface-variant hover:text-on-surface">
                <Icon name="search" className="h-3.5 w-3.5" />
                How the agent investigated
                <span className="text-on-surface-variant/60">({queryCount} queries)</span>
                <Icon
                  name="chevron-down"
                  className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-outline-variant p-3">
                <FinetuneActivityStream
                  timeline={timeline}
                  running={false}
                  queryCount={queryCount}
                  queryBudget={QUERY_BUDGET}
                />
              </div>
            </details>
          )}

          {usage?.cost_usd != null && (
            <p className="text-right text-[10px] text-on-surface-variant/60">
              Run cost ≈ ${usage.cost_usd.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
