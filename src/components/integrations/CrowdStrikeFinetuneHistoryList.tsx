import React from 'react';
import { useNavigate } from 'react-router-dom';
import { routeHelpers } from '../../router/routes';
import { useCrowdStrikeFinetuneHistory } from '../../hooks/useCrowdStrikeFinetuneHistory';
import type { CrowdStrikeFinetuneRefinement, CrowdStrikeFinetuneStatus } from '../../types/crowdstrikeFinetune';
import { Icon } from '../Icon';
import { BulletList } from '../ui/BulletList';
import { CrowdStrikeFinetuneLadderCard } from './CrowdStrikeFinetuneLadderCard';

interface CrowdStrikeFinetuneHistoryListProps {
  detectionId: string;
}

const STATUS_LABEL: Record<CrowdStrikeFinetuneStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_DOT: Record<CrowdStrikeFinetuneStatus, string> = {
  running: 'bg-primary animate-pulse',
  completed: 'bg-[#4D7C6F]',
  failed: 'bg-[#A63D40]',
  cancelled: 'bg-on-surface-variant/50',
};

const STATUS_TEXT: Record<CrowdStrikeFinetuneStatus, string> = {
  running: 'text-primary',
  completed: 'text-[#4D7C6F]',
  failed: 'text-[#A63D40]',
  cancelled: 'text-on-surface-variant',
};

export const CrowdStrikeFinetuneHistoryList: React.FC<CrowdStrikeFinetuneHistoryListProps> = ({ detectionId }) => {
  const navigate = useNavigate();
  const { entries, loading, error } = useCrowdStrikeFinetuneHistory(detectionId);

  const applyRefinement = (refinement: CrowdStrikeFinetuneRefinement) => {
    navigate(routeHelpers.detectionEdit(detectionId), {
      state: { refinedCql: refinement.cql },
    });
  };

  if (loading) {
    return <p className="text-xs text-on-surface-variant">Loading CrowdStrike history...</p>;
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-container/40 px-3.5 py-2.5">
        <Icon name="x-circle" className="mt-0.5 h-4 w-4 flex-shrink-0 text-error" />
        <p className="text-xs text-on-surface">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center">
        <p className="text-sm text-on-surface-variant">No CrowdStrike finetune sessions yet.</p>
        <p className="mt-1 text-[11px] text-on-surface-variant/70">
          Run CrowdStrike pre-flight from the Detection Query tab, then launch Finetune CrowdStrike CQL to capture a
          session here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const timestamp = new Date(entry.created_at).toLocaleString();
        const refinementCount = entry.result?.refinements.length ?? 0;
        const baseline = entry.baseline_hit_count;

        return (
          <details
            key={entry.id}
            className="group rounded-xl border border-outline-variant bg-surface-container-high/40"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container-high/60">
              <div className="flex min-w-0 items-center gap-2.5 text-xs">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} />
                <span className={`font-medium ${STATUS_TEXT[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>
                <span className="text-on-surface-variant">-</span>
                <span className="text-on-surface-variant">
                  {baseline !== null ? baseline.toLocaleString() : '-'} events / {entry.window_days}d
                </span>
                {entry.status === 'completed' && (
                  <>
                    <span className="text-on-surface-variant">-</span>
                    <span className="text-on-surface-variant">
                      {refinementCount} refinement{refinementCount === 1 ? '' : 's'}
                    </span>
                  </>
                )}
                <span className="hidden text-on-surface-variant sm:inline">- CrowdStrike CQL</span>
                {entry.usage?.cost_usd != null && (
                  <>
                    <span className="text-on-surface-variant">-</span>
                    <span className="text-on-surface-variant">${entry.usage.cost_usd.toFixed(2)}</span>
                  </>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2 text-[11px] text-on-surface-variant">
                <span>{timestamp}</span>
                <Icon name="chevron-down" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </div>
            </summary>

            {entry.status === 'completed' && entry.result && (
              <div className="space-y-4 border-t border-outline-variant p-4">
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                    What&apos;s driving the noise
                  </p>
                  <BulletList text={entry.result.summary} className="text-xs leading-relaxed text-on-surface" />
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant/70">
                    CrowdStrike CQL refinements
                  </p>
                  <div className="space-y-3">
                    {entry.result.refinements
                      .slice()
                      .sort((left, right) => left.level - right.level)
                      .map((refinement) => (
                        <CrowdStrikeFinetuneLadderCard
                          key={refinement.level}
                          refinement={refinement}
                          baselineHitCount={entry.result?.baseline_hit_count || baseline || 0}
                          onApply={applyRefinement}
                        />
                      ))}
                  </div>
                </div>
              </div>
            )}

            {(entry.status === 'failed' || entry.status === 'cancelled') && entry.error_message && (
              <div className="border-t border-outline-variant px-4 py-3">
                <p className="text-xs text-on-surface-variant">{entry.error_message}</p>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
};
