import React from 'react';
import { Button } from '../../ui/Button';

export interface CompletionCTAsProps {
  onGoToCommandCenter: () => void;
  onViewLibrary: () => void;
  onAddMoreSources: () => void;
  visible: boolean;
}

/**
 * CompletionCTAs
 *
 * Bottom action bar shown after onboarding completes. Contains three
 * navigation actions with a fade-in entrance controlled by the `visible` prop.
 */
export const CompletionCTAs: React.FC<CompletionCTAsProps> = ({
  onGoToCommandCenter,
  onViewLibrary,
  onAddMoreSources,
  visible,
}) => {
  return (
    <div
      className={[
        'flex items-center justify-center gap-3 py-4 px-6 transition-opacity duration-300',
        visible ? 'opacity-100 animate-fade-in' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <Button
        variant="filled"
        color="primary"
        size="md"
        onClick={onGoToCommandCenter}
      >
        <span className="font-brand">Go to Command Center</span>
      </Button>

      <Button
        variant="tonal"
        color="primary"
        size="md"
        onClick={onViewLibrary}
      >
        View Detection Library
      </Button>

      <Button
        variant="outlined"
        color="primary"
        size="md"
        onClick={onAddMoreSources}
      >
        Add More Sources
      </Button>
    </div>
  );
};

export default CompletionCTAs;
