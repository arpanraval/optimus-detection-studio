import React from 'react';
import { PackTotals } from '../../hooks/usePackDeploymentStatus';

interface Props {
  totals: PackTotals | null;
}

export const PackQualityBar: React.FC<Props> = ({ totals }) => {
  if (!totals || totals.total_detections === 0) return null;

  const { total_detections, production_ready_count, draft_count } = totals;
  const inProgressCount = total_detections - production_ready_count - draft_count;
  const readyPct = (production_ready_count / total_detections) * 100;
  const draftPct = (draft_count / total_detections) * 100;
  const otherPct = (inProgressCount / total_detections) * 100;

  const isDeployable = production_ready_count > 0 && draft_count === 0;

  let readinessLabel: string;
  if (isDeployable) {
    readinessLabel = 'Ready to deploy';
  } else if (draft_count > 0) {
    readinessLabel = `${draft_count} draft${draft_count !== 1 ? 's' : ''} block deploy`;
  } else {
    readinessLabel = 'No production-ready detections';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-on-surface text-sm">Deployment Readiness</span>
        <span className={`text-xs font-semibold ${isDeployable ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {readinessLabel}
        </span>
      </div>
      {totals.total_detections > 0 && (
        <div className="text-xs text-on-surface-variant">
          {Math.round((production_ready_count / totals.total_detections) * 100)}% production-ready
          {(draft_count > 0 || totals.total_detections - production_ready_count - draft_count > 0) && (
            <span className="ml-1 text-amber-300">
              · {draft_count} draft, {totals.total_detections - production_ready_count - draft_count} other non-production
            </span>
          )}
        </div>
      )}
      <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden flex">
        {readyPct > 0 && (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${readyPct}%` }}
            title={`${production_ready_count} production-ready`}
          />
        )}
        {otherPct > 0 && (
          <div
            className="bg-yellow-500 transition-all"
            style={{ width: `${otherPct}%` }}
            title={`${inProgressCount} in review/testing`}
          />
        )}
        {draftPct > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${draftPct}%` }}
            title={`${draft_count} draft`}
          />
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          {production_ready_count} ready
        </span>
        {inProgressCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
            {inProgressCount} in progress
          </span>
        )}
        {draft_count > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            {draft_count} draft
          </span>
        )}
      </div>
    </div>
  );
};
