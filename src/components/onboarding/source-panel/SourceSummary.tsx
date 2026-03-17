import React, { useMemo } from 'react';
import { useOnboarding } from '../OnboardingContext';
import { Button } from '../../ui/Button';

/**
 * SourceSummary - Fixed bottom bar in the source panel.
 *
 * Shows selected source/rule counts and the primary CTA button
 * whose label and variant shift based on the onboarding phase.
 */
export const SourceSummary: React.FC = () => {
  const { phase, sources, initializeOnboarding } = useOnboarding();

  const { selectedCount, estimatedRules } = useMemo(() => {
    let count = 0;
    let rules = 0;

    for (const s of sources) {
      if (!s.selected) continue;
      count++;

      // If folders are populated, sum only selected folder file counts
      const selectedFolders = s.folders.filter((f) => f.selected);
      if (selectedFolders.length > 0) {
        rules += selectedFolders.reduce((sum, f) => sum + f.fileCount, 0);
      } else {
        // Fall back to estimated rules from the source definition
        rules += s.source.estimatedRules;
      }
    }

    return { selectedCount: count, estimatedRules: rules };
  }, [sources]);

  const isComplete = phase === 'complete';
  const isProcessing = phase === 'processing';
  const isSelection = phase === 'selection';
  const noSelection = selectedCount === 0;

  return (
    <div className="border-t border-outline-variant/20 p-4 bg-surface-container-lowest">
      {/* Stats line */}
      <p className="text-xs text-on-surface-variant mb-3">
        Selected:{' '}
        <span className="text-on-surface font-medium">
          {selectedCount} source{selectedCount !== 1 ? 's' : ''}
        </span>
        {' '}&middot;{' '}
        <span className="text-on-surface font-medium">
          ~{estimatedRules.toLocaleString()} estimated rules
        </span>
      </p>

      {/* CTA button */}
      {isComplete ? (
        <Button
          variant="outlined"
          color="primary"
          fullWidth
          className="font-brand"
          onClick={() => { window.location.href = '/onboarding'; }}
        >
          Add More Sources
        </Button>
      ) : (
        <Button
          variant="filled"
          color="primary"
          fullWidth
          loading={isProcessing}
          disabled={noSelection || !isSelection}
          className="font-brand"
          onClick={initializeOnboarding}
        >
          {isProcessing ? 'Processing...' : 'Initialize Onboarding'}
        </Button>
      )}
    </div>
  );
};

export default SourceSummary;
