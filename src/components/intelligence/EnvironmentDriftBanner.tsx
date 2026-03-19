import React from 'react';
import { Icon } from '../Icon';
import type { EnvironmentSnapshot } from '../../types/intelligence';
import { computeEnvironmentDiff } from '../../lib/intelligence/environmentDiff';

interface EnvironmentDriftBannerProps {
  snapshot: EnvironmentSnapshot | null;
  currentProfile: { log_sources: string[]; siem_platforms: string[]; edr_tools: string[] } | null;
  reportDate: string;
  onRerun: () => void;
}

export const EnvironmentDriftBanner: React.FC<EnvironmentDriftBannerProps> = ({
  snapshot,
  currentProfile,
  reportDate,
  onRerun,
}) => {
  const diff = computeEnvironmentDiff(snapshot, currentProfile);

  if (!diff.hasChanged) return null;

  const allAdded = [
    ...diff.addedLogSources,
    ...diff.addedSiems,
    ...diff.addedEdrTools,
  ];
  const allRemoved = [
    ...diff.removedLogSources,
    ...diff.removedSiems,
    ...diff.removedEdrTools,
  ];

  const formattedDate = new Date(reportDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
      <Icon name="alert-triangle" className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-yellow-200">
          Environment changed since this report ({formattedDate})
        </p>
        {allAdded.length > 0 && (
          <p className="text-xs text-yellow-300/80 mt-1">
            Added: {allAdded.join(', ')}
          </p>
        )}
        {allRemoved.length > 0 && (
          <p className="text-xs text-yellow-300/80 mt-0.5">
            Removed: {allRemoved.join(', ')}
          </p>
        )}
      </div>
      <button
        onClick={onRerun}
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/30 transition-colors"
      >
        Re-run Analysis
      </button>
    </div>
  );
};

export default EnvironmentDriftBanner;
