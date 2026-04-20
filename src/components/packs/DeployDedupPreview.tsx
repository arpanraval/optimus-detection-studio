/**
 * DeployDedupPreview — shows cross-pack duplicate detections before deploy.
 * Transparency: user sees which detections are in multiple packs, and how many
 * redundant deploys will be saved by the worker's dedup.
 */

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { DuplicationSummary } from '../../lib/packValidation';

interface Props {
  summary: DuplicationSummary;
}

export const DeployDedupPreview: React.FC<Props> = ({ summary }) => {
  const [expanded, setExpanded] = useState(false);

  if (summary.duplicateDetectionCount === 0) return null;

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Icon name="info" className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-on-surface mb-1">Cross-Pack Duplicates Detected</div>
          <p className="text-xs text-on-surface-variant mb-3">
            <span className="font-semibold text-on-surface">{summary.duplicateDetectionCount}</span> detection
            {summary.duplicateDetectionCount !== 1 ? 's appear' : ' appears'} in multiple selected packs. Each detection will be deployed only once, saving{' '}
            <span className="font-semibold text-on-surface">{summary.deploysSaved}</span> redundant deploy
            {summary.deploysSaved !== 1 ? 's' : ''}.
          </p>

          <div className="flex items-center gap-4 mb-3 text-xs">
            <div>
              <div className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Requested</div>
              <div className="font-bold text-on-surface tabular-nums">{summary.totalRequestedIfNotDeduped}</div>
            </div>
            <div className="text-on-surface-variant/30">→</div>
            <div>
              <div className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Will Deploy</div>
              <div className="font-bold text-primary tabular-nums">{summary.totalUniqueDetections}</div>
            </div>
            <div>
              <div className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Saved</div>
              <div className="font-bold text-emerald-400 tabular-nums">{summary.deploysSaved}</div>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
            {expanded ? 'Hide' : 'Show'} duplicate details
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1 max-h-48 overflow-auto text-xs">
              {summary.duplicates.map((d) => (
                <li key={d.detectionId} className="py-1">
                  <div className="text-on-surface font-medium truncate">{d.detectionName}</div>
                  <div className="text-[11px] text-on-surface-variant/70">
                    in {d.packNames.length} packs: {d.packNames.join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
