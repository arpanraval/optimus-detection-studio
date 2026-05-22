import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-high/40 px-4 py-3">
        <p className="text-xs text-on-surface-variant">
          An AI agent is investigating the {baselineHitCount.toLocaleString()} matches over the last{' '}
          {windowDays} days and will return a ladder of refined queries.
        </p>
        <p className="mt-1.5 text-[11px] text-on-surface-variant/70">
          Keep this tab open until it finishes — the agent needs an active session to run its queries.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-3">
          <Icon name="x-circle" className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" />
          <p className="text-xs text-on-surface">{error}</p>
        </div>
      )}

      {(timeline.length > 0 || running) && (
        <FinetuneActivityStream
          timeline={timeline}
          running={running}
          queryCount={queryCount}
          queryBudget={QUERY_BUDGET}
        />
      )}

      {running && (
        <Button variant="outlined" color="primary" leadingIcon="x" onClick={() => void cancel()}>
          Stop finetuning
        </Button>
      )}

      {status === 'failed' && !error && (
        <p className="text-xs text-on-surface-variant">
          The finetuning run did not complete. You can close this and try again.
        </p>
      )}

      {status === 'completed' && result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-ext-green/30 bg-ext-green-container/30 px-3.5 py-2.5">
            <p className="text-xs leading-relaxed text-on-surface">{result.summary}</p>
          </div>
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
