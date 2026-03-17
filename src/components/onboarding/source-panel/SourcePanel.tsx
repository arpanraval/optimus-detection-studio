import React from 'react';
import { useOnboarding } from '../OnboardingContext';
import { SourceCard } from './SourceCard';
import { SourceSummary } from './SourceSummary';

/**
 * SourcePanel - Left panel of the onboarding dashboard.
 *
 * Renders the "DETECTION SOURCES" header, a scrollable list of SourceCards
 * (one per official source), and a fixed SourceSummary bar at the bottom.
 * Consumes all state and actions from the OnboardingContext.
 */
export const SourcePanel: React.FC = () => {
  const {
    sources,
    toggleSource,
    toggleFolder,
    selectAllFolders,
    deselectAllFolders,
    retrySource,
  } = useOnboarding();

  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="font-brand text-[11px] tracking-widest uppercase text-on-surface-variant">
          Detection Sources
        </h2>
      </div>

      {/* Scrollable source list */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal px-4 pb-2">
        <div className="flex flex-col gap-3">
          {sources.map((sourceState, index) => (
            <SourceCard
              key={sourceState.source.id}
              state={sourceState}
              onToggle={() => toggleSource(sourceState.source.id)}
              onToggleFolder={(folderPath) =>
                toggleFolder(sourceState.source.id, folderPath)
              }
              onSelectAllFolders={() => selectAllFolders(sourceState.source.id)}
              onDeselectAllFolders={() => deselectAllFolders(sourceState.source.id)}
              onRetry={() => retrySource(sourceState.source.id)}
              animationDelay={index * 60}
            />
          ))}
        </div>
      </div>

      {/* Fixed summary bar */}
      <SourceSummary />
    </div>
  );
};

export default SourcePanel;
