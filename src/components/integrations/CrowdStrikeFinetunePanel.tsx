import React, { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { BulletList } from '../ui/BulletList';
import { Icon } from '../Icon';
import { useCrowdStrikeFinetuneRun } from '../../hooks/useCrowdStrikeFinetuneRun';
import { CrowdStrikeFinetuneActivityStream } from './CrowdStrikeFinetuneActivityStream';
import { CrowdStrikeFinetuneLadderCard } from './CrowdStrikeFinetuneLadderCard';
import type { Detection } from '../../types';
import type { CrowdStrikeFinetuneRefinement } from '../../types/crowdstrikeFinetune';

const QUERY_BUDGET = 8;

export function CrowdStrikeFinetunePanel({
  detection,
  integrationId,
  preflightRunId,
  windowDays,
  baselineHitCount,
  onApplyRefinement,
}: {
  detection: Detection;
  integrationId: string;
  preflightRunId: string;
  windowDays: number;
  baselineHitCount: number;
  onApplyRefinement: (refinement: CrowdStrikeFinetuneRefinement) => void;
}) {
  const { status, timeline, queryCount, result, usage, error, start, cancel } =
    useCrowdStrikeFinetuneRun();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start({ detectionId: detection.id, integrationId, preflightRunId });
  }, [detection.id, integrationId, preflightRunId, start]);

  const running = status === 'running' || status === 'starting';
  const completed = status === 'completed' && !!result;

  return (
    <div className="space-y-4">
      {running && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 px-4 py-3">
          <p className="text-xs leading-relaxed text-on-surface-variant">
            A CrowdStrike-specific AI agent is investigating the {baselineHitCount.toLocaleString()}
            {' '}matches over the last {windowDays} days and measuring refined LogScale CQL queries.
          </p>
          <p className="mt-1.5 text-[11px] text-on-surface-variant/70">
            Queries run sequentially in the configured NGSIEM repository. Keep this tab open until it finishes.
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
          <Icon name="x-circle" className="mt-0.5 h-4 w-4 text-error" />
          <p className="text-xs text-on-surface">{error}</p>
        </div>
      )}
      {running && (
        <>
          {timeline.length > 0 ? (
            <CrowdStrikeFinetuneActivityStream
              timeline={timeline}
              running
              queryCount={queryCount}
              queryBudget={QUERY_BUDGET}
            />
          ) : (
            <div className="flex items-center gap-2 px-0.5 text-[11px] text-on-surface-variant">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Starting the CrowdStrike investigation...
            </div>
          )}
          <Button variant="outlined" color="primary" leadingIcon="x" onClick={() => void cancel()}>
            Stop CrowdStrike finetuning
          </Button>
        </>
      )}
      {status === 'failed' && !error && (
        <p className="text-xs text-on-surface-variant">
          The CrowdStrike finetuning run did not complete. Close this dialog and try again.
        </p>
      )}
      {completed && result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-high/40 p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
              What is driving the noise
            </p>
            <BulletList text={result.summary} className="text-xs leading-relaxed text-on-surface" />
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
              CrowdStrike CQL refinement options
            </p>
            <div className="space-y-3">
              {result.refinements
                .slice()
                .sort((left, right) => left.level - right.level)
                .map((refinement) => (
                  <CrowdStrikeFinetuneLadderCard
                    key={refinement.level}
                    refinement={refinement}
                    baselineHitCount={result.baseline_hit_count || baselineHitCount}
                    onApply={onApplyRefinement}
                  />
                ))}
            </div>
          </div>
          {timeline.length > 0 && (
            <details className="group rounded-xl border border-outline-variant">
              <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-on-surface-variant">
                <Icon name="search" className="h-3.5 w-3.5" />
                How the CrowdStrike agent investigated ({queryCount} queries)
              </summary>
              <div className="border-t border-outline-variant p-3">
                <CrowdStrikeFinetuneActivityStream
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
              Run cost approximately ${usage.cost_usd.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
